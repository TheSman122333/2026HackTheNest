import { LocalizedText as Text } from '@/features/language/LocalizedText';
/** The island: tap a highlighted hex to walk there (costs Moves). Reach the center to fight. */
import { useFocusEffect, router } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Bar, Btn, C, F, H, P, Panel, Row, Screen, Stat, Tag, Title } from '@/components/kit';
import { BOSS_SPRITE, ITEM_SPRITE, Sprite } from '@/components/sprites';
import { HexBoard } from '@/features/island/HexBoard';
import { useNarrator } from '@/features/narrator/useNarrator';
import { useIsland } from '@/state/island';
import { useSession } from '@/state/session';
import { Float } from '@/ui/motion';
import { useT } from '@/features/language/i18n';

export const THEME_NAME: Record<string, string> = {
  tropical: 'Palmshade Isle',
  spooky: 'Gloomhollow',
  winter: 'Frostmere',
  volcanic: 'Cinderpeak',
};

export default function IslandScreen() {
  const tx = useT();
  const { view, busy, error, feed, load, move } = useIsland();
  const meId = useSession((s) => s.me?.user.id ?? '');

  useFocusEffect(
    useCallback(() => {
      load();
      void useNarrator.getState().scheduledWorldEvent();
    }, [load]),
  );

  if (!view) {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Float amplitude={5} tilt={5}><Sprite name="compass" size={72} /></Float>
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
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={s.eyebrow}>{tx('EXPEDITION {number}', { number: String(view.island.index + 1).padStart(2, '0') })}</Text>
          <Title size={30}>{THEME_NAME[theme] ?? 'Unknown Isle'}</Title>
          <Text style={s.subtitle}>{tx('{theme} waters · your crew’s frontier', { theme: tx(theme.charAt(0).toUpperCase() + theme.slice(1)) })}</Text>
        </View>
        <Stat label="MOVES" value={view.movesRemaining} icon={<Sprite name="boots" size={22} />} />
      </Row>

      <Bar value={ex.hp} max={ex.maxHp} color={ko ? C.red : C.green} label={tx('Your vitality {hp} / {max}', { hp: ex.hp, max: ex.maxHp })} />

      {view.island.conquered ? (
        <Panel color={C.deep} style={{ borderColor: C.green }}>
          <Row>
            <Float amplitude={2} tilt={3}><Sprite name="t_flag" size={36} /></Float>
            <H color={C.green}>Island conquered</H>
          </Row>
          <P dim>{tx('Your crew defeated {boss}. Your next horizon awaits at nightfall.', { boss: view.boss.name })}</P>
        </Panel>
      ) : view.canFight ? (
        <Panel color={C.deep} style={{ borderColor: C.red }}>
          <Row style={{ flexWrap: 'nowrap' }}>
            <Float amplitude={3} tilt={3}><Sprite name={BOSS_SPRITE[view.boss.key] ?? 'b_octopus'} size={64} /></Float>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[s.eyebrow, { color: C.red }]}>GUARDIAN IN REACH</Text>
              <H>{view.boss.name}</H>
              <P dim>{view.boss.title}</P>
              <Bar value={view.boss.hp} max={view.boss.maxHp} color={C.gold} label={`HP ${view.boss.hp}/${view.boss.maxHp}`} />
            </View>
          </Row>
          <Btn label="Engage guardian" color={C.gold} disabled={busy || ko || view.movesRemaining === 0} icon={<Sprite name="cutlass" size={24} />} onPress={() => router.push('/fight')} />
        </Panel>
      ) : (
        <Panel color={C.deep}>
          <Text style={s.eyebrow}>{ko ? 'REST AT THE SHORE' : view.movesRemaining === 0 ? 'RECHARGE YOUR VOYAGE' : 'CHART YOUR COURSE'}</Text>
          <P>
            {ko
              ? 'You were washed overboard. You will be back at full strength tomorrow.'
              : view.movesRemaining === 0
                ? 'Out of Moves. Walk, log an activity, or stay off short-form video to earn more.'
                : 'Follow the brass-edged tiles. Each number is its Move cost. The guardian waits at the center.'}
          </P>
          <Bar value={view.boss.hp} max={view.boss.maxHp} color={C.red} label={`${view.boss.name}  ${view.boss.hp} / ${view.boss.maxHp}`} />
        </Panel>
      )}

      <HexBoard view={view} meId={meId} onTap={(to) => { void move(to); }} disabled={busy || ko} />

      {bag.length ? (
        <Panel>
          <Row style={{ justifyContent: 'space-between' }}><H>Field inventory</H><Tag label={tx('{count} ITEMS', { count: bag.length })} color={C.deep} /></Row>
          <Row gap={12}>
            {bag.map(([item, n]) => {
              const sp = ITEM_SPRITE[item];
              return (
                <Row key={item} gap={6} style={s.inventoryItem}>
                  <Sprite name={sp ?? 'chest'} size={28} />
                  <Text style={s.itemLabel}>{tx(item.charAt(0).toUpperCase() + item.slice(1))} <Text style={{ color: C.dimDark }}>×{n}</Text></Text>
                </Row>
              );
            })}
          </Row>
        </Panel>
      ) : null}

      {error ? <Panel color={C.deep} style={{ borderColor: C.red }}><P color={C.red}>{error}</P></Panel> : null}
      {feed.length ? <Panel color={C.deep}>
        <Text style={s.eyebrow}>FIELD NOTES</Text>
        {feed.slice(0, 4).map((line, i) => <P key={i} dim={i > 0}>{line}</P>)}
      </Panel> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  eyebrow: { fontFamily: F.bodyBold, color: C.gold, fontSize: 10, letterSpacing: 2 },
  subtitle: { fontFamily: F.body, color: C.dimLight, fontSize: 12, textTransform: 'capitalize' },
  inventoryItem: { backgroundColor: '#E9E4D9', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 9 },
  itemLabel: { fontFamily: F.bodyBold, fontSize: 12, color: C.ink, textTransform: 'capitalize' },
});
