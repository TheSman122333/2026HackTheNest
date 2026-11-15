/**
 * How the Tidekeeper sounds, shared by every AI prompt, plus a last-line guard that keeps
 * other franchises' names out of anything spoken or shown. The game is genre-inspired only.
 */

/** A natural guide with brief, factual language. */
export const TIDEKEEPER_VOICE = `VOICE: calm, friendly, natural contemporary English. One plain sentence, at most 25 words. Give the useful information directly. No pirate accent, dialect, catchphrases, dramatic performance, forced laughs, or repeated greetings. Never say "arr", "matey", "ye", "me hearties", "shiver me timbers", "avast", "scallywag", "landlubber", or "Ahoy". Keep the adventure theme in the world and artwork rather than the way you speak.
ORIGINAL WORLD: this game's own names only (the Tidewake sea, the Lodestar, the Tidekeeper, the Shipwright). Never name, quote or retell any existing anime, manga, film, game or book, or their characters, places, treasures, powers, eras, plots or catchphrases. If the player asks about another story, a famous pirate legend or a "pirate king", say you only know the tales of the Tidewake and turn back to their voyage.`;

/** Other franchises' names → this game's own. Ordered longest-first so phrases win. */
const REPLACEMENTS: [RegExp, string][] = [
  [/\bgol\.?\s*d\.?\s*roger\b/gi, 'the last great captain'],
  [/\bgold\s+roger\b/gi, 'the last great captain'],
  [/\bking of (?:the )?pirates\b/gi, 'greatest captain of the Tidewake'],
  [/\bpirate king\b/gi, 'greatest captain of the Tidewake'],
  [/\bone piece\b/gi, 'Lodestar'],
  [/\bgrand line\b/gi, 'Tidewake'],
  [/\bnew world\b/gi, 'far Tidewake'],
  [/\bgreat (?:age of )?pirates?(?: era)?\b/gi, 'age of voyages'],
  [/\bred line\b/gi, 'great reef'],
  [/\blaugh tale\b|\braftel\b/gi, 'the last island'],
  [/\bdevil fruits?\b/gi, 'strange fruit'],
  [/\bstraw ?hats?\b/gi, 'crew'],
  [/\bwhitebeard\b/gi, 'the old captain'],
  [/\bnakama\b/gi, 'crewmates'],
  [/\b(?:luffy|zoro|nami|usopp|sanji|chopper|shanks|blackbeard|kaido|big mom)\b/gi, 'a fellow sailor'],
];

export function scrubFranchise(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement);
  return out;
}
