import { Migration } from '@mikro-orm/migrations';

export class Migration20261017041410 extends Migration {

  override name = 'Migration20261017041410';

  override up(): void | Promise<void> {
    this.addSql(`create table "inbox_messages" ("consumer_name" text not null, "message_id" text not null, "payload_hash" char(64) not null, "received_at" timestamptz not null, "processed_at" timestamptz null, primary key ("consumer_name", "message_id"));`);

    this.addSql(`create table "outbox_messages" ("id" uuid not null, "aggregate_id" uuid not null, "event_type" text not null, "payload" jsonb not null, "occurred_at" timestamptz not null, "attempts" int not null default 0, "next_attempt_at" timestamptz not null, "published_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "outbox_messages_pending_idx" on "outbox_messages" ("next_attempt_at") where published_at IS NULL;`);

    this.addSql(`alter table "wager_transactions" add "reference_attempts" int not null default 0, add "next_reference_attempt_at" timestamptz null;`);
    this.addSql(`create index "wager_transactions_pending_reference_idx" on "wager_transactions" ("next_reference_attempt_at") where status = 'PENDING_REFERENCE';`);
    this.addSql(`create index "wager_transactions_pending_by_reference_idx" on "wager_transactions" ("provider_id", "reference_external_transaction_id") where status = 'PENDING_REFERENCE';`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_reference_attempts_ck" check (reference_attempts >= 0);`);

    this.addSql(`alter table "outbox_messages" add constraint "outbox_messages_attempts_ck" check (attempts >= 0);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "inbox_messages" cascade;`);
    this.addSql(`drop table if exists "outbox_messages" cascade;`);

    this.addSql(`drop index "wager_transactions_pending_reference_idx";`);
    this.addSql(`drop index "wager_transactions_pending_by_reference_idx";`);
    this.addSql(`alter table "wager_transactions" drop constraint "wager_transactions_reference_attempts_ck";`);
    this.addSql(`alter table "wager_transactions" drop column "reference_attempts", drop column "next_reference_attempt_at";`);
  }

}
