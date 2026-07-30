-- This is intentionally a later migration. The original ledger migration may
-- already be recorded as applied in a Supabase environment and must never be
-- edited to carry an incremental runtime dependency.

alter table vixel_koc.media_generation_ledger
  add column if not exists revision bigint not null default 0;

-- Paid-submission quotas count the current UTC day's claims across the ledger.
create index if not exists media_generation_created_idx
  on vixel_koc.media_generation_ledger (created_at desc);

comment on column vixel_koc.media_generation_ledger.revision is
  'Monotonic compare-and-swap revision for provider submission state.';
