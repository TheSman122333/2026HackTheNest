/** The island: tap a highlighted hex to walk there (costs Moves). Reach the center to fight. */
import { useFocusEffect, router } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Bar, Btn, C, H, P, Panel, Row, Screen, Stat, Tag, Title } from '@/components/kit';
import { BOSS_SPRITE, ITEM_SPRITE, Sprite, THEME_CARD } from '@/components/sprites';
import { HexBoard } from '@/features/island/HexBoard';
import { NarratorPanel } from '@/features/narrator/NarratorPanel';
import { ITEM_GLYPH, useIsland } from '@/state/island';
import { useSession } from '@/state/session';

export const THEME_NAME: Record<string, string> = {
  tropical: 'Palmshade Isle',
  spooky: 'Gloomhollow',
  winter: 'Frostmere',
  volcanic: 'Cinderpeak',
};

export default function IslandScreen() {
  const { view, busy, error, feed, load, move } = useIsland();
  const meId = useSession((s) => s.me?.user.id ?? '');

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!view) {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          {error ? <P>{error}</P> : <ActivityIndicator color={C.cloud} size="large" />}
          {error ? <Btn label="Retry" onPress={load} /> : null}
        </View>
      </Screen>
    );
  }

  const ex = view.explorer;
  const bag = Object.entries(ex.inventory).filter(([, n]) => (n ?? 0) > 0);
  const ko = ex.hp <= 0;
  const theme = view.island.theme;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Row gap={10} style={{ flexShrink: 1, flexWrap: 'nowrap' }}>
          <Sprite name={THEME_CARD[theme] ?? 'm_jul'} size={60} />
          <View style={{ flexShrink: 1 }}>
            <Title size={28}>{THEME_NAME[theme] ?? 'Unknown Isle'}</Title>
            <P dim>
              Island #{view.island.index + 1} · {theme}
            </P>
          </View>
        </Row>
        <Stat label="MOVES" value={view.movesRemaining} icon={<Sprite name="boots" size={22} />} />
      </Row>

      <Bar value={ex.hp} max={ex.maxHp} color={ko ? C.red : C.green} label={`HP ${ex.hp}/${ex.maxHp}`} />

      <HexBoard view={view} meId={meId} onTap={move} disabled={busy || ko} />

      {view.island.conquered ? (
        <Panel color={C.green}>
          <Row>
            <Sprite name="t_flag" size={36} />
            <H>Island conquered!</H>
          </Row>
          <P>Your crew beat {view.boss.name}. Tonight the ship sails on (or tap Advance Night on the Ship tab).</P>
        </Panel>
      ) : view.canFight ? (
        <Panel color={C.red}>
          <Row style={{ flexWrap: 'nowrap' }}>
            <Sprite name={BOSS_SPRITE[view.boss.key] ?? 'b_octopus'} size={72} />
            <View style={{ flex: 1, gap: 4 }}>
              <H>
                {view.boss.name} {view.boss.title}
              </H>
              <Bar value={view.boss.hp} max={view.boss.maxHp} color={C.gold} label={`HP ${view.boss.hp}/${view.boss.maxHp}`} />
            </View>
          </Row>
          <Btn label="FIGHT!" color={C.gold} icon={<Sprite name="cutlass" size={24} />} onPress={() => router.push('/fight')} />
        </Panel>
      ) : (
        <Panel>
          <P>
            {ko
              ? '🌊 You were washed overboard. You will be back at full strength tomorrow.'
              : view.movesRemaining === 0
                ? 'Out of Moves. Walk, log an activity, or stay off short-form video to earn more.'
                : 'Tap an orange-ringed hex to move. The number is its Move cost. The guardian waits at the center.'}
          </P>
          <Bar value={view.boss.hp} max={view.boss.maxHp} color={C.red} label={`${view.boss.name} HP ${view.boss.hp}/${view.boss.maxHp}`} />
        </Panel>
      )}

      <NarratorPanel />

      {bag.length ? (
        <Panel>
          <H>Bag</H>
          <Row gap={12}>
            {bag.map(([item, n]) => {
              const sp = ITEM_SPRITE[item];
              return (
                <Row key={item} gap={4}>
                  {sp ? <Sprite name={sp} size={30} /> : <P>{ITEM_GLYPH[item] ?? '✨'}</P>}
                  <P>
                    {item} ×{n}
                  </P>
                </Row>
              );
            })}
          </Row>
        </Panel>
      ) : null}

      {error ? <Tag label={`⚠️ ${error}`} color={C.red} /> : null}
      {feed.slice(0, 6).map((line, i) => (
        <P key={i} dim={i > 0}>
          {line}
        </P>
      ))}
    </Screen>
  );
}
