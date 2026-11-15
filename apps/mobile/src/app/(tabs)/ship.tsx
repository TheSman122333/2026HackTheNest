/** Home: the crew's ship. Today's Moves at a glance, crew roster, stores, and demo controls. */
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { Btn, C, F, H, P, Panel, Row, Screen, Stat, Tag, Title } from '@/components/kit';
import { ITEM_SPRITE, Sprite } from '@/components/sprites';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ShipwrightPanel } from '@/features/ship/ShipwrightPanel';
import { api } from '@/lib/api';
import { TRACKING } from '@/lib/platform';
import type { CrewRoster } from '@/lib/types';
import { useIsland } from '@/state/island';
import { useSession } from '@/state/session';
import { ShipScene } from '@/ui/ShipScene';

export default function Ship() {
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const advanceNight = useIsland((s) => s.advanceNight);
  const [roster, setRoster] = useState<CrewRoster | null>(null);
  const [busy, setBusy] = useState(false);
  const crewId = me?.crew?.id;

  useFocusEffect(
    useCallback(() => {
      if (!crewId) return;
      let active = true;
      const load = () => {
        if (AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
        refresh();
        api<CrewRoster>('GET', '/crew').then((next) => { if (active) setRoster(next); }).catch(() => {});
      };
      load();
      const timer = setInterval(load, 30_000);
      const visibility = AppState.addEventListener('change', (state) => { if (state === 'active') load(); });
      return () => { active = false; clearInterval(timer); visibility.remove(); };
    }, [refresh, crewId]),
  );

  if (!me?.crew) return null;
  const t = me.today;
  const m = t.moves;
  const crewSailing = roster?.crew?.id === me.crew.id ? roster.sailing : null;
  const sailing = crewSailing ?? {
    totalMoves: m.total, averageMoves: m.total, activities: t.activities.length, steps: t.steps,
    activeMembers: t.steps > 0 || t.activities.length > 0 ? 1 : 0, members: 1,
  };

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

      <ShipScene sailing={sailing} personal={!crewSailing} onBoard={() => router.push('/deck')} />
      <P dim>Walk, finish quests, and live a little. Every sailor helps fill these sails.</P>

      <Row gap={10}>
        <Stat label="MOVES LEFT" value={m.remaining} icon={<Sprite name="boots" size={22} />} />
        {TRACKING ? (<>
        <Stat label="STEPS" value={t.steps.toLocaleString()} color={C.cloud} icon={<Sprite name="fx_footsteps" size={20} />} />
        <Stat label="CALM DAYS" value={t.streak.calmDays} color={C.cloud} icon={<Sprite name="t_campfire" size={22} />} />
        <Stat label="SHIELDS" value={t.streak.shields} color={C.cloud} icon={<Sprite name="shield" size={22} />} />
        </>) : null}
      </Row>

      <ShipwrightPanel crewAverageMoves={crewSailing?.averageMoves} />

      <Panel>
        <H>Today&apos;s Moves</H>
        <P dim>{m.base} free + {m.fromSteps} steps + {m.fromActivities} quests</P>
        <Row>
          {TRACKING ? <Tag label={`×${m.multiplier} STREAK`} color={C.gold} /> : null}
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
                <PlayerAvatar userId={mm.id} avatarId={mm.avatarId} size={44} />
              </View>
              <View style={{ flex: 1 }}><P>{mm.name}</P></View>
            </Row>
            <View style={{ alignItems: 'flex-end' }}>
              <P dim>{mm.legend} honor</P>
              <P dim>{mm.calmDays} calm days</P>
            </View>
          </Row>
        ))}
        <View style={s.invite}>
          <P>Invite friends with code</P>
          <Text style={s.code}>{me.crew.inviteCode}</Text>
          <Btn label="Invite with QR code" color={C.sky} onPress={() => router.push('/invite')} />
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
