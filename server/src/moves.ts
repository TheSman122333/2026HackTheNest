/** Server-side Moves: folds finished days into the streak and computes today's Moves. */
import {
  advanceStreak,
  dailyMoves,
  dayKeyInTz,
  judgeDay,
  movesRemaining,
  type DayKey,
  type StreakEvent,
} from '@last-voyage/game';
import type { ObjectId } from 'mongodb';

import type { Collections, UserDoc } from './db';

/**
 * Fold every finished (before today) day with data into the user's streak. Idempotent:
 * advanceStreak ignores days <= lastDay, and days without a day log simply pause the streak.
 */
export async function foldStreak(c: Collections, user: UserDoc, today: DayKey) {
  const filter: Record<string, unknown> = { userId: user._id, day: { $lt: today } };
  if (user.streak.lastDay) filter.day = { $lt: today, $gt: user.streak.lastDay };
  const days = await c.dayLogs.find(filter).sort({ day: 1 }).toArray();
  if (days.length === 0) return { streak: user.streak, events: [] as StreakEvent[] };

  let streak = user.streak;
  const events: StreakEvent[] = [];
  for (const d of days) {
    const r = advanceStreak(streak, d.day, judgeDay(d.screen, user.limits));
    streak = r.state;
    events.push(...r.events);
  }
  await c.users.updateOne({ _id: user._id }, { $set: { streak } });
  return { streak, events };
}

export async function todayMoves(c: Collections, user: UserDoc, now = new Date()) {
  const today = dayKeyInTz(now, user.tz);
  const { streak, events } = await foldStreak(c, user, today);
  const [doc, acts] = await Promise.all([
    c.dayLogs.findOne({ userId: user._id, day: today }),
    c.activities.find({ userId: user._id, day: today }).toArray(),
  ]);
  const activityMoves = acts.reduce((n, a) => n + a.moves, 0);
  const moves = dailyMoves({ steps: doc?.steps ?? 0, activityMoves, streak });
  const spent = doc?.movesSpent ?? 0;
  return {
    day: today,
    steps: doc?.steps ?? 0,
    screen: doc?.screen ?? { swipes: 0, minutes: 0, opens: 0, tracked: false },
    activities: acts.map(({ kind, supplies, moves: m, legend, at }) => ({ kind, supplies, moves: m, legend, at })),
    moves: { ...moves, spent, remaining: movesRemaining(moves.total, spent) },
    streak,
    streakEvents: events,
  };
}

export async function ledger(
  c: Collections,
  entry: { crewId: ObjectId | null; userId: ObjectId | null; item: string; delta: number; reason: string },
) {
  await c.ledger.insertOne({ ...entry, at: new Date() });
}
