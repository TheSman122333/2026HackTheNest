/** Home: the crew's ship. Today's Moves at a glance, crew roster, stores, and demo controls. */
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Btn, C, F, H, P, Panel, Row, Screen, Stat, Title } from '@/components/kit';
import { TRACKING } from '@/lib/platform';
import { avatarFor, ITEM_SPRITE, MONTH_CARD, Sprite } from '@/components/sprites';
import { ShipwrightPanel } from '@/features/ship/ShipwrightPanel';
import { api } from '@/lib/api';
import type { CrewRoster } from '@/lib/types';
import { useIsland } from '@/state/island';
import { useSession } from '@/state/session';

const MONTH_EVENT = [
  'New Year',
  'Black History Month',
  "Women's History Month",
  'Spring',
  'Mental Health Awareness',
  'Pride',
  'Summer',
  'Back to School',
  'Self-Care',
  'Spooky Season',
  'Remembrance',
  'Winter Holidays',
];

export default function Ship() {
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const advanceNight = useIsland((s) => s.advanceNight);
  const [roster, setRoster] = useState<CrewRoster | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
      api<CrewRoster>('GET', '/crew').then(setRoster).catch(() => {});
    }, [refresh]),
  );

  if (!me?.crew) return null;
  const t = me.today;
  const m = t.moves;
  const month = new Date().getMonth();

  const night = async () => {
    setBusy(true);
    await advanceNight();
    await refresh();
    setBusy(false);
  };

  return (
    <Screen>
      <Title>{me.crew.name.toUpperCase()}</Title>

      <Panel color={C.sky} style={{ alignItems: 'center', gap: 4 }}>
        <Sprite name={MONTH_CARD[month]!} size={150} />
        <H color={C.ink}>This month: {MONTH_EVENT[month]}</H>
        <P color={C.ink}>Ship art coming soon. Your crew sails at midnight.</P>
      </Panel>

      <Row gap={10}>
        <Stat label="MOVES LEFT" value={m.remaining} icon={<Sprite name="boots" size={22} />} />
        {TRACKING ? (<>
        <Stat label="STEPS" value={t.steps.toLocaleString()} color={C.cloud} icon={<Sprite name="fx_footsteps" size={20} />} />
        <Stat label="CALM DAYS" value={t.streak.calmDays} color={C.cloud} icon={<Sprite name="t_campfire" size={22} />} />
        <Stat label="SHIELDS" value={t.streak.shields} color={C.cloud} icon={<Sprite name="shield" size={22} />} />
        </>) : null}
      </Row>

      <ShipwrightPanel />

      <Panel>
        <H>Today&apos;s Moves</H>
        <View style={s.math}>
          <MathCell n={m.base} label="free" />
          <Text style={s.op}>+</Text>
          {TRACKING ? (<>
          <MathCell n={m.fromSteps} label="steps" />
          <Text style={s.op}>+</Text>
          </>) : null}
          <MathCell n={m.fromActivities} label="quests" />
          {TRACKING ? (<>
          <Text style={s.op}>×</Text>
          <MathCell n={m.multiplier} label="streak" />
          </>) : null}
          <Text style={s.op}>=</Text>
          <MathCell n={m.total} label="moves" hot />
        </View>
        <P dim>{m.spent} spent today</P>
        <Row>
          <Btn small label="Explore island" icon={<Sprite name="map" size={22} />} onPress={() => router.navigate('/island')} />
          <Btn small label="Log a quest" icon={<Sprite name="journal" size={22} />} color={C.sky} onPress={() => router.navigate('/quests')} />
        </Row>
      </Panel>

      <Panel>
        <H>Crew stores</H>
        <Row gap={14}>
          {Object.entries(me.crew.stores).map(([k, v]) => {
            const sp = ITEM_SPRITE[k];
            return (
              <Row key={k} gap={4}>
                {sp ? <Sprite name={sp} size={28} /> : null}
                <P>
                  {k} {v}
                </P>
              </Row>
            );
          })}
          {Object.keys(me.crew.stores).length === 0 ? <P dim>Empty. Log quests and loot islands to fill the hold.</P> : null}
        </Row>
      </Panel>

      <Panel>
        <H>Crew</H>
        {(roster?.members ?? []).map((mm) => (
          <Row key={mm.id} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <Row gap={10} style={{ flexWrap: 'nowrap' }}>
              <View style={[s.avatar, mm.id === me.user.id && { borderColor: C.orange }]}>
                <Sprite name={avatarFor(mm.id)} size={44} />
              </View>
              <P>{mm.name}</P>
            </Row>
            <P dim>
              ⭐ {mm.legend} · 🔥 {mm.calmDays}
            </P>
          </Row>
        ))}
        <View style={s.invite}>
          <P>Invite friends with code</P>
          <Text style={s.code}>{me.crew.inviteCode}</Text>
        </View>
      </Panel>

      <Panel color={C.deep}>
        <H>Demo controls</H>
        <P dim>Skips to midnight: new items spawn, maybe a storm. If the island is conquered, the ship sails on.</P>
        <Btn label="Advance Night" icon={<Sprite name="q_sleep" size={24} />} color={C.peri} onPress={night} busy={busy} />
      </Panel>
    </Screen>
  );
}

function MathCell({ n, label, hot }: { n: number; label: string; hot?: boolean }) {
  return (
    <View style={[s.cell, hot && { backgroundColor: C.orange }]}>
      <Text style={s.cellN}>{n}</Text>
      <Text style={s.cellL}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  math: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  op: { fontFamily: F.ui, fontSize: 20, color: C.ink },
  cell: { borderWidth: 2, borderColor: C.ink, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignItems: 'center', backgroundColor: C.white },
  cellN: { fontFamily: F.ui, fontSize: 18, color: C.ink },
  cellL: { fontFamily: F.bodyBold, fontSize: 10, color: C.dimDark },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: C.ink, backgroundColor: C.navy, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  invite: { borderTopWidth: 2, borderColor: C.ink, paddingTop: 8, alignItems: 'center' },
  code: { fontFamily: F.title, fontSize: 40, letterSpacing: 6, color: C.navy },
});
