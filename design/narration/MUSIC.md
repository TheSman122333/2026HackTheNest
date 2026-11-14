# Situational music for The Last Voyage

ElevenLabs can generate music from a written brief or a composition plan. Its Music API requires a paid subscription. The [official music overview](https://elevenlabs.io/docs/overview/capabilities/music) describes the available service and links the applicable [music terms](https://elevenlabs.io/music-terms). Check the project's plan and intended distribution against those terms before shipping generated tracks.

This change supplies **seven original instrumental briefs only**, in [music-cues.json](../../content/narration/music-cues.json). No music files, paid requests, music-generation adapter or game playback integration are included yet.

| Cue | Use |
| --- | --- |
| `ship_calm` | Ship home and quiet time aboard |
| `island_exploration` | Ordinary island exploration |
| `ruins_mystery` | Ruins and lore discoveries |
| `boss_battle` | Active guardian combat |
| `storm_disaster` | Hurricane or eruption |
| `crew_victory` | Short victory announcement |
| `return_recap` | Quiet accompaniment to Old Brine's log |

All briefs use an original acoustic palette: plucked strings, wooden percussion, low drums, flute and occasional bells. They avoid performer, franchise and existing-song references. `loopIntent` is a playback/design intention; it does not mean a generated file will loop seamlessly. Audition and edit loop boundaries before using it as a repeating bed.

## Generation later

Generate and review a small cue library before the demo, or prepare the next island's music in a background job. Keep the key and generation on the backend. The [compose endpoint](https://elevenlabs.io/docs/api-reference/music/compose) accepts `POST /v1/music` with `prompt`, `music_length_ms`, `model_id` and `force_instrumental`. Prompt mode and composition-plan mode are alternatives; the instrumental flag is available with prompt mode. Set the model explicitly because the reference still lists an older default.

An example request body derived from a cue is:

```json
{
  "model_id": "music_v2_5",
  "prompt": "Original instrumental seafaring adventure underscore. Warm plucked strings, gentle flute, wooden percussion and a soft low drum. Calm and welcoming, sparse beneath narration. No vocals or lyrics.",
  "music_length_ms": 60000,
  "force_instrumental": true
}
```

The endpoint returns an audio file. Save the reviewed output with its cue ID, model, prompt version and a content hash; reuse it across matching situations. Keep raw generated audio outside Git until its size and asset location are agreed. Music generation uses separate provider capacity and credits from the local subtitle writer; do not automatically call it for every tap.

## Adaptive playback later

Use game state to choose an existing cue. Give active combat or disaster precedence over ordinary exploration, play a victory cue once per confirmed victory, and return to the appropriate background bed afterward. Ignore repeated requests for the cue already playing. A short minimum hold time can prevent rapid mood switching while moving between adjacent terrain tiles.

Crossfade between reviewed background tracks over about **1.5 seconds** as a starting setting. Lower music to roughly **25% of its normal gain** while Old Brine speaks, then restore it smoothly; tune this by listening on the demo phone. Subtitle-only mode can leave music at its ordinary setting because no voice competes with it. Keep separate music and narration volume/mute controls.

The game can react immediately by switching cached cues. That is adaptive playback of generated music; it does not guarantee instantaneous composition, continuous live rescoring, beat-matched transitions or seamless loops. If a track is unavailable, keep the current safe background cue or fade to silence while the next one loads.
