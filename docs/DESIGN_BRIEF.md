# Design Brief

For whoever owns the look of *The Last Voyage*. Read `docs/GAME.md` first for what the game is.

## Constraints
- **Android phone, portrait.** Demo device: Pixel 10 Pro XL. Design at **412×915 dp**.
- Keep tap targets ≥ 48 dp and clear of the bottom gesture bar. No swipe interactions within 24 dp of the left or right edge (system back gesture).
- We have about 20 hours. A small, consistent, finished set beats a big rough one.

## IP rules (must pass)
Inspired by the shonen-adventure-manga *genre* only.
- **Not allowed:** straw hats, stretchy or rubber powers, fruit powers, "Grand Line"-style seas, "Pirate King", "nakama", bounty posters with money amounts, or anything that looks like an existing series' characters, logo or flags.
- Crew flags are built from our own parts: anchor, gull, star, wave, compass.

## Where design work goes
- Sprites: `assets/sprites/<category>/` as transparent PNGs, `snake_case.png`, exported at 3×.
- Register every sprite in `assets/sprites/manifest.json` with `"status": "pending"`. **The project lead approves each sprite before it's used** by setting `"approved"`.
- Theme tokens: `apps/mobile/src/theme/`. Presentational components: `apps/mobile/src/ui/`. These take props in and draw; no data fetching.
- Work on your own branch (`<name>/design`). Claude checks and merges into `main`.

## What the UI must show (the game's numbers)
- **Moves:** the main currency. Spent to move on islands and to act in boss fights.
- **Supplies:** the crew resource, used for ship upgrades.
- **Steps today**, and progress to the next Move.
- **Calm Seas streak:** days under your scroll limit. Plus the **Shore Leave** bonus and up to 2 **Streak Shields**.
- **Legend:** score for the yearly Lodestar race.
- **Skills:** Grit, Charm, Lore, Craft, Seacraft.

## Screens needed (priority order)
1. **Island board:** hex grid, terrain types, your token, Moves left, fog, items, boss at the center.
2. **Boss fight:** boss, your HP and the boss's HP, 4 actions (Strike, Cannon, Tonic, Brace), damage numbers.
3. **Ship (home):** ship, crew, Moves, Supplies, streak, today's quests.
4. **Quests / log activity:** activity buttons, steps progress, scroll limit progress.
5. **Onboarding:** sign in, a short quiz, photo face, create or join a crew (code or QR).
6. **Log feed and Me** (profile, streaks, Legend).

## Sprite list (priority order)
1. Hex tiles (pointy-top): beach, grass, jungle, rock, ruins, town, swamp, volcano, snow, sea, plus fog and a selected highlight.
2. 4 bosses: Tide Crab, Bog Lantern, Frost Walrus, Lava Golem.
3. Items: cutlass, cannon, tonic, mystery chest, supplies, timber, iron, spice, shard, clue.
4. Player token / chibi pirate (with a round face slot for the player's photo).
5. Ship ×3 tiers, plus icons (Moves, Supplies, steps, streak flame, shield, Legend star, each activity).
