export type ShipMetrics = {
  quests: number;
  coins: number;
  moves: number;
  bossDamage: number;
  upgrades: number;
  suppliesInvested: number;
  steps: number;
};

export type ShipMember = {
  id: string;
  name: string;
  legend: number;
  monthly: ShipMetrics;
  overall: ShipMetrics;
  history: { id: string; text: string; item: string; delta: number; reason: string; at: string }[];
  damageNote: string | null;
};

export type ShipUpgrade = {
  key: 'helm' | 'sails';
  name: string;
  description: string;
  level: number;
  maxLevel: 3;
  cost: number | null;
  effect: string;
  nextEffect: string | null;
};

export type ShipDeck = {
  crew: { id: string; name: string; stores: Record<string, number> };
  month: { key: string; label: string; timeZone: string };
  members: ShipMember[];
  upgrades: ShipUpgrade[];
  sailing: { baseAverageMoves: number; effectiveAverageMoves: number; windMultiplier: number };
  map: {
    current: {
      id: string; name: string; theme: string; index: number;
      bossName: string; bossHp: number; bossMaxHp: number;
      conquered: boolean; conquestProgress: number; explored: number; totalTiles: number;
    };
    next: { month: string; monthLabel: string; name: string; theme: string; event: string };
    preparation: {
      earnedMoves: number; effectiveMoves: number; targetMoves: number;
      progress: number; ready: boolean; source: string; note: string;
    };
  };
};
