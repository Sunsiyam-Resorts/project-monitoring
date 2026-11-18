# Project boundary

Use ONLY GitHub repository `Sunsiyam-Resorts/project-monitoring` for this project or any related work. The single exception is the ERP repository `Sunsiyam-Resorts/rene-next` (local `D:codeene`), which may be changed only for the ERP single sign-on link to this portal. Do not access, modify, delete, clear, or overwrite any other repository. In particular, do not touch `Test1`.

# Workflow contract

Read `docs/SPECIFICATION.md` before changes. Main requests are unapproved parent orders. Payment requests are separate children with independent approvals. Never inherit approval from a sibling or parent. Company visibility and role actions must be enforced server-side. Preserve sequence, audit, approved budgets, prior revisions and payment history.

# Structure

The Go backend in `backend/` serves the API and the built React frontend from `frontend/`, and holds the authoritative workflow rules (`backend/internal/domain`). The frontend keeps a JavaScript copy of the same rules (`frontend/src/domain`) for the browser-only demo and on-screen figures. Change both copies together: after changing `frontend/src/domain`, run `npm run traces` in `frontend/` and make `go test ./...` in `backend/` pass, which replays the recorded JavaScript behaviour against Go.

# Interface components

The frontend UI is built only from shadcn/ui components (Tailwind CSS, Radix, Lucide icons), customised to the portal theme:
- **Components:** `frontend/src/components/ui/` holds them, each restyled once to the theme so every screen shares the same look.
- **Theme:** `frontend/src/styles/globals.css` holds the Light and Dark tokens.
- **Before writing UI:** use the shadcn component when one exists. **Do not create a custom component when shadcn provides one.**
- **Missing components:** add them with `npx shadcn add <name>` in `frontend/`. Then fix any `import { cn } from "cn"` to `@/lib/utils`, remove a stray `cn` package, and restyle the component to the theme in `components/ui/`.
- **Compositions:** app building blocks (page headers, status badges, form fields, record-dialog sections) are compositions of shadcn components in `frontend/src/components/ui.jsx` and `frontend/src/components/detail.jsx`. Reuse them before adding new ones.
- **Styling:** use Tailwind classes and the theme tokens: no new stylesheets, inline colours or hand-drawn icons. Icons come from Lucide via `components/Icon.jsx`.

# Checks

After workflow or UI changes run, in `frontend/`, `npm test` and `npm run build`, and in `backend/`, `go vet ./...` and `go test ./...` (Go 1.25; without a local Go use the `golang:1.25-alpine` Docker image). Never commit secrets or real finance records. Demo data is explicitly fictional and browser-local. Do not describe demo role switching as secure login. Live use requires PostgreSQL, initial Admin environment configuration, mandatory TOTP for password sign-in and email service for password resets. ERP single sign-on deliberately skips the portal password and TOTP (see `docs/SPECIFICATION.md`, Access and login).

# Deployment

The source repository is GitHub. The portal is self-hosted in Docker on the internal server at 192.168.135.39: the `portal` image is built from the repository's `Dockerfile` and runs with PostgreSQL through `compose.yaml`. Users open https://project.ssrsys.com: the server's Cloudflare Tunnel provides HTTPS and forwards to the portal, which is published only on `127.0.0.1:3080` (this replaces the earlier Vercel and 130.3 choices). Do not create an alternate source repository or hosting service. Follow `docs/DEPLOYMENT.md`. Push only the `dev` branch; `main` changes only through pull requests from `dev` on GitHub (see `CLAUDE.md`).
