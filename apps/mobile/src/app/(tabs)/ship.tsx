/** Home: the crew's ship. Today's Moves at a glance, crew roster, stores, and demo controls. */
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Btn, C, F, H, P, Panel, Row, Screen, Stat, Tag, Title } from '@/components/kit';
import { avatarFor, ITEM_SPRITE, MONTH_CARD, Sprite } from '@/components/sprites';
import { ShipwrightPanel } from '@/features/ship/ShipwrightPanel';
import { api } from '@/lib/api';
import type { CrewRoster } from '@/lib/types';
import { useIsland } from '@/state/island';
import { useSession } from '@/state/session';
import { Float } from '@/ui/motion';

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
      <P dim>ABOARD YOUR SHIP</P>
      <Title>{me.crew.name}</Title>

      <Panel color={C.deep} style={{ alignItems: 'center', gap: 8, paddingVertical: 22 }}>
        <Float amplitude={5} duration={4200} tilt={2}><Sprite name={MONTH_CARD[month]!} size={140} /></Float>
        <H>The next shore awaits</H>
        <P dim>{MONTH_EVENT[month]} · Your crew sails at midnight.</P>
      </Panel>

      <Row gap={10}>
        <Stat label="MOVES LEFT" value={m.remaining} icon={<Sprite name="boots" size={22} />} />
        <Stat label="STEPS" value={t.steps.toLocaleString()} color={C.cloud} icon={<Sprite name="fx_footsteps" size={20} />} />
        <Stat label="CALM DAYS" value={t.streak.calmDays} color={C.cloud} icon={<Sprite name="t_campfire" size={22} />} />
        <Stat label="SHIELDS" value={t.streak.shields} color={C.cloud} icon={<Sprite name="shield" size={22} />} />
      </Row>

      <ShipwrightPanel />

      <Panel>
        <H>Today&apos;s Moves</H>
        <P dim>{m.base} free + {m.fromSteps} steps + {m.fromActivities} quests</P>
        <Row>
          <Tag label={`×${m.multiplier} STREAK`} color={C.gold} />
          <P>{m.total} earned · {m.spent} spent</P>
        </Row>
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
            <Row gap={10} style={{ flexWrap: 'nowrap', flex: 1 }}>
              <View style={[s.avatar, mm.id === me.user.id && { borderColor: C.orange }]}>
                <Sprite name={avatarFor(mm.id)} size={44} />
              </View>
              <View style={{ flex: 1 }}><P>{mm.name}</P></View>
            </Row>
            <View style={{ alignItems: 'flex-end' }}>
              <P dim>{mm.legend} legend</P>
              <P dim>{mm.calmDays} calm days</P>
            </View>
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

const s = StyleSheet.create({
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#D8D3C8', backgroundColor: C.navy, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  invite: { borderTopWidth: 1, borderColor: '#D8D3C8', paddingTop: 16, marginTop: 8, alignItems: 'center', gap: 8 },
  code: { fontFamily: F.uiBold, fontSize: 28, letterSpacing: 6, color: C.navy },
});
