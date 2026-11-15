import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

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

/** Sunny chart contours and a passing tide, behind every screen. */
export function OceanBackdrop() {
  const enabled = useMotionEnabled();
  const [tide] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!enabled) { tide.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(tide, { toValue: 1, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(tide, { toValue: 0, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [enabled, tide]);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <View style={styles.sunGlow} />
      <Animated.View style={[styles.cloud, { transform: [{ translateX: tide.interpolate({ inputRange: [0, 1], outputRange: [-28, 20] }) }] }]}>
        <View style={styles.cloudPuff} /><View style={[styles.cloudPuff, { width: 90, height: 32, left: 32, top: 8 }]} />
      </Animated.View>
      <Animated.View style={[styles.chart, { transform: [{ translateY: tide.interpolate({ inputRange: [0, 1], outputRange: [-16, 16] }) }, { rotate: '-24deg' }] }]}>
        {[0, 1, 2].map((line) => <View key={line} style={[styles.contour, { width: 250 + line * 80, height: 250 + line * 80, borderRadius: 250 + line * 80 }]} />)}
      </Animated.View>
      <Animated.View style={[styles.tide, { opacity: tide.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }), transform: [{ translateX: tide.interpolate({ inputRange: [0, 1], outputRange: [-50, 50] }) }] }]}>
        <View style={styles.wave} /><View style={[styles.wave, { marginLeft: 90, width: 180 }]} /><View style={[styles.wave, { marginLeft: 30, width: 90 }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sunGlow: { position: 'absolute', top: -100, right: -90, width: 350, height: 350, borderRadius: 175, backgroundColor: '#168BC3', opacity: 0.3 },
  cloud: { position: 'absolute', top: 55, right: -14, width: 150, height: 60, opacity: 0.08 },
  cloudPuff: { position: 'absolute', width: 65, height: 30, borderRadius: 30, backgroundColor: '#E6F9FF' },
  chart: { position: 'absolute', right: -220, top: -90, width: 520, height: 520, alignItems: 'center', justifyContent: 'center', opacity: 0.34 },
  contour: { position: 'absolute', borderWidth: 1, borderColor: '#6FC9ED' },
  tide: { position: 'absolute', bottom: 8, left: 0, right: -100, gap: 5 },
  wave: { height: 1.5, width: 230, backgroundColor: '#A0E5FF', borderRadius: 1 },
});
