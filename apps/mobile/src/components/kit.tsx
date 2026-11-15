/** Quiet nautical colors, brass details, and readable surfaces. */
import { Children, createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OceanBackdrop, useMotionEnabled } from '@/ui/motion';
import { cleanText } from '@/ui/text';

export const C = {
  navy: '#0B1821', indigo: '#24434E', peri: '#789CA6', sky: '#78B9C6', cloud: '#F3EEE3',
  red: '#C97063', orange: '#D5B576', ink: '#152B34', deep: '#10242D', white: '#FFFCF6',
  green: '#5FAD97', gold: '#D5B576', dimDark: '#59676B', dimLight: '#9BB0B6', paper: '#F3EEE3',
  sea: '#78B9C6', seaLight: '#789CA6', night: '#0B1821', sun: '#D5B576', jungle: '#5FAD97', dim: '#59676B', fog: '#29414B',
} as const;
export const F = { title: 'VoyageSerif', ui: 'VoyageSansBold', uiBold: 'VoyageSansMedium', body: 'VoyageSans', bodyBold: 'VoyageSansMedium' } as const;
type Tone = 'dark' | 'light';
const ToneContext = createContext<Tone>('dark');
const useTone = () => useContext(ToneContext);
const textColor = (tone: Tone) => tone === 'dark' ? C.cloud : C.ink;
const dimColor = (tone: Tone) => tone === 'dark' ? C.dimLight : C.dimDark;
const copy = (children: ReactNode) => Children.map(children, (child) => typeof child === 'string' ? cleanText(child) : child);
const toneFor = (bg: string): Tone => {
  const hex = bg.replace('#', '');
  if (hex.length !== 6) return 'light';
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  // Pick the foreground with greater contrast against the actual surface.
  return (luminance + 0.05) / (0.022 + 0.05) > (0.858 + 0.05) / (luminance + 0.05) ? 'light' : 'dark';
};
export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  return <ToneContext.Provider value="dark"><SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <OceanBackdrop />
    {scroll ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[padded && s.padded, s.content]}>{children}</ScrollView>
      : <View style={[{ flex: 1 }, padded && s.padded]}>{children}</View>}
  </SafeAreaView></ToneContext.Provider>;
}
export function Title({ children, size = 36, color }: { children: ReactNode; size?: number; color?: string }) {
  const tone = useTone();
  return <Text accessibilityRole="header" style={[s.title, { fontSize: size, color: color ?? textColor(tone) }]}>{copy(children)}</Text>;
}
export function H({ children, color }: { children: ReactNode; color?: string }) {
  const tone = useTone();
  return <Text accessibilityRole="header" style={[s.h, { color: color ?? textColor(tone) }]}>{copy(children)}</Text>;
}
export function P({ children, dim, center, color }: { children: ReactNode; dim?: boolean; center?: boolean; color?: string }) {
  const tone = useTone();
  return <Text style={[s.p, { color: color ?? (dim ? dimColor(tone) : textColor(tone)) }, center && { textAlign: 'center' }]}>{copy(children)}</Text>;
}
export function Panel({ children, style, color = C.cloud }: { children: ReactNode; style?: ViewStyle; color?: string }) {
  const tone = toneFor(color);
  return <ToneContext.Provider value={tone}><View style={[s.panel, { backgroundColor: color, borderColor: tone === 'dark' ? '#2A414A' : '#DCD7CB' }, style]}>{children}</View></ToneContext.Provider>;
}
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function Btn({ label, onPress, color = C.orange, disabled, busy, small, icon }: {
  label: string; onPress: () => void; color?: string; disabled?: boolean; busy?: boolean; small?: boolean; icon?: ReactNode;
}) {
  const off = Boolean(disabled || busy);
  const enabled = useMotionEnabled();
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);
  const fg = off ? C.dimLight : toneFor(color) === 'light' ? C.ink : C.white;
  useEffect(() => { if (off || !enabled) { scale.stopAnimation(); scale.setValue(1); } }, [off, enabled, scale]);
  const press = (toValue: number) => {
    if (!enabled || off) return;
    Animated.spring(scale, { toValue, damping: 14, stiffness: 320, mass: 0.5, useNativeDriver: true }).start();
  };
  return <AnimatedPressable accessibilityRole="button" accessibilityLabel={cleanText(label)} accessibilityState={{ disabled: off, busy: Boolean(busy) }}
    disabled={off} onPress={onPress} onPressIn={() => { setPressed(true); press(0.96); }} onPressOut={() => { setPressed(false); press(1); }}
    style={[s.btn, small && s.btnSmall, { backgroundColor: off ? C.fog : color, transform: [{ scale }], opacity: pressed && !off ? 0.87 : 1 }]}>
    <View style={s.buttonContent}>{busy ? <ActivityIndicator size="small" color={fg} /> : icon}<Text style={[s.btnText, { color: fg }, small && { fontSize: 13 }]}>{cleanText(label)}</Text></View>
  </AnimatedPressable>;
}
export function Stat({ label, value, color = C.orange, icon }: { label: string; value: string | number; color?: string; icon?: ReactNode }) {
  const enabled = useMotionEnabled();
  const [pop] = useState(() => new Animated.Value(1));
  const previous = useRef(value);
  useEffect(() => {
    if (!enabled) { pop.setValue(1); previous.current = value; return; }
    if (previous.current === value) return;
    previous.current = value;
    pop.setValue(1.12);
    Animated.spring(pop, { toValue: 1, damping: 12, stiffness: 200, useNativeDriver: true }).start();
    return () => pop.stopAnimation();
  }, [value, enabled, pop]);
  const fg = toneFor(color) === 'light' ? C.ink : C.white;
  return <View style={[s.stat, { backgroundColor: color }]}><View style={s.statTop}>{icon}<Animated.Text style={[s.statValue, { color: fg, transform: [{ scale: pop }] }]}>{typeof value === 'string' ? cleanText(value) : value}</Animated.Text></View><Text style={[s.statLabel, { color: fg }]}>{cleanText(label)}</Text></View>;
}
export function Bar({ value, max, color = C.green, label }: { value: number; max: number; color?: string; label?: string }) {
  const tone = useTone();
  const enabled = useMotionEnabled();
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const [progress] = useState(() => new Animated.Value(pct));
  useEffect(() => {
    const animation = Animated.timing(progress, { toValue: pct, duration: enabled ? 450 : 0, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start(); return () => animation.stop();
  }, [pct, enabled, progress]);
  return <View style={{ gap: 8 }}>{label ? <Text style={[s.barLabel, { color: textColor(tone) }]}>{cleanText(label)}</Text> : null}
    <View accessibilityRole="progressbar" accessibilityLabel={label ? cleanText(label) : undefined} accessibilityValue={{ min: 0, max: max > 0 ? max : 1, now: max > 0 ? Math.max(0, Math.min(value, max)) : 0 }} style={[s.barOuter, { backgroundColor: tone === 'dark' ? C.fog : '#DCDDD3' }]}>
      <Animated.View style={[s.barInner, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: color }]} />
    </View></View>;
}
export function Row({ children, gap = 8, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: 'wrap' }, style]}>{children}</View>;
}
export function Tag({ label, color = C.indigo }: { label: string; color?: string }) {
  const fg = toneFor(color) === 'light' ? C.ink : C.white;
  return <View style={[s.tag, { backgroundColor: color }]}><Text style={[s.tagText, { color: fg }]}>{cleanText(label)}</Text></View>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.navy }, padded: { padding: 20 }, content: { gap: 20, paddingBottom: 48 },
  title: { fontFamily: F.title, letterSpacing: 0.1 }, h: { fontFamily: F.ui, fontSize: 17, letterSpacing: -0.3 },
  p: { fontFamily: F.body, fontSize: 14, lineHeight: 22 }, panel: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 12 },
  btn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  btnSmall: { paddingVertical: 12, paddingHorizontal: 14, minHeight: 48, borderRadius: 10 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 1 },
  btnText: { fontFamily: F.ui, fontSize: 14, letterSpacing: 0.1, flexShrink: 1, textAlign: 'center' },
  stat: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', minWidth: 72, gap: 3 },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 5 }, statValue: { fontFamily: F.ui, fontSize: 23, fontVariant: ['tabular-nums'], letterSpacing: -0.8 },
  statLabel: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 1 }, barLabel: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 0.3 },
  barOuter: { height: 6, borderRadius: 3, overflow: 'hidden' }, barInner: { height: '100%', borderRadius: 3 },
  tag: { borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5, alignSelf: 'flex-start' }, tagText: { fontFamily: F.bodyBold, fontSize: 10, letterSpacing: 1 },
});
