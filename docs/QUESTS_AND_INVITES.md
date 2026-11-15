# Personalized quests and crew invitations

After sign-in, players choose their pirate and can optionally take or select a face photo. The existing on-device photo fitting controls are available during this first setup. The avatar selection is saved to the account; face photos stay on the device. Players then answer eight short questions about activities, goals, daily time, pace, setting, company, preferred time of day, and activities to avoid. Players can change those answers under **Me → Quest preferences**.

The Quests screen replaces **Log an activity** with three daily quests. The other sections remain. The three tasks share the selected daily time budget; completion uses the existing activity rewards, daily caps, and crew contribution records. Completed quests cannot award rewards twice. Changing preferences does not grant additional daily slots or reset the skip allowance.

Players can replace available quests five times per week. The allowance is saved on the server and resets at Monday midnight in the player's time zone. A failed replacement does not consume a skip. Skipping does not remove earned progress.

## Gemini setup

Set `GEMINI_API_KEY` in the ignored `server/.env`, or in the server deployment's secret store. `GEMINI_QUEST_MODEL` can optionally select a supported Gemini model. Restart the local server after changing its environment.

Only the questionnaire choices and recent quest titles are sent to Gemini. Avatar photos, identity, journals, and OAuth credentials are excluded. The app does not receive the Gemini key. If the provider is unavailable or returns invalid quests, the server supplies clearly labeled suggestions based on the same preferences. Existing daily quests remain stable; a new day or a requested replacement can use Gemini once it is configured.

## Inviting friends

Open **Ship → Invite with QR code**. The QR is generated on the device, and the screen also provides a shareable link and six-character code. It contains no sign-in token.

On web, invitations use the current app origin. For native builds, set `EXPO_PUBLIC_APP_URL` to the deployed HTTPS app origin to let friends open the website. Without it, QR invitations use `lastvoyage://join?code=...`, which requires the installed app. The existing app scheme needs no new native dependency.

An invitation is remembered separately from SSOJet's OAuth state. Friends can sign in, complete the preference questions, and confirm joining. Opening an invitation does not silently move a player out of an existing crew. Manual code entry is still available under **Join a friend**.

SSOJet continues to use the existing issuer/client configuration and server-side code exchange. Register the exact web `/auth/callback` URL and native API `/auth/ssojet/callback` bridge URL in the SSOJet tenant. Never put the client secret in `EXPO_PUBLIC_*` settings.

## Narration and game audio

Automatic narration is limited to three short, non-repeating first-visit tips: Ship, Island, and Quests. Movement, attacks, quest completions, and ordinary tab changes do not each trigger another voice line. The narrator uses plain language and a neutral ElevenLabs voice; `ELEVENLABS_NARRATOR_VOICE_ID` can select another natural voice. This replaces the older pirate-performance voice setting for narration. The opening retains the supplied story and uses the same neutral voice.

Set `ELEVENLABS_API_KEY` in the server environment to enable five original effects (movement, sword strike, cannon, recovery, and blocking) plus a quiet 30-second instrumental background loop. The account must have access to ElevenLabs Sound Effects and Music. Generation happens on the server with fixed prompts, and MongoDB caches the results for reuse. If generation is unavailable, gameplay continues with its existing visual feedback.

**Me → Voyage audio** controls music, effects, and narration. Music becomes quieter under spoken narration and pauses when the app is backgrounded or a personal theme song is playing. Browser audio may need a tap to start. No additional native module or npm dependency is needed for these audio changes.
