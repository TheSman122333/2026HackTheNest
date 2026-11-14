import { ACTIVITIES, REWARDS, type ActivityKind, type Skill } from './config';

/** One logged real-life activity (what the server stores). */
export type ActivityLog = {
  kind: ActivityKind;
  at: number;
  supplies: number;
  moves: number;
  legend: number;
};

export type ActivityGrant = {
  kind: ActivityKind;
  supplies: number;
  moves: number;
  legend: number;
  xp: Partial<Record<Skill, number>>;
  /** true when a daily cap or diminishing returns reduced the grant */
  reduced: boolean;
};

const sum = (logs: readonly ActivityLog[], f: (l: ActivityLog) => number) =>
  logs.reduce((n, l) => n + f(l), 0);

/**
 * What logging `kind` right now is worth, given everything already logged TODAY.
 * Honor system + hard caps: faking volume can only ever match an honest active day.
 */
export function grantForActivity(today: readonly ActivityLog[], kind: ActivityKind): ActivityGrant {
  const def = ACTIVITIES[kind];
  const sameKind = today.filter((l) => l.kind === kind).length;
  const diminished = sameKind >= REWARDS.diminishAfterSameKind;

  const wantSupplies = diminished ? 1 : def.supplies;
  const wantMoves = diminished ? 0 : def.moves;

  const supplies = clampToCap(wantSupplies, sum(today, (l) => l.supplies), REWARDS.suppliesPerDay);
  const moves = clampToCap(wantMoves, sum(today, (l) => l.moves), REWARDS.movesFromActivitiesPerDay);
  const legend = clampToCap(1, sum(today, (l) => l.legend), REWARDS.legendFromActivitiesPerDay);

  const xp: Partial<Record<Skill, number>> = {};
  for (const s of def.skills) xp[s] = REWARDS.xpPerActivity;

  return {
    kind,
    supplies,
    moves,
    legend,
    xp,
    reduced: diminished || supplies < wantSupplies || moves < wantMoves,
  };
}

function clampToCap(want: number, used: number, cap: number): number {
  return Math.max(0, Math.min(want, cap - used));
}
