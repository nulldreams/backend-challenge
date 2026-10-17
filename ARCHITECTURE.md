# Arquitetura

Sobre a estrutura do projeto, criei as pastas `domain`, `application`, `infra` e `apps`.

- **domain**: optei por criar uma pasta só para as regras de negócio e suas invariantes, como por ex: saldo nunca negativo, transações terminais não mudam de estado, lançamento do ledger sempre balanceado, etc. Ela não depende de framework, ORM ou qualquer recurso externo, o que deixa as regras fáceis de testar sem subir banco nem fila.
- **application**: concentra os casos de uso, que orquestram o domínio decidindo a ordem das coisas: abrir a transação, travar a wallet, aplicar a regra e gravar. Aqui também ficam os contratos que os casos de uso precisam do mundo externo, definidos como classes abstratas (`WalletRepository`, `TransactionManager`, `EventPublisher`), assim o caso de uso depende do contrato e não de como ele é implementado.
- **infra**: aqui ficam as implementações desses contratos e tudo que tem alguma dependência externa: MikroORM e Postgres, SQS, a camada HTTP do Nest, métricas e logs. Se um dia fosse preciso trocar o ORM ou o broker, a mudança ficaria restrita a essa pasta.
- **apps**: decisão pessoal para separar cada processo que o projeto sobe (api, consumer, outbox-publisher, reference-worker e migrate), de forma que fique mais simples entender até onde vai cada processo. Cada app só monta os módulos que usa e dá o start, sem regra de negócio.

As dependências seguem sempre a direção `apps -> infra -> application -> domain`: uma camada só conhece as que estão mais para dentro, nunca o contrário.

Mantive o `migrate` em `apps` por ele também ser um processo do sistema: no compose ele é executado uma única vez, antes dos outros serviços, que só sobem quando a migration finaliza.

# Uma breve explicação sobre cada serviço

São processos separados, mas não são serviços independentes, todos usam o mesmo banco, as mesmas classes de domínio e por consequência, respeitam as mesmas invariantes. Separei para que cada um possa escalar no seu ritmo e para que a queda de um não derrube os outros.

## API

É a entrada HTTP dos provedores: criação de wallet, envio de transações, consultas de transação e de ledger, reconciliação e health checks. Ela não publica eventos direto na fila, ela grava o evento na outbox dentro da mesma transação do banco, e o envio fica a cargo do outbox-publisher. Cada tipo de falha volta com um status diferente (400 para payload inválido, 409 para conflito, 422 para regra de negócio, 202 para aceite pendente e 503 para falha temporária), assim o provedor sabe se pode reenviar sem precisar interpretar a mensagem de erro.

**Exemplo: uma BET de 25.00 enviada via `POST /wagering/transactions`**

1. `infra/http/correlation-id.ts`: recebe ou gera o `correlationId` da requisição.
2. `apps/api/modules/wagering/wagering.controller.ts`: valida o header (`idempotency-key.header.ts`) e o body (`infra/validation/wager-payload.schema.ts`) com o `ZodValidationPipe`.
3. `application/use-cases/submit-wager-transaction.use-case.ts`: cria a transação pelo domínio (`domain/wager-transaction/wager-transaction.ts`) e calcula o hash do payload (`compute-payload-hash.ts`).
4. `infra/repositories/mikro-orm-wager-transaction.repository.ts`: procura a idempotency key; se já existir, devolve o resultado original como replay.
5. `infra/database/mikro-orm-transaction-manager.ts`: abre a transação com `lock_timeout` de 2s.
6. `infra/repositories/mikro-orm-wallet.repository.ts`: trava a wallet com `SELECT ... FOR UPDATE`.
7. `application/processing/wager-transaction-processor.ts`: aplica a regra. A `Wallet` debita (`domain/wallet/wallet.ts`) e gera o lançamento (`domain/ledger-entry/wallet-ledger-entry.ts`).
8. Grava a transação, atualiza a wallet, insere o lançamento no ledger e grava na outbox os eventos `WagerTransactionProcessed` e `WalletBalanceChanged` (`domain/events`, `domain/outbox-message`). Tudo isso no mesmo commit.
9. `apps/api/modules/wagering/wager-transaction.response.ts`: monta a resposta (200, 202 ou 422). Se algo lançar erro, `infra/http/http-error.filter.ts` converte para o status correspondente.

## Consumer

Faz o mesmo papel da API, só que lendo da fila `wager-transactions.fifo`, e reutiliza exatamente o mesmo caso de uso, então a regra de negócio é só uma para as duas entradas de dados do provedor. Como o SQS pode entregar a mesma mensagem mais de uma vez, cada mensagem processada é registrada numa tabela inbox dentro da mesma transação do banco, se ela chegar de novo, é reconhecida e removida da fila sem aplicar o efeito duas vezes. A mensagem só é removida da fila depois do commit, então se o processo morrer no meio, ela volta e é tratada por outra instância. Erros de negócio geram uma transação `REJECTED` e a mensagem é removida da fila, para não ficar num loop de reprocessamento, erros que não são permanentes retornam para a fila, erros permanentes como por exemplo: payload inválido, vão direto para a DLQ. No compose rodam três instâncias ao mesmo tempo.

As mensagens na DLQ não são reprocessadas automaticamente, já que representam falhas que o sistema não consegue resolver sozinho. Cada envio para a DLQ gera um log de erro com o motivo, e a quantidade de mensagens na fila é exposta na métrica `wagering_dlq_depth`, que pode ser usada para alertar algum canal. Depois de corrigida a causa, as mensagens podem voltar para a fila principal com o redrive do próprio SQS, sem risco de duplicar efeito, porque a inbox e a idempotency key barram o que já foi aplicado.

**Exemplo: a mesma BET chegando pela fila, entregue duas vezes**

1. `apps/consumer/main.ts`: sobe o processo via `infra/workers/bootstrap-worker.ts`, e o `infra/workers/worker-loop.ts` chama o ciclo continuamente.
2. `apps/consumer/wager-transaction.consumer.ts`: busca até 10 mensagens e agrupa por wallet.
3. `apps/consumer/wager-transaction-message.schema.ts`: valida o envelope da mensagem.
4. Cria a `InboxMessage` (`domain/inbox-message`) e chama o **mesmo** `submit-wager-transaction.use-case.ts` da API.
5. `infra/repositories/mikro-orm-inbox-message.repository.ts`: na primeira entrega grava a inbox e segue o mesmo fluxo da API (passos 5 a 8). Na segunda entrega o registro já existe, então o caso de uso devolve o resultado original sem aplicar nada.
6. De volta ao consumer: depois do commit, apaga a mensagem da fila (ack). Se der erro, `apps/consumer/message-action.ts` decide entre ack, retry ou DLQ.

## outbox-publisher

Publica na fila `wager-events.fifo` os eventos que a API e o consumer deixaram gravados na outbox. Usei esse padrão porque publicar antes do commit poderia anunciar algo que não aconteceu, e publicar depois poderia correr o risco de o processo cair entre um passo e outro resultando num evento perdido, com a outbox, o evento existe se e somente se a operação foi confirmada. Rodo duas instâncias, e elas não pegam o mesmo evento porque cada uma trava as linhas que está publicando com `FOR UPDATE SKIP LOCKED`, e a outra simplesmente pula esses registros da tabela. Se uma instância cair no meio da publicação, a transação dela é desfeita e o lote volta a ficar disponível para outra instância pegar. Pode acontecer de um evento ser publicado duas vezes, mas ele carrega um `eventId` único, então quem consome consegue descartar o duplicado.

**Exemplo: publicação dos eventos gerados pela BET**

1. `apps/outbox-publisher/outbox-publisher.worker.ts`: chama o caso de uso a cada ciclo.
2. `application/use-cases/publish-outbox-batch.use-case.ts`: abre uma transação.
3. `infra/repositories/mikro-orm-outbox-message.repository.ts`: pega até 10 eventos pendentes com `FOR UPDATE SKIP LOCKED`.
4. `infra/sqs/sqs-event-publisher.ts`: envia o lote para a `wager-events.fifo`, usando o `eventId` como id de deduplicação.
5. `domain/outbox-message/outbox-message.ts`: marca como publicado o que deu certo e agenda nova tentativa para o que falhou.
6. O repository grava o resultado e a transação faz commit, liberando as linhas.

## reference-worker

Resolve as transações que ficaram em `PENDING_REFERENCE`, que é o caso de um REFUND ou ROLLBACK chegar antes da transação que ele desfaz. De tempo em tempo ele busca essas transações pendentes e tenta processar de novo, aumentando o intervalo entre as tentativas (1s, 2s, 4s, até 5 minutos). Depois de 10 tentativas sem a referência aparecer, a transação é rejeitada com `REFERENCE_NOT_FOUND`. Quando a referência é processada, as pendentes ligadas a ela são reagendadas na hora, para não esperarem o próximo intervalo.

**Exemplo: REFUND que chegou antes da BET**

1. A API recebe o REFUND, não encontra a BET e grava a transação como `PENDING_REFERENCE`, com a próxima tentativa agendada (`domain/wager-transaction/wager-transaction.ts`, `markPendingReference`).
2. A BET chega e é processada. No fim, o `wager-transaction-processor.ts` "acorda" as pendentes que apontam para ela (`wakePendingReferencesTo`).
3. `apps/reference-worker/pending-reference.worker.ts`: no ciclo seguinte, chama `application/use-cases/resolve-pending-references.use-case.ts`.
4. `mikro-orm-wager-transaction.repository.ts`: busca as pendentes vencidas. Para cada uma, trava a wallet (`mikro-orm-wallet.repository.ts`) e relê a transação com `SKIP LOCKED`, para não disputar com outra instância.
5. `wager-transaction-processor.ts`: aplica a mesma regra da API. Encontra a BET processada, credita o REFUND e grava o lançamento e os eventos.
6. Se a referência ainda não existisse, `referenceStillMissing` contaria a tentativa e reagendaria; na 10ª, rejeitaria com `REFERENCE_NOT_FOUND`.

# Decisões que tomei a partir da descrição do teste

## Autenticação

Não implementei a autenticação, deixei o ponto de extensão pronto com um `ProviderAuthGuard` no-op em `infra/http/provider-auth.guard.ts`, que já está aplicado nos controllers de wallets e de wagering, então quando a autenticação entrar é só implementar a validação ali dentro. Os health checks continuam abertos, e a fila é tratada como canal interno, mas mesmo assim o `providerId` que vem na mensagem passa pelas mesmas validações de domínio.

Se fosse implementar, usaria um provider externo como Keycloak ou Zitadel, com um client para cada provedor. O guard validaria o JWT, ligaria o token a um `providerId` e devolveria 403 se o provedor tentasse mandar uma transação em nome de outro.

## ORM

Optei por utilizar o MikroORM, que era o preferencial do teste e já resolve boa parte do que eu precisava: o `transactional()` propaga a transação para todos os repositories sem eu precisar passar ela de mão em mão, o `LockMode` me dá o `SELECT ... FOR UPDATE` e o `SKIP LOCKED`, e as migrations são geradas a partir das entidades. Usei o `defineEntity` para declarar no mesmo lugar as colunas, constraints, índices e triggers de cada tabela, assim quem abre o record já vê tudo que o banco garante.

O único ponto que o MikroORM não resolveu foi a FK composta `(wallet_id, currency)` entre o ledger e a wallet, que ele não consegue persistir. No lugar dela criei o trigger `ensure_wallet_currency`, que recusa o lançamento quando a moeda não bate com a da wallet.

## Dinheiro

O `Money` guarda o valor em centavos usando `bigint`, então nenhuma conta passa por `number` e não existe erro de arredondamento, por ex: `0.10 + 0.20` dá exatamente `0.30`. O valor sempre entra como string com no máximo duas casas decimais, qualquer coisa fora disso (`NaN`, notação científica, valor negativo, três casas) é recusada com erro de domínio. No banco o valor fica em `numeric(18,2)` e a moeda numa coluna separada, e quando o registro volta do banco ela é transformada em `Money` de novo. Somar ou subtrair moedas diferentes lança `CurrencyMismatchError`.

## Estratégia transacional

Cada operação roda numa única transação do banco, o `TransactionManager` abre a transação e os repositories usam ela automaticamente através do `AsyncLocalStorage` do MikroORM. Mantive o isolamento padrão do Postgres (READ COMMITTED), porque quem fica esperando o lock da wallet lê o saldo já atualizado por quem estava na frente. A única exceção é a reconciliação, que roda em `REPEATABLE READ` somente leitura, para ler a wallet e o ledger no mesmo instante e não acusar uma diferença falsa por causa de uma aposta que entrou no meio.

## Garantias no banco

Não quis depender só do código para as regras mais importantes, então o próprio banco recusa os estados que o teste proíbe, mesmo que um bug passe pela aplicação:

| Garantia                                              | Como                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| Uma wallet por player e moeda                         | `wallets_player_currency_uq`                                       |
| Saldo nunca negativo                                  | `wallets_balance_non_negative_ck` e `balance_after >= 0` no ledger |
| Idempotency key única                                 | `wager_transactions_idempotency_key_uq`                            |
| Um id externo por provedor                            | `wager_transactions_provider_external_id_uq`                       |
| Uma única OPENING por wallet                          | `wager_transactions_single_opening_uq`                             |
| Uma referência só pode ser revertida uma vez por tipo | `wager_transactions_single_reversal_uq`                            |
| No máximo um lançamento por transação em cada wallet  | `wallet_ledger_entries_wallet_transaction_uq`                      |
| Versões do ledger sem repetição                       | `wallet_ledger_entries_wallet_version_uq`                          |
| Lançamento sempre fecha a conta                       | `wallet_ledger_entries_balanced_ck`                                |
| Ledger não aceita UPDATE, DELETE nem TRUNCATE         | triggers `block_update_delete` e `block_truncate`                  |
| Moeda do lançamento igual à da wallet                 | trigger `ensure_wallet_currency`                                   |
| Transação rejeitada sempre tem `failure_code`         | `wager_transactions_failure_code_ck`                               |

As migrations são geradas comparando as entidades com um snapshot que fica versionado junto. Desliguei o `snapshotOnMigrate`, porque o MikroORM regravaria esse snapshot lendo o banco, e o Postgres não mostra os triggers de TRUNCATE na leitura, então eles sumiriam da próxima migration. Tenho um teste que confere se entidades e migrations estão em sincronia e outro que aplica, desfaz e aplica de novo todas elas.

## Ciclo de vida da WagerTransaction

```
PENDING -> PROCESSED                       (terminal)
        -> REJECTED                        (terminal)
        -> PENDING_REFERENCE -> PROCESSED | REJECTED
```

Toda transação nasce `PENDING` e já sai da decisão processada ou rejeitada, a não ser que falte a referência, aí ela fica em `PENDING_REFERENCE` até o reference-worker resolver. Depois que chega em `PROCESSED`, `REJECTED` ou `FAILED` ela não muda mais, se algum código tentar mudar é lançado um `InvalidTransactionStateError`, que trato como erro de programação e não como regra de negócio. O `FAILED` existe no modelo, mas ainda não tem nenhum caminho que use.

## Interpretações das regras de negócio

Alguns pontos o teste deixa em aberto, então segui essas interpretações:

- O WIN pode vir com ou sem referência, e quando vem, precisa apontar para uma BET da mesma rodada.
- O LOSS aceita `0.00`, fica como `PROCESSED` e não gera lançamento no ledger.
- O REFUND só pode referenciar uma BET, já o ROLLBACK pode referenciar BET, WIN ou REFUND, e sempre faz o contrário da referência, por ex: desfazer um WIN debita.
- A referência precisa ser do mesmo provider, player, wallet, moeda e rodada, e o valor da reversão precisa ser igual ao da referência, já que reversão parcial está fora do escopo.
- Uma referência rejeitada não pode ser revertida, e se a referência ainda estiver pendente, a reversão espera junto.
- Moeda diferente da wallet ou player diferente do dono da wallet viram `REJECTED`, ficando gravados como qualquer outra regra de negócio.
- No replay, o saldo devolvido é o saldo do momento em que a transação foi decidida, não o saldo atual.
- A OPENING só é criada na abertura da wallet, se chegar pela API ou pela fila é recusada com `KIND_NOT_ALLOWED`.

## Referências fora de ordem

Quando uma reversão chega antes da referência, ela fica pendente e o reference-worker tenta de novo esperando cada vez mais entre uma tentativa e outra, de 1s até no máximo 5 minutos, com limite de 10 tentativas, o que dá uns 13 minutos no total. Escolhi esse limite porque na prática a referência atrasada costuma chegar em poucos segundos, por causa de entregas em paralelo ou retry do provedor, e depois de alguns minutos é bem mais provável que ela nunca exista. Quando as tentativas acabam, a transação é rejeitada com `REFERENCE_NOT_FOUND` e o evento de rejeição é publicado. E para não esperar o intervalo à toa, quando a referência chega as pendentes ligadas a ela são reagendadas na hora.

## Códigos de falha

Todo erro de regra volta com um `failureCode` fixo, e cada código tem um destino certo no HTTP e no SQS, assim o provedor sabe o que fazer sem precisar ler a mensagem de erro. Os dois mapeamentos são feitos com um `Record<FailureCode, ...>`, então se alguém criar um código novo e esquecer de mapear, o projeto nem compila.

| Categoria            | Códigos                                                                                                                                                                                                                                               | HTTP                | SQS   | O provedor deve                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----- | --------------------------------------- |
| Payload inválido     | `INVALID_PAYLOAD`, `INVALID_AMOUNT`, `INVALID_CURRENCY`, `KIND_NOT_ALLOWED`, `REFERENCE_REQUIRED`, `REFERENCE_NOT_ALLOWED`                                                                                                                            | 400                 | DLQ   | corrigir o payload                      |
| Conflito             | `IDEMPOTENCY_CONFLICT`, `EXTERNAL_TRANSACTION_ID_CONFLICT`, `WALLET_ALREADY_EXISTS`                                                                                                                                                                   | 409                 | ack   | não reenviar                            |
| Não encontrado       | `WALLET_NOT_FOUND`, `WAGER_TRANSACTION_NOT_FOUND`                                                                                                                                                                                                     | 404                 | ack   | conferir os ids                         |
| Regra de negócio     | `INSUFFICIENT_FUNDS`, `REVERSAL_INSUFFICIENT_FUNDS`, `CURRENCY_MISMATCH`, `WALLET_PLAYER_MISMATCH`, `INVALID_REFERENCE_KIND`, `REFERENCE_MISMATCH`, `REFERENCE_AMOUNT_MISMATCH`, `REFERENCE_NOT_PROCESSED`, `ALREADY_REVERSED`, `REFERENCE_NOT_FOUND` | 422                 | ack   | desistir, reenviar dá o mesmo resultado |
| Mensagem reutilizada | `MESSAGE_ID_CONFLICT`                                                                                                                                                                                                                                 | —                   | DLQ   | investigar o produtor                   |
| Falha temporária     | `SERVICE_UNAVAILABLE`                                                                                                                                                                                                                                 | 503 + `Retry-After` | retry | reenviar com a mesma key                |

A reversão sem saldo ganhou um código próprio (`REVERSAL_INSUFFICIENT_FUNDS`) porque é bem diferente de uma aposta sem saldo, ela indica que o dinheiro creditado já foi gasto antes de ser desfeito, e normalmente precisa de alguém olhando.

## Concorrência

A unidade de concorrência é a wallet, antes de decidir qualquer coisa eu travo a wallet com `SELECT ... FOR UPDATE`, então operações na mesma wallet passam uma de cada vez, enquanto wallets diferentes continuam sendo processadas em paralelo, sem nenhum lock global. A transação tem um `lock_timeout` de 2s, se a fila numa wallet demorar mais que isso a requisição falha como temporária (503 no HTTP e retry no SQS), em vez de ficar segurando uma conexão para sempre. Além do lock, o UPDATE da wallet confere a versão anterior, como uma segunda trava caso algum caminho esqueça de travar.

Escolhi o lock pessimista porque aqui várias apostas na mesma wallet ao mesmo tempo é o cenário normal, não a exceção. Com lock otimista cada conflito viraria um retry, e numa wallet muito disputada esses retries iam se acumulando. Também pensei num UPDATE condicionado (`WHERE balance >= valor`), mas ele resolveria só o saldo, e eu ainda preciso ler a referência, checar se já foi revertida e gerar a próxima versão do ledger, tudo debaixo da mesma trava. O lado ruim é que uma wallet muito disputada vira uma fila, e o `lock_timeout` é o que impede essa fila de travar o resto. Para não ter deadlock, todo fluxo trava sempre a wallet primeiro.

No cenário obrigatório, com saldo de 100.00 e duas apostas de 80.00 ao mesmo tempo, a primeira trava a wallet, debita e faz commit, a segunda fica esperando o lock, quando entra já lê o saldo de 20.00 e é rejeitada com `INSUFFICIENT_FUNDS`. No fim tem um débito só e o saldo fica em 20.00.

## Idempotência

A chave vem do header `Idempotency-Key` no HTTP e do `data.idempotencyKey` na mensagem do SQS. Junto com ela guardo um `payloadHash`, que é um SHA-256 de um JSON com as chaves em ordem alfabética e só com os campos de negócio (`providerId`, `externalTransactionId`, `playerId`, `walletId`, `roundId`, `gameId`, `kind`, `money` e `referenceExternalTransactionId`). O valor é normalizado antes, então `"10"` e `"10.00"` geram o mesmo hash, e header, `messageId` e outros dados de transporte ficam de fora, por isso a mesma operação gera o mesmo hash vindo do HTTP ou da fila.

A key é checada duas vezes, uma antes de travar a wallet, para o retry do provedor voltar rápido sem disputar o lock, e outra depois do lock, para pegar uma requisição igual que fez commit enquanto essa estava esperando. Se mesmo assim duas instâncias tentarem gravar a mesma key juntas, o índice único do banco decide quem ganha, a outra recebe o erro, desfaz tudo, relê e devolve o resultado da primeira como replay. Mesma key com payload diferente é sempre conflito (409), nunca replay. Como as transações rejeitadas também ficam gravadas, o replay de uma rejeição devolve a mesma rejeição.

## Mensageria

O funcionamento do consumer está na seção dele, aqui ficam só as decisões de configuração:

- A fila é FIFO com o `MessageGroupId` igual à wallet, então as mensagens de uma mesma wallet chegam em ordem e wallets diferentes são processadas em paralelo. Essa ordem ajuda, mas quem garante que nada sai errado é o banco.
- O erro temporário volta para a fila esperando 5s, 10s, 20s e 40s, com uma variação de até 20% para as instâncias não voltarem todas no mesmo segundo. Depois de 5 recebimentos sem sucesso, o próprio SQS move a mensagem para a DLQ.
- O visibility timeout da fila é de 30s, igual ao tempo que o compose dá para o processo desligar. No SIGTERM o consumer termina a mensagem que está processando e devolve o resto do lote para a fila na hora.

## Outbox e eventos

Os eventos são publicados numa fila FIFO (`wager-events.fifo`), usando o agregado como `MessageGroupId` e o `eventId` como id de deduplicação. Pensei em usar um tópico SNS, mas o teste não pede vários consumidores para o mesmo evento, então uma fila já resolve e é mais simples. A outbox não tem limite de tentativas, porque não pode perder evento, mas quando uma mensagem falha 10 vezes é gerado um log de aviso.

Como rodam dois publishers, a ordem entre os eventos não é garantida, por isso o `WalletBalanceChanged` leva o `walletVersion`, para quem consome conseguir ordenar ou descartar um evento mais antigo.

| Evento                             | Quando                                                |
| ---------------------------------- | ----------------------------------------------------- |
| `WagerTransactionProcessed`        | qualquer transação aplicada, inclusive LOSS e OPENING |
| `WagerTransactionRejected`         | transação rejeitada por regra de negócio              |
| `WalletBalanceChanged`             | somente quando o saldo muda                           |
| `WagerTransactionPendingReference` | referência ausente                                    |

Cada evento é uma classe própria que estende o `IntegrationEvent`, com o `eventType` e a `version` definidos na própria classe, e o construtor é privado, então o evento só pode ser criado pelo `from()`. O `data` leva o dinheiro como string (`MoneyProps`) e nunca o objeto `Money`, para o payload ser sempre um JSON estável.

## Reconciliação

A reconciliação compara o saldo gravado na wallet com o saldo calculado somando o ledger. Se der diferença, ela não corrige nada, só gera um log de erro com os valores, conta na métrica `wallet_reconciliations_total` e devolve `consistent: false` com a diferença, para alguém investigar. Mesmo com todas as constraints, uma diferença ainda pode aparecer por alteração manual no banco, por um bug futuro ou por um backup restaurado pela metade, porque o banco garante que cada lançamento está certo, mas não que o conjunto todo bate com o saldo.

## Observabilidade

- Os logs saem em JSON, com o `correlationId` e o `messageId` entrando sozinhos em todo log através do `AsyncLocalStorage`, e os logs de processamento trazem `transactionId`, `walletId` e `providerId`. Valores financeiros não vão para o log, com uma exceção consciente: a divergência da reconciliação, que precisa dos saldos para ser investigada.
- As métricas seguem o formato do Prometheus e cobrem transações por status, duplicatas, retries, mensagens na DLQ, conflitos de lock, outbox lag e latência. Nenhum id vira label, para não explodir a quantidade de séries. As métricas de outbox e DLQ ficam na API, que consulta o banco e a fila na hora da coleta, assim elas continuam aparecendo mesmo se os workers caírem.
- Os health checks são separados, o `/health/live` só diz que o processo está respondendo e o `/health/ready` confere se o Postgres e o SQS estão acessíveis.
- No compose também sobem o Prometheus, o Loki e o Grafana, com um dashboard pronto de métricas e de logs, que dá para filtrar por `correlationId`. O OpenTelemetry ficou como próximo passo.

## Testes

Os testes de integração e de concorrência rodam contra Postgres e LocalStack de verdade, sem nenhum mock, e o banco e as filas são recriados a cada execução. Todos eles conferem no final que o saldo da wallet bate com o saldo calculado pelo ledger. Nos testes que dependem de tempo, em vez de usar um `sleep` fixo, o teste fica conferindo a condição até um prazo máximo.

| Exigência                                                  | Onde                                               |
| ---------------------------------------------------------- | -------------------------------------------------- |
| Money, Wallet, regras por kind, moeda e payload divergente | `tests/unit`, com 100% de cobertura do domínio     |
| Migrations e constraints                                   | `tests/integration/migrations`                     |
| Atomicidade e rollback                                     | `tests/integration/application/use-cases`          |
| Inbox, redelivery, retry e DLQ                             | `tests/integration/apps/consumer`                  |
| Publishers concorrentes                                    | `tests/integration/apps/outbox-publisher`          |
| 50 envios iguais, cenário do §8 e wallets em paralelo      | `tests/concurrency/wallet-contention.test.ts`      |
| Worker morto depois do commit e antes do ack               | `tests/concurrency/commit-before-ack.test.ts`      |
| REFUND e ROLLBACK antes da referência                      | `tests/concurrency/out-of-order-reference.test.ts` |
| 3 processos reais, SIGKILL e reinício                      | `tests/concurrency/multi-process.test.ts`          |

Também deixei a pasta `local-test`, com scripts que rodam os mesmos cenários contra a stack do Docker, para facilitar uma demonstração.
