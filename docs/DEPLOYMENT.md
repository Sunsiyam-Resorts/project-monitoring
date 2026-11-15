# Container deployment (internal server 192.168.135.39)

Use ONLY `Sunsiyam-Resorts/project-monitoring` for the portal. The ERP repository `Sunsiyam-Resorts/rene-next` is changed only for the single sign-on link. Do not import or change another repository.

The portal runs in Docker on the internal Ubuntu server at 192.168.135.39. `compose.yaml` starts two containers:

- `portal`: built from the repository's `Dockerfile`; Node.js serves `public/` and the API (`scripts/serve.mjs`) on port 3000.
- `db`: PostgreSQL 17. Its data lives in the Docker volume `project-monitoring_pgdata`, under `/var/lib/docker/volumes/` on the server. Its port is not published, so only the portal container can reach it.

For now the portal is served over **plain HTTP** at `http://192.168.135.39:3000`. Passwords, authenticator codes and session cookies cross the network unencrypted, so do not enter real finance records until HTTPS is in place (see [Moving to HTTPS](#moving-to-https)). This replaces the earlier Vercel and 130.3 deployments; `vercel.json` is kept only until cut-over.

## 1. Server prerequisites

Docker Engine with the Compose plugin, and git:

```sh
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
docker compose version
```

Docker's own packages (`docker-ce`, `docker-compose-plugin`, from https://docs.docker.com/engine/install/ubuntu/) work as well. If `ufw` is active, allow the portal port: `sudo ufw allow 3000/tcp`.

## 2. Get the code

```sh
sudo git clone https://github.com/Sunsiyam-Resorts/project-monitoring.git /opt/project-monitoring
cd /opt/project-monitoring
```

The server deploys `main`, which records what is released.

## 3. Environment

Create `/opt/project-monitoring/.env` from the template, readable only by root and never committed:

```sh
cd /opt/project-monitoring
sudo install -m 600 .env.example .env
sudo sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/; s/^AUTH_ENCRYPTION_KEY=.*/AUTH_ENCRYPTION_KEY=$(openssl rand -hex 32)/" .env
sudo nano .env    # fill in the initial Admin
```

| Variable | Value |
|---|---|
| POSTGRES_PASSWORD | Database password, used by both containers. Hexadecimal (as generated above) so it is safe inside the connection URL. Set it before the first start; changing it later does not change the existing database user's password. |
| PORTAL_PORT | Host port for the portal, default `3000`. |
| ADMIN_USERNAME | Initial administrator username, e.g. abuney |
| ADMIN_EMAIL | Administrator email |
| ADMIN_PASSWORD | Strong initial password, 12–256 characters. Wrap it in single quotes (`'...'`) so characters such as `$` and `#` are kept literally. |
| AUTH_ENCRYPTION_KEY | Random 32-byte key written as 64 hexadecimal characters (`openssl rand -hex 32`). |
| RESEND_API_KEY | Email service key for password reset OTP. Empty disables email reset. |
| MAIL_FROM | Verified sender, e.g. Project Portal <portal@yourdomain> |
| ERP_SSO_SECRET | Shared ERP single sign-on secret, at least 32 bytes (`openssl rand -base64 32`). Must equal the ERP's `PROJECT_MONITORING_SSO_SECRET`. Empty disables ERP sign-in. |
| NODE_ENV | Leave unset while the portal is on plain HTTP. `production` marks the session cookie `Secure`, which browsers refuse over HTTP, so nobody could sign in. Set it to `production` once HTTPS is in place. |

`compose.yaml` sets `DATABASE_URL`, `HOST` and `PORT` for the portal container itself; values for them in `.env` are ignored there (they are used only by local `npm run dev`).

Keep all values out of GitHub and chat messages. The application creates its own tables and first Admin if the database is empty. Initial Admin settings remain required by the bootstrap; changing them does not reset an existing user's password. Do not rotate AUTH_ENCRYPTION_KEY without re-encrypting existing authenticator keys. Rotating ERP_SSO_SECRET requires changing it in the ERP at the same time.

## 4. Start

```sh
cd /opt/project-monitoring
sudo docker compose up -d --build
sudo docker compose ps                                   # both services "healthy"
curl -s http://127.0.0.1:3000/api/index?action=config    # {"configured":true,"demo":false,...}
sudo docker compose logs -f portal                       # follow the portal log
```

Both containers restart automatically after a crash or a server reboot (`restart: unless-stopped`).

## 5. Update

```sh
cd /opt/project-monitoring
sudo git pull
sudo docker compose up -d --build
```

The database volume is kept across rebuilds and restarts. **Never run `docker compose down -v`**: `-v` deletes the volume and with it the database.

## 6. Backups

Nightly database dump on the server, kept 14 days, in `/etc/cron.d/project-monitoring-backup`:

```cron
30 2 * * * root cd /opt/project-monitoring && docker compose exec -T db pg_dump -U portal -Fc portal > /var/backups/project-monitoring/portal-$(date +\%F).dump && find /var/backups/project-monitoring -name 'portal-*.dump' -mtime +14 -delete
```

Create the folder first with `sudo install -d -m 700 /var/backups/project-monitoring`. Copy the dumps to another machine as well; a backup on the same disk is lost with it. Restore into the running database (this replaces its contents):

```sh
sudo docker compose exec -T db pg_restore -U portal -d portal --clean --if-exists < /var/backups/project-monitoring/portal-YYYY-MM-DD.dump
sudo docker compose restart portal
```

## 7. ERP single sign-on

In the ERP (`rene`) environment, set:

- `PROJECT_MONITORING_URL` — the portal's origin, currently `http://192.168.135.39:3000` (the HTTPS origin once HTTPS is in place)
- `PROJECT_MONITORING_SSO_SECRET` — the same value as the portal's `ERP_SSO_SECRET`

The ERP sidebar's **Project Monitoring** item opens `/api/project-monitoring/launch` in the ERP, which redirects to `<portal>/api/index?action=sso&token=…`. The portal signs in the active portal user with the same email, without password or TOTP, and records "Signed in via ERP" in the audit. ERP users without a portal account, or with an inactive one, land on the portal login with "ERP sign-in failed". Create portal users with the same email they use in the ERP.

## Moving to HTTPS

Put an HTTPS reverse proxy in front of the portal, then:

1. Obtain a TLS certificate for the address users will open: from an internal CA for an internal DNS name pointing at the server (recommended), or with the server IP in its Subject Alternative Name (e.g. `IP:192.168.135.39`). Install the internal CA on staff devices so browsers trust it.
2. In `compose.yaml`, publish the portal only to the proxy: `"127.0.0.1:3000:3000"`.
3. Add `NODE_ENV=production` to `.env`, then `sudo docker compose up -d`.
4. Update `PROJECT_MONITORING_URL` in the ERP to the HTTPS origin.

nginx on the server:

```nginx
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name _;
    ssl_certificate     /etc/ssl/project-monitoring/cert.pem;
    ssl_certificate_key /etc/ssl/project-monitoring/key.pem;
    client_max_body_size 4m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;                    # required by the API's same-origin check
        proxy_set_header X-Forwarded-For $remote_addr;  # set, not appended, so sign-in throttling cannot be spoofed
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

ERP sign-in links carry a 60-second single-use token in the query string. To keep it out of access logs, use a log format without `$request_uri` arguments for `/api/index`, or accept the logged tokens since they cannot be reused.

Until then, note that sign-in throttling keys on the `X-Forwarded-For` header when a request carries one. With no proxy in front, a client can send its own value and so avoid the attempt limit; the mandatory authenticator code still applies.

## First sign-in

Enter the initial username/password, choose **Scan QR code** or **Enter setup key**, add the account to an authenticator app, and verify its six-digit code. The QR code is generated by the application without an external QR service. Subsequent password sign-ins require both factors. Email OTP password reset requires the verified Resend sender and does not remove authenticator enrolment.

Developers can review [DATABASE.md](DATABASE.md) for the storage model and setup, and [database-example.sql](database-example.sql) for the matching schema and read-only inspection examples.

Create companies/projects/budgets/suppliers, then users and their company access. Do not enter real finance records until the live checks below pass and HTTPS is in place.

## Live acceptance checks

- Open the portal; once on HTTPS, confirm the browser trusts the certificate and the session cookie is marked `Secure`.
- Create a test record (confirms the same-origin check succeeds for the address users open).
- From the ERP, click **Project Monitoring**: you land signed in as the matching user. Reloading the same sign-in link fails (single use). An ERP user without a portal account lands on the login screen.
- Log in as separate actual users in separate browsers. Check company scope and team-specific approvals.
- Attempt to open the same request twice as different users; check lock expiry and Admin unlock.
- Submit two requests concurrently to test order balance protection and unique sequences in PostgreSQL.
- Upload, retrieve and print real test PDFs under the size limit.
- Verify mandatory TOTP for password sign-in, expired/invalid codes, sign-out and actual email OTP reset delivery.
- Confirm persistent records after `sudo docker compose down && sudo docker compose up -d` and after a server reboot; test a backup restore.

## Architecture and verification limits

Static browser UI + Node.js API (`api/index.mjs`, served by `scripts/serve.mjs`) in the `portal` container + PostgreSQL in the `db` container, on 192.168.135.39. The local checks cover domain logic, authentication primitives (including ERP token verification) and DOM interaction, not production database/network integration or browser visual layout. The server, Docker, certificate and email accounts must be set up separately; the repository alone does not provision those services.

The database code follows node-postgres's same-client transactions: https://node-postgres.com/features/transactions
