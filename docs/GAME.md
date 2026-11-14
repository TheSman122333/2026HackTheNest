# The Last Voyage — Game Design (source of truth)

> Hack The Nest 2026. Pitch: **"A game that makes you excited to put your phone down and go live your life."**
> Numbers here match `packages/game/src/config.ts`, `island.ts` and `combat.ts`. Change the code and this doc together.
> Status tags: ✅ built and tested · 🟡 partly built · ⬜ planned

## 1. The game in one breath
A co-op pirate adventure inspired by the shonen-manga genre. **Your crew is your real friends and you share one ship.** On the ship, your pirate lives a BitLife-style life. The crew sails to an island, explores it as a big hex board (tap to move, scavenge loot), fights the boss at its center, conquers it, upgrades the ship, and sails on. **Every move you make on an island is earned in real life**: walking, doing things, and staying off TikTok, Reels and Shorts.

## 2. The core loop
```
REAL LIFE ──► MOVES ──► ISLAND (explore + loot) ──► BOSS FIGHT ──► CONQUER ──► UPGRADE SHIP ──► SAIL ──┐
   ▲                                                                                                │
   └────────────────────────────────── next island ◄───────────────────────────────────────────────┘
```
- **Daytime:** log real life, play life events on the ship, spend Moves on the island, queue crew decisions.
- **Midnight:** the crew turn resolves: sail, arrive, chaos spawns, disasters, rival moves.
- **Morning:** Old Brine (the narrator) tells you what happened while you were away.

## 3. Wind = real-life fuel ✅
"Wind" is the name for everything real life gives you. Wind fills your sails, so it becomes **Moves** (and Supplies, XP and Legend).

### 3a. Logging activities ✅ (honor system with hard caps)
| Activity | Supplies | Moves | Skill XP (+5 each) |
|---|---|---|---|
| Walk | 2 | 1 | Grit, Seacraft |
| Workout | 3 | 2 | Grit |
| Outdoors | 3 | 2 | Seacraft |
| Read | 2 | 1 | Lore |
| Study | 3 | 1 | Lore |
| Hobby / build | 3 | 1 | Craft |
| Time with people | 3 | 2 | Charm |
| Chores | 2 | 1 | Craft |
| Journal | 1 | 0 | Lore |

- **Daily caps:** 10 Supplies, 6 Moves from activities, 2 Legend from activities.
- **Spam guard:** the 3rd and later logs of the same activity in one day give only 1 Supply and 0 Moves.
- Each log gives +1 Legend, up to the cap.

### 3b. Steps ✅ (Android Health Connect)
- **1 Move per 1,000 steps**, max **10 Moves a day** from steps.

### 3c. Free Moves ✅
- Everyone gets **2 base Moves a day**, so nobody is ever fully locked out.

### 3d. Daily Moves formula ✅
```
Moves today = floor( (2 base + step Moves + activity Moves) × streak multiplier )
```
Example: 6,200 steps, a workout and a walk (3 activity Moves), on a 5-day streak → (2 + 6 + 3) × 1.5 = **16 Moves**.

## 4. Streaks ✅ (phone-free rewards)
| Streak | What counts | Reward |
|---|---|---|
| **Calm Seas** | A day under BOTH of your short-form limits. Default **60 swipes and 20 minutes**; each player can set 0–300 swipes and 0–120 minutes | **+10% Moves per streak day**, up to 10 days (**×2.0 max**) |
| **Shore Leave** | A day where you **didn't open** TikTok, Instagram or YouTube at all | **+25% Moves the next day** (stacks with Calm Seas) |
| **Streak Shield** | Earned every **7** calm days (hold **max 2**) | A stormy day uses a shield instead of breaking the streak |

- **Never punishing:** breaking a streak only resets the bonus. You never lose Moves, Supplies, items or Legend.
- **Days without data** (tracking off, phone dead) **pause** the streak and never break it.
- Days close at local midnight in your time zone. The server folds finished days into the streak automatically.

## 5. Scroll Sentinel 🟡 (Android tracking system; code done, not yet tested on the phone)
- An **Accessibility Service** counts swipes in TikTok (the whole feed), Instagram (**Reels only**) and YouTube (**Shorts only**). One swipe = one video.
- **Usage Access** gives minutes in those apps and how many times each was opened (used for Shore Leave).
- Sessions are recorded: start, end, swipes. A session ends after 60 s idle or when you leave the app.
- **Privacy:** it reads only app names and screen-layout IDs, **never text or content**. Raw data stays on the phone; only daily totals go to the server.
- **Scroll Lab** (debug screen) shows permissions, live counts, today's totals, and a discovery mode that finds the right screen IDs for each app version.
- iOS: not possible without an Apple developer account. Android only.

## 6. The Ship: life sim ⬜ (stats exist ✅)
- **Your pirate:** a chibi with your **real photo as the face**, drawn in manga style by a shader. A drawn face is the fallback.
- **5 skills (0–100):** **Grit, Charm, Lore, Craft, Seacraft**. All start at 10 and grow from activity XP ✅.
- **Role title** = your highest skill (Navigator, Shipwright, Quartermaster, Silver-tongue, Bosun), shown as your hat.
- **Life-event cards:** logging an activity unlocks a story card. Pick a choice, a dice roll plus your skills decides the result, and stats, loot or friendships change. Comic tone.
- **Journal → traits:** private journal entries go to Claude, which proposes a trait from a fixed list (e.g. *Tinkerer*, *Bookworm*). You approve it, and each trait gives a small bonus.
- **Ship rooms:** Helm, Workshop, Hold, Galley, Armory (levels 1–3), paid for with crew Supplies. Total room levels raise the hull: **Skiff → Sloop → Brigantine** (→ the Lodestar form for the yearly winner's crew).

## 7. The Crew 🟡
- ✅ Create a crew, or join with a **6-letter invite code** (QR planned).
- ✅ **Shared Supplies:** every activity's Supplies also go to the crew store.
- ✅ **Log feed:** every reward is recorded, so the crew sees who did what.
- ⬜ **Heading vote:** the crew votes on the next island before midnight. The ship sails at midnight.
- ⬜ **Rival crews:** game-run crews racing you to islands.

## 8. Islands: the hex board ✅
- Generated from a seed. The board is a hex disk of radius 5 (91 hexes): an outer **sea ring**, a **landing beach**, and the **boss lair at the center**.
- **4 themes:** tropical, spooky, winter, volcanic. Each has its own terrain mix and boss.
- **Tap to move:** you can tap any revealed hex or the fog edge next to it. The cheapest path is taken and its cost paid in Moves.
- **Fog of war:** clears 1 hex around you as you walk.
- **Scavenging:** about 30% of hexes start with an item, picked up as you walk over them. Island items are shared by the crew (first come, first served).

| Terrain | Move cost | Loot | Hazard | Real-life perk (planned) |
|---|---|---|---|---|
| Beach | 1 | supplies, timber, chest | – | |
| Meadow | 1 | supplies, tonic, spice | – | 2× outdoor quests |
| Jungle | 2 | timber, spice, tonic, chest | 5% | 2× walk quests |
| Crags | 2 | iron, shard | 5% | |
| Ruins | 1 | clue, shard, cutlass, chest | – | 2× read quests |
| Port Town | 1 | cannon, tonic, supplies | – | 2× friends quests |
| Bog | 2 | spice, tonic, clue | 15% | |
| Volcano | 3 | shard, iron | 30% | |
| Snowfield | 2 | iron, shard, chest | 5% | |
| Sea | can't enter | | | |

- **Hazards** do 5 damage. HP starts at 30. At 0 HP you're **washed overboard**: no more moves today, and you respawn at the beach tomorrow.
- **Chaos (nightly):** cutlasses, cannons, tonics and mystery chests spawn on empty land.
- **Disasters:**
  - **Hurricane** scatters every loose item across the island.
  - **Eruption** turns land around a volcano into crags and destroys items there.

### Items
| Item | Use |
|---|---|
| Cutlass | +3 damage on every Strike (kept) |
| Cannon | 14 flat damage, ignores armor (used up) |
| Tonic | Heals 15 HP (used up) |
| Mystery chest | Random loot ⬜ |
| Supplies, timber, iron, spice, shard | Ship upgrades ⬜ |
| Clue | Lore and island secrets ⬜ |

## 9. Boss fights ✅ (turn-based, async co-op)
- Stand next to the center hex to fight. **Each action costs 1 Move.**
- The **boss's HP is shared and persists**: friends chip away at it across days, whenever they play.
- After each of your actions, the boss hits back at you.

| Boss | Theme | HP | Attack | Armor |
|---|---|---|---|---|
| Clawdius the Tide Crab | tropical | 120 | 6 | 2 |
| Wispwick the Bog Lantern | spooky | 110 | 7 | 1 |
| Tuskar the Frost Walrus | winter | 140 | 5 | 3 |
| Emberhulk the Lava Golem | volcanic | 160 | 7 | 3 |

- **Your stats come from your skills:**
  - **HP** = 25 + Grit/2
  - **Attack** = 4 + (Grit + Craft)/20
  - **Crit chance** = 5% + Charm/300 (max 50%, ×2 damage)
  - **Weak spot** = +Lore/20 damage
- **Actions:**
  - **Strike:** attack + d4, minus armor; +3 with a cutlass.
  - **Cannon:** 14 damage.
  - **Tonic:** heal 15.
  - **Brace:** halves the counterattack.
- **Enrage:** below 30% HP (Lava Golem: 25%) the boss deals +50% damage.
- **KO** = washed overboard until tomorrow. Next day everyone returns at full HP; the boss doesn't heal.
- **Win:** the island is conquered for the crew. Damage dealt is credited per player (feeds Legend ⬜).

## 10. Legend and the Lodestar ⬜ (Legend from activities ✅)
- **Legend** is your personal score for the year and **can never be taken away**.
- **Sources:**
  - activities (max 2/day) ✅
  - boss damage and the finishing blow
  - conquering islands
  - first discovery of an island
  - streak milestones
  - helping crew upgrades
  - all multiplied by your crew's rank
- **The Lodestar:** at year end, the top Legend player across all crews claims the fallen star:
  - a crown on their pirate
  - the legendary ship form for their whole crew
  - the Hall of Legends
  - **naming an island in next year's sea**
- **Demo:** an "End the Year" button plays the ceremony.

## 11. Monthly islands ⬜ (live events)
Jan New Year · Feb Black History Month · Mar Women's History Month · Apr Spring · May Mental Health Awareness · Jun Pride · Jul Summer · Aug Back to School · Sep Self-Care · Oct Spooky · Nov Remembrance · Dec Winter Holidays.

## 12. Old Brine, the narrator ⬜ (ElevenLabs)
- The ship's spirit, living in the figurehead.
- **Morning recap:** narrates everything you missed since you last opened the app.
- Pre-recorded intro and stock lines (cheap). The dynamic recap is shown off in the demo.

## 13. App screens
| Screen | Status |
|---|---|
| Scroll Lab (debug: permissions, swipes, steps, Moves, streak) | ✅ |
| Onboarding: sign in → quiz → photo face → create/join crew | ⬜ |
| **Ship** (home: crew, Moves, Supplies, streak, life events) | ⬜ |
| **Sea** (chart + heading vote) → **Island board** → **Boss fight** | ⬜ (engine ✅) |
| **Quests** (log activities, steps, scroll limits, Calendar) | ⬜ (server ✅) |
| **Log** (feed of everything that happened) | ⬜ (server ✅) |
| **Me** (pirate, traits, streaks, Legend) | ⬜ |
| Demo buttons: Advance Night, End the Year | ⬜ |

## 14. Tech
- **App:** React Native + Expo SDK 58 (development build, Android only; demo on a Pixel 10 Pro XL), Expo Router, TypeScript strict.
- **Native:** `modules/scroll-sentinel` (Kotlin) and Health Connect for steps.
- **Rules:** `packages/game`, pure TypeScript shared by the app and the server, with tests.
- **Server:** Node + Hono + **MongoDB** (Atlas, or a local database that starts automatically). Our own JWT login (dev login now, SSOJet later).
- **AI and voice:** Claude (journal → traits, recap text), ElevenLabs (Old Brine).

## 15. Hard rules
- **IP:** genre-inspired only (see `docs/DESIGN_BRIEF.md`).
- **Sprites:** every sprite is approved by the project lead before use.
- **Privacy:** no reading other apps' content; face photos never go to AI.
- **Never punish life:** no lost progress, ever.
