create schema if not exists vixel_koc;

revoke all on schema vixel_koc from public;
revoke all on schema vixel_koc from anon;
revoke all on schema vixel_koc from authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_roles
    where rolname = 'vixel_koc_runtime'
  ) then
    create role vixel_koc_runtime nologin;
  end if;
end
$$;

create table if not exists vixel_koc.media_generation_ledger (
  id uuid primary key,
  session_identity char(64) not null,
  kind text not null check (kind in ('image', 'video')),
  idempotency_key varchar(128) not null,
  input_signature char(64) not null,
  approval_signature char(64) not null,
  provider_model varchar(240) not null,
  status text not null check (
    status in (
      'submitting',
      'submitted',
      'processing',
      'succeeded',
      'failed',
      'submit_unknown',
      'cancelled',
      'reconciliation_required'
    )
  ),
  provider_task_id varchar(128),
  provider_result jsonb,
  error_code varchar(120),
  error_message varchar(1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_identity, idempotency_key),
  unique (session_identity, approval_signature)
);

create unique index if not exists media_generation_provider_task_unique
  on vixel_koc.media_generation_ledger (provider_task_id)
  where provider_task_id is not null;

create index if not exists media_generation_session_created_idx
  on vixel_koc.media_generation_ledger (session_identity, created_at desc);

-- Earlier development builds created this table in public at runtime. A new
-- isolated Supabase project will not have it, but a reused database must copy
-- every legacy row before the application switches schemas. Conflicting or
-- incomplete copies abort the migration instead of silently dropping the
-- idempotency chain.
do $$
begin
  if to_regclass('public.vixel_media_generation_ledger') is not null then
    lock table public.vixel_media_generation_ledger in share mode;

    insert into vixel_koc.media_generation_ledger (
      id,
      session_identity,
      kind,
      idempotency_key,
      input_signature,
      approval_signature,
      provider_model,
      status,
      provider_task_id,
      provider_result,
      error_code,
      error_message,
      created_at,
      updated_at
    )
    select
      id,
      session_identity,
      kind,
      idempotency_key,
      input_signature,
      approval_signature,
      provider_model,
      status,
      provider_task_id,
      provider_result,
      error_code,
      error_message,
      created_at,
      updated_at
    from public.vixel_media_generation_ledger
    on conflict do nothing;

    if exists (
      select 1
      from public.vixel_media_generation_ledger legacy
      left join vixel_koc.media_generation_ledger current
        on current.id = legacy.id
      where current.id is null
        or current.session_identity is distinct from legacy.session_identity
        or current.kind is distinct from legacy.kind
        or current.idempotency_key is distinct from legacy.idempotency_key
        or current.input_signature is distinct from legacy.input_signature
        or current.approval_signature is distinct from legacy.approval_signature
        or current.provider_model is distinct from legacy.provider_model
        or current.status is distinct from legacy.status
        or current.provider_task_id is distinct from legacy.provider_task_id
        or current.provider_result is distinct from legacy.provider_result
        or current.error_code is distinct from legacy.error_code
        or current.error_message is distinct from legacy.error_message
        or current.created_at is distinct from legacy.created_at
        or current.updated_at is distinct from legacy.updated_at
    ) then
      raise exception
        'Legacy Vixel media ledger did not migrate exactly; refusing schema cutover';
    end if;
  end if;
end
$$;

alter table vixel_koc.media_generation_ledger enable row level security;
alter table vixel_koc.media_generation_ledger force row level security;

revoke all on table vixel_koc.media_generation_ledger from public;
revoke all on table vixel_koc.media_generation_ledger from anon;
revoke all on table vixel_koc.media_generation_ledger from authenticated;

grant usage on schema vixel_koc to vixel_koc_runtime;
grant select, insert, update
  on table vixel_koc.media_generation_ledger
  to vixel_koc_runtime;

drop policy if exists vixel_koc_runtime_server_access
  on vixel_koc.media_generation_ledger;

create policy vixel_koc_runtime_server_access
  on vixel_koc.media_generation_ledger
  for all
  to vixel_koc_runtime
  using (true)
  with check (true);

comment on schema vixel_koc is
  'Private server-only schema for Vixel KOC Studio.';

comment on table vixel_koc.media_generation_ledger is
  'Durable paid-media submission, idempotency, result, and recovery ledger.';

comment on role vixel_koc_runtime is
  'NOLOGIN capability role for the Vixel KOC server ledger connection.';
