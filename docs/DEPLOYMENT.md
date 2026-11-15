# Container deployment (https://project.ssrsys.com on 192.168.135.39)

Use ONLY `Sunsiyam-Resorts/project-monitoring` for the portal. The ERP repository `Sunsiyam-Resorts/rene-next` is changed only for the single sign-on link. Do not import or change another repository.

Users open **https://project.ssrsys.com**. Cloudflare provides HTTPS, and the Cloudflare Tunnel already running on the internal Ubuntu server at 192.168.135.39 (`cloudflared`) forwards requests to the portal at `http://localhost:3080`. `compose.yaml` starts two containers:

- `portal`: built from the repository's `Dockerfile`; Node.js serves `public/` and the API (`scripts/serve.mjs`) on port 3000 inside the container, published on the server only as `127.0.0.1:3080`, so the tunnel is the only way in.
- `db`: PostgreSQL 17. Its data lives in the Docker volume `project-monitoring_pgdata`, under `/var/lib/docker/volumes/` on the server. Its port is not published, so only the portal container can reach it.

The server also runs other Docker applications; the ERP already uses port 3000 there, and 3001, 3002 and 18080 are taken as well. This replaces the earlier Vercel and 130.3 deployments; `vercel.json` is kept only until cut-over.

## 1. Server prerequisites

Docker Engine with the Compose plugin, git and the Cloudflare Tunnel are already installed on 192.168.135.39. On a new server:

```sh
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
docker compose version
```

Docker's own packages (`docker-ce`, `docker-compose-plugin`, from https://docs.docker.com/engine/install/ubuntu/) work as well. No firewall port needs opening: the portal is reached only through the tunnel.

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
| PORTAL_PORT | Local port the tunnel forwards to, default `3080`. If you change it, change the tunnel's service URL too (`sudo ss -ltn` lists the ports in use). |
| ADMIN_USERNAME | Initial administrator username, e.g. abuney |
| ADMIN_EMAIL | Administrator email |
| ADMIN_PASSWORD | Strong initial password, 12–256 characters. Wrap it in single quotes (`'...'`) so characters such as `$` and `#` are kept literally. |
| AUTH_ENCRYPTION_KEY | Random 32-byte key written as 64 hexadecimal characters (`openssl rand -hex 32`). |
| RESEND_API_KEY | Email service key for password reset OTP. Empty disables email reset. |
| MAIL_FROM | Verified sender, e.g. Project Portal <portal@yourdomain> |
| ERP_SSO_SECRET | Shared ERP single sign-on secret, at least 32 bytes (`openssl rand -base64 32`). Must equal the ERP's `PROJECT_MONITORING_SSO_SECRET`. Empty disables ERP sign-in. |

`compose.yaml` sets `DATABASE_URL`, `HOST`, `PORT` and `NODE_ENV=production` (session cookie marked `Secure`) for the portal container itself; values for them in `.env` are ignored there (they are used only by local `npm run dev`).

Keep all values out of GitHub and chat messages. The application creates its own tables and first Admin if the database is empty. Initial Admin settings remain required by the bootstrap; changing them does not reset an existing user's password. Do not rotate AUTH_ENCRYPTION_KEY without re-encrypting existing authenticator keys. Rotating ERP_SSO_SECRET requires changing it in the ERP at the same time.

## 4. Start

```sh
cd /opt/project-monitoring
sudo docker compose up -d --build
sudo docker compose ps                                   # both services "healthy"
curl -s http://127.0.0.1:3080/api/index?action=config    # {"configured":true,"demo":false,...}
sudo docker compose logs -f portal                       # follow the portal log
```

Both containers restart automatically after a crash or a server reboot (`restart: unless-stopped`).

## 5. Cloudflare Tunnel

Add a public hostname to the server's existing tunnel that sends `project.ssrsys.com` to `http://localhost:3080`. `sudo systemctl cat cloudflared` shows how the tunnel is run:

- **Started with `--token`** (managed in the Cloudflare dashboard): Cloudflare One / Zero Trust → Networks → Tunnels → the server's tunnel → Public hostnames → Add: subdomain `project`, domain `ssrsys.com`, service type `HTTP`, URL `localhost:3080`. Cloudflare creates the DNS record.
- **Started with a config file** (usually `/etc/cloudflared/config.yml`): add this rule above the final catch-all rule, then run `cloudflared tunnel route dns <tunnel name> project.ssrsys.com` and `sudo systemctl restart cloudflared`:

  ```yaml
  - hostname: project.ssrsys.com
    service: http://localhost:3080
  ```

Then:

- Leave the tunnel's **HTTP Host Header** setting empty. The API's same-origin check needs requests to keep the `project.ssrsys.com` host, which cloudflared passes on by default.
- If `cloudflared` runs in a container rather than on the server itself, `localhost` there is the container; point the hostname at an address that reaches the server instead.
- Do not add a Cloudflare "Cache Everything" rule for this hostname. The portal sends its own `Cache-Control` headers: `no-cache` for pages and scripts (so a reload after an update gets the new version), one week for fonts and `no-store` for the API.
- Sign-in throttling counts attempts per visitor using Cloudflare's `CF-Connecting-IP` header. Keep the portal published only on `127.0.0.1`, so nobody can bypass Cloudflare and send that header themselves.

## 6. Update

```sh
cd /opt/project-monitoring
sudo git pull
sudo docker compose up -d --build
```

The database volume is kept across rebuilds and restarts. **Never run `docker compose down -v`**: `-v` deletes the volume and with it the database.

## 7. Backups

Nightly database dump on the server, kept 14 days, in `/etc/cron.d/project-monitoring-backup`:

```cron
30 2 * * * root cd /opt/project-monitoring && docker compose exec -T db pg_dump -U portal -Fc portal > /var/backups/project-monitoring/portal-$(date +\%F).dump && find /var/backups/project-monitoring -name 'portal-*.dump' -mtime +14 -delete
```

Create the folder first with `sudo install -d -m 700 /var/backups/project-monitoring`. Copy the dumps to another machine as well; a backup on the same disk is lost with it. Restore into the running database (this replaces its contents):

```sh
sudo docker compose exec -T db pg_restore -U portal -d portal --clean --if-exists < /var/backups/project-monitoring/portal-YYYY-MM-DD.dump
sudo docker compose restart portal
```

## 8. ERP single sign-on

In the ERP (`rene`) environment, set:

- `PROJECT_MONITORING_URL` — `https://project.ssrsys.com`
- `PROJECT_MONITORING_SSO_SECRET` — the same value as the portal's `ERP_SSO_SECRET`

The ERP sidebar's **Project Monitoring** item opens `/api/project-monitoring/launch` in the ERP, which redirects to `<portal>/api/index?action=sso&token=…`. The portal signs in the active portal user with the same email, without password or TOTP, and records "Signed in via ERP" in the audit. ERP users without a portal account, or with an inactive one, land on the portal login with "ERP sign-in failed". Create portal users with the same email they use in the ERP.

ERP sign-in links carry a 60-second single-use token in the query string; a logged copy cannot be reused.

## First sign-in

Enter the initial username/password, choose **Scan QR code** or **Enter setup key**, add the account to an authenticator app, and verify its six-digit code. The QR code is generated by the application without an external QR service. Subsequent password sign-ins require both factors. Email OTP password reset requires the verified Resend sender and does not remove authenticator enrolment.

Developers can review [DATABASE.md](DATABASE.md) for the storage model and setup, and [database-example.sql](database-example.sql) for the matching schema and read-only inspection examples.

Create companies/projects/budgets/suppliers, then users and their company access. Do not enter real finance records until the live checks below pass.

## Live acceptance checks

- Open https://project.ssrsys.com; confirm the certificate is valid and the session cookie is marked `Secure`.
- Create a test record (confirms the same-origin check succeeds through the tunnel).
- After an update, reload and confirm the new version appears (no stale cached scripts).
- From the ERP, click **Project Monitoring**: you land signed in as the matching user. Reloading the same sign-in link fails (single use). An ERP user without a portal account lands on the login screen.
- Log in as separate actual users in separate browsers. Check company scope and team-specific approvals.
- Attempt to open the same request twice as different users; check lock expiry and Admin unlock.
- Submit two requests concurrently to test order balance protection and unique sequences in PostgreSQL.
- Upload, retrieve and print real test PDFs under the size limit.
- Verify mandatory TOTP for password sign-in, expired/invalid codes, sign-out and actual email OTP reset delivery.
- Confirm persistent records after `sudo docker compose down && sudo docker compose up -d` and after a server reboot; test a backup restore.

## Architecture and verification limits

Browser → Cloudflare (HTTPS) → Cloudflare Tunnel on 192.168.135.39 → `portal` container (static UI + Node.js API, `api/index.mjs` served by `scripts/serve.mjs`) → `db` container (PostgreSQL). The local checks cover domain logic, authentication primitives (including ERP token verification) and DOM interaction, not production database/network integration or browser visual layout. The server, Docker, Cloudflare Tunnel and email accounts must be set up separately; the repository alone does not provision those services.

The database code follows node-postgres's same-client transactions: https://node-postgres.com/features/transactions
