/** Home: the crew's ship. Today's Moves at a glance, crew roster, stores, and demo controls. */
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Btn, C, F, H, P, Panel, Row, Screen, Stat, Title } from '@/components/kit';
import { api } from '@/lib/api';
import type { CrewRoster } from '@/lib/types';
import { useIsland } from '@/state/island';
import { useSession } from '@/state/session';

const STORE_GLYPH: Record<string, string> = { supplies: '📦', timber: '🪵', iron: '⛓️', spice: '🌶️', shard: '💎' };

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

  const night = async () => {
    setBusy(true);
    await advanceNight();
    await refresh();
    setBusy(false);
  };

  return (
    <Screen>
      <Title>{me.crew.name.toUpperCase()}</Title>

      <Panel color={C.seaLight} style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 88 }}>⛵</Text>
        <P dim>(ship art coming soon)</P>
      </Panel>

      <Row gap={10}>
        <Stat label="MOVES LEFT" value={m.remaining} />
        <Stat label="STEPS" value={t.steps.toLocaleString()} color={C.white} />
        <Stat label="CALM DAYS" value={`🔥${t.streak.calmDays}`} color={C.white} />
        <Stat label="SHIELDS" value={`🛡️${t.streak.shields}`} color={C.white} />
      </Row>

      <Panel>
        <H>Today&apos;s Moves</H>
        <P>
          {m.base} free + {m.fromSteps} from steps + {m.fromActivities} from activities = {m.base + m.fromSteps + m.fromActivities}
        </P>
        <P>
          × {m.multiplier} streak bonus = <Text style={{ fontFamily: F.ui }}>{m.total} Moves</Text> ({m.spent} spent)
        </P>
        <Row>
          <Btn small label="🏝️ Explore island" onPress={() => router.navigate('/island')} />
          <Btn small label="📜 Log activity" color={C.white} onPress={() => router.navigate('/quests')} />
        </Row>
      </Panel>

      <Panel>
        <H>Crew stores</H>
        <Row gap={14}>
          {Object.entries(me.crew.stores).map(([k, v]) => (
            <P key={k}>
              {STORE_GLYPH[k] ?? '•'} {k} {v}
            </P>
          ))}
        </Row>
      </Panel>

      <Panel>
        <H>Crew</H>
        {(roster?.members ?? []).map((mm) => (
          <Row key={mm.id} style={{ justifyContent: 'space-between' }}>
            <P>
              {mm.id === me.user.id ? '★ ' : ''}
              {mm.name}
            </P>
            <P dim>
              ⭐ {mm.legend} Legend · 🔥 {mm.calmDays}
            </P>
          </Row>
        ))}
        <View style={{ borderTopWidth: 2, borderColor: C.ink, paddingTop: 8 }}>
          <P>Invite friends with code:</P>
          <Text style={{ fontFamily: F.title, fontSize: 36, letterSpacing: 4, color: C.ink }}>{me.crew.inviteCode}</Text>
        </View>
      </Panel>

      <Panel color="#EFE7D6">
        <H>Demo controls</H>
        <P dim>Skips to midnight: new items spawn, maybe a storm; if the island is conquered, the ship sails on.</P>
        <Btn label="🌙 Advance Night" color={C.night} onPress={night} busy={busy} />
      </Panel>
    </Screen>
  );
}
