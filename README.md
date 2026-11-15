<p align="center">
  <img src="apps/mobile/assets/icon.png" width="120" alt="The Last Voyage" />
</p>

<h1 align="center">The Last Voyage</h1>

<p align="center"><b>A co-op pirate adventure fuelled by real life.</b><br/>
A game that makes you excited to put your phone down and go live your life.</p>

<p align="center">
  <a href="https://lastvoyageplease.work"><b>🌊 lastvoyageplease.work</b></a> · <a href="https://play.lastvoyageplease.work"><b>▶ Play now</b></a>
</p>

Built for **Hack The Nest 2026**.

---

## Get the game
| Platform | How |
|---|---|
| **Android** | Download the APK from the [Releases](../../releases) page and install it (allow "install unknown apps" once). Includes automatic steps and scroll tracking. |
| **iPhone** | Open **https://play.lastvoyageplease.work** in Safari → **Share → Add to Home Screen**. |
| **Desktop** | Open **https://play.lastvoyageplease.work** in any browser. |

## What it is
Your real friends are your **crew**, and you share one ship. Everything you do in real life (walking, reading, working out, time with friends, staying off short-form video) becomes **Moves**. The crew spends Moves exploring a 721-tile island, looting, and fighting a shared boss.

- **Real life → Moves:** steps, AI-personalized daily quests, and a **Calm Seas** streak for staying under your short-form limit.
- **Islands:** seeded hex boards with fog of war, terrain, hazards and loot, plus turn-based **async co-op boss fights** whose stats come from your real-life skills.
- **AI world events:** 3 random days a week, a real fact from live web search, with sources, washes up as a helpful item.
- **Honor and the Lodestar:** Honor only ever goes up. A ship's Honor is its crew's total, and **exactly one Lodestar** exists in the whole game, for the top ship.
- **Companions:** the voiced **Tidekeeper** narrator, the **Shipwright** coach, and a personal **AI theme song** for every player.
- **32 languages**, fair rules across Android / iPhone / web, and **"never punish life"**: you never lose progress.

## Architecture
```
 Android app (Expo)            iPhone / desktop (installable web app)
 ├─ Kotlin Accessibility ─┐    └─ same React Native codebase (react-native-web)
 ├─ Usage Access, Health  │ daily totals only
 └─ React Native + Router ┴──────────► Hono API on Vercel
                                       ├─ @last-voyage/game (shared, pure, tested rules)
                                       ├─ MongoDB Atlas
                                       ├─ SSOJet (OIDC + PKCE)
                                       ├─ Gemini → OpenAI fallback (narrator, quests)
                                       ├─ OpenAI Responses + web_search (world events)
                                       └─ ElevenLabs (voice, speech-to-text, music, SFX)
```

| Layer | Tech |
|---|---|
| App | React Native, **Expo SDK 58**, Expo Router, strict TypeScript |
| Native | Kotlin Expo modules: Accessibility Service (Shorts swipe detection), Usage Access; Health Connect |
| Rules | `packages/game`: deterministic engine (seeded RNG, hex Dijkstra pathfinding, combat, streaks) |
| Server | Node, **Hono**, MongoDB driver, zod, jose (JWT) |
| Data | **MongoDB Atlas**: idempotent writes, conditional updates, unique indexes, TTL media |
| AI & voice | **Gemini**, **OpenAI**, **ElevenLabs** |
| Auth | **SSOJet** OIDC authorization code + PKCE |
| Hosting | **Vercel** (Build Output API: static web export + serverless API) |

## Repository
```
apps/mobile/     Expo app (Android + web); native modules in apps/mobile/modules
packages/game/   shared game rules + Vitest tests
server/          Hono API + tests (in-memory MongoDB)
content/         islands, events, narration, localization
docs/            GAME.md (design source of truth), design brief, languages
scripts/         Vercel build, localization tooling
```

## Run it locally
```bash
npm install                 # repo root (npm workspaces)
npm run check               # typecheck + lint + all tests
npm run server              # API on :8787 (starts a local MongoDB if MONGODB_URI is unset)
cd apps/mobile && npx expo run:android --device   # Android dev build
cd apps/mobile && npx expo start --web            # web
```
Copy `server/.env.example` to `server/.env` for API keys (all optional: features fall back gracefully). No secrets live in the app.

## Privacy
- Scroll tracking runs **on the phone**, reads screen-layout IDs only (never text or content), and uploads daily totals only.
- Face photos are synced to your own account only and **never sent to any AI**.
- The AI only narrates; deterministic game code makes every decision.

## Team
Made with care at Hack The Nest 2026. Original world, characters and lore; inspired by the shonen-adventure genre.
