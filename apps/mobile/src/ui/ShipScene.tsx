import { speedFor, type ShipSpeed } from '@last-voyage/game';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { F } from '@/components/kit';
import { useMotionEnabled } from '@/ui/motion';

type Sailing = { totalMoves: number; averageMoves: number; activities: number; steps: number; activeMembers: number; members: number };
const SPEEDS: ShipSpeed[] = ['becalmed', 'slow', 'steady', 'swift', 'flying'];
const PACE: Record<ShipSpeed, { label: string; wind: string; duration: number; gusts: number }> = {
  becalmed: { label: 'Gentle drift', wind: 'A little life will fill the sails', duration: 6800, gusts: 0 },
  slow: { label: 'Catching a breeze', wind: 'Your crew is stirring the sea', duration: 4900, gusts: 2 },
  steady: { label: 'Steady sailing', wind: 'A fair wind, earned together', duration: 3400, gusts: 4 },
  swift: { label: 'Full sail', wind: 'Your crew has the wind at its back', duration: 2300, gusts: 6 },
  flying: { label: 'Chasing the horizon', wind: 'Everyday adventures. Extraordinary wind.', duration: 1500, gusts: 8 },
};

function Gust({ index, duration, width, enabled }: { index: number; duration: number; width: number; enabled: boolean }) {
  const [travel] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!enabled) { travel.setValue(0.5); return; }
    travel.setValue(0);
    const loop = Animated.loop(Animated.timing(travel, {
      toValue: 1, delay: index * 140, duration: duration + index * 90,
      easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    }));
    loop.start();
    return () => loop.stop();
  }, [travel, index, duration, enabled]);
  return <Animated.View pointerEvents="none" style={[s.gust, {
    top: 95 + (index * 29) % 140, width: 32 + (index % 3) * 18,
    opacity: travel.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.65, 0.65, 0] }),
    transform: [{ translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [width + 60, -90] }) }],
  }]} />;
}

/** Presentation only: activity totals are provided by the authenticated crew response. */
export function ShipScene({ sailing, personal = false, onBoard }: { sailing: Sailing; personal?: boolean; onBoard?: () => void }) {
  const motion = useMotionEnabled();
  const { width } = useWindowDimensions();
  const sceneWidth = Math.max(240, width - 40);
  const pace = speedFor(sailing.averageMoves);
  const level = SPEEDS.indexOf(pace);
  const config = PACE[pace];
  const [bob] = useState(() => new Animated.Value(0));
  const [sea] = useState(() => new Animated.Value(0));
  const [splash] = useState(() => new Animated.Value(1));
  const [answer, setAnswer] = useState(false);
  const clearAnswer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!motion) { bob.setValue(0); sea.setValue(0); splash.setValue(1); return; }
    bob.setValue(0);
    sea.setValue(0);
    const sailingMotion = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: config.duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(bob, { toValue: -1, duration: config.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(bob, { toValue: 0, duration: config.duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]));
    const wake = Animated.loop(Animated.timing(sea, { toValue: 1, duration: config.duration, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    sailingMotion.start(); wake.start();
    return () => { sailingMotion.stop(); wake.stop(); };
  }, [motion, bob, sea, splash, config.duration]);

  useEffect(() => () => {
    if (clearAnswer.current) clearTimeout(clearAnswer.current);
    splash.stopAnimation();
  }, [splash]);

  const makeSplash = () => {
    Haptics.selectionAsync().catch(() => {});
    setAnswer(true);
    if (clearAnswer.current) clearTimeout(clearAnswer.current);
    clearAnswer.current = setTimeout(() => setAnswer(false), 2000);
    if (!motion) return;
    splash.stopAnimation();
    splash.setValue(0);
    Animated.timing(splash, { toValue: 1, duration: 850, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  return <View style={s.scene}>
    <View style={s.heading}>
      <Text style={s.eyebrow}>{personal ? 'YOUR WIND TODAY' : 'POWERED BY YOUR CREW'}</Text>
      <View style={s.rule} />
      <Text style={s.pace}>{config.label}</Text>
    </View>


    <View pointerEvents="none" style={s.wakePosition}>
      <Animated.View style={[s.wake, { opacity: 0.22 + level * 0.12, transform: [{ scaleX: bob.interpolate({ inputRange: [-1, 1], outputRange: [0.9, 1.12 + level * 0.09] }) }] }]} />
    </View>

    <Pressable accessibilityRole="button" accessibilityLabel={onBoard ? 'Board your crew’s ship' : 'Make a splash with your crew’s ship'} accessibilityHint={onBoard ? 'Opens the overhead crew deck, contributions, upgrades, and voyage map.' : 'Plays a ship animation. Sailing pace comes from real crew activity.'}
      onPress={onBoard ?? makeSplash} style={s.shipTouch}>
      <Animated.View style={{ transform: [
        { translateY: bob.interpolate({ inputRange: [-1, 1], outputRange: [-3 - level, 3 + level] }) },
        { translateX: bob.interpolate({ inputRange: [-1, 1], outputRange: [-2 - level * 1.5, 2 + level * 2] }) },
        { rotate: bob.interpolate({ inputRange: [-1, 1], outputRange: [`${-0.6 - level * 0.45}deg`, `${0.6 + level * 0.45}deg`] }) },
        { scale: splash.interpolate({ inputRange: [0, 0.2, 0.45, 1], outputRange: [1, 0.96, 1.045, 1] }) },
      ] }}>
        <Image source={require('../../assets/game/ships/voyage_ship.png')} style={s.ship} contentFit="contain" accessible={false} />
      </Animated.View>
    </Pressable>

    {Array.from({ length: config.gusts }, (_, i) => <Gust key={i} index={i} duration={config.duration * 0.7} width={sceneWidth} enabled={motion} />)}
    <Animated.View pointerEvents="none" style={[s.splash, { opacity: splash.interpolate({ inputRange: [0, 0.1, 0.6, 1], outputRange: [0, 0.9, 0.65, 0] }), transform: [{ scale: splash.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] }) }] }]} />

    <View style={s.caption} pointerEvents="none">
      <Text accessibilityLiveRegion="polite" style={s.wind}>{answer ? 'Aye, Captain! A splash for the next adventure.' : config.wind}</Text>
      <Text style={s.interact}>{onBoard ? 'Tap the ship to come aboard' : 'Tap the ship to make a splash'}</Text>
    </View>
    <View style={s.stats}>
      <View style={s.tile}><Text style={s.statN}>{sailing.totalMoves}</Text><Text style={s.statL}>{personal ? 'YOUR MOVES EARNED' : 'CREW MOVES EARNED'}</Text></View>
      <View style={s.tile}><Text style={s.statN}>{sailing.activities}</Text><Text style={s.statL}>QUESTS LOGGED</Text></View>
      <View style={s.tile}><Text style={s.statN}>{sailing.activeMembers}/{sailing.members}</Text><Text style={s.statL}>SAILORS ACTIVE</Text></View>
    </View>
  </View>;
}

// Frame only: the ship art, bob, wake, gusts and splash are unchanged. No sea of its own:
// the ship floats on the page's live ocean, so scrolling never shows a static cut-off. It spans the full width
// so the ship sits on the open sea, with a parchment banner, caption plaque and stat tiles.
const INK = '#25221C';
const PAPER = '#F4D99C';
const cut = { borderTopLeftRadius: 12, borderTopRightRadius: 5, borderBottomRightRadius: 14, borderBottomLeftRadius: 6 } as const;
const s = StyleSheet.create({
  scene: { marginHorizontal: -18, overflow: 'hidden', paddingBottom: 6 },
  heading: { marginHorizontal: 18, marginTop: 4, paddingHorizontal: 18, paddingVertical: 10, gap: 2, zIndex: 4, alignSelf: 'flex-start', backgroundColor: PAPER, borderWidth: 2.5, borderColor: INK, ...cut, transform: [{ rotate: '-1.2deg' }] },
  eyebrow: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.6, color: INK },
  rule: { height: 2, backgroundColor: INK, opacity: 0.7, borderRadius: 1, marginVertical: 2 },
  pace: { fontFamily: F.title, fontSize: 32, lineHeight: 40, color: INK },
  shipTouch: { marginTop: 0, height: 251, width: 266, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  ship: { width: 258, height: 258 },
  wakePosition: { position: 'absolute', top: 300, alignSelf: 'center', width: 260, height: 18 },
  wake: { height: 16, width: 246, borderBottomWidth: 3, borderTopWidth: 1, borderColor: '#FFFFFF', borderRadius: 80, transform: [{ rotate: '-3deg' }] },
  gust: { position: 'absolute', left: 0, height: 2, backgroundColor: '#FFFFFF', borderRadius: 2, zIndex: 3 },
  splash: { position: 'absolute', top: 300, alignSelf: 'center', width: 228, height: 37, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 100, zIndex: 3 },
  caption: { alignSelf: 'center', marginTop: 2, paddingHorizontal: 22, paddingVertical: 8, alignItems: 'center', gap: 2, zIndex: 3, backgroundColor: PAPER, borderWidth: 2.5, borderColor: INK, ...cut, transform: [{ rotate: '0.8deg' }] },
  wind: { fontFamily: F.ui, color: INK, textAlign: 'center', fontSize: 17, lineHeight: 22 },
  interact: { fontFamily: F.ui, color: '#5B4A2E', fontSize: 14, lineHeight: 18 },
  stats: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingTop: 14, zIndex: 3 },
  tile: { flex: 1, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', backgroundColor: PAPER, borderWidth: 2.5, borderColor: INK, ...cut, borderBottomWidth: 6 },
  statN: { fontFamily: F.ui, color: INK, fontSize: 28, lineHeight: 34, textAlign: 'center', fontVariant: ['tabular-nums'] },
  statL: { fontFamily: F.ui, color: INK, fontSize: 12, lineHeight: 15, textAlign: 'center' },
});
