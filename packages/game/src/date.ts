/** Local-day keys as 'YYYY-MM-DD'. Pure string math so it is identical on device and server. */
export type DayKey = string;

export function dayKey(d: Date): DayKey {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole days from a to b (b - a). Uses UTC noon to dodge DST edges. */
export function daysBetween(a: DayKey, b: DayKey): number {
  const toUtc = (k: DayKey) => {
    const [y, m, d] = k.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d, 12);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** Day key for an instant in a given IANA time zone (e.g. 'America/Detroit'). Falls back to UTC. */
export function dayKeyInTz(at: Date, timeZone: string): DayKey {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}
