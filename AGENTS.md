# Project boundary

Use ONLY GitHub repository `Sunsiyam-Resorts/project-monitoring` for this project or any related work. The single exception is the ERP repository `Sunsiyam-Resorts/rene-next` (local `D:codeene`), which may be changed only for the ERP single sign-on link to this portal. Do not access, modify, delete, clear, or overwrite any other repository. In particular, do not touch `Test1`.

# Workflow contract

Read `docs/SPECIFICATION.md` before changes. Main requests are unapproved parent orders. Payment requests are separate children with independent approvals. Never inherit approval from a sibling or parent. Company visibility and role actions must be enforced server-side. Preserve sequence, audit, approved budgets, prior revisions and payment history.

# Checks

Run `npm test` and `npm run build` after workflow or UI changes. Never commit secrets or real finance records. Demo data is explicitly fictional and browser-local. Do not describe demo role switching as secure login. Live use requires PostgreSQL, initial Admin environment configuration, mandatory TOTP for password sign-in and email service for password resets. ERP single sign-on deliberately skips the portal password and TOTP (see `docs/SPECIFICATION.md`, Access and login).

# Deployment

The source repository is GitHub. The portal is self-hosted in Docker on the internal server at 192.168.135.39: the `portal` image is built from the repository's `Dockerfile` and runs with PostgreSQL through `compose.yaml`. It is served over plain HTTP on port 3000 until an HTTPS reverse proxy is added (this replaces the earlier Vercel and 130.3 choices). Do not create an alternate source repository or hosting service. Follow `docs/DEPLOYMENT.md`. Push only the `dev` branch; `main` changes only through pull requests from `dev` on GitHub (see `CLAUDE.md`).
