# Project boundary

Use ONLY GitHub repository `abuney9/sun-siyam-project-monitoring` for this project or any related work. The single exception is the ERP repository `Sunsiyam-Resorts/rene-next` (local `D:codeene`), which may be changed only for the ERP single sign-on link to this portal. Do not access, modify, delete, clear, or overwrite any other repository. In particular, do not touch `Test1`.

# Workflow contract

Read `docs/SPECIFICATION.md` before changes. Main requests are unapproved parent orders. Payment requests are separate children with independent approvals. Never inherit approval from a sibling or parent. Company visibility and role actions must be enforced server-side. Preserve sequence, audit, approved budgets, prior revisions and payment history.

# Checks

Run `npm test` and `npm run build` after workflow or UI changes. Never commit secrets or real finance records. Demo data is explicitly fictional and browser-local. Do not describe demo role switching as secure login. Live use requires PostgreSQL, initial Admin environment configuration, mandatory TOTP for password sign-in and email service for password resets. ERP single sign-on deliberately skips the portal password and TOTP (see `docs/SPECIFICATION.md`, Access and login).

# Deployment

The source repository is GitHub. The portal is self-hosted on the internal server at 130.3 behind an HTTPS reverse proxy (this replaces the earlier Vercel choice). Do not create an alternate source repository or hosting service. Follow `docs/DEPLOYMENT.md`.
