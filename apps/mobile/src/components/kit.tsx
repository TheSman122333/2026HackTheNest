/**
 * UI kit. Palette from assets/sprites/atlases/palette_reference.png (navy · indigo · periwinkle ·
 * sky · cloud · red · orange). Screens are dark navy; Panels are light cards. Text picks its
 * color from the surface it sits on (ToneContext), so the same <P> reads well on both.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const C = {
  // palette
  navy: '#27187E',
  indigo: '#4D51BE',
  peri: '#7289FD',
  sky: '#33A6FF',
  cloud: '#F1F2F6',
  red: '#FF4542',
  orange: '#FF8600',
  // roles
  ink: '#140C4F',
  deep: '#1B1160',
  white: '#FFFFFF',
  green: '#2ECC8F',
  gold: '#FFC83D',
  dimDark: '#6C6A9C',
  dimLight: '#B9BCF5',
  // legacy names used across screens
  paper: '#F1F2F6',
  sea: '#33A6FF',
  seaLight: '#7289FD',
  night: '#27187E',
  sun: '#FF8600',
  jungle: '#2ECC8F',
  dim: '#6C6A9C',
  fog: '#3A2F96',
} as const;

export const F = {
  title: 'Bangers_400Regular',
  ui: 'Baloo2_800ExtraBold',
  uiBold: 'Baloo2_700Bold',
  body: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_800ExtraBold',
} as const;

type Tone = 'dark' | 'light';
const ToneContext = createContext<Tone>('dark');
const useTone = () => useContext(ToneContext);
const textColor = (tone: Tone) => (tone === 'dark' ? C.cloud : C.ink);
const dimColor = (tone: Tone) => (tone === 'dark' ? C.dimLight : C.dimDark);
/** light backgrounds get ink text; dark ones get cloud text */
const toneFor = (bg: string): Tone => {
  const hex = bg.replace('#', '');
  if (hex.length !== 6) return 'light';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 150 ? 'light' : 'dark';
};

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const inner = padded ? s.padded : undefined;
  return (
    <ToneContext.Provider value="dark">
      <SafeAreaView style={s.screen} edges={['top']}>
        {scroll ? (
          <ScrollView contentContainerStyle={[inner, { gap: 14, paddingBottom: 32 }]}>{children}</ScrollView>
        ) : (
          <View style={[{ flex: 1 }, inner]}>{children}</View>
        )}
      </SafeAreaView>
    </ToneContext.Provider>
  );
}

export function Title({ children, size = 34, color }: { children: ReactNode; size?: number; color?: string }) {
  const tone = useTone();
  return <Text style={[s.title, { fontSize: size, color: color ?? textColor(tone) }]}>{children}</Text>;
}

export function H({ children, color }: { children: ReactNode; color?: string }) {
  const tone = useTone();
  return <Text style={[s.h, { color: color ?? textColor(tone) }]}>{children}</Text>;
}

export function P({ children, dim, center, color }: { children: ReactNode; dim?: boolean; center?: boolean; color?: string }) {
  const tone = useTone();
  return (
    <Text style={[s.p, { color: color ?? (dim ? dimColor(tone) : textColor(tone)) }, center && { textAlign: 'center' }]}>{children}</Text>
  );
}

export function Panel({ children, style, color = C.cloud }: { children: ReactNode; style?: ViewStyle; color?: string }) {
  return (
    <ToneContext.Provider value={toneFor(color)}>
      <View style={[s.panel, { backgroundColor: color }, style]}>{children}</View>
    </ToneContext.Provider>
  );
}

export function Btn({
  label,
  onPress,
  color = C.orange,
  disabled,
  busy,
  small,
  icon,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  icon?: ReactNode;
}) {
  const off = disabled || busy;
  const bg = off ? '#9C9AC4' : color;
  const fg = toneFor(bg) === 'light' ? C.ink : C.white;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        { backgroundColor: bg },
        pressed && !off && { transform: [{ translateY: 3 }], shadowOffset: { width: 0, height: 1 } },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {icon}
          <Text style={[s.btnText, { color: fg }, small && { fontSize: 14 }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Stat({ label, value, color = C.orange, icon }: { label: string; value: string | number; color?: string; icon?: ReactNode }) {
  const fg = toneFor(color) === 'light' ? C.ink : C.white;
  return (
    <View style={[s.stat, { backgroundColor: color }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {icon}
        <Text style={[s.statValue, { color: fg }]}>{value}</Text>
      </View>
      <Text style={[s.statLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Bar({ value, max, color = C.green, label }: { value: number; max: number; color?: string; label?: string }) {
  const tone = useTone();
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={{ gap: 3 }}>
      {label ? <Text style={[s.barLabel, { color: textColor(tone) }]}>{label}</Text> : null}
      <View style={[s.barOuter, { backgroundColor: tone === 'dark' ? C.deep : '#DCDDF0' }]}>
        <View style={[s.barInner, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export function Row({ children, gap = 8, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: 'wrap' }, style]}>{children}</View>;
}

/** Small pill label, e.g. "ENRAGED" or "LIVE". */
export function Tag({ label, color = C.indigo }: { label: string; color?: string }) {
  const fg = toneFor(color) === 'light' ? C.ink : C.white;
  return (
    <View style={[s.tag, { backgroundColor: color }]}>
      <Text style={[s.tagText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const shadow = {
  shadowColor: C.ink,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 1,
  shadowRadius: 0,
  elevation: 0,
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.navy },
  padded: { padding: 16 },
  title: { fontFamily: F.title, letterSpacing: 1.5 },
  h: { fontFamily: F.ui, fontSize: 18 },
  p: { fontFamily: F.body, fontSize: 14, lineHeight: 20 },
  panel: { borderWidth: 3, borderColor: C.ink, borderRadius: 18, padding: 14, gap: 8, ...shadow },
  btn: {
    borderWidth: 3,
    borderColor: C.ink,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
    ...shadow,
  },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 12, minHeight: 40, borderRadius: 12 },
  btnText: { fontFamily: F.ui, fontSize: 16 },
  stat: { borderWidth: 3, borderColor: C.ink, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', minWidth: 74, ...shadow },
  statValue: { fontFamily: F.ui, fontSize: 22 },
  statLabel: { fontFamily: F.bodyBold, fontSize: 10, letterSpacing: 0.5 },
  barLabel: { fontFamily: F.bodyBold, fontSize: 12 },
  barOuter: { height: 14, borderWidth: 2, borderColor: C.ink, borderRadius: 8, overflow: 'hidden' },
  barInner: { height: '100%', borderRadius: 6 },
  tag: { borderWidth: 2, borderColor: C.ink, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, alignSelf: 'flex-start' },
  tagText: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 0.5 },
});
