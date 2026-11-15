import type {
  ActivityKind,
  ActivityGrant,
  DayKey,
  Explorer,
  Fight,
  Island,
  ScreenDay,
  ScreenLimits,
  Skill,
  StreakState,
} from '@last-voyage/game';
import { MongoClient, type Binary, type Collection, type Db, type ObjectId } from 'mongodb';
import type { QuestWeekDoc, VoyagePreferences } from './quests';

export const AVATAR_IDS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11', 'a12'] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

export type UserDoc = {
  _id: ObjectId;
  name: string;
  /** An approved outfit only. Face photos stay on the player's device. */
  avatarId?: AvatarId;
  /** Last platform the app reported. Android tracks steps + scrolling; iPhone/web get extra quests instead. */
  platform?: 'android' | 'ios' | 'web';
  preferences?: VoyagePreferences;
  activityRevision?: number;
  /** Atomic award receipts; activity/crew/ledger records are recoverable projections. */
  activityReceipts?: ActivityReceipt[];
  tz: string;
  crewId: ObjectId | null;
  skills: Record<Skill, number>;
  supplies: number;
  legend: number;
  streak: StreakState;
  limits: ScreenLimits;
  ssojetSub?: string;
  /** personal theme song (ElevenLabs Music) */
  theme?: { status: 'pending' | 'ready' | 'failed'; prompt: string; version: number; updatedAt: Date };
  createdAt: Date;
};

export type CrewDoc = {
  _id: ObjectId;
  name: string;
  inviteCode: string;
  memberIds: ObjectId[];
  /** supplies + materials (timber, iron, spice, shard) */
  stores: Record<string, number>;
  activityRewardIds?: string[];
  upgrades?: { helm?: number; sails?: number };
  /** Purchases live with the atomic resource debit; the Log is a recoverable projection. */
  upgradeLog?: { id: string; key: 'helm' | 'sails'; level: number; cost: number; userId: string; at: Date }[];
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
  eventId?: string;
  grant?: ActivityGrant;
  projected?: boolean;
};

export type ActivityReceipt = { id: string; day: DayKey; kind: ActivityKind; grant: ActivityGrant; crewId: ObjectId | null; at: Date };

export type DayLogDoc = {
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
  eventId?: string;
  /** human-readable line for the Log feed */
  text?: string;
  at: Date;
};

/** The crew's current island (one active per crew). */
export type IslandDoc = {
  _id: ObjectId;
  crewId: ObjectId;
  /** 0, 1, 2… voyage order */
  index: number;
  island: Island;
  fight: Fight;
  /** day the fighters map was last reset */
  fightDay: DayKey | null;
  conqueredAt: Date | null;
  createdAt: Date;
};

/** A player's position/HP/bag on the crew's current island. */
export type ExplorerDoc = {
  _id?: ObjectId;
  userId: ObjectId;
  islandDocId: ObjectId;
  explorer: Explorer;
  /** last day HP was restored */
  day: DayKey;
};

export type GmEventSource = {
  title: string;
  url: string;
  publishedAt: string | null;
};

export type GmWorldEvent = {
  id: string;
  narration: string;
  sources: GmEventSource[];
  effect: { type: 'spawn_item'; at: string; item: string } | { type: 'none' };
  createdAt: Date;
};

export type GmEventDoc = {
  _id: string;
  eventKey: string;
  crewId: ObjectId;
  islandDocId: ObjectId;
  userId: ObjectId;
  day: string;
  status: 'pending' | 'applied' | 'already_applied' | 'no_event';
  event: GmWorldEvent;
  changedTile: { hex: string; terrain: string; item: string } | null;
  audit: { id: string; reason: 'gm:event'; text: string };
  createdAt: Date;
  updatedAt: Date;
};

export type VoiceConversationDoc = {
  /** last few exchanges with the narrator (text only) */
  history?: { role: 'user' | 'assistant'; content: string }[];
  _id: string;
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
};

export type VoiceTurnDoc = {
  _id?: ObjectId;
  userId: ObjectId;
  requestId: string;
  status: 'processing' | 'completed';
  response?: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
};

/** Generated audio (theme songs, short-lived narrator replies). */
export type MediaDoc = {
  _id: string;
  userId: ObjectId;
  contentType: string;
  bytes: Binary;
  createdAt: Date;
  /** TTL: removed automatically after this time (narrator replies) */
  expiresAt?: Date;
};

/** One Lodestar ceremony ("End the Year"). The demo can run it more than once. */
export type SeasonDoc = {
  _id: ObjectId;
  year: number;
  winner: { userId: ObjectId; name: string; avatarId: string | null; legend: number; crewId: ObjectId | null; crewName: string | null } | null;
  players: number;
  endedBy: ObjectId;
  at: Date;
};

export type Collections = {
  users: Collection<UserDoc>;
  crews: Collection<CrewDoc>;
  activities: Collection<ActivityDoc>;
  dayLogs: Collection<DayLogDoc>;
  ledger: Collection<LedgerDoc>;
  islands: Collection<IslandDoc>;
  explorers: Collection<ExplorerDoc>;
  gmEvents: Collection<GmEventDoc>;
  voiceConversations: Collection<VoiceConversationDoc>;
  voiceTurns: Collection<VoiceTurnDoc>;
  media: Collection<MediaDoc>;
  questWeeks: Collection<QuestWeekDoc>;
  seasons: Collection<SeasonDoc>;
};

export function collections(db: Db): Collections {
  return {
    users: db.collection<UserDoc>('users'),
    crews: db.collection<CrewDoc>('crews'),
    activities: db.collection<ActivityDoc>('activities'),
    dayLogs: db.collection<DayLogDoc>('day_logs'),
    ledger: db.collection<LedgerDoc>('ledger'),
    islands: db.collection<IslandDoc>('islands'),
    explorers: db.collection<ExplorerDoc>('explorers'),
    gmEvents: db.collection<GmEventDoc>('gm_events'),
    voiceConversations: db.collection<VoiceConversationDoc>('voice_conversations'),
    voiceTurns: db.collection<VoiceTurnDoc>('voice_turns'),
    media: db.collection<MediaDoc>('media'),
    questWeeks: db.collection<QuestWeekDoc>('quest_weeks'),
    seasons: db.collection<SeasonDoc>('seasons'),
  };
}

export async function ensureIndexes(c: Collections) {
  await Promise.all([
    c.crews.createIndex({ inviteCode: 1 }, { unique: true }),
    c.users.createIndex({ ssojetSub: 1 }, { unique: true, sparse: true }),
    c.activities.createIndex({ userId: 1, day: 1 }),
    c.activities.createIndex({ eventId: 1 }, { unique: true, sparse: true }),
    c.questWeeks.createIndex({ userId: 1 }),
    c.users.createIndex({ legend: -1, createdAt: 1 }),
    c.seasons.createIndex({ at: -1 }),
    c.dayLogs.createIndex({ userId: 1, day: 1 }, { unique: true }),
    c.ledger.createIndex({ crewId: 1, at: -1 }),
    c.ledger.createIndex({ userId: 1, at: -1 }),
    c.ledger.createIndex({ eventId: 1 }, { unique: true, sparse: true }),
    c.islands.createIndex({ crewId: 1, index: -1 }),
    c.explorers.createIndex({ userId: 1, islandDocId: 1 }, { unique: true }),
    c.gmEvents.createIndex({ eventKey: 1 }, { unique: true }),
    c.voiceConversations.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.voiceTurns.createIndex({ userId: 1, requestId: 1 }, { unique: true }),
    c.voiceTurns.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.media.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true }),
  ]);
}

export async function connect(uri: string, dbName: string) {
  const client = new MongoClient(uri);
  await client.connect();
  const c = collections(client.db(dbName));
  await ensureIndexes(c);
  return { client, c };
}
