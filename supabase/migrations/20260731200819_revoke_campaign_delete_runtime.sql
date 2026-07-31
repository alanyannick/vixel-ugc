-- Campaign removal is implemented as a soft delete (`deleted_at`). Keep the
-- production runtime role from bypassing that retention path accidentally.
revoke delete on table vixel_ugc.campaign_snapshots from vixel_ugc_runtime;
