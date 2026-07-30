# NewAPI HTTPS compatibility gateway

Vixel UGC uses `https://newapi-koc.vixelai.com:3000/v1` as its server-only
provider base. Production code rejects a plaintext provider URL.

The shared NewAPI service historically listened on plaintext port 3000. The
checked-in target configuration removes that credential-exposure path while
retaining TLS on the same public port:

- plaintext HTTP receives `426 HTTPS Required` and never reaches NewAPI;
- TLS is terminated on `127.0.0.1:3443`, then forwarded to the same upstream;
- the NewAPI container is bound only to `127.0.0.1:3001`;
- HAProxy is pinned by image digest and owns public port 3000.

Applying this target configuration is intentionally breaking for legacy HTTP
clients. Inventory and migrate every shared NewAPI consumer to HTTPS first;
never send a bearer token through the compatibility route.

The certificate lives only on the NewAPI host. It was issued for
`newapi-koc.vixelai.com` by a DNS-01 challenge and expires on 2026-10-28.
Renew it before expiry, rebuild `tls.pem` from `fullchain.pem` and
`privkey.pem`, then restart only the HAProxy container.

Rollback:

1. stop and remove the `newapi-koc-haproxy` container;
2. restore the timestamped compose backup;
3. run `docker-compose up -d new-api`;
4. bind the restored service to loopback or a private network only;
5. verify the public plaintext route cannot reach an authenticated endpoint.

Do not restore a bearer-authenticated plaintext public listener as a normal
rollback. If emergency compatibility is unavoidable, rotate every exposed key
after the incident window and remove the route immediately.
