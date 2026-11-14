# Codex Handoff: Design, Sprites, UI/UX

You're the **design lead and UI engineer** on *The Last Voyage*. Claude Code handles engineering: native modules, game logic, backend, data wiring. One human (the user) approves everything and merges PRs.

Read first: `AGENTS.md` (ownership and git rules), then `docs/GAME.md` (the game).
**Your areas:** `design/**`, `assets/sprites/**`, `apps/mobile/src/theme/**`, `apps/mobile/src/ui/**`, and `content/**` when asked.

---

## 0. TL;DR of the game
A co-op pirate game whose look is inspired by the shonen-adventure manga genre. Friends share one ship. A BitLife-style life sim plays out on deck. The crew sails to islands, and each island is a big **hex board** (Catan-like layout, Mario Party-like variety) explored point-and-click, with a **boss fight** at the center. Conquer, upgrade the ship, repeat. **Moves come from real life:** steps, logged activities, and streaks of *not* doom-scrolling. Narrator: **Old Brine**, the ship's spirit in the figurehead. The yearly prize is **the Lodestar**, a fallen star.

Platform: phone, portrait, Android first (Pixel 10 Pro XL, about 1344×2992 px, 20:9 aspect) with iOS as well. Design at **412×915 dp**.

---

## 1. Art direction: "Ink & Tide"
Bright, loud, sunny **shonen adventure manga in color**.
- Thick ink outlines (3px UI, 4–6px on sprites at 1×), flat cel shading with **one** shadow tone, halftone dots in shadows, speed lines, splash panels, and big onomatopoeia ("KA-CHUNK!", "WHAM!", "SPLASH!").
- Characters are **chibi**: oversized heads (about 1:1.3 head to body), huge expressions.
- Prompt template (never name a series or artist): *"90s–2000s shonen adventure manga style, full color, cel-shaded, thick black ink outlines, flat colors, halftone shading, transparent background, centered, no text"*.
- Frutiger Aero, glassmorphism and blur are **out**.

### Tokens (starting point; you own `apps/mobile/src/theme/tokens.ts` and may refine)
| Token | Value | Use |
|---|---|---|
| `ink` | `#141414` | outlines, text, borders |
| `paper` | `#FFF6E3` | panels, cards |
| `sea300 / sea500 / sea800` | `#4FC3F7 / #1E88E5 / #0D3B66` | water, primary, night |
| `sun` | `#FFC72C` | Supplies, highlights |
| `red` | `#E63946` | danger, combat, rivals |
| `jungle` | `#43AA8B` | success, islands |
| `lodestarA → lodestarB` | `#FFE066 → #FF9F1C` | Legend, crown, glow |

**Fonts** (Google Fonts via `@expo-google-fonts/*`): **Bangers** (titles, sound effects; ink stroke and sun fill), **Baloo 2** 700/800 (UI, buttons, numbers), **Nunito** 600/800 (body).

**Panel recipe:** paper fill, 3px ink border, **hard 4px/4px offset ink shadow with no blur**, optional corner halftone. **Pressed:** translate 4px and drop the shadow to 0 (the button "sinks"). **Avoid** soft shadows, gradients-as-decoration, and blur.

### IP guardrails (check every asset)
NO straw hats, stretch or rubber limbs, fruit-granted powers, skull-and-crossbones lookalikes of known crews, wanted posters with currency, "Grand ___" seas, "Pirate King", "nakama", or lettering that mimics any series logo. **Crew flags are built from our own parts:** anchor, gull, star, wave, compass, in crew colors.

---

## 2. Your phases (in order)

### Phase 1: Design system + style frames (start here)
Deliver in `design/`:
1. `design/DESIGN_SYSTEM.md`: tokens, type scale, spacing (4pt grid), radii (mostly sharp or slightly irregular ink corners), the panel recipe, buttons (sea, sun, red, jungle variants), meters, badges, the tab bar, motion and juice rules (durations, easing, haptics), and accessibility (contrast ≥ 4.5:1 for body text; never rely on color alone).
2. **3 style frames** (PNG, 412×915): **Ship screen** (home), **Island hex board** mid-exploration, and a **Boss fight** splash moment. These lock the look. **The user must approve them before Phase 2.**
3. `apps/mobile/src/theme/tokens.ts` + `typography.ts` exporting typed constants (no runtime deps).

### Phase 2: Screen mockups (412×915 PNG or HTML) in `design/screens/`
For each one show the default, empty and loading states, plus any special moment.
- **Onboarding:** sign in · preferences quiz (3–5 fun questions) · character pick · photo face framing (circle mask, live "inked" preview) · find crew (random / invite link / QR).
- **Ship (home):** sky by time of day (flat 3-band skies), the ship with rooms as hotspots, crew bobbleheads on deck, the morning bottle, Supplies and Moves counters, a life-event card.
- **Sea:** the chart (islands, lanes, ink-wash fog), heading vote, "sails at midnight" countdown.
- **Island board:** hex grid with terrain types, the player token, Moves left, fog, item pickups, chaos-item use, boss hex.
- **Boss fight:** turn-based panel layout, crew portraits, action buttons, damage numbers in Bangers.
- **Quests:** real-life quest list, activity stamps, steps progress, Calendar strip.
- **Log:** an audit feed ("A seagull stole Maya's hat", "The ship reached Ember Isle") with icons.
- **Me:** character sheet, traits, **Calm Seas streak** (phone-free), Legend rank.
- **Scroll Lab (debug):** keep it plain. Claude builds it functional-first; just give it a pass later.
- **Lodestar ceremony:** crown landing, Hall of Legends.

### Phase 3: Sprites (the user approves every one)
Production rules:
- **PNG with transparency**, exported at **3×**, on a **power-of-two-friendly** canvas. Name files `snake_case`, e.g. `chibi_body_navigator_idle_0.png`.
- Consistent light direction (top-left), same outline weight, same palette.
- Put files in `assets/sprites/<category>/`. Register each in `assets/sprites/manifest.json`:
```json
{
  "sprites": [
    {
      "id": "ship_skiff",
      "file": "ships/ship_skiff.png",
      "category": "ships",
      "size": [768, 576],
      "anchor": [0.5, 0.9],
      "status": "pending",
      "notes": "Tier 1 ship, side view facing right",
      "feedback": ""
    }
  ]
}
```
- `status` is `pending | approved | rejected`. **Only the user changes it to `approved`.** When something is rejected, read `feedback`, revise, and set it back to `pending`.
- Build `design/gallery/index.html`: a static page that reads `manifest.json` and shows each sprite on paper and dark backgrounds at 1× and 3×, grouped by category, with id, size, status and notes. That page is the approval surface. It must run with no build step.

**Sprite list (priority order; the 1st batch goes to the user as one set):**
1. **Characters:** 4 chibi bodies sharing a **256×320** frame (1×) with a head-mask cutout for the photo face. Poses: idle ×2 frames, cheer, shock, KO. Plus a head mask PNG, 6 role hats, the **Lodestar crown**, and 6 preset drawn faces (the fallback when there's no photo).
2. **Ships:** Skiff, Sloop, Brigantine, plus the Lodestar legendary form. Side view, plus a small top-down token for the chart.
3. **Hex tiles** (pointy-top, 1× about 128 px wide, seamless edges): sea, beach, jungle, grass, rock, ruins, town, volcano, swamp, snow, plus a fog overlay and a highlighted/selected state.
4. **Bosses:** one per island biome (start with 3). Cartoon guardians, e.g. a giant crab, a storm gull, a lava golem.
5. **Items and chaos:** cutlass, seaweed cannon, tonic, mystery chest, treasure, hurricane, eruption.
6. **Icons:** Supplies, Moves, steps, streak flame, Legend star, each activity type (walk, read, hobby, friends, outdoors, workout, study, chores), and rooms (Helm, Workshop, Hold, Galley, Armory).
7. **Monthly island badges** ×12 (see `docs/GAME.md` §6). Respectful designs for awareness months.
8. **UI art:** message bottle, ink-wash cloud, speed-line burst, halftone texture, flag emblem parts (anchor, gull, star, wave, compass).

### Phase 4: UI components in `apps/mobile/src/ui/`
Presentational only: **props in, view out, no data fetching, no global state.** TypeScript strict. Use `react-native` primitives plus Reanimated or Skia where needed. Ask Claude via `design/requests.md` before adding any dependency.
Start with: `Panel`, `InkButton`, `MeterBar`, `CurrencyBadge`, `SfxText`, `ActivityStamp`, `TabBar`, `HexTile`, `StreakFlame`, `SplashPanel`.
Each component gets a short header comment with usage. Add them to a `src/ui/index.ts` barrel.

### Phase 5: Ongoing UI/UX review
Once Claude wires screens, review them on the PRs or in `design/reviews/<screen>.md` using this format:
```
## <Screen> — review <date>
Severity: P0 (broken/unusable) | P1 (confusing/ugly) | P2 (polish)
- [P1] Moves counter competes with Supplies; make Moves the hero (larger, sun fill). Suggested fix: …
```
Focus on clarity of the daily loop, readable hierarchy, tap-target size (≥ 48 dp), juice moments, consistency with the design system, and IP risks.

---

## 3. Contracts with Claude
- **Requests:** anything you need from engineering (a dep, a new prop from data, a route) goes in `design/requests.md` as `- [ ] <request> — why`.
- **Components:** Claude imports from `src/ui` and never restyles. If a screen needs a new visual, you build the component and Claude wires it.
- **Sprites in code:** Claude will generate a typed `sprites.ts` from approved manifest entries only. Never import a pending sprite.
- **Branches:** work on `codex/<topic>` and open small PRs. Don't touch files outside your areas.

## 4. Definition of done (per PR)
- Assets are in the manifest, IP-checked, and visible in the gallery.
- `npx tsc --noEmit` and `npx expo lint` pass (from `apps/mobile`) for any code you touched.
- The PR description includes screenshots and states which phase or step it covers.
