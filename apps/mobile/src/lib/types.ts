/** Response shapes from server/ (kept loose on purpose: the server is the source of truth). */
import type {
  ActivityGrant,
  ActivityKind,
  Explorer,
  FightEvent,
  HexKey,
  IslandEvent,
  IslandTheme,
  MovesBreakdown,
  ScreenDay,
  ScreenLimits,
  Skill,
  StreakState,
  Tile,
} from '@last-voyage/game';

export type AvatarId = 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'a7' | 'a8' | 'a9' | 'a10' | 'a11' | 'a12';

export type User = {
  id: string;
  name: string;
  avatarId?: AvatarId | null;
  tz: string;
  crewId: string | null;
  skills: Record<Skill, number>;
  supplies: number;
  legend: number;
  limits: ScreenLimits;
};

export type Crew = {
  id: string;
  name: string;
  inviteCode: string;
  memberIds: string[];
  stores: Record<string, number>;
};

export type Today = {
  day: string;
  steps: number;
  screen: ScreenDay;
  activities: { kind: ActivityKind; supplies: number; moves: number; legend: number; at: string }[];
  moves: MovesBreakdown & { spent: number; remaining: number };
  streak: StreakState;
};

export type Me = { user: User; crew: Crew | null; today: Today };

export type CrewRoster = {
  crew: Crew | null;
  members: { id: string; name: string; avatarId?: AvatarId | null; legend: number; skills: Record<Skill, number>; calmDays: number }[];
  sailing?: { totalMoves: number; averageMoves: number; activities: number; steps: number; activeMembers: number; members: number } | null;
};

export type IslandView = {
  island: {
    id: string;
    index: number;
    theme: IslandTheme;
    radius: number;
    start: HexKey;
    bossAt: HexKey;
    tiles: Record<HexKey, Tile>;
    allHexes: HexKey[];
    conquered: boolean;
  };
  explorer: Explorer;
  crewmates: { userId: string; name: string; avatarId?: AvatarId | null; pos: HexKey; hp: number }[];
  reachable: Record<HexKey, number>;
  canFight: boolean;
  boss: { key: string; name: string; title: string; maxHp: number; hp: number; atk: number; armor: number; defeated: boolean };
  movesRemaining: number;
};

export type MoveResponse = IslandView & { events: IslandEvent[]; spent: number };
export type FightResponse = IslandView & { events: FightEvent[] };
export type ActivityResponse = { grant: ActivityGrant; today: Today };
export type LogEntry = { id: string; text: string; item: string; delta: number; reason: string; at: string };

export type VoiceTurn = {
  requestId: string;
  conversationId: string;
  transcript: string | null;
  reply: string;
  intent: { type: 'briefing' | 'question' | 'island.move' | 'fight' | 'narration'; to?: string; action?: string; scene?: string };
  result: { events: (IslandEvent | FightEvent)[]; movesRemaining: number; playerHp: number; bossHp: number } | null;
  audio: { url: string; expiresAt: string } | null;
  audioError: string | null;
  sfxCueKeys: string[];
};

export type GmEvent = {
  requestId: string;
  status: 'applied' | 'already_applied' | 'no_event';
  event: {
    id: string;
    narration: string;
    sources: { title: string; url: string; publishedAt: string | null }[];
    effect: { type: 'spawn_item'; at: string; item: string } | { type: 'none' };
  };
  island: { id: string; changedTile: { hex: string; terrain: string; item: string } | null };
};
