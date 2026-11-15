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
    <View pointerEvents="none" style={s.sky} />
    <View pointerEvents="none" style={s.sun} />
    <View pointerEvents="none" style={s.cloud}><View style={s.cloudCrown} /></View>
    <View style={s.heading}>
      <Text style={s.eyebrow}>{personal ? 'YOUR WIND TODAY' : 'POWERED BY YOUR CREW'}</Text>
      <Text style={s.pace}>{config.label}</Text>
    </View>
    <View pointerEvents="none" style={s.farSea} />
    <View pointerEvents="none" style={s.nearSea} />

    <Animated.View pointerEvents="none" style={[s.foamField, { transform: [{ translateX: sea.interpolate({ inputRange: [0, 1], outputRange: [0, -120] }) }] }]}>
      {Array.from({ length: 20 }, (_, i) => <View key={i} style={[s.foam, { left: (i % 10) * 60, top: Math.floor(i / 10) * 34 + (i % 3) * 6, width: 16 + (i % 3) * 12, opacity: 0.2 + level * 0.055 }]} />)}
    </Animated.View>

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
      <View style={{ flex: 1 }}><Text style={s.statN}>{sailing.totalMoves}</Text><Text style={s.statL}>{personal ? 'YOUR MOVES EARNED' : 'CREW MOVES EARNED'}</Text></View>
      <View style={s.divider} />
      <View style={{ flex: 1 }}><Text style={s.statN}>{sailing.activities}</Text><Text style={s.statL}>QUESTS LOGGED</Text></View>
      <View style={s.divider} />
      <View style={{ flex: 1 }}><Text style={s.statN}>{sailing.activeMembers}/{sailing.members}</Text><Text style={s.statL}>SAILORS ACTIVE</Text></View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  scene: { borderRadius: 24, overflow: 'hidden', backgroundColor: '#0C4D82', borderWidth: 1, borderColor: '#52B6E0' },
  sky: { position: 'absolute', top: 0, left: 0, right: 0, height: 270, backgroundColor: '#4BB9E6' },
  sun: { position: 'absolute', width: 90, height: 90, borderRadius: 45, right: -22, top: 30, backgroundColor: '#FFE5A2', opacity: 0.8 },
  cloud: { position: 'absolute', left: 34, top: 109, width: 75, height: 14, borderRadius: 20, backgroundColor: '#E9F8FF', opacity: 0.55 },
  cloudCrown: { position: 'absolute', width: 34, height: 24, borderRadius: 20, left: 18, bottom: 0, backgroundColor: '#E9F8FF' },
  heading: { paddingHorizontal: 22, paddingTop: 20, gap: 3, zIndex: 1 },
  eyebrow: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 1.8, color: '#0B416E' },
  pace: { fontFamily: F.title, fontSize: 31, color: '#063A65' },
  farSea: { position: 'absolute', top: 178, height: 180, left: -60, right: -60, borderTopLeftRadius: 170, borderTopRightRadius: 90, backgroundColor: '#239ED0', transform: [{ rotate: '-3deg' }] },
  nearSea: { position: 'absolute', top: 259, bottom: 67, left: -40, right: -40, borderTopLeftRadius: 120, borderTopRightRadius: 170, backgroundColor: '#117AB6', transform: [{ rotate: '3deg' }] },
  foamField: { position: 'absolute', left: -80, width: 720, height: 105, top: 245 },
  foam: { position: 'absolute', height: 2, borderRadius: 2, backgroundColor: '#D6F9FF' },
  shipTouch: { marginTop: 8, height: 251, width: 266, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  ship: { width: 258, height: 258 },
  wakePosition: { position: 'absolute', top: 294, alignSelf: 'center', width: 260, height: 18 },
  wake: { height: 16, width: 246, borderBottomWidth: 3, borderTopWidth: 1, borderColor: '#C6F7FF', borderRadius: 80, transform: [{ rotate: '-3deg' }] },
  gust: { position: 'absolute', left: 0, height: 2, backgroundColor: '#FFFFFF', borderRadius: 2, zIndex: 3 },
  splash: { position: 'absolute', top: 280, alignSelf: 'center', width: 228, height: 37, borderWidth: 3, borderColor: '#D7FAFF', borderRadius: 100, zIndex: 3 },
  caption: { paddingHorizontal: 18, paddingTop: 5, paddingBottom: 18, alignItems: 'center', gap: 5, minHeight: 61, zIndex: 3 },
  wind: { fontFamily: F.bodyBold, color: '#FFFFFF', textAlign: 'center', fontSize: 12 },
  interact: { fontFamily: F.body, color: '#D3F2FF', fontSize: 10 },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 12, backgroundColor: '#075185' },
  statN: { fontFamily: F.ui, color: '#FFE2A0', fontSize: 22, textAlign: 'center', fontVariant: ['tabular-nums'] },
  statL: { fontFamily: F.bodyBold, color: '#D4F0FF', fontSize: 8, textAlign: 'center', letterSpacing: 0.6, marginTop: 3 },
  divider: { width: 1, height: 26, backgroundColor: '#68BFE14D' },
});
