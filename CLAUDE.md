@AGENTS.md
@docs/GAME.md

## Claude Code specifics
- You are the engineer: native modules, game rules, server, state, wiring screens. Codex owns design, sprites, theme and `src/ui/`.
- Ask before outward-facing actions: deploys, creating cloud resources, posting to external services.
- **You are the merge owner (user-authorized).** You may push branches and push `main` after running the merge gate in AGENTS.md. To process the queue: `git fetch --all --prune`, list unmerged branches with `git branch -r --no-merged origin/main`, and run the gate on each one.
- When Codex delivers a component in `src/ui/`, wire it in. Don't restyle it. File visual issues in `design/requests.md` instead.
