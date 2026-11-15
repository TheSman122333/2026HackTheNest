/**
 * ALL economy constants for real-life rewards (activities, steps, streaks → Moves). Tune here only — UI and server import these.
 */
export const SKILLS = ['grit', 'charm', 'lore', 'craft', 'seacraft'] as const;
export type Skill = (typeof SKILLS)[number];

export const ACTIVITY_KINDS = [
  'walk',
  'workout',
  'outdoors',
  'read',
  'study',
  'hobby',
  'friends',
  'chores',
  'journal',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivityDef = {
  label: string;
  /** XP goes to each listed skill */
  skills: Skill[];
  supplies: number;
  moves: number;
};

export const ACTIVITIES: Record<ActivityKind, ActivityDef> = {
  walk: { label: 'Walk', skills: ['grit', 'seacraft'], supplies: 2, moves: 1 },
  workout: { label: 'Workout', skills: ['grit'], supplies: 3, moves: 2 },
  outdoors: { label: 'Outdoors', skills: ['seacraft'], supplies: 3, moves: 2 },
  read: { label: 'Read', skills: ['lore'], supplies: 2, moves: 1 },
  study: { label: 'Study', skills: ['lore'], supplies: 3, moves: 1 },
  hobby: { label: 'Hobby / build', skills: ['craft'], supplies: 3, moves: 1 },
  friends: { label: 'Time with people', skills: ['charm'], supplies: 3, moves: 2 },
  chores: { label: 'Chores', skills: ['craft'], supplies: 2, moves: 1 },
  journal: { label: 'Journal', skills: ['lore'], supplies: 1, moves: 0 },
};

export const REWARDS = {
  /** XP per logged activity, per listed skill */
  xpPerActivity: 5,
  /** Honor-system caps (per local day) */
  suppliesPerDay: 10,
  movesFromActivitiesPerDay: 6,
  /** iPhone/web can't track steps or scrolling, so they get 2 extra daily quests and room for their Moves. */
  movesFromActivitiesPerDayUntracked: 10,
  legendFromActivitiesPerDay: 2,
  /** The Nth+ log of the same kind in a day only gives 1 Supply and no Moves */
  diminishAfterSameKind: 2,
  /** Steps → Island Moves */
  stepsPerMove: 1000,
  movesFromStepsPerDay: 10,
  /** iPhone/web type in today's steps from their Health app (honor system): smaller cap. */
  movesFromSelfReportedStepsPerDay: 6,
  /** Base Moves everyone gets daily so nobody is ever fully locked out */
  baseMovesPerDay: 2,
} as const;

export const SCREEN = {
  /** Default daily short-form limits; the player can set their own (stricter or looser within bounds). */
  defaultSwipeLimit: 60,
  defaultMinuteLimit: 20,
  minSwipeLimit: 0,
  maxSwipeLimit: 300,
  minMinuteLimit: 0,
  maxMinuteLimit: 120,
} as const;

export const STREAK = {
  /** Calm Seas: each streak day adds this much to the Moves/Supplies multiplier … */
  calmStepBonus: 0.1,
  /** … up to this many days */
  calmMaxDays: 10,
  /** Shore Leave (didn't open any tracked app) adds a flat bonus on top for the next day */
  shoreLeaveBonus: 0.25,
  /** Earn a shield every N consecutive calm days; a shield absorbs one missed day */
  shieldEvery: 7,
  maxShields: 2,
} as const;

/** The ship's narrator. Rename here (and in content/ lines) — every UI/server string reads this. */
export const NARRATOR = { name: 'Tidekeeper', withThe: 'the Tidekeeper' } as const;
/** Steers the ship and keeps it up to speed (Ship screen). */
export const SHIPWRIGHT = { name: 'Shipwright', withThe: 'the Shipwright' } as const;
