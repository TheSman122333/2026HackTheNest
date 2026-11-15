import { ACTIVITY_KINDS, dayKeyInTz, type ActivityKind } from '@last-voyage/game';
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { awardActivity } from './activities';
import type { Collections, UserDoc } from './db';

export const GOALS = ['move_more', 'learn', 'create', 'connect', 'reset', 'get_organized'] as const;
const unique = <T>(items: T[]) => new Set(items).size === items.length;
export const preferenceInput = z.object({
  interests: z.array(z.enum(ACTIVITY_KINDS)).min(1).max(ACTIVITY_KINDS.length).refine(unique, 'Choose each interest once'),
  goals: z.array(z.enum(GOALS)).min(1).max(GOALS.length).refine(unique, 'Choose each goal once'),
  dailyMinutes: z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)]),
  pace: z.enum(['gentle', 'balanced', 'challenging']),
  setting: z.enum(['indoors', 'outdoors', 'either']),
  company: z.enum(['solo', 'friends', 'either']),
  timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'flexible']),
  avoid: z.array(z.enum(ACTIVITY_KINDS)).max(ACTIVITY_KINDS.length - 1).refine(unique, 'Choose each exclusion once'),
}).strict().refine((p) => !p.interests.some((kind) => p.avoid.includes(kind)), 'An interest cannot also be excluded')
  .refine((p) => ACTIVITY_KINDS.some((kind) => !p.avoid.includes(kind) && !(p.setting === 'indoors' && kind === 'outdoors') && !(p.company === 'solo' && kind === 'friends')), 'Leave at least one activity available for your setting and company');
export type VoyagePreferences = z.infer<typeof preferenceInput> & { completedAt: string };
type QuestSource = 'gemini' | 'fallback';
export type PersonalizedQuest = { id: string; kind: ActivityKind; title: string; description: string; minutes: number; status: 'available' | 'completed'; source: QuestSource; completedAt?: Date };
export type QuestWeekDoc = {
  _id: string; userId: UserDoc['_id']; week: string; revision: number; skipsUsed: number;
  days: Record<string, PersonalizedQuest[]>;
  budgets: Record<string, number>;
  requests: { id: string; type: 'skip' | 'complete'; questId: string }[];
  pendingCompletions: { questId: string; kind: ActivityKind; at: Date }[];
};
type QuestOptions = { env: NodeJS.ProcessEnv; fetchImpl: typeof fetch; now?: () => Date };
const REQUEST = z.object({ requestId: z.string().uuid() }).strict();
const LIMIT = 5;
const COUNT = 3;
const QUEST_TIMEOUT_MS = 12_000;
const generations = new Map<string, Promise<PersonalizedQuest[]>>();
function singleflight(key: string, generate: () => Promise<PersonalizedQuest[]>) {
  const existing = generations.get(key);
  if (existing) return existing;
  const promise = generate().finally(() => { if (generations.get(key) === promise) generations.delete(key); });
  generations.set(key, promise);
  return promise;
}

const duplicate = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
const zoneOf = (user: UserDoc) => { try { new Intl.DateTimeFormat('en-US', { timeZone: user.tz }); return user.tz; } catch { return 'UTC'; } };

/** Monday boundaries follow the sailor's local calendar, including DST changes. */
export function questWeek(now: Date, tz: string) {
  const day = dayKeyInTz(now, tz);
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const week = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 7);
  const target = date.getTime();
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const displayed = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
    guess += target - displayed;
  }
  return { day, week, resetsAt: new Date(guess).toISOString() };
}

const GOAL_KIND: Record<(typeof GOALS)[number], ActivityKind[]> = {
  move_more: ['walk', 'workout', 'outdoors'], learn: ['read', 'study'], create: ['hobby'], connect: ['friends'], reset: ['journal', 'outdoors'], get_organized: ['chores'],
};
function allowedKinds(p: VoyagePreferences) {
  return ACTIVITY_KINDS.filter((kind) => !p.avoid.includes(kind) && !(p.setting === 'indoors' && kind === 'outdoors') && !(p.company === 'solo' && kind === 'friends'));
}
function preferredKinds(p: VoyagePreferences) {
  const allowed = allowedKinds(p);
  const preferred = [...new Set([...p.interests, ...p.goals.flatMap((goal) => GOAL_KIND[goal])])].filter((kind) => allowed.includes(kind));
  return preferred.length ? preferred : allowed;
}
const TEMPLATES: Record<ActivityKind, { titles: string[]; task: string }> = {
  walk: { titles: ['Chart a little distance', 'A new route for the navigator', 'Stretch your sea legs'], task: 'Move at a comfortable pace along an accessible route, indoors or outside. Adapt the movement to what works for you.' },
  workout: { titles: ['Ready the deck', 'A little strength for the voyage', 'Find your steady rhythm'], task: 'Do a gentle movement routine you already know, seated or standing. No equipment is needed; pause or stop whenever you need.' },
  outdoors: { titles: ['Meet the open sky', 'A quiet lookout', 'Notice the shore'], task: 'Spend a little time in a safe, accessible outdoor place. Notice three details around you; resting outside counts.' },
  read: { titles: ['A page from the chartroom', 'Follow a curious thread', 'Find a fresh idea'], task: 'Read or listen to something you already have access to. Remember one idea you would like to keep.' },
  study: { titles: ['Learn a navigator’s trick', 'One small discovery', 'Practice for your next port'], task: 'Practice a topic or skill you want to learn using material you already have. Write down one thing that became clearer.' },
  hobby: { titles: ['A maker’s small masterpiece', 'Make something of your own', 'A spark in the workshop'], task: 'Spend time on a creative hobby with things already available: sketch, write, make music, code, or build something small.' },
  friends: { titles: ['Send a signal to a friend', 'A moment for your crew', 'Keep a friendship afloat'], task: 'Connect with someone you know in a way that suits you: send a thoughtful message, call, or spend a little time together.' },
  chores: { titles: ['Clear a corner of the deck', 'A little order in the hold', 'Make tomorrow easier'], task: 'Tidy or organize one small, reachable area. Choose a useful task you can comfortably finish without buying anything.' },
  journal: { titles: ['A quiet captain’s note', 'Take stock of the day', 'A moment in the logbook'], task: 'Reflect privately on one thing you noticed, appreciated, or want to try. Writing, a voice note, or quiet thought all count; nothing needs to be uploaded.' },
};
const DETOUR_TITLES: Record<ActivityKind, string> = { walk: 'A fresh heading for your sea legs', workout: 'Set a comfortable new rhythm', outdoors: 'Another view of the horizon', read: 'Open a different chapter', study: 'Try a new learning angle', hobby: 'Try a tiny creative experiment', friends: 'Make room for a kind check-in', chores: 'A fresh start for a small corner', journal: 'A new question for the logbook' };
function fallback(p: VoyagePreferences, count: number, variation: number, excluded: string[], budget: number) {
  const kinds = preferredKinds(p);
  const used = new Set(excluded);
  return Array.from({ length: count }, (_, index) => {
    const kind = kinds[(variation + index) % kinds.length]!;
    const template = TEMPLATES[kind];
    const titles = [...template.titles, DETOUR_TITLES[kind]];
    let variant = Math.floor((variation + index) / kinds.length) % titles.length;
    while (used.has(titles[variant]!)) variant = (variant + 1) % titles.length;
    const title = titles[variant]!;
    used.add(title);
    const allocation = Math.floor(budget / count) + (index < budget % count ? 1 : 0);
    const minutes = Math.max(1, Math.min(allocation, p.pace === 'gentle' ? 5 : p.pace === 'balanced' ? 15 : 30));
    const timing = p.timeOfDay === 'flexible' ? 'Choose a time that works today.' : `Try this in the ${p.timeOfDay}, or whenever your day allows.`;
    return { kind, title, description: `${template.task} ${timing}`, minutes };
  });
}

/** Provider receives only explicit preference enums and recent quest titles; never photos or identity. */
export async function generateQuests(p: VoyagePreferences, count: number, variation: number, excluded: string[], opts: QuestOptions, budget: number = p.dailyMinutes): Promise<PersonalizedQuest[]> {
  const choices = allowedKinds(p);
  const generated = z.object({ quests: z.array(z.object({
    kind: z.enum(ACTIVITY_KINDS).refine((kind) => choices.includes(kind)),
    title: z.string().trim().min(4).max(80), description: z.string().trim().min(15).max(400),
    minutes: z.number().int().min(1).max(budget),
  }).strict()).length(count) }).strict().refine((result) => result.quests.reduce((sum, quest) => sum + quest.minutes, 0) <= budget);
  let source: QuestSource = 'fallback';
  let tasks = fallback(p, count, variation, excluded, budget);
  if (opts.env.GEMINI_API_KEY) {
    try {
      const model = opts.env.GEMINI_QUEST_MODEL ?? 'gemini-3.5-flash-lite';
      if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Invalid model');
      const { completedAt: _completedAt, ...preferences } = p;
      const prompt = [
        `Create exactly ${count} distinct, practical real-life quests for a friendly original pirate adventure.`,
        'The player earns rewards only after doing each activity in real life. Pirate flavor belongs in the title; descriptions must be concrete.',
        'Respect every exclusion, preferred setting/company, available time and pace. Use interests and goals. Keep tasks free, accessible, adaptable, without required equipment, travel, purchases, health advice or risky exertion. Never ask for sensitive details or uploads.',
        `The TOTAL time for all ${count} quests combined must be at most ${budget} minutes. Each quest takes at least 1 minute. Only use these activity categories: ${choices.join(', ')}.`,
        'Return JSON with quests [{kind,title,description,minutes}]. Do not repeat recent titles.',
        `Preferences: ${JSON.stringify(preferences)}. Recent titles: ${JSON.stringify(excluded)}. Variation: ${variation}.`,
      ].join('\n');
      const response = await opts.fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: AbortSignal.timeout(QUEST_TIMEOUT_MS),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: {
          responseMimeType: 'application/json', maxOutputTokens: 1800,
          responseJsonSchema: { type: 'object', properties: { quests: { type: 'array', minItems: count, maxItems: count, items: {
            type: 'object', properties: { kind: { type: 'string', enum: choices }, title: { type: 'string' }, description: { type: 'string' }, minutes: { type: 'integer', minimum: 1, maximum: budget } }, required: ['kind', 'title', 'description', 'minutes'], additionalProperties: false,
          } } }, required: ['quests'], additionalProperties: false },
        } }),
      });
      if (!response.ok) throw new Error('Provider unavailable');
      const raw = await response.text();
      if (raw.length > 64_000) throw new Error('Provider response too large');
      const envelope = JSON.parse(raw) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
      const candidate = envelope.candidates?.[0];
      if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error('Incomplete provider response');
      const text = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? '').join('') ?? '';
      const parsed = generated.parse(JSON.parse(text)).quests;
      if (parsed.some((quest) => excluded.some((title) => title.toLowerCase() === quest.title.toLowerCase())) || !unique(parsed.map((quest) => quest.title.toLowerCase()))) throw new Error('Repeated quest');
      tasks = parsed;
      source = 'gemini';
    } catch { /* Safe, preference-based quests keep the game playable during provider outages. */ }
  }
  return tasks.map((task) => ({ ...task, id: randomUUID(), status: 'available', source }));
}

function preferencesOf(user: UserDoc) {
  if (!user.preferences) throw new HTTPException(409, { message: 'Finish your voyage preferences first.' });
  return user.preferences;
}
async function loadWeek(c: Collections, user: UserDoc, now: Date) {
  const calendar = questWeek(now, zoneOf(user));
  const id = `${user._id.toHexString()}:${calendar.week}`;
  try { await c.questWeeks.updateOne({ _id: id }, { $setOnInsert: { userId: user._id, week: calendar.week, revision: 0, skipsUsed: 0, days: {}, budgets: {}, requests: [], pendingCompletions: [] } }, { upsert: true }); }
  catch (error) { if (!duplicate(error)) throw error; }
  return { calendar, doc: (await c.questWeeks.findOne({ _id: id }))! };
}
function board(doc: QuestWeekDoc, calendar: ReturnType<typeof questWeek>) {
  const quests = (doc.days[calendar.day] ?? []).map(({ completedAt: _completedAt, ...quest }) => quest);
  return { day: calendar.day, quests, skips: { remaining: Math.max(0, LIMIT - doc.skipsUsed), limit: LIMIT, resetsAt: calendar.resetsAt }, source: quests.every((quest) => quest.source === 'gemini') ? 'gemini' as const : 'fallback' as const };
}
async function dailyBoard(c: Collections, user: UserDoc, now: Date, opts: QuestOptions) {
  const p = preferencesOf(user);
  let { doc, calendar } = await loadWeek(c, user, now);
  if (!doc.days[calendar.day]) {
    const tasks = await singleflight(`${doc._id}:${calendar.day}`, () => generateQuests(p, COUNT, new Date(`${calendar.day}T00:00Z`).getUTCDate(), [], opts));
    await c.questWeeks.updateOne({ _id: doc._id, [`days.${calendar.day}`]: { $exists: false } }, { $set: { [`days.${calendar.day}`]: tasks, [`budgets.${calendar.day}`]: p.dailyMinutes }, $inc: { revision: 1 } });
    doc = (await c.questWeeks.findOne({ _id: doc._id }))!;
  }
  return { doc, calendar };
}
function priorRequest(doc: QuestWeekDoc, requestId: string, type: 'complete' | 'skip', questId: string) {
  const prior = doc.requests.find((request) => request.id === requestId);
  if (prior && (prior.type !== type || prior.questId !== questId)) throw new HTTPException(409, { message: 'Use a new request ID for a different quest action.' });
  return prior;
}
async function input(ctx: { req: { json: () => Promise<unknown> } }) { return REQUEST.parse(await ctx.req.json().catch(() => ({}))); }
async function finishCompletion(c: Collections, user: UserDoc, docId: string, completion: { questId: string; kind: ActivityKind; at: Date }) {
  const reward = await awardActivity(c, user, completion.kind, completion.at, `quest:${completion.questId}`);
  await c.questWeeks.updateOne({ _id: docId }, { $pull: { pendingCompletions: { questId: completion.questId } } });
  return reward;
}

export function registerQuests(app: Hono<{ Variables: { user: UserDoc } }>, c: Collections, opts: QuestOptions) {
  const now = () => opts.now?.() ?? new Date();
  app.put('/me/preferences', async (ctx) => {
    const preferences: VoyagePreferences = { ...preferenceInput.parse(await ctx.req.json().catch(() => ({}))), completedAt: now().toISOString() };
    await c.users.updateOne({ _id: ctx.get('user')._id }, { $set: { preferences } });
    return ctx.json({ preferences });
  });
  app.get('/quests', async (ctx) => {
    const user = ctx.get('user');
    const interrupted = await c.questWeeks.find({ userId: user._id, 'pendingCompletions.0': { $exists: true } }).toArray();
    for (const week of interrupted) for (const completion of week.pendingCompletions) await finishCompletion(c, user, week._id, completion);
    const { doc, calendar } = await dailyBoard(c, user, now(), opts);
    return ctx.json(board(doc, calendar));
  });
  app.post('/quests/:id/skip', async (ctx) => {
    const user = ctx.get('user');
    const { requestId } = await input(ctx);
    const questId = ctx.req.param('id');
    const { doc, calendar } = await dailyBoard(c, user, now(), opts);
    if (priorRequest(doc, requestId, 'skip', questId)) return ctx.json({ board: board(doc, calendar) });
    if (doc.skipsUsed >= LIMIT) throw new HTTPException(409, { message: 'All five skips have been used this week. More arrive on Monday.' });
    const current = doc.days[calendar.day]!;
    const index = current.findIndex((quest) => quest.id === questId && quest.status === 'available');
    if (index < 0) throw new HTTPException(409, { message: 'This quest has already changed or been completed. Refresh your quests.' });
    const budget = (doc.budgets[calendar.day] ?? preferencesOf(user).dailyMinutes) - current.reduce((sum, quest, slot) => sum + (slot === index ? 0 : quest.minutes), 0);
    const [replacement] = await singleflight(`${doc._id}:${calendar.day}:skip:${doc.revision}:${questId}`, () => generateQuests(preferencesOf(user), 1, doc.skipsUsed + 1, current.map((quest) => quest.title), opts, budget));
    const updated = await c.questWeeks.findOneAndUpdate({ _id: doc._id, revision: doc.revision, skipsUsed: { $lt: LIMIT }, 'requests.id': { $ne: requestId } }, {
      $set: { [`days.${calendar.day}.${index}`]: replacement! }, $inc: { skipsUsed: 1, revision: 1 }, $push: { requests: { id: requestId, type: 'skip', questId } },
    }, { returnDocument: 'after' });
    if (updated) return ctx.json({ board: board(updated, calendar) });
    const fresh = (await c.questWeeks.findOne({ _id: doc._id }))!;
    if (priorRequest(fresh, requestId, 'skip', questId)) return ctx.json({ board: board(fresh, calendar) });
    throw new HTTPException(409, { message: 'Your quest board changed. Refresh and try again; no skip was used.' });
  });
  app.post('/quests/:id/complete', async (ctx) => {
    const user = ctx.get('user');
    const { requestId } = await input(ctx);
    const questId = ctx.req.param('id');
    const at = now();
    let { doc, calendar } = await dailyBoard(c, user, at, opts);
    priorRequest(doc, requestId, 'complete', questId);
    const index = doc.days[calendar.day]!.findIndex((quest) => quest.id === questId);
    if (index < 0) throw new HTTPException(409, { message: 'This quest is no longer on today’s board. Refresh your quests.' });
    if (doc.days[calendar.day]![index]!.status === 'available') {
      const updated = await c.questWeeks.findOneAndUpdate({ _id: doc._id, revision: doc.revision, 'requests.id': { $ne: requestId } }, {
        $set: { [`days.${calendar.day}.${index}.status`]: 'completed', [`days.${calendar.day}.${index}.completedAt`]: at },
        $inc: { revision: 1 }, $push: { requests: { id: requestId, type: 'complete', questId }, pendingCompletions: { questId, kind: doc.days[calendar.day]![index]!.kind, at } },
      }, { returnDocument: 'after' });
      doc = updated ?? (await c.questWeeks.findOne({ _id: doc._id }))!;
    }
    const quest = doc.days[calendar.day]!.find((item) => item.id === questId);
    if (!quest || quest.status !== 'completed') throw new HTTPException(409, { message: 'Your quest board changed. Refresh and try again.' });
    const reward = await finishCompletion(c, user, doc._id, { questId: quest.id, kind: quest.kind, at: quest.completedAt ?? at });
    return ctx.json({ board: board(doc, calendar), ...reward });
  });
}
