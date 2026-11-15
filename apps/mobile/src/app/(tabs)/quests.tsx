/** Real life → Moves: log activities, see steps and today's scroll budget. */
import { ACTIVITIES, ACTIVITY_KINDS, REWARDS, stepsToNextMove, type ActivityKind } from '@last-voyage/game';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Bar, Btn, C, H, P, Panel, Row, Screen, Stat, Title } from '@/components/kit';
import { ACTIVITY_SPRITE, Sprite } from '@/components/sprites';
import { useSentinelPermissions } from '@/features/scroll/useScrollSentinel';
import { useTodaySteps } from '@/features/steps/steps';
import { syncToday } from '@/features/sync/deviceSync';
import { api } from '@/lib/api';
import type { ActivityResponse } from '@/lib/types';
import { useSession } from '@/state/session';

export default function Quests() {
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const steps = useTodaySteps();
  const perms = useSentinelPermissions();
  const [busy, setBusy] = useState<ActivityKind | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  if (!me) return null;
  const t = me.today;
  const limits = me.user.limits;
  const counts = t.activities.reduce<Record<string, number>>((m, a) => ((m[a.kind] = (m[a.kind] ?? 0) + 1), m), {});
  const suppliesToday = t.activities.reduce((n, a) => n + a.supplies, 0);
  const next = stepsToNextMove(t.steps);

  const log = async (kind: ActivityKind) => {
    setBusy(kind);
    try {
      const r = await api<ActivityResponse>('POST', '/activities', { kind });
      setMe({ today: r.today });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const g = r.grant;
      setToast(
        g.supplies || g.moves
          ? `WHAM! ${ACTIVITIES[kind].label}: +${g.moves} Moves, +${g.supplies} Supplies${g.reduced ? ' (daily cap)' : ''}`
          : `${ACTIVITIES[kind].label} logged. Daily cap reached, but it still counts!`,
      );
      useSession.getState().refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Title>QUESTS</Title>
      <P>Do it in real life, then log it here. Every quest fills your sails.</P>

      <Row gap={10}>
        <Stat label="MOVES LEFT" value={t.moves.remaining} icon={<Sprite name="boots" size={22} />} />
        <Stat label="SUPPLIES TODAY" value={`${suppliesToday}/${REWARDS.suppliesPerDay}`} color={C.cloud} icon={<Sprite name="coin" size={22} />} />
      </Row>

      {toast ? (
        <Panel color={C.gold}>
          <H>{toast}</H>
        </Panel>
      ) : null}

      <Panel>
        <H>Log an activity</H>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {ACTIVITY_KINDS.map((k) => (
            <View key={k} style={{ width: '47%' }}>
              <Btn
                icon={<Sprite name={ACTIVITY_SPRITE[k]!} size={26} />}
                label={`${ACTIVITIES[k].label}${counts[k] ? ` ×${counts[k]}` : ''}`}
                color={counts[k] ? C.cloud : C.orange}
                onPress={() => log(k)}
                busy={busy === k}
                small
              />
            </View>
          ))}
        </View>
        <P dim>Honor system. Logging the same thing 3+ times a day gives almost nothing.</P>
      </Panel>

      <Panel>
        <Row><Sprite name="fx_footsteps" size={28} /><H>Steps: {t.steps.toLocaleString()}</H></Row>
        <Bar value={t.moves.fromSteps} max={REWARDS.movesFromStepsPerDay} color={C.sea} label={`${t.moves.fromSteps}/${REWARDS.movesFromStepsPerDay} step Moves`} />
        <P dim>{next === null ? 'Step Moves maxed for today!' : `${next} more steps to the next Move`}</P>
        {steps.supported && !steps.granted ? <Btn small label="Allow step access" onPress={steps.request} /> : null}
        <Btn small label="↻ Sync now" color={C.sky} onPress={() => syncToday().catch(() => {})} />
      </Panel>

      <Panel>
        <Row><Sprite name="fx_wave" size={28} /><H>Calm Seas (short-form budget)</H></Row>
        {perms.supported && !perms.accessibility ? (
          <Panel color={C.red}>
            <P>⚠️ Swipe tracker is OFF, so swipes aren&apos;t counted and minutes are your total time in TikTok, Instagram and YouTube.</P>
            <Btn small label="Turn tracker on" onPress={() => router.push('/dev/scroll-lab')} />
          </Panel>
        ) : null}
        <Bar value={t.screen.swipes} max={limits.swipes} color={t.screen.swipes > limits.swipes ? C.red : C.jungle} label={`Swipes ${t.screen.swipes}/${limits.swipes}`} />
        <Bar value={t.screen.minutes} max={limits.minutes} color={t.screen.minutes > limits.minutes ? C.red : C.jungle} label={`Minutes ${t.screen.minutes}/${limits.minutes}`} />
        <P dim>
          {!t.screen.tracked
            ? 'Tracking is off. Turn it on in Me → Scroll Lab to earn streak bonuses.'
            : t.screen.opens === 0
              ? 'Shore Leave so far: you haven’t opened TikTok, Instagram or YouTube today. +25% Moves tomorrow!'
              : 'Stay under both limits today to grow your streak (+10% Moves per day).'}
        </P>
        {!t.screen.tracked ? <Btn small label="Set up tracking" onPress={() => router.push('/dev/scroll-lab')} /> : null}
      </Panel>
    </Screen>
  );
}
