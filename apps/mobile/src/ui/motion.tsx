import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

const MotionContext = createContext(false);

/** For overlays above the navigator, where there is no focused route context. */
export function useDeviceMotionEnabled() {
  return useContext(MotionContext);
}

/** Share device preferences once; idle loops stop when the app is away. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(true);
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduced(value); }).catch(() => { if (mounted) setReduced(false); });
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const visibility = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => { mounted = false; preference.remove(); visibility.remove(); };
  }, []);
  return <MotionContext.Provider value={active && !reduced}>{children}</MotionContext.Provider>;
}

/** A hidden tab or covered route should not keep its ocean running. */
export function useMotionEnabled() {
  const deviceEnabled = useContext(MotionContext);
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  return deviceEnabled && focused;
}

export function Float({ children, amplitude = 4, duration = 3000, tilt = 0, style }: {
  children: ReactNode; amplitude?: number; duration?: number; tilt?: number; style?: StyleProp<ViewStyle>;
}) {
  const enabled = useMotionEnabled();
  const [phase] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!enabled || (amplitude === 0 && tilt === 0)) { phase.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(phase, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(phase, { toValue: -1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(phase, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]));
    loop.start();
    return () => { loop.stop(); phase.setValue(0); };
  }, [enabled, phase, duration, amplitude, tilt]);
  return <Animated.View style={[style, { transform: [
    { translateY: phase.interpolate({ inputRange: [-1, 1], outputRange: [-amplitude, amplitude] }) },
    { rotate: phase.interpolate({ inputRange: [-1, 1], outputRange: [`${-tilt}deg`, `${tilt}deg`] }) },
  ] }]}>{children}</Animated.View>;
}

/** One looping clock (0 → 1) for the whole backdrop; frozen when motion is off or the screen is hidden. */
function useLoop(enabled: boolean, duration: number) {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!enabled) { value.setValue(0.5); return; }
    value.setValue(0);
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    loop.start();
    return () => loop.stop();
  }, [enabled, duration, value]);
  return value;
}

const CREST = 64; // one wave crest, in dp; rows are two screens wide so the loop is seamless
const WAVE_ROWS = [
  { top: '46%', color: '#2E9BD6', foam: '#E9F8FF', speed: 1, scale: 0.7, opacity: 0.35 },
  { top: '58%', color: '#1C86C6', foam: '#F4FCFF', speed: -1, scale: 0.85, opacity: 0.4 },
  { top: '71%', color: '#0E70AE', foam: '#FFFFFF', speed: 1, scale: 1, opacity: 0.45 },
  { top: '85%', color: '#075C94', foam: '#FFFFFF', speed: -1, scale: 1.15, opacity: 0.5 },
] as const;

function WaveRow({ row, clock, width }: { row: (typeof WAVE_ROWS)[number]; clock: Animated.Value; width: number }) {
  const crest = CREST * row.scale;
  const count = Math.ceil((width * 2) / crest) + 2;
  return (
    <Animated.View style={[styles.waveRow, { top: row.top, opacity: row.opacity, transform: [{ translateX: clock.interpolate({ inputRange: [0, 1], outputRange: row.speed > 0 ? [-crest * 2, 0] : [0, -crest * 2] }) }] }]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: crest, height: crest * 0.42 }}>
          <View style={[styles.crest, { backgroundColor: row.color, borderTopColor: row.foam, height: crest * 0.42, borderTopLeftRadius: crest * 0.5, borderTopRightRadius: crest * 0.5 }]} />
        </View>
      ))}
    </Animated.View>
  );
}

/**
 * The open sea behind every screen: sky, sun, drifting clouds, a horizon, rolling foam-capped
 * waves, manga speed lines and sparkles. Plain Views, native-driven, paused when not visible.
 */
export function OceanBackdrop() {
  const enabled = useMotionEnabled();
  const { width } = useWindowDimensions();
  const waves = useLoop(enabled, 6000);
  const drift = useLoop(enabled, 60000);
  const twinkle = useLoop(enabled, 3200);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.sea]}>
      {/* Sky */}
      <View style={styles.sky} />
      <View style={[styles.skyBand, { top: '24%', opacity: 0.5 }]} />
      <View style={[styles.skyBand, { top: '30%', opacity: 0.3 }]} />
      {/* Sun with a soft halo */}
      <View style={styles.sunHalo} />
      <View style={styles.sun} />
      {/* Clouds drift across the whole sky once a minute */}
      {[{ top: '19%', size: 0.7, offset: 0 }, { top: '28%', size: 0.5, offset: 0.55 }].map((cl, i) => (
        <Animated.View key={i} style={[styles.cloud, { top: cl.top, transform: [
          { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [width * (1.1 - cl.offset * 2), width * (1.1 - cl.offset * 2) - width * 1.6] }) },
          { scale: cl.size },
        ] }]}>
          <View style={[styles.puff, { left: 0, top: 18, width: 70, height: 34 }]} />
          <View style={[styles.puff, { left: 30, top: 0, width: 70, height: 52 }]} />
          <View style={[styles.puff, { left: 78, top: 12, width: 64, height: 40 }]} />
        </Animated.View>
      ))}
      {/* Horizon and rolling waves */}
      <View style={styles.horizon} />
      {WAVE_ROWS.map((row, i) => <WaveRow key={i} row={row} clock={waves} width={width} />)}
      <View style={styles.depth} />
      {/* Sun sparkles on the water */}
      {[{ l: '68%', t: '50%' }, { l: '20%', t: '63%' }, { l: '80%', t: '76%' }, { l: '42%', t: '90%' }].map((p, i) => (
        <Animated.View key={i} style={[styles.sparkle, { left: p.l, top: p.t, opacity: twinkle.interpolate({ inputRange: [0, 0.25 + i * 0.15, 0.5 + i * 0.1, 1], outputRange: [0.1, 0.9, 0.2, 0.1] }) }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sea: { backgroundColor: '#087DBB', overflow: 'hidden' },
  sky: { position: 'absolute', left: 0, right: 0, top: 0, height: '38%', backgroundColor: '#2B9FD9' },
  skyBand: { position: 'absolute', left: 0, right: 0, height: '9%', backgroundColor: '#5DBDEA' },
  sunHalo: { position: 'absolute', top: 138, right: -4, width: 128, height: 128, borderRadius: 64, backgroundColor: '#FFF3C4', opacity: 0.22 },
  sun: { position: 'absolute', top: 158, right: 16, width: 88, height: 88, borderRadius: 44, backgroundColor: '#FBE6A2', borderWidth: 2.5, borderColor: '#25221C' },
  cloud: { position: 'absolute', left: 0, width: 150, height: 60 },
  puff: { position: 'absolute', borderRadius: 40, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#25221C33', opacity: 0.92 },
  horizon: { position: 'absolute', left: 0, right: 0, top: '38%', height: 3, backgroundColor: '#E9F8FF', opacity: 0.6 },
  waveRow: { position: 'absolute', left: 0, flexDirection: 'row' },
  crest: { width: '100%', borderTopWidth: 3 },
  depth: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '12%', backgroundColor: '#063B65', opacity: 0.35 },
  sparkle: { position: 'absolute', width: 10, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
});
