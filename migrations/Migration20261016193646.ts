import { Migration } from '@mikro-orm/migrations';

export class Migration20261016193646 extends Migration {

  override name = 'Migration20261016193646';

  override up(): void | Promise<void> {
    this.addSql(`create table "wallets" ("id" uuid not null, "player_id" uuid not null, "currency" char(3) not null, "balance" numeric(18,2) not null, "version" int not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "wallets" add constraint "wallets_player_currency_uq" unique ("player_id", "currency");`);

    this.addSql(`create table "wager_transactions" ("id" uuid not null, "provider_id" text not null, "external_transaction_id" text not null, "idempotency_key" text not null, "payload_hash" char(64) not null, "wallet_id" uuid not null, "player_id" uuid not null, "round_id" text not null, "game_id" text not null, "kind" text not null, "amount" numeric(18,2) not null, "currency" char(3) not null, "reference_external_transaction_id" text null, "status" text not null, "created_at" timestamptz not null, "processed_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_idempotency_key_uq" unique ("idempotency_key");`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_provider_external_id_uq" unique ("provider_id", "external_transaction_id");`);
    this.addSql(`create unique index "wager_transactions_single_opening_uq" on "wager_transactions" ("wallet_id") where kind = 'OPENING';`);

    this.addSql(`create table "wallet_ledger_entries" ("id" uuid not null, "wallet_id" uuid not null, "transaction_id" uuid not null, "wallet_version" int not null, "direction" text not null, "amount" numeric(18,2) not null, "currency" char(3) not null, "balance_before" numeric(18,2) not null, "balance_after" numeric(18,2) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_wallet_transaction_uq" unique ("wallet_id", "transaction_id");`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_wallet_version_uq" unique ("wallet_id", "wallet_version");`);

    this.addSql(`alter table "wallets" add constraint "wallets_currency_format_ck" check (currency ~ '^[A-Z]{3}\$');`);
    this.addSql(`alter table "wallets" add constraint "wallets_balance_non_negative_ck" check (balance >= 0);`);
    this.addSql(`alter table "wallets" add constraint "wallets_version_positive_ck" check (version >= 1);`);

    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_wallet_fk" foreign key ("wallet_id") references "wallets" ("id");`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_kind_ck" check (kind IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_status_ck" check (status IN ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_amount_non_negative_ck" check (amount >= 0);`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_processed_at_ck" check (status <> 'PROCESSED' OR processed_at IS NOT NULL);`);

    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_wallet_fk" foreign key ("wallet_id") references "wallets" ("id");`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_transaction_fk" foreign key ("transaction_id") references "wager_transactions" ("id");`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_wallet_version_ck" check (wallet_version >= 1);`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_direction_ck" check (direction IN ('DEBIT', 'CREDIT'));`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_amount_positive_ck" check (amount > 0);`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_balance_before_ck" check (balance_before >= 0);`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_balance_after_ck" check (balance_after >= 0);`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_balanced_ck" check (balance_after = balance_before + CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END);`);
    this.addSql(`create or replace function "wallet_ledger_entries_ensure_wallet_currency_fn"() returns trigger as \$\$ begin IF NEW.currency IS DISTINCT FROM (SELECT currency FROM wallets WHERE id = NEW.wallet_id) THEN RAISE EXCEPTION 'ledger entry currency % does not match wallet currency', NEW.currency USING ERRCODE = 'foreign_key_violation'; END IF; RETURN NEW; end; \$\$ language plpgsql;`);
    this.addSql(`create trigger "ensure_wallet_currency" BEFORE INSERT on "wallet_ledger_entries" for each ROW execute function "wallet_ledger_entries_ensure_wallet_currency_fn"();`);
    this.addSql(`create or replace function "wallet_ledger_entries_block_update_delete_fn"() returns trigger as \$\$ begin RAISE EXCEPTION 'wallet_ledger_entries is append-only (% blocked)', TG_OP USING ERRCODE = 'restrict_violation'; end; \$\$ language plpgsql;`);
    this.addSql(`create trigger "block_update_delete" BEFORE UPDATE OR DELETE on "wallet_ledger_entries" for each ROW execute function "wallet_ledger_entries_block_update_delete_fn"();`);
    this.addSql(`create or replace function "wallet_ledger_entries_block_truncate_fn"() returns trigger as \$\$ begin RAISE EXCEPTION 'wallet_ledger_entries is append-only (% blocked)', TG_OP USING ERRCODE = 'restrict_violation'; end; \$\$ language plpgsql;`);
    this.addSql(`create trigger "block_truncate" BEFORE TRUNCATE on "wallet_ledger_entries" for each STATEMENT execute function "wallet_ledger_entries_block_truncate_fn"();`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "wager_transactions" drop constraint "wager_transactions_wallet_fk";`);
    this.addSql(`alter table "wallet_ledger_entries" drop constraint "wallet_ledger_entries_wallet_fk";`);
    this.addSql(`alter table "wallet_ledger_entries" drop constraint "wallet_ledger_entries_transaction_fk";`);

    this.addSql(`drop table if exists "wallets" cascade;`);
    this.addSql(`drop table if exists "wager_transactions" cascade;`);
    this.addSql(`drop trigger if exists "ensure_wallet_currency" on "wallet_ledger_entries";`);
    this.addSql(`drop function if exists "wallet_ledger_entries_ensure_wallet_currency_fn"();`);
    this.addSql(`drop trigger if exists "block_update_delete" on "wallet_ledger_entries";`);
    this.addSql(`drop function if exists "wallet_ledger_entries_block_update_delete_fn"();`);
    this.addSql(`drop trigger if exists "block_truncate" on "wallet_ledger_entries";`);
    this.addSql(`drop function if exists "wallet_ledger_entries_block_truncate_fn"();`);
    this.addSql(`drop table if exists "wallet_ledger_entries" cascade;`);
  }

}
