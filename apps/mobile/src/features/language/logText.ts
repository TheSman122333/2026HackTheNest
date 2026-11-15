import { ACTIVITIES, type ActivityKind, type TranslationParams } from '@last-voyage/game';

type LedgerText = Readonly<{ text: string; item: string; delta: number; reason: string }>;
export type LogTranslator = (source: string, params?: TranslationParams) => string;

const ITEM_LABELS: Readonly<Record<string, string>> = {
  supplies: 'Supplies', moves: 'Moves', legend: 'Honor', timber: 'Timber', iron: 'Iron',
  spice: 'Spice', shard: 'Shard', clue: 'Clue', cutlass: 'Cutlass', cannon: 'Cannon',
  tonic: 'Tonic', chest: 'Mystery chest', boss_damage: 'Boss damage',
};
const UPGRADE_LABELS: Readonly<Record<string, string>> = { helm: "Navigator's helm", sails: 'Windcatcher sails' };
const THEME_LABELS: Readonly<Record<string, string>> = { tropical: 'Tropical', spooky: 'Spooky', winter: 'Winter', volcanic: 'Volcanic' };

/** Localize canonical ledger events. Captured names are values, never translation keys. */
export function formatLogText(entry: LedgerText, tx: LogTranslator, language = 'en'): string {
  const { text, item, delta, reason } = entry;
  const number = (value: number) => value.toLocaleString(language);
  const itemLabel = Object.hasOwn(ITEM_LABELS, item) ? ITEM_LABELS[item]! : null;

  if (reason.startsWith('activity:')) {
    const kind = reason.slice('activity:'.length);
    if (Object.hasOwn(ACTIVITIES, kind) && itemLabel) {
      const activity = ACTIVITIES[kind as ActivityKind].label;
      const reward = `${delta > 0 ? '+' : ''}${delta} ${item}`;
      // The API and crew-history endpoint use these two historical representations.
      if (text === `${reward} (${reason})` || text === `${reward} (${activity})`) {
        return tx('{activity}: {amount} {item}', { activity: tx(activity), amount: `${delta > 0 ? '+' : ''}${number(delta)}`, item: tx(itemLabel) });
      }
    }
    return text;
  }

  if (reason === 'island:loot' && itemLabel) {
    const suffix = ` found ${delta} ${item}`;
    if (text.endsWith(suffix) && text.length > suffix.length) {
      return tx('{name} found {count} {item}', { name: text.slice(0, -suffix.length), count: number(delta), item: tx(itemLabel) });
    }
  }
  if (reason === 'island:ko') {
    const suffix = ' was washed overboard!';
    if (text.endsWith(suffix) && text.length > suffix.length) return tx('{name} was washed overboard!', { name: text.slice(0, -suffix.length) });
  }
  if (reason === 'fight:damage') {
    const match = text.match(/^(.+) dealt (\d+) damage to (.+)\.$/);
    if (match && Number(match[2]) === delta) return tx('{name} dealt {damage} damage to {boss}.', { name: match[1]!, damage: number(delta), boss: match[3]! });
  }
  if (reason === 'fight:ko') {
    const match = text.match(/^(.+) knocked (.+) overboard!$/);
    if (match) return tx('{boss} knocked {name} overboard!', { boss: match[1]!, name: match[2]! });
  }
  if (reason === 'island:conquered') {
    const match = text.match(/^(.+) defeated (.+)! The island is ours!$/);
    if (match) return tx('{name} defeated {boss}! The island is ours!', { name: match[1]!, boss: match[2]! });
  }
  if (reason === 'crew:leave') {
    const suffix = ' left the crew to sail with another. Fair winds!';
    if (text.endsWith(suffix) && text.length > suffix.length) return tx('{name} left the crew to sail with another. Fair winds!', { name: text.slice(0, -suffix.length) });
  }
  if (reason === 'season:lodestar') {
    const ship = text.match(/^The (.+) claimed the Lodestar with (\d+) Honor! The only one in all the Tidewake\.$/);
    if (ship) return tx('The {crew} claimed the Lodestar with {honor} Honor! The only one in all the Tidewake.', { crew: ship[1]!, honor: number(Number(ship[2])) });
    // Older seasons awarded a pirate; preserve those recorded facts instead of changing the winner.
    const match = text.match(/^(.+) claimed the Lodestar with (\d+) Legend! The year's voyage is complete\.$/);
    if (match) return tx('{name} claimed the Lodestar with {legend} Legend! The year\'s voyage is complete.', { name: match[1]!, legend: number(Number(match[2])) });
  }
  if (reason.startsWith('ship:upgrade:')) {
    const key = reason.slice('ship:upgrade:'.length);
    const match = text.match(/^(.+) upgraded to level (\d+) for (\d+) Supplies\.$/);
    if (match && Object.hasOwn(UPGRADE_LABELS, key) && match[1] === UPGRADE_LABELS[key] && Number(match[3]) === -delta) {
      return tx('{upgrade} upgraded to level {level} for {cost} Supplies.', { upgrade: tx(UPGRADE_LABELS[key]!), level: number(Number(match[2])), cost: number(-delta) });
    }
  }
  if (reason === 'night:sail') {
    const match = text.match(/^The ship sailed through the night and reached a (tropical|spooky|winter|volcanic) island!$/);
    if (match) return tx('The ship sailed through the night and reached a {theme} island!', { theme: tx(THEME_LABELS[match[1]!]!) });
  }
  if (reason === 'night:chaos') {
    if (text === 'Night fell. Strange items washed ashore.') return tx('Night fell. Strange items washed ashore.');
    if (text === 'A hurricane tore across the island overnight, scattering everything!') return tx('A hurricane tore across the island overnight, scattering everything!');
    if (text === 'The volcano erupted overnight! The land has changed.') return tx('The volcano erupted overnight! The land has changed.');
  }
  // Future events and older free-form text remain intact, including all player-written text.
  return text;
}

export function relativeLogTime(iso: string, language: string, now = Date.now()): string {
  const elapsed = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(elapsed)) return '';
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' });
  if (elapsed < 60) return formatter.format(-Math.floor(elapsed), 'second');
  if (elapsed < 3600) return formatter.format(-Math.floor(elapsed / 60), 'minute');
  if (elapsed < 86400) return formatter.format(-Math.floor(elapsed / 3600), 'hour');
  return formatter.format(-Math.floor(elapsed / 86400), 'day');
}
