# The Last Voyage — Game Design (source of truth)

> Hack The Nest 2026, 24h. One coder plus AI agents (Claude Code = engineering, Codex = design, sprites, UI/UX review).
> Pitch: **"A game that makes you excited to put your phone down and go live your life."**
> If this file and anything else disagree, this file wins. Change it only with the user's approval.

## 1. One-liner
A co-op pirate adventure, inspired by the shonen manga *genre*. **Your crew is your real friends and you share one ship.** On deck the game plays as a BitLife-style life sim. You sail to an island, explore it as a giant hex board (point-and-click scavenging, then a boss fight), conquer it, upgrade the ship, and repeat. **Real life fuels everything:** steps, logged activities, and time spent away from short-form video give you the turns you spend on islands. Each year, the pirate with the most **Legend** claims **the Lodestar**, a legendary fallen star.

## 2. Core loop
```
 ┌─► SHIP (life sim) ──► SAIL (nightly) ──► ISLAND (hex board) ──► CONQUER ──► UPGRADE SHIP ─┐
 └──────────────────────────────────────────────────────────────────────────────────────────┘
          ▲ fuel: real-life activity, steps, no-scroll streaks → Supplies + Island Moves
```
- **Daytime (any time before midnight):** log real life, play life-event cards on the ship, spend Island Moves on the hex board, fight, scavenge, and queue crew orders (heading vote, upgrade contributions).
- **Midnight:** the crew turn resolves: the ship sails, arrivals happen, claims settle, rival crews move, chaos events trigger.
- **Morning:** **Old Brine** (the figurehead spirit narrator, ElevenLabs) recaps everything you missed since you last opened the app.

## 3. Pillars
1. **Real life is the controller.** No real-life input means no moves. Phone-free time is the strongest fuel.
2. **Co-op first, then individual glory.** Legend mostly comes from helping the crew.
3. **Loud, juicy manga presentation.** Every action gets a splash panel or a sound effect.
4. **Never punish life.** Streaks give bonuses. Breaking a streak resets the bonus and never removes earned progress.

## 4. Real-life fuel ("Wind")
| Source | How it's measured | Gives |
|---|---|---|
| **Steps** | Health Connect (Android), HealthKit (iOS) | Island Moves (e.g. 1 Move per 1,000 steps, capped per day) |
| **Logged activities** | Honor-system stamps: walk, workout, read, hobby, friends, outdoors, chores, study | Supplies + skill XP + Moves |
| **Calm Seas streak** | Scroll Sentinel: short-form swipes and minutes (TikTok, Reels, Shorts) stay under the daily limit you set | Streak multiplier on Island Moves (+10% per day, max ×2), plus a Streak Shield every 7 days |
| **Shore Leave streak** | Days you don't open the tracked apps at all | Bigger streak bonus |
| **Focus sessions** (stretch) | A timer in the app where the phone stays untouched | Moves |

- **Daily caps** keep honor-system logging fair. All constants live in `packages/game/src/config.ts`.
- **Streak rules:** a day counts when it meets the rule. Missing a day resets the streak *multiplier*, never banked Moves, Supplies or Legend. Earn a **Streak Shield** every 7 days, which saves the streak once.

## 5. Ship layer (BitLife-style life sim)
- Your chibi pirate (with your **real photo face, inked by a shader**) lives on deck. Stats: **Grit, Charm, Lore, Craft, Seacraft** (0–100).
- **Life-event cards** (unlocked by logging real activities): pick a choice, a dice roll decides the outcome, and stats, relationships or loot change. Comic tone.
- **Journal → traits:** private journal entries go to Claude, which proposes traits from a fixed catalog. The player approves them.
- **Rooms:** Helm, Workshop, Hold, Galley, Armory (combat). Rooms go up to level 3, and the hull tier rises: Skiff → Sloop → Brigantine (→ Lodestar form for the yearly winner's crew).

## 6. Sea layer (crew, turn before midnight)
- A chart of islands joined by sea lanes. The crew votes on a heading before midnight, and the ship sails at midnight.
- **Monthly themed island** (live events): Jan New Year · Feb Black History Month · Mar Women's History Month · Apr Spring/Easter · May Mental Health Awareness · Jun Pride · Jul Summer · Aug Back to School · Sep Self-Care · Oct Spooky · Nov Remembrance · Dec Winter Holidays.

## 7. Island layer (hex board)
- Each island is a **large hex board** with a Catan-style layout and Mario Party-style variety. Players tap a hex to move, spending **Island Moves**.
- **Terrain effects:** e.g. jungle gives 2× outdoor-quest rewards, beach gives a Supplies cache, ruins hold a lore clue, volcano is dangerous, town lets you trade.
- **Scavenging:** hidden items on hexes, plus fog of war that clears as you explore.
- **Chaos items spawn:** cutlass (melee, knocks an adjacent pirate back), seaweed cannon (ranged splat), tonic (heals), mystery chest (random loot), and natural disasters (hurricane, eruption) that reshape the board.
- **Boss fight:** the island's guardian sits at the center hex. Turn-based combat where the crew's stats and items matter. Beating it **conquers the island** for the crew.
- **Combat tone:** cartoony. A KO means "washed overboard": you respawn at the ship and lose your remaining Moves for the day. No gore, no real weapons named as guns.

## 8. Competition: Legend and the Lodestar
- Legend sources: crew contributions, boss KOs, first discoveries, island conquests, streak milestones, and activities (capped). Multiplied by crew rank. **Legend is never taken away.**
- At year end, the top Legend holder across all crews claims **the Lodestar**: a crown on their chibi, a legendary ship form for their crew, the Hall of Legends, and naming an island in next year's sea.
- The demo has an "End the Year" button that runs the ceremony.

## 9. App structure
- **Onboarding:** sign in (SSOJet) → preferences quiz (shapes quest suggestions) → character + photo face (Inkify) → find a crew (random match, invite link, or QR).
- **Tabs:** **Ship** (home and life sim) · **Sea** (chart + island board) · **Quests** (real-life tasks + Calendar) · **Log** (an audit feed of everything that happened to you and your ship) · **Me** (character, traits, streaks, Legend).
- **Debug-only:** Scroll Lab, Sprite Gallery, Advance Night, End the Year.

## 10. Tech (locked unless noted)
- **App:** React Native + Expo SDK 58, TypeScript strict, Expo Router, **development build** (not Expo Go). Android first (test device: Pixel 10 Pro XL), iOS through EAS.
- **Native:** `modules/scroll-sentinel` (Android AccessibilityService + UsageStats; iOS Screen Time stub). Steps via Health Connect and HealthKit.
- **Backend:** **MongoDB Atlas** behind a thin Node API in `server/`. Hosting TBD (Vercel functions are the likely choice). LootLocker dropped.
- **AI:** Claude (journal → traits, Ship's Log text). ElevenLabs (Old Brine). Intro and stock lines are pre-generated, the Ship's Log is dynamic for the demo.
- **Integrations:** SSOJet (auth), Google Calendar (stretch: suggest quests in free time).

## 11. Hard rules
- **IP:** genre-inspired only. NO straw hats, stretch or rubber powers, fruit-granted powers, "Grand Line"-style seas, "Pirate King", "nakama", bounty posters with currency amounts, or flags resembling known crews. Flags are built from original parts: anchor, gull, star, wave, compass.
- **Sprites:** every sprite must be **approved by the user** in the Sprite Gallery before the app uses it (see `assets/sprites/manifest.json`).
- **Privacy:** Scroll Sentinel never reads on-screen text, only package names, view IDs, class names and timestamps. Raw data stays on the device, and only aggregates sync, opt-in. Face photos never go to AI services.
