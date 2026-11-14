@AGENTS.md
@docs/GAME.md

## Claude Code specifics
- You are the engineer: native modules, game rules, server, state, wiring screens. Codex owns design, sprites, theme and `src/ui/`.
- Ask before outward-facing actions: deploys, creating cloud resources, posting to external services. Pushing feature branches to `origin` is fine; merging to `main` goes through the user.
- When Codex delivers a component in `src/ui/`, wire it in. Don't restyle it. File visual issues in `design/requests.md` instead.
