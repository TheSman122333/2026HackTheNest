/** Real life → Moves: log activities, see steps and today's scroll budget. */
import { REWARDS, stepsToNextMove } from '@last-voyage/game';
import { router } from 'expo-router';

import { Bar, Btn, C, H, P, Panel, Row, Screen, Stat, Title } from '@/components/kit';
import { TRACKING } from '@/lib/platform';
import { Sprite } from '@/components/sprites';
import { PersonalizedQuests } from '@/features/quests/PersonalizedQuests';
import { StepsCheckIn } from '@/features/steps/StepsCheckIn';
import { useSentinelPermissions } from '@/features/scroll/useScrollSentinel';
import { useTodaySteps } from '@/features/steps/steps';
import { syncToday } from '@/features/sync/deviceSync';
import { useSession } from '@/state/session';
import { useLanguage } from '@/state/language';
import { useT } from '@/features/language/i18n';

export default function Quests() {
  const tx = useT();
  const language = useLanguage((state) => state.language);
  const me = useSession((s) => s.me);
  const steps = useTodaySteps();
  const perms = useSentinelPermissions();
  if (!me) return null;
  const t = me.today;
  const limits = me.user.limits;
  const suppliesToday = t.activities.reduce((n, a) => n + a.supplies, 0);
  const next = stepsToNextMove(t.steps);

  return (
    <Screen>
      <Title>Earn your next move</Title>
      <P>Do it in real life, then complete your quest here. Every quest fills your sails.</P>

      <Row gap={10}>
        <Stat label="MOVES LEFT" value={t.moves.remaining} icon={<Sprite name="boots" size={22} />} />
        <Stat label="SUPPLIES TODAY" value={`${suppliesToday}/${REWARDS.suppliesPerDay}`} color={C.cloud} icon={<Sprite name="coin" size={22} />} />
      </Row>

      <PersonalizedQuests key={`${me.user.id}:${language}`} userId={me.user.id} />

      {TRACKING ? null : <StepsCheckIn />}

      {TRACKING ? (<>
      <Panel>
        <Row><Sprite name="fx_footsteps" size={28} /><H>{tx('Steps: {count}', { count: t.steps.toLocaleString(language) })}</H></Row>
        <Bar value={t.moves.fromSteps} max={REWARDS.movesFromStepsPerDay} color={C.sea} label={tx('{count}/{max} step Moves', { count: t.moves.fromSteps, max: REWARDS.movesFromStepsPerDay })} />
        <P dim>{next === null ? 'Step Moves maxed for today!' : tx('{count} more steps to the next Move', { count: next })}</P>
        {steps.supported && !steps.granted ? <Btn small label="Allow step access" onPress={steps.request} /> : null}
        <Btn small label="Sync now" color={C.sky} onPress={() => syncToday().catch(() => {})} />
      </Panel>

      <Panel>
        <Row><Sprite name="fx_wave" size={28} /><H>Calm Seas</H></Row>
        {perms.supported && !perms.accessibility ? (
          <Panel color={C.red}>
            <P>Swipe tracker is off. Swipes aren&apos;t counted and minutes reflect your total time in TikTok, Instagram and YouTube.</P>
            <Btn small label="Turn tracker on" onPress={() => router.push('/dev/scroll-lab')} />
          </Panel>
        ) : null}
        <Bar value={t.screen.swipes} max={limits.swipes} color={t.screen.swipes > limits.swipes ? C.red : C.jungle} label={tx('Swipes {count}/{max}', { count: t.screen.swipes, max: limits.swipes })} />
        <Bar value={t.screen.minutes} max={limits.minutes} color={t.screen.minutes > limits.minutes ? C.red : C.jungle} label={tx('Minutes {count}/{max}', { count: t.screen.minutes, max: limits.minutes })} />
        <P dim>
          {!t.screen.tracked
            ? 'Tracking is off. Turn it on in Me → Scroll Lab to earn streak bonuses.'
            : t.screen.opens === 0
              ? 'Shore Leave so far: you haven’t opened TikTok, Instagram or YouTube today. +25% Moves tomorrow!'
              : 'Stay under both limits today to grow your streak (+10% Moves per day).'}
        </P>
        {!t.screen.tracked ? <Btn small label="Set up tracking" onPress={() => router.push('/dev/scroll-lab')} /> : null}
      </Panel>
      </>) : null}
    </Screen>
  );
}
