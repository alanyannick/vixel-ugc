create index if not exists user_profiles_approved_by_idx
  on vixel_ugc.user_profiles (approved_by)
  where approved_by is not null;

create index if not exists waitlist_converted_user_idx
  on vixel_ugc.waitlist_entries (converted_user_id)
  where converted_user_id is not null;

create index if not exists waitlist_approved_by_idx
  on vixel_ugc.waitlist_entries (approved_by)
  where approved_by is not null;

create index if not exists email_delivery_user_idx
  on vixel_ugc.email_delivery_ledger (user_id)
  where user_id is not null;

create index if not exists audit_actor_created_idx
  on vixel_ugc.audit_events (actor_user_id, created_at desc)
  where actor_user_id is not null;

create index if not exists audit_subject_created_idx
  on vixel_ugc.audit_events (subject_user_id, created_at desc)
  where subject_user_id is not null;
