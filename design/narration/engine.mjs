/** Staged narration prototype; no imports from, or mutations to, the live game. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const bank = JSON.parse(await readFile(new URL('../../content/narration/old-brine.json', import.meta.url), 'utf8'));
export const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const VERSION = `old-brine-1:${hash(bank)}`;
export const MAX_RECAP_EVENTS = 8;
const activities = new Set(['walk', 'workout', 'outdoors', 'read', 'study', 'hobby', 'friends', 'chores', 'journal']);
const terrains = new Set(['sea', 'beach', 'jungle', 'grass', 'rock', 'ruins', 'town', 'volcano', 'swamp', 'snow']);
const fields = {
  intro: {},
  activity_logged: { actor: 'label', activity: 'activity', supplies: 'number', moves: 'number', legend: 'number' },
  move: { actor: 'label', terrain: 'terrain', movesRemaining: 'number' },
  item_found: { actor: 'label', item: 'label' },
  chaos: { disaster: 'disaster', island: 'label' },
  boss_victory: { actor: 'label', boss: 'label', island: 'label' },
  streak_milestone: { actor: 'label', days: 'number' },
  streak_reset: { actor: 'label' },
  crew_joined: { actor: 'label', crew: 'label' },
  island_arrival: { crew: 'label', island: 'label' },
};
export const EVENT_TYPES = Object.keys(fields);

export class InputError extends Error {}
const fail = (message) => { throw new InputError(message); };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed, name) {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key))) fail(`Unexpected fields in ${name}.`);
}
function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) fail('IDs must be 1-80 letters, numbers, underscores or hyphens.');
  return value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail('Use a UTC ISO timestamp ending in Z.');
  const normalized = new Date(value).toISOString();
  const canonicalInput = value.includes('.') ? value.replace(/\.(\d{1,3})Z$/, (_, fraction) => `.${fraction.padEnd(3, '0')}Z`) : value.replace('Z', '.000Z');
  if (canonicalInput !== normalized) fail('Invalid calendar date or time.');
  return normalized;
}
function label(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 64 || /[\p{Cc}\p{Cf}<>\[\]{}]/u.test(value)) fail('Labels must be 1-64 characters without controls or speech markup.');
  return value.trim();
}

export function validateEvent(input) {
  keys(input, ['id', 'type', 'at', 'facts'], 'event');
  if (!EVENT_TYPES.includes(input.type)) fail('Unknown narration event type.');
  const schema = fields[input.type];
  keys(input.facts, Object.keys(schema), 'event facts');
  const facts = {};
  for (const [name, kind] of Object.entries(schema)) {
    const value = input.facts[name];
    if (kind === 'number') {
      if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) fail(`${name} must be a non-negative integer, at most 1000000.`);
      facts[name] = value;
    } else {
      facts[name] = label(value);
      if (kind === 'activity' && !activities.has(value)) fail('Unknown activity.');
      if (kind === 'terrain' && !terrains.has(value)) fail('Unknown terrain.');
      if (kind === 'disaster' && !['hurricane', 'eruption'].includes(value)) fail('Unknown disaster.');
    }
  }
  return { id: id(input.id), type: input.type, at: timestamp(input.at), facts };
}

function cursor(input) {
  keys(input, ['at', 'id'], 'cursor');
  return { at: timestamp(input.at), id: id(input.id) };
}
const compare = (a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function normalizeRequest(input, now = new Date()) {
  if (!object(input) || !['event', 'recap'].includes(input.mode)) fail('mode must be event or recap.');
  if (input.ai !== undefined && typeof input.ai !== 'boolean') fail('ai must be true or false.');
  if (input.mode === 'event') {
    keys(input, ['mode', 'ai', 'event'], 'request');
    return { mode: 'event', ai: input.ai === true, events: [validateEvent(input.event)], nextCursor: null, hasMore: false };
  }
  keys(input, ['mode', 'ai', 'events', 'after', 'until'], 'request');
  if (!Array.isArray(input.events) || input.events.length > 100) fail('Supply up to 100 events per recap request.');
  const until = timestamp(input.until ?? now.toISOString());
  const after = input.after == null ? null : cursor(input.after);
  if (after && after.at > until) fail('The recap cursor is after the snapshot time.');
  const seen = new Set();
  const all = input.events.map(validateEvent).sort(compare).filter((event) => {
    if (seen.has(event.id)) fail('Duplicate event ID.');
    seen.add(event.id);
    return event.at <= until && (!after || compare(event, after) > 0);
  });
  // Paginate rather than silently omit unread events. ACK only the returned cursor.
  const events = all.slice(0, MAX_RECAP_EVENTS);
  const last = events.at(-1);
  return {
    mode: 'recap', ai: input.ai === true, events, until,
    nextCursor: last ? { at: last.at, id: last.id } : after,
    hasMore: all.length > events.length,
  };
}

export function stockLine(event) {
  const lines = bank.lines[event.type];
  const variant = Number.parseInt(hash([event.id, event.type]).slice(0, 8), 16) % lines.length;
  return lines[variant].replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in event.facts)) throw new Error(`Missing stock-line placeholder: ${name}`);
    return String(event.facts[name]);
  });
}

/** AI writes a fresh lead-in; authoritative names, amounts and outcomes stay intact. */
export async function composeScript(request, { generateFlavor } = {}) {
  const factualText = request.events.map(stockLine).join(' ');
  let lead = request.mode === 'recap' ? 'Back aboard? Here is the latest from the ship\'s log.' : '';
  let source = 'stock';
  let warning = null;
  if (request.ai && request.events.length) {
    if (!generateFlavor) warning = 'AI writer is not configured; using stock lines.';
    else {
      try {
        // Send only categories, never player names, journal entries or device data.
        const flavor = await generateFlavor({ mode: request.mode, eventTypes: request.events.map((e) => e.type) });
        if (typeof flavor !== 'string' || !flavor.trim() || flavor.length > 180 || /[\p{Cc}\p{Cf}<>\[\]{}\d]/u.test(flavor)) throw new Error('Invalid AI lead-in.');
        lead = flavor.trim();
        source = 'ai';
      } catch { warning = 'AI writer unavailable or returned invalid text; using stock lines.'; }
    }
  }
  const text = factualText ? [lead, factualText].filter(Boolean).join(' ') : bank.lines.recap_empty[0];
  if (text.length > 4000) throw new InputError('Narration exceeds the 4000 character speech limit.');
  return {
    id: hash([VERSION, source, text]), text, source, warning,
    eventIds: request.events.map((event) => event.id),
    nextCursor: request.nextCursor, hasMore: request.hasMore,
    capturedUntil: request.until ?? null,
  };
}

export const examples = {
  activity: { mode: 'event', event: { id: 'activity-1', type: 'activity_logged', at: '2026-11-14T16:00:00.000Z', facts: { actor: 'Maya', activity: 'walk', supplies: 2, moves: 1, legend: 1 } } },
  pickup: { mode: 'event', event: { id: 'pickup-1', type: 'item_found', at: '2026-11-14T16:01:00.000Z', facts: { actor: 'Maya', item: 'cannon' } } },
  boss: { mode: 'event', event: { id: 'boss-1', type: 'boss_victory', at: '2026-11-14T16:02:00.000Z', facts: { actor: 'The Gullwing crew', boss: 'Cindertail the Magma Scorpion', island: 'Ember Isle' } } },
};
examples.recap = { mode: 'recap', until: '2026-11-14T18:00:00.000Z', events: Object.values(examples).map((example) => example.event) };
