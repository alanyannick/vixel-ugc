revoke select, insert, update
  on vixel_koc.media_generation_ledger
  from vixel_ugc_runtime;

drop policy if exists vixel_ugc_runtime_media_access
  on vixel_koc.media_generation_ledger;

comment on policy vixel_koc_runtime_server_access
  on vixel_koc.media_generation_ledger is
  'Single server-only policy for the reviewed paid-generation ledger contract.';
