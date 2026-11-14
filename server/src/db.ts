import type { ActivityKind, DayKey, ScreenDay, ScreenLimits, Skill, StreakState } from '@last-voyage/game';
import { MongoClient, type Collection, type Db, type ObjectId } from 'mongodb';

export type UserDoc = {
  _id: ObjectId;
  name: string;
  tz: string;
  crewId: ObjectId | null;
  skills: Record<Skill, number>;
  supplies: number;
  legend: number;
  streak: StreakState;
  limits: ScreenLimits;
  ssojetSub?: string;
  createdAt: Date;
};

export type CrewDoc = {
  _id: ObjectId;
  name: string;
  inviteCode: string;
  memberIds: ObjectId[];
  stores: { supplies: number };
  createdAt: Date;
};

export type ActivityDoc = {
  _id?: ObjectId;
  userId: ObjectId;
  crewId: ObjectId | null;
  day: DayKey;
  kind: ActivityKind;
  supplies: number;
  moves: number;
  legend: number;
  xp: Partial<Record<Skill, number>>;
  at: Date;
};

export type WindDayDoc = {
  _id?: ObjectId;
  userId: ObjectId;
  day: DayKey;
  steps: number;
  screen: ScreenDay;
  movesSpent: number;
  updatedAt: Date;
};

/** Append-only audit of every resource change (feeds the Log tab). */
export type LedgerDoc = {
  _id?: ObjectId;
  crewId: ObjectId | null;
  userId: ObjectId | null;
  item: string;
  delta: number;
  reason: string;
  at: Date;
};

export type Collections = {
  users: Collection<UserDoc>;
  crews: Collection<CrewDoc>;
  activities: Collection<ActivityDoc>;
  windDays: Collection<WindDayDoc>;
  ledger: Collection<LedgerDoc>;
};

export function collections(db: Db): Collections {
  return {
    users: db.collection<UserDoc>('users'),
    crews: db.collection<CrewDoc>('crews'),
    activities: db.collection<ActivityDoc>('activities'),
    windDays: db.collection<WindDayDoc>('wind_days'),
    ledger: db.collection<LedgerDoc>('ledger'),
  };
}

export async function ensureIndexes(c: Collections) {
  await Promise.all([
    c.crews.createIndex({ inviteCode: 1 }, { unique: true }),
    c.users.createIndex({ ssojetSub: 1 }, { unique: true, sparse: true }),
    c.activities.createIndex({ userId: 1, day: 1 }),
    c.windDays.createIndex({ userId: 1, day: 1 }, { unique: true }),
    c.ledger.createIndex({ crewId: 1, at: -1 }),
    c.ledger.createIndex({ userId: 1, at: -1 }),
  ]);
}

export async function connect(uri: string, dbName: string) {
  const client = new MongoClient(uri);
  await client.connect();
  const c = collections(client.db(dbName));
  await ensureIndexes(c);
  return { client, c };
}
