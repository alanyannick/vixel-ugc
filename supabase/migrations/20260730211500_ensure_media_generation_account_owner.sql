alter table vixel_koc.media_generation_ledger
  add column if not exists account_user_id uuid;

create index if not exists media_generation_account_created_idx
  on vixel_koc.media_generation_ledger (account_user_id, created_at desc)
  where account_user_id is not null;

comment on column vixel_koc.media_generation_ledger.account_user_id is
  'Supabase account owner when account auth is enabled; nullable for legacy operator sessions.';
