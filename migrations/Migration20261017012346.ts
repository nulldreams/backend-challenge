import { Migration } from '@mikro-orm/migrations';

export class Migration20261017012346 extends Migration {

  override name = 'Migration20261017012346';

  override up(): void | Promise<void> {
    this.addSql(`alter table "wager_transactions" add "reference_transaction_id" uuid null, add "failure_code" text null, add "observed_balance_amount" numeric(18,2) null, add "observed_balance_currency" char(3) null;`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_reference_fk" foreign key ("reference_transaction_id") references "wager_transactions" ("id") on delete no action;`);
    this.addSql(`create unique index "wager_transactions_single_reversal_uq" on "wager_transactions" ("reference_transaction_id", "kind") where status = 'PROCESSED' AND kind IN ('REFUND', 'ROLLBACK');`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_reversal_requires_reference_ck" check (kind NOT IN ('REFUND', 'ROLLBACK') OR reference_external_transaction_id IS NOT NULL);`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_processed_reversal_resolved_ck" check (status <> 'PROCESSED' OR kind NOT IN ('REFUND', 'ROLLBACK') OR reference_transaction_id IS NOT NULL);`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_failure_code_ck" check ((status IN ('REJECTED', 'FAILED')) = (failure_code IS NOT NULL));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_observed_balance_ck" check ((observed_balance_amount IS NULL) = (observed_balance_currency IS NULL));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "wager_transactions" drop constraint "wager_transactions_reference_fk";`);

    this.addSql(`drop index "wager_transactions_single_reversal_uq";`);
    this.addSql(`alter table "wager_transactions" drop constraint "wager_transactions_reversal_requires_reference_ck";`);
    this.addSql(`alter table "wager_transactions" drop constraint "wager_transactions_processed_reversal_resolved_ck";`);
    this.addSql(`alter table "wager_transactions" drop constraint "wager_transactions_failure_code_ck";`);
    this.addSql(`alter table "wager_transactions" drop constraint "wager_transactions_observed_balance_ck";`);
    this.addSql(`alter table "wager_transactions" drop column "reference_transaction_id", drop column "failure_code", drop column "observed_balance_amount", drop column "observed_balance_currency";`);
  }

}
