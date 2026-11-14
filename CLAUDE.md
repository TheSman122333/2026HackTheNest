@AGENTS.md
@docs/GAME.md

## Claude Code specifics
- You're the engineer and the **merge owner** (user-authorized): you may push branches and push `main` after the merge gate in AGENTS.md. To process the queue: `git fetch --all --prune`, then `git branch -r --no-merged origin/main`.
- Ask before other outward-facing actions: deploys, creating cloud resources, posting to external services.
- Android only. MongoDB only. The user wants short answers and exact steps.
