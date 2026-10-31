# Self-hosted deployment (internal server 130.3)

Use ONLY `abuney9/sun-siyam-project-monitoring` for the portal. The ERP repository `Sunsiyam-Resorts/rene-next` is changed only for the single sign-on link. Do not import or change another repository.

The portal runs as a Node.js process on the internal server at 130.3, behind an nginx HTTPS reverse proxy, with PostgreSQL. It replaces the earlier Vercel deployment; `vercel.json` is kept only until cut-over.

## 1. Server prerequisites

- Node.js 22 or later.
- PostgreSQL 14 or later. A local instance on the same server is fine; use a dedicated database and user.
- nginx.
- A TLS certificate for the address users will open:
  - from an internal CA, with the server IP in its Subject Alternative Name (e.g. `IP:192.168.130.3`), or
  - for an internal DNS name pointing at the server (recommended; certificates for bare IPs are awkward to manage).
  - Install the internal CA on staff devices so browsers trust it.

## 2. Install the portal

```sh
git clone https://github.com/abuney9/sun-siyam-project-monitoring.git /opt/project-monitoring
cd /opt/project-monitoring
npm ci --omit=dev
```

Updates: `git pull && npm ci --omit=dev`, then restart the service.

## 3. Environment

Create `/opt/project-monitoring/.env` (readable only by the service user, never committed):

| Variable | Value |
|---|---|
| NODE_ENV | `production` (marks the session cookie `Secure`; requires HTTPS) |
| PORT | `3000` |
| HOST | `127.0.0.1` (only nginx should reach the Node process) |
| DATABASE_URL | e.g. `postgres://portal:<password>@127.0.0.1:5432/portal` |
| ADMIN_USERNAME | Initial administrator username, e.g. abuney |
| ADMIN_EMAIL | Administrator email |
| ADMIN_PASSWORD | Strong initial password, 12–256 characters |
| AUTH_ENCRYPTION_KEY | Random 32-byte key written as 64 hexadecimal characters |
| RESEND_API_KEY | Email service key for password reset OTP |
| MAIL_FROM | Verified sender, e.g. Project Portal <portal@yourdomain> |
| ERP_SSO_SECRET | Shared ERP single sign-on secret, at least 32 bytes. Must equal the ERP's `PROJECT_MONITORING_SSO_SECRET`. Empty disables ERP sign-in. |

Generate keys locally with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # AUTH_ENCRYPTION_KEY
openssl rand -base64 32                                                     # ERP_SSO_SECRET
```

Keep all values out of GitHub and chat messages. The application creates its own tables and first Admin if the database is empty. Initial Admin settings remain required by the bootstrap; changing them does not reset an existing user's password. Do not rotate AUTH_ENCRYPTION_KEY without re-encrypting existing authenticator keys. Rotating ERP_SSO_SECRET requires changing it in the ERP at the same time.

Without DATABASE_URL the site serves only the browser-local demo workspace; the demo actor selector is a testing tool, not a secure login.

## 4. Run as a service (systemd)

`/etc/systemd/system/project-monitoring.service`:

```ini
[Unit]
Description=Sun Siyam Project Monitoring portal
After=network.target postgresql.service

[Service]
User=portal
WorkingDirectory=/opt/project-monitoring
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now project-monitoring`. On a Windows server, run `npm start` under a service wrapper (e.g. NSSM) with the same working directory.

`scripts/serve.mjs` serves `public/` and the API, and sends the same security headers as `vercel.json`.

## 5. nginx HTTPS reverse proxy

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

## 6. ERP single sign-on

In the ERP (`rene`) environment, set:

- `PROJECT_MONITORING_URL` — the portal's HTTPS origin, e.g. `https://192.168.130.3`
- `PROJECT_MONITORING_SSO_SECRET` — the same value as the portal's `ERP_SSO_SECRET`

The ERP sidebar's **Project Monitoring** item opens `/api/project-monitoring/launch` in the ERP, which redirects to `<portal>/api/index?action=sso&token=…`. The portal signs in the active portal user with the same email, without password or TOTP, and records "Signed in via ERP" in the audit. ERP users without a portal account, or with an inactive one, land on the portal login with "ERP sign-in failed". Create portal users with the same email they use in the ERP.

## First sign-in

Enter the initial username/password, choose **Scan QR code** or **Enter setup key**, add the account to an authenticator app, and verify its six-digit code. The QR code is generated by the application without an external QR service. Subsequent password sign-ins require both factors. Email OTP password reset requires the verified Resend sender and does not remove authenticator enrolment.

Developers can review [DATABASE.md](DATABASE.md) for the storage model and setup, and [database-example.sql](database-example.sql) for the matching schema and read-only inspection examples.

Create companies/projects/budgets/suppliers, then users and their company access. Do not enter real finance records until the live checks below pass.

## Live acceptance checks

- Open the portal over HTTPS; confirm the browser trusts the certificate and the session cookie is marked `Secure`.
- Create a test record (confirms nginx passes Host and the same-origin check succeeds).
- From the ERP, click **Project Monitoring**: you land signed in as the matching user. Reloading the same sign-in link fails (single use). An ERP user without a portal account lands on the login screen.
- Log in as separate actual users in separate browsers. Check company scope and team-specific approvals.
- Attempt to open the same request twice as different users; check lock expiry and Admin unlock.
- Submit two requests concurrently to test order balance protection and unique sequences in PostgreSQL.
- Upload, retrieve and print real test PDFs under the size limit.
- Verify mandatory TOTP for password sign-in, expired/invalid codes, sign-out and actual email OTP reset delivery.
- Confirm persistent records after a service restart; set up and test PostgreSQL backups/restores (e.g. nightly `pg_dump`).

## Architecture and verification limits

Static browser UI + Node.js API (`api/index.mjs`, served by `scripts/serve.mjs`) + PostgreSQL, behind nginx HTTPS on 130.3. The local checks cover domain logic, authentication primitives (including ERP token verification) and DOM interaction, not production database/network integration or browser visual layout. The server, database, certificate and email accounts must be set up separately; the repository alone does not provision those services.

The database code follows node-postgres's same-client transactions: https://node-postgres.com/features/transactions
