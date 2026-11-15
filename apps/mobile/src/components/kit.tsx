/**
 * The Tidewake look: a sunny ocean, parchment "wanted"-style cards with ink outlines and a hard
 * comic shadow, paper buttons that press down, and hand-lettered type. Original art direction;
 * genre-inspired only (see docs/DESIGN_BRIEF.md). Every screen picks this up from here.
 */
import { Children, createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OceanBackdrop, useMotionEnabled } from '@/ui/motion';
import { cleanText } from '@/ui/text';

export const C = {
  // Sea and sky
  navy: '#063B65', deep: '#0A5E97', indigo: '#087DBB', sky: '#42B6E8', peri: '#8FD3F5', fog: '#2C79AE',
  // Paper, ink and sun
  paper: '#F4D99C', cloud: '#FFF3D5', white: '#FFF8E6', ink: '#25221C', gold: '#F4B942', orange: '#F4B942',
  // Accents
  red: '#D94B35', green: '#4FB97F',
  dimDark: '#6A5534', dimLight: '#D3EFFF',
  // Legacy aliases kept so older screens resolve
  sea: '#42B6E8', seaLight: '#8FD3F5', night: '#063B65', sun: '#F4B942', jungle: '#4FB97F', dim: '#6A5534',
} as const;
/** Hand-lettered display type (Kalam, OFL) with a clean sans kept for small UI text. */
export const F = { title: 'KalamBold', ui: 'KalamBold', uiBold: 'KalamBold', body: 'VoyageSans', bodyBold: 'VoyageSansBold' } as const;

type Tone = 'dark' | 'light';
const ToneContext = createContext<Tone>('dark');
const useTone = () => useContext(ToneContext);
const textColor = (tone: Tone) => tone === 'dark' ? C.cloud : C.ink;
const dimColor = (tone: Tone) => tone === 'dark' ? C.dimLight : C.dimDark;
const copy = (children: ReactNode) => Children.map(children, (child) => typeof child === 'string' ? cleanText(child) : child);
const toneFor = (bg: string): Tone => {
  const hex = bg.replace('#', '').slice(0, 6);
  if (hex.length !== 6) return 'light';
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return (luminance + 0.05) / (0.0405 + 0.05) > (0.9184 + 0.05) / (luminance + 0.05) ? 'light' : 'dark';
};
/** A darker edge of the same colour, for the pressed-paper bottom lip. */
const shade = (hex: string, by = 0.72) => {
  const h = hex.replace('#', '').slice(0, 6);
  if (h.length !== 6) return C.ink;
  const n = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * by).toString(16).padStart(2, '0'));
  return `#${n.join('')}`;
};

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  return <ToneContext.Provider value="dark"><SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <OceanBackdrop />
    {scroll ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[padded && s.padded, s.content]}>{children}</ScrollView>
      : <View style={[{ flex: 1 }, padded && s.padded]}>{children}</View>}
  </SafeAreaView></ToneContext.Provider>;
}

/** Big hand-lettered titles; on the open sea they get an ink drop so they pop like a manga caption. */
export function Title({ children, size = 36, color }: { children: ReactNode; size?: number; color?: string }) {
  const tone = useTone();
  return <Text accessibilityRole="header" style={[s.title, { fontSize: size, lineHeight: Math.round(size * 1.25), color: color ?? textColor(tone) }, tone === 'dark' && s.inkDrop]}>{copy(children)}</Text>;
}
export function H({ children, color }: { children: ReactNode; color?: string }) {
  const tone = useTone();
  return <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
    <Text accessibilityRole="header" style={[s.h, { color: color ?? textColor(tone) }]}>{copy(children)}</Text>
    <View style={[s.brush, { backgroundColor: tone === 'light' ? C.red : C.gold }]} />
  </View>;
}
export function P({ children, dim, center, color }: { children: ReactNode; dim?: boolean; center?: boolean; color?: string }) {
  const tone = useTone();
  return <Text style={[s.p, { color: color ?? (dim ? dimColor(tone) : textColor(tone)) }, center && { textAlign: 'center' }]}>{copy(children)}</Text>;
}

/**
 * Parchment poster card (default) or a sea-glass board when given a blue colour.
 * Uneven corners + ink outline + a hard offset shadow read as hand-cut paper.
 */
type Finish = 'tape' | 'nails' | 'fold' | 'scorch';
const FINISHES: Finish[] = ['tape', 'nails', 'fold', 'scorch'];
let nextFinish = 0;

/** Each paper card gets its own hand-made finish and a tiny tilt, so stacks never look stamped out. */
function PaperFinish({ finish }: { finish: Finish }) {
  return <>
    <View pointerEvents="none" style={[s.vignette, s.cut]} />
    <View pointerEvents="none" style={[s.stain, finish === 'scorch' ? { right: 18, bottom: 14 } : { right: -18, top: -16 }]} />
    {finish === 'tape' ? <>
      <View pointerEvents="none" style={[s.tape, { left: -12, top: 6, transform: [{ rotate: '-38deg' }] }]} />
      <View pointerEvents="none" style={[s.tape, { right: -12, top: 6, transform: [{ rotate: '38deg' }] }]} />
    </> : null}
    {finish === 'nails' ? [{ left: 8, top: 8 }, { right: 8, top: 8 }, { left: 8, bottom: 8 }, { right: 8, bottom: 8 }].map((pos, i) => <View key={i} pointerEvents="none" style={[s.nail, pos]} />) : null}
    {finish === 'fold' ? <View pointerEvents="none" style={s.fold} /> : null}
    {finish === 'scorch' ? <View pointerEvents="none" style={[s.scorch, s.cut]} /> : null}
  </>;
}

/**
 * Parchment poster card (default) or a sea-glass board when given a blue colour.
 * Uneven corners + ink outline + a hard offset shadow read as hand-cut paper.
 */
export function Panel({ children, style, color = C.paper }: { children: ReactNode; style?: ViewStyle; color?: string }) {
  const tone = toneFor(color);
  const paper = tone === 'light';
  const [look] = useState(() => {
    const finish = FINISHES[nextFinish++ % FINISHES.length]!;
    return { finish, tilt: ['-0.5deg', '0.4deg', '-0.25deg', '0.55deg'][nextFinish % 4]! };
  });
  return <ToneContext.Provider value={tone}>
    <View style={[s.panelWrap, { transform: [{ rotate: paper ? look.tilt : '0deg' }] }, style && { flex: style.flex, alignSelf: style.alignSelf, width: style.width, minWidth: style.minWidth, maxWidth: style.maxWidth }]}>
      <View pointerEvents="none" style={[s.panelShadow, s.cut]} />
      <View style={[s.panel, s.cut, { backgroundColor: color }, style, { flex: undefined, width: undefined, margin: 0, marginTop: 0, marginBottom: 0 }]}>
        {paper ? <PaperFinish finish={look.finish} /> : <View pointerEvents="none" style={[s.panelGlass, s.cut]} />}
        {children}
      </View>
    </View>
  </ToneContext.Provider>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
/** Paper button with an ink outline and a thick lip that squashes when pressed. Default: action red. */
export function Btn({ label, onPress, color = C.red, disabled, busy, small, icon }: {
  label: string; onPress: () => void; color?: string; disabled?: boolean; busy?: boolean; small?: boolean; icon?: ReactNode;
}) {
  const off = Boolean(disabled || busy);
  const enabled = useMotionEnabled();
  const [press] = useState(() => new Animated.Value(0));
  const bg = off ? '#B9C7CF' : color;
  const fg = off ? '#5B6A73' : toneFor(bg) === 'light' ? C.ink : C.white;
  const lip = small ? 4 : 5;
  useEffect(() => { if (off) press.setValue(0); }, [off, press]);
  const to = (value: number) => {
    if (off) return;
    if (!enabled) { press.setValue(value); return; }
    Animated.spring(press, { toValue: value, damping: 15, stiffness: 420, mass: 0.45, useNativeDriver: true }).start();
  };
  return <AnimatedPressable accessibilityRole="button" accessibilityLabel={cleanText(label)} accessibilityState={{ disabled: off, busy: Boolean(busy) }}
    disabled={off} onPress={onPress} onPressIn={() => to(1)} onPressOut={() => to(0)}
    style={{ paddingBottom: lip, transform: [{ translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, lip - 1] }) }] }}>
    <View pointerEvents="none" style={[s.btnLip, s.cutSmall, { top: lip, backgroundColor: off ? '#8E9DA6' : shade(bg) }]} />
    <View style={[s.btn, s.cutSmall, small && s.btnSmall, { backgroundColor: bg }]}>
      <View style={s.buttonContent}>{busy ? <ActivityIndicator size="small" color={fg} /> : icon}<Text style={[s.btnText, { color: fg }, small && { fontSize: 15 }]}>{cleanText(label)}</Text></View>
    </View>
  </AnimatedPressable>;
}

/** Parchment stat tile with a coloured lip (red by default, gold for the headline number). */
export function Stat({ label, value, color = C.orange, icon }: { label: string; value: string | number; color?: string; icon?: ReactNode }) {
  const enabled = useMotionEnabled();
  const [pop] = useState(() => new Animated.Value(1));
  const previous = useRef(value);
  useEffect(() => {
    if (!enabled) { pop.setValue(1); previous.current = value; return; }
    if (previous.current === value) return;
    previous.current = value;
    pop.setValue(1.15);
    Animated.spring(pop, { toValue: 1, damping: 12, stiffness: 200, useNativeDriver: true }).start();
    return () => pop.stopAnimation();
  }, [value, enabled, pop]);
  const hot = color === C.orange || color === C.gold;
  return <View style={s.statWrap}>
    <View pointerEvents="none" style={[s.statLip, s.cutSmall, { backgroundColor: hot ? C.red : '#C2402C' }]} />
    <View style={[s.stat, s.cutSmall, { backgroundColor: hot ? C.gold : C.paper }]}>
      <View style={s.statTop}>{icon}<Animated.Text style={[s.statValue, { transform: [{ scale: pop }] }]}>{typeof value === 'string' ? cleanText(value) : value}</Animated.Text></View>
      <Text style={s.statLabel}>{cleanText(label)}</Text>
    </View>
  </View>;
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
  return <View style={{ gap: 6 }}>{label ? <Text style={[s.barLabel, { color: textColor(tone) }]}>{cleanText(label)}</Text> : null}
    <View accessibilityRole="progressbar" accessibilityLabel={label ? cleanText(label) : undefined} accessibilityValue={{ min: 0, max: max > 0 ? max : 1, now: max > 0 ? Math.max(0, Math.min(value, max)) : 0 }} style={s.barOuter}>
      <Animated.View style={[s.barInner, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: color }]} />
    </View></View>;
}
export function Row({ children, gap = 8, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: 'wrap' }, style]}>{children}</View>;
}
/** A little stamped label, slightly askew like ink on a poster. */
export function Tag({ label, color = C.indigo }: { label: string; color?: string }) {
  const fg = toneFor(color) === 'light' ? C.ink : C.white;
  return <View style={[s.tag, { backgroundColor: color }]}><Text style={[s.tagText, { color: fg }]}>{cleanText(label)}</Text></View>;
}

const INK = C.ink;
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.indigo }, padded: { padding: 18 }, content: { gap: 20, paddingBottom: 56 },
  title: { fontFamily: F.title, letterSpacing: 0.2 },
  inkDrop: { textShadowColor: INK, textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0.5 },
  h: { fontFamily: F.ui, fontSize: 21, lineHeight: 27 },
  p: { fontFamily: F.body, fontSize: 14, lineHeight: 21 },
  // Hand-cut corners: every corner a different radius.
  cut: { borderTopLeftRadius: 14, borderTopRightRadius: 6, borderBottomRightRadius: 16, borderBottomLeftRadius: 8 },
  cutSmall: { borderTopLeftRadius: 9, borderTopRightRadius: 4, borderBottomRightRadius: 10, borderBottomLeftRadius: 5 },
  panelWrap: { position: 'relative' },
  panelShadow: { position: 'absolute', left: 5, top: 6, right: -5, bottom: -6, backgroundColor: INK, opacity: 0.85 },
  panel: { borderWidth: 3, borderColor: INK, padding: 18, gap: 12, overflow: 'hidden' },
  // Rustic paper: a baked edge, a coffee stain, and one finish per card.
  vignette: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderWidth: 7, borderColor: '#B9853A2E' },
  stain: { position: 'absolute', width: 90, height: 70, borderRadius: 45, backgroundColor: '#B07A3014', transform: [{ rotate: '-18deg' }] },
  tape: { position: 'absolute', width: 64, height: 20, backgroundColor: '#FFF6DAC8', borderWidth: 1, borderColor: '#25221C26' },
  nail: { position: 'absolute', width: 11, height: 11, borderRadius: 6, backgroundColor: '#E2A93B', borderWidth: 2, borderColor: INK },
  fold: { position: 'absolute', right: -2, bottom: -2, width: 0, height: 0, borderLeftWidth: 30, borderTopWidth: 30, borderLeftColor: 'transparent', borderTopColor: '#D9B46C', borderRightWidth: 0, borderStyle: 'solid' },
  scorch: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderWidth: 3, borderColor: '#7A4A1A55', borderBottomWidth: 9, borderRightWidth: 6 },
  brush: { height: 4, width: '70%', minWidth: 40, borderRadius: 3, marginTop: 1, transform: [{ rotate: '-1.2deg' }] },
  panelGlass: { position: 'absolute', left: 0, right: 0, top: 0, height: 26, backgroundColor: '#FFFFFF14' },
  btn: { borderWidth: 2.5, borderColor: INK, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 14, minHeight: 44 },
  btnLip: { position: 'absolute', left: 0, right: 0, bottom: 0, borderWidth: 2.5, borderColor: INK },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 1 },
  btnText: { fontFamily: F.ui, fontSize: 17, lineHeight: 22, flexShrink: 1, textAlign: 'center' },
  statWrap: { paddingBottom: 5, minWidth: 74, flexGrow: 1 },
  statLip: { position: 'absolute', left: 0, right: 0, top: 5, bottom: 0, borderWidth: 2.5, borderColor: INK },
  stat: { borderWidth: 2.5, borderColor: INK, paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center', gap: 2 },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statValue: { fontFamily: F.ui, fontSize: 26, lineHeight: 32, color: INK, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: F.ui, fontSize: 12, lineHeight: 15, color: INK, textAlign: 'center', textTransform: 'uppercase' },
  barLabel: { fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 0.3 },
  barOuter: { height: 12, borderRadius: 6, overflow: 'hidden', borderWidth: 2, borderColor: INK, backgroundColor: C.cloud },
  barInner: { height: '100%', borderRightWidth: 2, borderColor: INK },
  tag: { borderRadius: 4, borderWidth: 2, borderColor: INK, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start', transform: [{ rotate: '-1.5deg' }] },
  tagText: { fontFamily: F.ui, fontSize: 13, lineHeight: 17, letterSpacing: 0.5 },
});
