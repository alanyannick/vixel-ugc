create schema if not exists vixel_ugc;

revoke all on schema vixel_ugc from public;
revoke all on schema vixel_ugc from anon;
revoke all on schema vixel_ugc from authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_roles
    where rolname = 'vixel_ugc_runtime'
  ) then
    create role vixel_ugc_runtime nologin;
  end if;
end
$$;

create table if not exists vixel_ugc.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  display_name varchar(120),
  company varchar(160),
  use_case varchar(1000),
  expected_volume varchar(80),
  account_status text not null default 'pending' check (
    account_status in ('pending', 'approved', 'suspended')
  ),
  app_role text not null default 'user' check (
    app_role in ('user', 'admin')
  ),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

create table if not exists vixel_ugc.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email))),
  display_name varchar(120),
  company varchar(160),
  use_case varchar(1000),
  expected_volume varchar(80),
  status text not null default 'pending' check (
    status in (
      'pending',
      'approved',
      'invited',
      'rejected',
      'converted'
    )
  ),
  source varchar(120) not null default 'product-entry',
  internal_note varchar(4000),
  converted_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  invitation_expires_at timestamptz,
  last_reminder_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

create table if not exists vixel_ugc.email_preferences (
  email text primary key check (email = lower(btrim(email))),
  user_id uuid unique references auth.users(id) on delete set null,
  product_updates_opted_in boolean not null default false,
  consent_source varchar(120),
  consent_recorded_at timestamptz,
  provider_contact_id varchar(160),
  provider_projected_at timestamptz,
  suppressed_at timestamptz,
  suppression_reason varchar(240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    product_updates_opted_in = false
    or consent_recorded_at is not null
  )
);

create table if not exists vixel_ugc.campaign_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title varchar(240) not null,
  snapshot jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, id)
);

create table if not exists vixel_ugc.email_delivery_ledger (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in (
      'waitlist_confirmation',
      'welcome',
      'waitlist_approved',
      'invitation',
      'invitation_reminder'
    )
  ),
  recipient_email text not null check (
    recipient_email = lower(btrim(recipient_email))
  ),
  user_id uuid references auth.users(id) on delete set null,
  waitlist_entry_id uuid
    references vixel_ugc.waitlist_entries(id)
    on delete set null,
  idempotency_key varchar(200) not null unique,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'sent', 'failed', 'canceled')
  ),
  template_payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 10),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  provider_message_id varchar(200) unique,
  last_error_code varchar(120),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vixel_ugc.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id varchar(160) not null unique,
  stripe_subscription_id varchar(160) unique,
  stripe_price_id varchar(160),
  status text not null default 'none' check (
    status in (
      'none',
      'checkout_pending',
      'trialing',
      'active',
      'past_due',
      'unpaid',
      'paused',
      'canceled',
      'incomplete',
      'incomplete_expired'
    )
  ),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_provider_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vixel_ugc.provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'resend')),
  provider_event_id varchar(200) not null,
  event_type varchar(200) not null,
  payload_sha256 char(64) not null,
  provider_occurred_at timestamptz,
  processed_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists vixel_ugc.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_user_id uuid references auth.users(id) on delete set null,
  waitlist_entry_id uuid
    references vixel_ugc.waitlist_entries(id)
    on delete set null,
  action varchar(160) not null,
  before_state jsonb,
  after_state jsonb,
  request_id varchar(160),
  created_at timestamptz not null default now()
);

create index if not exists waitlist_status_created_idx
  on vixel_ugc.waitlist_entries (status, created_at desc);

create index if not exists waitlist_reminder_idx
  on vixel_ugc.waitlist_entries (invited_at, last_reminder_at)
  where status = 'invited';

create index if not exists campaign_user_updated_idx
  on vixel_ugc.campaign_snapshots (user_id, updated_at desc)
  where deleted_at is null;

create index if not exists email_delivery_claim_idx
  on vixel_ugc.email_delivery_ledger (next_attempt_at, created_at)
  where status in ('pending', 'failed');

create index if not exists email_delivery_waitlist_idx
  on vixel_ugc.email_delivery_ledger (waitlist_entry_id, created_at desc)
  where waitlist_entry_id is not null;

create index if not exists audit_waitlist_created_idx
  on vixel_ugc.audit_events (waitlist_entry_id, created_at desc)
  where waitlist_entry_id is not null;

create or replace function vixel_ugc.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function vixel_ugc.touch_updated_at() from public;
revoke all on function vixel_ugc.touch_updated_at() from anon;
revoke all on function vixel_ugc.touch_updated_at() from authenticated;

drop trigger if exists user_profiles_touch_updated_at
  on vixel_ugc.user_profiles;
create trigger user_profiles_touch_updated_at
before update on vixel_ugc.user_profiles
for each row execute function vixel_ugc.touch_updated_at();

drop trigger if exists waitlist_entries_touch_updated_at
  on vixel_ugc.waitlist_entries;
create trigger waitlist_entries_touch_updated_at
before update on vixel_ugc.waitlist_entries
for each row execute function vixel_ugc.touch_updated_at();

drop trigger if exists email_preferences_touch_updated_at
  on vixel_ugc.email_preferences;
create trigger email_preferences_touch_updated_at
before update on vixel_ugc.email_preferences
for each row execute function vixel_ugc.touch_updated_at();

drop trigger if exists campaign_snapshots_touch_updated_at
  on vixel_ugc.campaign_snapshots;
create trigger campaign_snapshots_touch_updated_at
before update on vixel_ugc.campaign_snapshots
for each row execute function vixel_ugc.touch_updated_at();

drop trigger if exists email_delivery_ledger_touch_updated_at
  on vixel_ugc.email_delivery_ledger;
create trigger email_delivery_ledger_touch_updated_at
before update on vixel_ugc.email_delivery_ledger
for each row execute function vixel_ugc.touch_updated_at();

drop trigger if exists subscriptions_touch_updated_at
  on vixel_ugc.subscriptions;
create trigger subscriptions_touch_updated_at
before update on vixel_ugc.subscriptions
for each row execute function vixel_ugc.touch_updated_at();

create or replace function vixel_ugc.create_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
  matching_waitlist vixel_ugc.waitlist_entries%rowtype;
begin
  normalized_email := lower(btrim(coalesce(new.email, '')));

  if normalized_email = '' then
    return new;
  end if;

  select *
  into matching_waitlist
  from vixel_ugc.waitlist_entries
  where email = normalized_email;

  insert into vixel_ugc.user_profiles (
    user_id,
    email,
    display_name,
    company,
    use_case,
    expected_volume,
    account_status
  )
  values (
    new.id,
    normalized_email,
    matching_waitlist.display_name,
    matching_waitlist.company,
    matching_waitlist.use_case,
    matching_waitlist.expected_volume,
    case
      when matching_waitlist.status in ('approved', 'invited', 'converted')
        then 'approved'
      else 'pending'
    end
  )
  on conflict (user_id) do update
  set email = excluded.email;

  update vixel_ugc.waitlist_entries
  set
    converted_user_id = new.id,
    status = case
      when status = 'invited' then 'converted'
      else status
    end
  where email = normalized_email;

  insert into vixel_ugc.email_preferences (email, user_id)
  values (normalized_email, new.id)
  on conflict (email) do update
  set user_id = excluded.user_id;

  return new;
end;
$$;

revoke all on function vixel_ugc.create_auth_user_profile() from public;
revoke all on function vixel_ugc.create_auth_user_profile() from anon;
revoke all on function vixel_ugc.create_auth_user_profile() from authenticated;

drop trigger if exists vixel_ugc_create_auth_user_profile on auth.users;
create trigger vixel_ugc_create_auth_user_profile
after insert or update of email on auth.users
for each row execute function vixel_ugc.create_auth_user_profile();

alter table vixel_koc.media_generation_ledger
  add column if not exists account_user_id uuid
    references auth.users(id)
    on delete set null;

create index if not exists media_generation_account_created_idx
  on vixel_koc.media_generation_ledger (account_user_id, created_at desc)
  where account_user_id is not null;

alter table vixel_ugc.user_profiles enable row level security;
alter table vixel_ugc.user_profiles force row level security;
alter table vixel_ugc.waitlist_entries enable row level security;
alter table vixel_ugc.waitlist_entries force row level security;
alter table vixel_ugc.email_preferences enable row level security;
alter table vixel_ugc.email_preferences force row level security;
alter table vixel_ugc.campaign_snapshots enable row level security;
alter table vixel_ugc.campaign_snapshots force row level security;
alter table vixel_ugc.email_delivery_ledger enable row level security;
alter table vixel_ugc.email_delivery_ledger force row level security;
alter table vixel_ugc.subscriptions enable row level security;
alter table vixel_ugc.subscriptions force row level security;
alter table vixel_ugc.provider_webhook_events enable row level security;
alter table vixel_ugc.provider_webhook_events force row level security;
alter table vixel_ugc.audit_events enable row level security;
alter table vixel_ugc.audit_events force row level security;

revoke all on all tables in schema vixel_ugc from public;
revoke all on all tables in schema vixel_ugc from anon;
revoke all on all tables in schema vixel_ugc from authenticated;

grant usage on schema vixel_ugc to vixel_ugc_runtime;

grant select, insert, update
  on vixel_ugc.user_profiles,
     vixel_ugc.waitlist_entries,
     vixel_ugc.email_preferences,
     vixel_ugc.email_delivery_ledger,
     vixel_ugc.subscriptions
  to vixel_ugc_runtime;

grant select, insert, update, delete
  on vixel_ugc.campaign_snapshots
  to vixel_ugc_runtime;

grant select, insert
  on vixel_ugc.provider_webhook_events,
     vixel_ugc.audit_events
  to vixel_ugc_runtime;

grant select, insert, update
  on vixel_koc.media_generation_ledger
  to vixel_ugc_runtime;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'user_profiles',
    'waitlist_entries',
    'email_preferences',
    'campaign_snapshots',
    'email_delivery_ledger',
    'subscriptions',
    'provider_webhook_events',
    'audit_events'
  ]
  loop
    execute format(
      'drop policy if exists vixel_ugc_runtime_server_access on vixel_ugc.%I',
      relation_name
    );
    execute format(
      'create policy vixel_ugc_runtime_server_access on vixel_ugc.%I
       for all to vixel_ugc_runtime using (true) with check (true)',
      relation_name
    );
  end loop;
end
$$;

drop policy if exists vixel_ugc_runtime_media_access
  on vixel_koc.media_generation_ledger;

create policy vixel_ugc_runtime_media_access
  on vixel_koc.media_generation_ledger
  for all
  to vixel_ugc_runtime
  using (true)
  with check (true);

comment on schema vixel_ugc is
  'Private server-only schema for Vixel UGC accounts, operations, and billing.';

comment on role vixel_ugc_runtime is
  'NOLOGIN capability role for the Vixel UGC application server.';

comment on table vixel_ugc.email_delivery_ledger is
  'Idempotent application-owned lifecycle email outbox and delivery ledger.';

comment on table vixel_ugc.provider_webhook_events is
  'Replay ledger containing provider event metadata and payload digests only.';
