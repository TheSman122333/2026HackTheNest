import { dayKeyInTz, grantForActivity, type ActivityKind, type ActivityLog } from '@last-voyage/game';
import { HTTPException } from 'hono/http-exception';
import { randomUUID } from 'node:crypto';

import type { ActivityReceipt, Collections, UserDoc } from './db';
import { activityCapForUser, todayMoves } from './moves';

const duplicate = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

/** Each derived record uses the canonical receipt ID, so retrying cannot double-credit the crew. */
async function project(c: Collections, user: UserDoc, receipt: ActivityReceipt) {
  const { id, day, kind, grant: g, crewId, at } = receipt;
  try {
    await c.activities.updateOne({ eventId: id }, { $setOnInsert: {
      userId: user._id, crewId, day, kind, supplies: g.supplies, moves: g.moves, legend: g.legend, xp: g.xp, at, eventId: id, grant: g,
    } }, { upsert: true });
  } catch (error) { if (!duplicate(error)) throw error; }
  if (crewId && g.supplies > 0) await c.crews.updateOne(
    { _id: crewId, activityRewardIds: { $ne: id } },
    { $inc: { 'stores.supplies': g.supplies }, $addToSet: { activityRewardIds: id } },
  );
  if (g.supplies > 0) {
    try { await c.ledger.updateOne({ eventId: id }, { $setOnInsert: {
      crewId, userId: user._id, item: 'supplies', delta: g.supplies, reason: `activity:${kind}`, eventId: id, at,
    } }, { upsert: true }); } catch (error) { if (!duplicate(error)) throw error; }
  }
  await c.activities.updateOne({ eventId: id }, { $set: { projected: true } });
  // The durable indexed activity is now the retry receipt. Bumping the revision also
  // invalidates an award computation that started before this receipt was projected.
  await c.users.updateOne({ _id: user._id, 'activityReceipts.id': id }, { $pull: { activityReceipts: { id } }, $inc: { activityRevision: 1 } });
}

export async function reconcileActivityReceipts(c: Collections, user: UserDoc) {
  const fresh = await c.users.findOne({ _id: user._id });
  for (const receipt of fresh?.activityReceipts ?? []) await project(c, fresh!, receipt);
}

/** Shared manual/quest reward path: CAS serializes grants and caps, with the user's award atomic. */
export async function awardActivity(c: Collections, user: UserDoc, kind: ActivityKind, now = new Date(), eventId = `activity:${randomUUID()}`) {
  const day = dayKeyInTz(now, user.tz);
  for (let attempt = 0; attempt < 30; attempt++) {
    const fresh = await c.users.findOne({ _id: user._id });
    if (!fresh) throw new HTTPException(401, { message: 'unauthorized' });
    let receipt = fresh.activityReceipts?.find((item) => item.id === eventId);
    if (!receipt) {
      const prior = await c.activities.findOne({ userId: user._id, eventId });
      if (prior?.grant && prior.projected) return { grant: prior.grant, today: await todayMoves(c, fresh, now) };
      const todays = await c.activities.find({ userId: user._id, day }).toArray();
      const ids = new Set(todays.flatMap((item) => item.eventId ? [item.eventId] : []));
      const logs: ActivityLog[] = todays.map((item) => ({ ...item, at: item.at.getTime() }));
      for (const item of fresh.activityReceipts ?? []) if (item.day === day && !ids.has(item.id)) logs.push({ ...item.grant, at: item.at.getTime() });
      const grant = grantForActivity(logs, kind, activityCapForUser(fresh));
      receipt = { id: eventId, day, kind, grant, crewId: fresh.crewId, at: now };
      const inc: Record<string, number> = { supplies: grant.supplies, legend: grant.legend, activityRevision: 1 };
      for (const [skill, value] of Object.entries(grant.xp)) inc[`skills.${skill}`] = value;
      const result = await c.users.updateOne(
        { _id: user._id, activityRevision: fresh.activityRevision ?? { $exists: false }, 'activityReceipts.id': { $ne: eventId } },
        { $inc: inc, $push: { activityReceipts: receipt } },
      );
      if (!result.modifiedCount) continue;
    }
    await project(c, fresh, receipt);
    const updated = (await c.users.findOne({ _id: user._id }))!;
    return { grant: receipt.grant, today: await todayMoves(c, updated, now) };
  }
  throw new HTTPException(409, { message: 'Your rewards are still updating. Please retry.' });
}
