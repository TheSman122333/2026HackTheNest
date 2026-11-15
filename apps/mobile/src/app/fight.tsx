/** Boss fight. Each action costs 1 Move; the boss hits back. Boss HP is shared by the whole crew. */
import type { FightAction } from '@last-voyage/game';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Bar, Btn, C, F, H, P, Panel, Row, Screen, Stat, Tag, Title } from '@/components/kit';
import { BOSS_SPRITE, Sprite } from '@/components/sprites';
import { useIsland } from '@/state/island';

export default function Fight() {
  const { view, busy, error, feed, fight } = useIsland();
  if (!view) return null;
  const ex = view.explorer;
  const boss = view.boss;
  const over = boss.defeated || view.island.conquered;
  const ko = ex.hp <= 0;
  const noMoves = view.movesRemaining <= 0;
  const cannons = ex.inventory.cannon ?? 0;
  const tonics = ex.inventory.tonic ?? 0;
  const enraged = !over && boss.hp / boss.maxHp < 0.3;

  const doAct = async (a: FightAction) => {
    Haptics.impactAsync(a === 'cannon' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const r = await fight(a);
    if (r?.events.some((e) => e.type === 'boss_defeated')) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Btn small label="← Island" onPress={() => router.back()} color={C.cloud} />
        <Stat label="MOVES" value={view.movesRemaining} icon={<Sprite name="boots" size={22} />} />
      </Row>

      <Panel color={enraged ? C.red : C.indigo} style={{ alignItems: 'center' }}>
        {over ? <Sprite name="t_flag" size={140} /> : <Sprite name={BOSS_SPRITE[boss.key] ?? 'b_octopus'} size={200} />}
        <Title size={30}>{boss.name}</Title>
        <P dim>{boss.title}</P>
        {enraged ? <Tag label="🔥 ENRAGED · +50% damage" color={C.orange} /> : null}
        <View style={{ alignSelf: 'stretch' }}>
          <Bar value={boss.hp} max={boss.maxHp} color={C.red} label={`HP ${boss.hp}/${boss.maxHp} · armor ${boss.armor}`} />
        </View>
      </Panel>

      <Panel>
        <Bar value={ex.hp} max={ex.maxHp} color={ko ? C.red : C.jungle} label={`You: HP ${ex.hp}/${ex.maxHp}${ex.inventory.cutlass ? ' · cutlass equipped (+3)' : ''}`} />
      </Panel>

      {over ? (
        <Panel color={C.green}>
          <Text style={{ fontFamily: F.title, fontSize: 44, color: C.ink, textAlign: 'center' }}>VICTORY!</Text>
          <P center>The island belongs to your crew. Legend earned!</P>
          <Btn label="Back to the island" onPress={() => router.back()} />
        </Panel>
      ) : ko ? (
        <Panel color={C.sky}>
          <Row><Sprite name="fx_wave" size={36} /><H>Washed overboard!</H></Row>
          <P>Rest up. You&apos;ll be back at full strength tomorrow, and the boss stays hurt.</P>
        </Panel>
      ) : (
        <View style={{ gap: 10 }}>
          <Row gap={10}>
            <View style={{ flex: 1 }}>
              <Btn label="Strike" icon={<Sprite name="cutlass" size={28} />} onPress={() => doAct('strike')} disabled={busy || noMoves} />
            </View>
            <View style={{ flex: 1 }}>
              <Btn label={`Cannon ×${cannons}`} icon={<Sprite name="cannon" size={28} />} color={C.red} onPress={() => doAct('cannon')} disabled={busy || noMoves || !cannons} />
            </View>
          </Row>
          <Row gap={10}>
            <View style={{ flex: 1 }}>
              <Btn label={`Tonic ×${tonics}`} icon={<Sprite name="tonic" size={28} />} color={C.green} onPress={() => doAct('tonic')} disabled={busy || noMoves || !tonics} />
            </View>
            <View style={{ flex: 1 }}>
              <Btn label="Brace" icon={<Sprite name="shield" size={28} />} color={C.sky} onPress={() => doAct('brace')} disabled={busy || noMoves} />
            </View>
          </Row>
          {noMoves ? <P center dim>Out of Moves. Go live a little and come back.</P> : <P center dim>Each action costs 1 Move</P>}
        </View>
      )}

      {error ? <P dim>⚠️ {error}</P> : null}
      {feed.slice(0, 8).map((l, i) => (
        <P key={i} dim={i > 1}>
          {l}
        </P>
      ))}
    </Screen>
  );
}
