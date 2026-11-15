/** What Honor is, in one place, so the Me screen and the leaderboard say the same thing. */
import { HelpLine, HelpTip } from '@/components/HelpTip';

export const HONOR_SUMMARY = 'Honor is your score. It only ever goes up.';

export function LegendHelp() {
  return (
    <HelpTip title="Honor">
      <HelpLine>{HONOR_SUMMARY} Nothing in the game can take it away.</HelpLine>
      <HelpLine>• Log a real-life activity: +1 (up to 2 a day)</HelpLine>
      <HelpLine>• Hit an island boss: +3 for everyone who dealt damage</HelpLine>
      <HelpLine>• Land the finishing blow: +5 more</HelpLine>
      <HelpLine>Your ship&apos;s Honor is your whole crew&apos;s added together. There is only one Lodestar in all the Tidewake: the ship with the most Honor claims it, and keeps it.</HelpLine>
    </HelpTip>
  );
}
