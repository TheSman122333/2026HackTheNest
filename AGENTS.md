# AGENTS.md — rules for every AI agent and teammate in this repo

Project: **The Last Voyage**, a co-op pirate game fuelled by real life (Hack The Nest 2026).
Read `docs/GAME.md` first. Design work: `docs/DESIGN_BRIEF.md`.

## Who owns what
| Area | Owner |
|---|---|
| `apps/mobile/src/app/**`, `src/features/**`, `src/lib/**`, `modules/**` | Claude (engineering) |
| `packages/game/**` (pure rules + tests), `server/**` (Mongo API) | Claude |
| `apps/mobile/src/theme/**`, `apps/mobile/src/ui/**`, `assets/sprites/**` | Design teammate |
| `content/**` (islands, events, quests, narration text) | Teammates |
| root config, `package.json`, lockfile | Claude only. Ask for new dependencies in `docs/requests.md` |
| `docs/GAME.md` | Project lead (the user) |

## Git workflow
- **Only Claude merges into `main`.** Everyone else works on `<name>/<topic>` branches and pushes them. Never force-push.
- Before pushing: `git fetch && git merge origin/main`, then `npm run check` if you touched code.
- **Claude's merge gate:**
  1. Merge `origin/main` into the branch.
  2. `npm run check` (typecheck, lint, tests).
  3. Review: ownership, IP rules, sprite approval status, no secrets or big files.
  4. Merge with `--no-ff` and push.
- Never commit `node_modules/`, `.env*`, `apps/mobile/android/` or `apps/mobile/ios/` (generated), or files over 2 MB.

## Commands
```bash
npm install          # repo root only (npm workspaces)
npm run check        # everything: typecheck + lint + tests
npm run server       # API on :8787 (local MongoDB auto-starts if MONGODB_URI is unset)
cd apps/mobile && npx expo install <pkg>     # never `npm add` for Expo/RN packages
cd apps/mobile && npx expo run:android --device
```
Expo changes every SDK. Check `https://docs.expo.dev/versions/v58.0.0/` instead of memory.

## Hard rules
1. **Sprites:** app code may only use sprites marked `"approved"` in `assets/sprites/manifest.json`. Only the project lead approves.
2. **IP:** genre-inspired only (see `docs/DESIGN_BRIEF.md`).
3. **Privacy:** never read on-screen text from other apps. Face photos never go to AI services.
4. **No secrets in the app.** API keys live on the server.
5. Don't hand-edit `android/` or `ios/`. Use `app.json` and config plugins.
