/**
 * Titles: "<title> of the <crew>". Everyone has their skill role (Bosun, Navigator, ...). More
 * titles unlock at Honor milestones (no spending; Honor never goes down). The top tier unlocks a
 * custom title, which is sanitized here: allowed characters, length, profanity/slurs (including
 * leetspeak and spacing tricks) and other franchises' names.
 */
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import type { Collections, UserDoc } from './db';
import { scrubFranchise } from './voice-style';

export const TITLE_LADDER = [
  { title: 'Deckhand', honor: 5 },
  { title: 'Lookout', honor: 15 },
  { title: 'First Mate', honor: 30 },
  { title: 'Sea Wolf', honor: 50 },
  { title: 'Storm Rider', honor: 80 },
  { title: 'Captain', honor: 120 },
] as const;
/** The highest tier: write your own title. */
export const CUSTOM_TITLE_HONOR = 200;

// Checked against a normalised copy, so "sh1t", "s h i t", "$hit" and "fuuuck" all match.
// STRONG roots are blocked anywhere in the title; SHORT ones only as whole words ("Dickens" is fine).
const STRONG = [
  'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'whore', 'slut', 'bastard', 'asshole', 'nigg', 'fagg', 'retard', 'tranny',
  'kike', 'wetback', 'nazi', 'hitler', 'rape', 'porn', 'penis', 'vagina', 'dildo', 'jizz', 'wank', 'twat',
];
const SHORT = ['dick', 'cock', 'arse', 'fag', 'spic', 'chink', 'gook', 'coon', 'boob', 'tits', 'cum', 'prick', 'ass', 'hoe'];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g' };

function normalise(text: string) {
  return text.toLowerCase().split('').map((ch) => LEET[ch] ?? ch).join('').replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
}

export type TitleCheck = { ok: true; title: string } | { ok: false; reason: string };

/** Clean a custom title or explain why it's not allowed. */
export function sanitizeCustomTitle(raw: string): TitleCheck {
  const title = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (title.length < 2 || title.length > 24) return { ok: false, reason: 'Titles are 2 to 24 characters.' };
  if (!/^[\p{L} '\-]+$/u.test(title)) return { ok: false, reason: 'Use letters, spaces, apostrophes and hyphens only.' };
  const flat = normalise(title);
  // Words, with runs of spaced-out single letters ("f u c k") glued back together.
  const words: string[] = [];
  let run = '';
  for (const w of title.toLowerCase().split(/[\s'\-]+/).map(normalise).filter(Boolean)) {
    if (w.length === 1) { run += w; continue; }
    if (run) { words.push(run); run = ''; }
    words.push(w);
  }
  if (run) words.push(run);
  const rude = STRONG.some((bad) => flat.includes(bad)) || SHORT.some((bad) => words.some((w) => w === bad || w === `${bad}s`));
  if (rude) return { ok: false, reason: 'Pick something the whole crew can enjoy.' };
  const cleaned = scrubFranchise(title);
  if (cleaned !== title) return { ok: false, reason: 'Keep it original to the Tidewake.' };
  return { ok: true, title: title.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase()) };
}

/** Titles this pirate can pick right now (role is always available, handled by the app). */
export function unlockedTitles(honor: number) {
  return TITLE_LADDER.filter((t) => honor >= t.honor).map((t) => t.title);
}

export function registerTitles(app: Hono<{ Variables: { user: UserDoc } }>, c: Collections) {
  app.get('/me/titles', (ctx) => {
    const user = ctx.get('user');
    return ctx.json({
      current: user.title ?? null,
      ladder: TITLE_LADDER.map((t) => ({ ...t, unlocked: user.legend >= t.honor })),
      custom: { honor: CUSTOM_TITLE_HONOR, unlocked: user.legend >= CUSTOM_TITLE_HONOR },
    });
  });

  /** { title: null } = back to your skill role; { title: 'Lookout' }; or { custom: 'Tide Whisperer' }. */
  app.put('/me/title', async (ctx) => {
    const user = ctx.get('user');
    const body = z.union([
      z.object({ title: z.string().max(40).nullable() }).strict(),
      z.object({ custom: z.string().max(60) }).strict(),
    ]).safeParse(await ctx.req.json().catch(() => ({})));
    if (!body.success) throw new HTTPException(400, { message: 'Send a title or a custom title.' });

    let title: string | null;
    if ('custom' in body.data) {
      if (user.legend < CUSTOM_TITLE_HONOR) throw new HTTPException(403, { message: `Custom titles unlock at ${CUSTOM_TITLE_HONOR} Honor.` });
      const check = sanitizeCustomTitle(body.data.custom);
      if (!check.ok) throw new HTTPException(400, { message: check.reason });
      title = check.title;
    } else if (body.data.title === null) {
      title = null;
    } else {
      const wanted = body.data.title;
      const rung = TITLE_LADDER.find((t) => t.title === wanted);
      if (!rung) throw new HTTPException(400, { message: 'Unknown title.' });
      if (user.legend < rung.honor) throw new HTTPException(403, { message: `${rung.title} unlocks at ${rung.honor} Honor.` });
      title = rung.title;
    }
    await c.users.updateOne({ _id: user._id }, title === null ? { $unset: { title: '' } } : { $set: { title } });
    return ctx.json({ title });
  });
}
