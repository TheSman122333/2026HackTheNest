/** Server-resolved combat, with a short visual beat for each action and counterattack. */
import type { FightAction } from '@last-voyage/game';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { Bar, Btn, C, F, H, P, Panel, Row, Screen, Stat, Tag, Title } from '@/components/kit';
import { BOSS_SPRITE, Sprite } from '@/components/sprites';
import type { FightResponse } from '@/lib/types';
import { useIsland } from '@/state/island';
import { Float, useMotionEnabled } from '@/ui/motion';

const ACTION_NAME: Record<FightAction, string> = {
  strike: 'Cutlass strike', cannon: 'Cannon fire', tonic: 'Restoring tonic', brace: 'Hold your ground',
};

type Feedback = { boss: string | null; player: string | null; summary: string };

function feedbackFrom(result: FightResponse): Feedback {
  const hit = result.events.find((event) => event.type === 'hit');
  const heal = result.events.find((event) => event.type === 'heal');
  const counter = result.events.find((event) => event.type === 'boss_hit');
  const braced = result.events.some((event) => event.type === 'brace');
  return {
    boss: hit ? `${hit.crit ? 'CRIT ' : ''}−${hit.damage}` : null,
    player: counter ? `−${counter.damage}` : null,
    summary: [
      hit ? `${hit.crit ? 'Critical hit. ' : ''}${hit.damage} damage dealt.` : null,
      heal ? `${heal.amount} HP restored.` : null,
      braced ? 'Guard raised.' : null,
      counter ? `${counter.damage} damage taken${counter.braced ? ' behind your guard' : ''}.` : null,
      result.events.some((event) => event.type === 'boss_defeated') ? 'Guardian defeated.' : null,
    ].filter(Boolean).join(' '),
  };
}

export default function Fight() {
  const { view, busy, error, feed, fight } = useIsland();
  const motion = useMotionEnabled();
  const motionRef = useRef(motion);
  const [action, setAction] = useState<FightAction | null>(null);
  const [phase, setPhase] = useState<'ready' | 'waiting' | 'action' | 'counter'>('ready');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [healAmount, setHealAmount] = useState<number | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const [progress] = useState(() => new Animated.Value(0));
  const [counter] = useState(() => new Animated.Value(0));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; running.current?.stop(); };
  }, []);

  useEffect(() => {
    motionRef.current = motion;
    if (!motion) running.current?.stop();
  }, [motion]);

  const play = (value: Animated.Value, duration: number) =>
    new Promise<void>((resolve) => {
      if (!motionRef.current || !mounted.current) { resolve(); return; }
      value.setValue(0);
      const animation = Animated.timing(value, {
        toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false,
      });
      running.current = animation;
      animation.start(() => resolve());
    });

  if (!view) {
    return <Screen><Title>Back to the chart</Title><P>The guardian is waiting on the island.</P><Btn label="Return to island" onPress={() => router.replace('/(tabs)/island')} /></Screen>;
  }
  const ex = view.explorer;
  const boss = view.boss;
  const over = boss.defeated || view.island.conquered;
  const ko = ex.hp <= 0;
  const noMoves = view.movesRemaining <= 0;
  const cannons = ex.inventory.cannon ?? 0;
  const tonics = ex.inventory.tonic ?? 0;
  const enraged = !over && boss.hp / boss.maxHp < (view.island.theme === 'volcanic' ? 0.25 : 0.3);
  const unavailable = busy || phase !== 'ready' || noMoves || ko || over;

  const doAct = async (nextAction: FightAction) => {
    // The ref closes the gap before React renders disabled buttons on a fast double tap.
    if (locked.current || unavailable) return;
    locked.current = true;
    setAction(nextAction);
    setPhase('waiting');
    setFeedback(null);
    setHealAmount(null);
    progress.setValue(0);
    counter.setValue(0);
    Haptics.impactAsync(nextAction === 'cannon' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const result = await fight(nextAction);
      if (!mounted.current || !result) return;
      setFeedback(feedbackFrom(result));
      const heal = result.events.find((event) => event.type === 'heal');
      setHealAmount(heal?.amount ?? null);
      setPhase('action');
      await play(progress, nextAction === 'cannon' ? 780 : 650);
      if (!mounted.current) return;
      if (result.events.some((event) => event.type === 'boss_hit')) {
        setPhase('counter');
        await play(counter, 620);
      }
      if (result.events.some((event) => event.type === 'boss_defeated')) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } finally {
      locked.current = false;
      if (mounted.current) setPhase('ready');
    }
  };

  const actionOpacity = progress.interpolate({ inputRange: [0, 0.12, 0.65, 1], outputRange: [0, 1, 0.9, 0] });
  const counterOpacity = counter.interpolate({ inputRange: [0, 0.12, 0.65, 1], outputRange: [0, 1, 1, 0] });
  const attack = action === 'strike' || action === 'cannon';
  const bossRecoil = progress.interpolate({ inputRange: [0, 0.2, 0.35, 0.5, 0.7, 1], outputRange: [0, 0, 9, -7, 3, 0] });
  const playerRecoil = counter.interpolate({ inputRange: [0, 0.15, 0.3, 0.5, 0.7, 1], outputRange: [0, 6, -6, 4, -2, 0] });

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Btn small label="Back to island" onPress={() => router.back()} color={C.deep} />
        <Stat label="MOVES" value={view.movesRemaining} icon={<Sprite name="boots" size={20} />} />
      </Row>

      <View style={s.heading}>
        <Text style={s.eyebrow}>THE ISLAND GUARDIAN</Text>
        <Title size={34}>{boss.name}</Title>
        <P dim>{boss.title}</P>
      </View>

      <Panel color={C.deep} style={{ padding: 0, overflow: 'hidden' }}>
        <View style={s.arena}>
          <View pointerEvents="none" style={s.orbit} />
          <View pointerEvents="none" style={s.horizon} />
          <Animated.View style={[s.boss, { transform: [
            { translateX: attack && phase === 'action' ? bossRecoil : 0 },
            { translateY: phase === 'counter' ? counter.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 12, 0] }) : 0 },
          ] }]}>
            <Float amplitude={5} tilt={2} duration={2700}>
              <Sprite name={over && phase === 'ready' ? 't_flag' : BOSS_SPRITE[boss.key] ?? 'b_octopus'} size={176} />
            </Float>
          </Animated.View>

          <Animated.View style={[s.player, { transform: [
            { translateX: phase === 'counter' ? playerRecoil : action === 'strike' && phase === 'action' ? progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 38, 0] }) : 0 },
          ] }]}>
            <Float amplitude={2} tilt={-3} duration={2300}>
              <View style={s.crest}><Sprite name="t_anchor" size={35} /></View>
            </Float>
            <Text style={s.playerLabel}>YOUR PIRATE</Text>
          </Animated.View>

          {phase === 'waiting' ? (
            <View style={s.preparing}>
              <Float amplitude={4} tilt={7} duration={700}>
                <Sprite name={action === 'strike' ? 'cutlass' : action === 'cannon' ? 'cannon' : action === 'tonic' ? 'tonic' : 'shield'} size={40} />
              </Float>
            </View>
          ) : null}

          {motion && phase === 'action' && action === 'strike' ? (
            <Animated.View pointerEvents="none" style={[s.slash, { opacity: actionOpacity, transform: [
              { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-55deg', '70deg'] }) },
              { scale: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.5, 1.15, 1] }) },
            ] }]}>
              <View style={s.slashArc} /><Sprite name="cutlass" size={100} />
            </Animated.View>
          ) : null}
          {motion && phase === 'action' && action === 'cannon' ? (
            <>
              <Animated.View pointerEvents="none" style={[s.projectile, { opacity: actionOpacity, transform: [
                { translateX: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 100, 100] }) },
                { translateY: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, -120, -120] }) },
                { scale: progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.5, 1, 0] }) },
              ] }]}><View style={s.cannonball} /></Animated.View>
              <Animated.View pointerEvents="none" style={[s.blast, { opacity: progress.interpolate({ inputRange: [0, 0.25, 0.4, 1], outputRange: [0, 0, 1, 0] }), transform: [{ scale: progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.2, 0.5, 1.5] }) }] }]}>
                <Sprite name="fx_spark" size={140} />
              </Animated.View>
            </>
          ) : null}
          {motion && phase === 'action' && (action === 'tonic' || action === 'brace') ? (
            <Animated.View pointerEvents="none" style={[s.guard, { opacity: actionOpacity, transform: [{ scale: progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.5, 1.1, 1.3] }) }] }]}>
              <Sprite name={action === 'tonic' ? 'fx_heal' : 'shield'} size={88} />
            </Animated.View>
          ) : null}
          {motion && phase === 'counter' ? (
            <Animated.View pointerEvents="none" style={[s.guard, { opacity: counterOpacity }]}>
              <Sprite name={action === 'brace' ? 'shield' : 'fx_claw'} size={88} />
            </Animated.View>
          ) : null}

          {motion && phase === 'action' && feedback?.boss ? (
            <Animated.Text pointerEvents="none" style={[s.damage, s.bossDamage, { opacity: actionOpacity, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, -32] }) }] }]}>{feedback.boss}</Animated.Text>
          ) : null}
          {motion && phase === 'action' && healAmount !== null ? (
            <Animated.Text pointerEvents="none" style={[s.damage, s.playerDamage, { color: C.green, opacity: actionOpacity, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) }] }]}>{`+${healAmount}`}</Animated.Text>
          ) : null}
          {motion && phase === 'counter' && feedback?.player ? (
            <Animated.Text pointerEvents="none" style={[s.damage, s.playerDamage, { color: C.red, opacity: counterOpacity, transform: [{ translateY: counter.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) }] }]}>{feedback.player}</Animated.Text>
          ) : null}

          <View style={s.arenaCaption}>
            <Text style={s.captionTitle}>{phase === 'waiting' ? 'Ready your action' : phase === 'counter' ? 'The guardian strikes back' : phase === 'action' && action ? ACTION_NAME[action] : over ? 'The tide is yours' : 'Stand fast, sailor'}</Text>
            <Text style={s.captionDetail}>{phase === 'waiting' ? 'Awaiting the tide…' : over ? 'An island claimed together' : 'One crew. One shared battle.'}</Text>
          </View>
        </View>
        <View style={s.bossHealth}>
          {enraged ? <Tag label="ENRAGED · +50% damage" color={C.red} /> : null}
          <Bar value={boss.hp} max={boss.maxHp} color={C.red} label={`GUARDIAN  ${boss.hp} / ${boss.maxHp} HP · ${boss.armor} armor`} />
        </View>
      </Panel>

      <Panel color={C.deep}>
        <Bar value={ex.hp} max={ex.maxHp} color={ko ? C.red : C.green} label={`YOUR HEALTH  ${ex.hp} / ${ex.maxHp} HP`} />
        {ex.inventory.cutlass ? <P dim>Cutlass equipped · +3 strike damage</P> : null}
      </Panel>

      {over ? (
        <Panel>
          <Title size={34}>Victory, together.</Title>
          <P>Your crew has claimed this island. A new horizon awaits.</P>
          <Btn label="Return to the island" onPress={() => router.back()} />
        </Panel>
      ) : ko ? (
        <Panel>
          <Row><Sprite name="fx_wave" size={32} /><H>Washed overboard</H></Row>
          <P>Rest up. You&apos;ll be back at full strength tomorrow, and the boss stays hurt.</P>
        </Panel>
      ) : (
        <View style={{ gap: 10 }}>
          <Row gap={10} style={{ flexWrap: 'nowrap' }}>
            <View style={{ flex: 1 }}><Btn label="Strike" icon={<Sprite name="cutlass" size={24} />} onPress={() => doAct('strike')} disabled={unavailable} /></View>
            <View style={{ flex: 1 }}><Btn label={`Cannon · ${cannons}`} icon={<Sprite name="cannon" size={24} />} color={C.red} onPress={() => doAct('cannon')} disabled={unavailable || !cannons} /></View>
          </Row>
          <Row gap={10} style={{ flexWrap: 'nowrap' }}>
            <View style={{ flex: 1 }}><Btn label={`Tonic · ${tonics}`} icon={<Sprite name="tonic" size={24} />} color={C.green} onPress={() => doAct('tonic')} disabled={unavailable || !tonics} /></View>
            <View style={{ flex: 1 }}><Btn label="Brace" icon={<Sprite name="shield" size={24} />} color={C.indigo} onPress={() => doAct('brace')} disabled={unavailable} /></View>
          </Row>
          <P center dim>{noMoves ? 'Out of Moves. Go live a little and come back.' : '1 Move per action · the guardian counters each turn'}</P>
        </View>
      )}

      {feedback ? <Text accessibilityLiveRegion="polite" style={s.result}>{feedback.summary}</Text> : null}
      {error ? <P color={C.red}>{error}</P> : null}
      {feed.length ? <H>Battle log</H> : null}
      {feed.slice(0, 5).map((line, index) => <P key={`${index}-${line}`} dim={index > 0}>{line}</P>)}
    </Screen>
  );
}

const s = StyleSheet.create({
  heading: { gap: 3, paddingVertical: 6 },
  eyebrow: { fontFamily: F.bodyBold, color: C.gold, fontSize: 10, letterSpacing: 2.5 },
  arena: { height: 282, position: 'relative' },
  orbit: { position: 'absolute', width: 208, height: 208, borderRadius: 104, borderWidth: 1, borderColor: '#D5B57620', alignSelf: 'center', top: 14 },
  horizon: { position: 'absolute', left: 22, right: 22, bottom: 62, height: 1, backgroundColor: '#D5B57620' },
  boss: { alignSelf: 'center', marginTop: 24 },
  player: { position: 'absolute', left: 25, bottom: 19, alignItems: 'center', gap: 9 },
  crest: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: C.navy, borderWidth: 1, borderColor: C.gold },
  playerLabel: { fontFamily: F.bodyBold, color: C.dimLight, fontSize: 8, letterSpacing: 1.2 },
  preparing: { position: 'absolute', left: 86, bottom: 72 },
  arenaCaption: { position: 'absolute', right: 20, bottom: 27, left: 112, gap: 5 },
  captionTitle: { fontFamily: F.uiBold, color: C.cloud, fontSize: 13 },
  captionDetail: { fontFamily: F.body, color: C.dimLight, fontSize: 10 },
  bossHealth: { paddingHorizontal: 18, paddingBottom: 18, gap: 9 },
  slash: { position: 'absolute', alignSelf: 'center', top: 50, width: 124, height: 124, alignItems: 'center', justifyContent: 'center' },
  slashArc: { position: 'absolute', width: 138, height: 80, borderRadius: 80, borderTopWidth: 5, borderColor: C.gold, transform: [{ rotate: '-35deg' }] },
  projectile: { position: 'absolute', left: 65, bottom: 67 },
  cannonball: { width: 19, height: 19, borderRadius: 10, backgroundColor: C.gold, borderWidth: 3, borderColor: C.cloud },
  blast: { position: 'absolute', alignSelf: 'center', top: 48 },
  guard: { position: 'absolute', left: 9, bottom: 30 },
  damage: { position: 'absolute', fontFamily: F.uiBold, fontSize: 28, color: C.gold, textShadowColor: C.navy, textShadowRadius: 5, textShadowOffset: { width: 0, height: 2 } },
  bossDamage: { alignSelf: 'center', top: 48 },
  playerDamage: { left: 39, bottom: 75 },
  result: { fontFamily: F.bodyBold, color: C.gold, fontSize: 13, lineHeight: 20 },
});
