# CLAUDE.md

Project rules for this repository are in [AGENTS.md](AGENTS.md); read it and `docs/SPECIFICATION.md` before making changes.

@AGENTS.md

## Interface components

- Use shadcn/ui components, customised to the portal theme, for all UI. **Never create a custom component when shadcn has one.** Add missing ones with `npx shadcn add` and restyle them in `frontend/src/components/ui/` (details in `AGENTS.md`, Interface components).

## Branches and pushing

- The GitHub repository is `Sunsiyam-Resorts/project-monitoring`.
- `main` is the official branch. It records what is released and is changed **only by merging a pull request on GitHub**.
- Do all work on `dev`. Commit to `dev` and push only `dev` (`git push origin dev`).
- **Never push to `main`**: no `git push origin main`, no force-push, and no pushing another branch onto `main`. Do not merge into `main` locally.
- To release, open a pull request from `dev` into `main` on GitHub (https://github.com/Sunsiyam-Resorts/project-monitoring/compare/main...dev) and let it be reviewed and merged there.
- Before pushing `dev`, run the checks in `AGENTS.md` (in `frontend/`: `npm test`, `npm run build`, and `npm run traces` when the workflow rules changed; in `backend/`: `go vet ./...`, `go test ./...`), and pull the latest `main` into `dev` if the pull request would conflict.
