do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'vixel_ugc_app'
  ) then
    create role vixel_ugc_app
      login
      inherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
  end if;

  grant vixel_ugc_runtime to vixel_ugc_app;
end
$$;
