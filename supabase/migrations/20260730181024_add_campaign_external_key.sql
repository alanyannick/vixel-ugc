alter table vixel_ugc.campaign_snapshots
  add column if not exists campaign_key varchar(180);

update vixel_ugc.campaign_snapshots
set campaign_key = id::text
where campaign_key is null;

alter table vixel_ugc.campaign_snapshots
  alter column campaign_key set not null;

create unique index if not exists campaign_user_key_unique
  on vixel_ugc.campaign_snapshots (user_id, campaign_key);
