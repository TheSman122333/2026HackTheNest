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

export type User = {
  id: string;
  name: string;
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
  members: { id: string; name: string; legend: number; skills: Record<Skill, number>; calmDays: number }[];
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
  crewmates: { userId: string; name: string; pos: HexKey; hp: number }[];
  reachable: Record<HexKey, number>;
  canFight: boolean;
  boss: { key: string; name: string; title: string; maxHp: number; hp: number; atk: number; armor: number; defeated: boolean };
  movesRemaining: number;
};

export type MoveResponse = IslandView & { events: IslandEvent[]; spent: number };
export type FightResponse = IslandView & { events: FightEvent[] };
export type ActivityResponse = { grant: ActivityGrant; today: Today };
export type LogEntry = { id: string; text: string; item: string; delta: number; reason: string; at: string };
