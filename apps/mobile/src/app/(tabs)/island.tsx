/** The island: tap a highlighted hex to walk there (costs Moves). Reach the center to fight. */
import { useFocusEffect, router } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Bar, Btn, C, H, P, Panel, Row, Screen, Stat, Title } from '@/components/kit';
import { HexBoard } from '@/features/island/HexBoard';
import { ITEM_GLYPH, useIsland } from '@/state/island';

const THEME_NAME: Record<string, string> = {
  tropical: 'Palmshade Isle',
  spooky: 'Gloomhollow',
  winter: 'Frostmere',
  volcanic: 'Cinderpeak',
};

export default function IslandScreen() {
  const { view, busy, error, feed, load, move } = useIsland();

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!view) {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          {error ? <P>{error}</P> : <ActivityIndicator color={C.ink} size="large" />}
          {error ? <Btn label="Retry" onPress={load} /> : null}
        </View>
      </Screen>
    );
  }

  const ex = view.explorer;
  const bag = Object.entries(ex.inventory).filter(([, n]) => (n ?? 0) > 0);
  const ko = ex.hp <= 0;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Title size={28}>{THEME_NAME[view.island.theme] ?? 'Unknown Isle'}</Title>
          <P dim>Island #{view.island.index + 1} · {view.island.theme}</P>
        </View>
        <Stat label="MOVES" value={view.movesRemaining} />
      </Row>

      <Bar value={ex.hp} max={ex.maxHp} color={ko ? C.red : C.jungle} label={`HP ${ex.hp}/${ex.maxHp}`} />

      <HexBoard view={view} onTap={move} disabled={busy || ko} />

      {view.island.conquered ? (
        <Panel color={C.jungle}>
          <H>🚩 Island conquered!</H>
          <P>Your crew beat {view.boss.name}. Tonight the ship sails to the next island (or tap Advance Night on the Ship tab).</P>
        </Panel>
      ) : view.canFight ? (
        <Panel color={C.red}>
          <H>👹 {view.boss.name} {view.boss.title}</H>
          <Bar value={view.boss.hp} max={view.boss.maxHp} color={C.sun} label={`Boss HP ${view.boss.hp}/${view.boss.maxHp}`} />
          <Btn label="FIGHT!" onPress={() => router.push('/fight')} />
        </Panel>
      ) : (
        <Panel>
          <P>
            {ko
              ? '🌊 You were washed overboard. You will be back at full strength tomorrow.'
              : view.movesRemaining === 0
                ? 'Out of Moves. Walk, log an activity, or stay off short-form video to earn more.'
                : 'Tap a highlighted hex to move. The number is its Move cost. The guardian waits at the center.'}
          </P>
          <Bar value={view.boss.hp} max={view.boss.maxHp} color={C.red} label={`${view.boss.name} HP ${view.boss.hp}/${view.boss.maxHp}`} />
        </Panel>
      )}

      {bag.length ? (
        <Panel>
          <H>Bag</H>
          <Row>
            {bag.map(([item, n]) => (
              <P key={item}>
                {ITEM_GLYPH[item] ?? '✨'} {item} ×{n}
              </P>
            ))}
          </Row>
        </Panel>
      ) : null}

      {error ? <P dim>⚠️ {error}</P> : null}
      {feed.slice(0, 6).map((line, i) => (
        <P key={i} dim={i > 0}>
          {line}
        </P>
      ))}
    </Screen>
  );
}
