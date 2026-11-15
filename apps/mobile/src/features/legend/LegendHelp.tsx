/** What Legend is, in one place, so the Me screen and the leaderboard say the same thing. */
import { HelpLine, HelpTip } from '@/components/HelpTip';

export const LEGEND_SUMMARY = 'Legend is your score for the year. It only ever goes up.';

export function LegendHelp() {
  return (
    <HelpTip title="Legend">
      <HelpLine>{LEGEND_SUMMARY} Nothing in the game can take it away.</HelpLine>
      <HelpLine>• Log a real-life activity: +1 (up to 2 a day)</HelpLine>
      <HelpLine>• Hit an island boss: +3 for everyone who dealt damage</HelpLine>
      <HelpLine>• Land the finishing blow: +5 more</HelpLine>
      <HelpLine>At the end of the year, the pirate with the most Legend across every crew claims the Lodestar: a crown, a legendary ship for their crew, and an island named after them.</HelpLine>
    </HelpTip>
  );
}
