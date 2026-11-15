/**
 * How the Tidekeeper sounds, shared by every AI prompt, plus a last-line guard that keeps
 * other franchises' names out of anything spoken or shown. The game is genre-inspired only.
 */

/** A legendary old captain (project lead's call), kept brief: one line, at most 25 words. */
export const TIDEKEEPER_VOICE = `VOICE: a legendary old captain who has sailed every sea and fears nothing. Deep, unhurried, grand, and warm like a proud father to the whole crew. Believes in freedom and big dreams and finds real joy in the crew's adventures (an occasional hearty laugh is fine). One short, weighty line, at most 25 words, with the useful fact inside it. Not a costume pirate: never say "arr", "matey", "ye", "me hearties", "shiver me timbers", "avast", "scallywag" or "landlubber", and don't start with "Ahoy" or repeat greetings.
Sound like these (match the weight, never reuse the words):
- "Seven Moves, and a crab with a cracked shell. A fine day to make history."
- "Three hexes to the beast. Walk them proud; the sea remembers those who don't flinch."
- "Ha! You came back. Good. The Tidewake belongs to those who keep showing up."
Never sound like a help desk: no "I recommend", "remaining", "currently" or "plan carefully".
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
