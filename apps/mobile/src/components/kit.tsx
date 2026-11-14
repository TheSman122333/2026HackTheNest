/**
 * PLACEHOLDER UI kit: plain ink-and-paper boxes so the game is playable before real art lands.
 * The design teammate's components (src/ui) replace these; keep props simple so swapping is easy.
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const C = {
  ink: '#141414',
  paper: '#FFF6E3',
  white: '#FFFFFF',
  sea: '#1E88E5',
  seaLight: '#4FC3F7',
  night: '#0D3B66',
  sun: '#FFC72C',
  red: '#E63946',
  jungle: '#43AA8B',
  dim: '#6B6B6B',
  fog: '#B8B2A6',
} as const;

export const F = {
  title: 'Bangers_400Regular',
  ui: 'Baloo2_800ExtraBold',
  uiBold: 'Baloo2_700Bold',
  body: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_800ExtraBold',
} as const;

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const inner = padded ? s.padded : undefined;
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { gap: 14, paddingBottom: 32 }]}>{children}</ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children, size = 34 }: { children: ReactNode; size?: number }) {
  return <Text style={[s.title, { fontSize: size }]}>{children}</Text>;
}

export function H({ children }: { children: ReactNode }) {
  return <Text style={s.h}>{children}</Text>;
}

export function P({ children, dim, center }: { children: ReactNode; dim?: boolean; center?: boolean }) {
  return <Text style={[s.p, dim && { color: C.dim }, center && { textAlign: 'center' }]}>{children}</Text>;
}

export function Panel({ children, style, color = C.white }: { children: ReactNode; style?: ViewStyle; color?: string }) {
  return <View style={[s.panel, { backgroundColor: color }, style]}>{children}</View>;
}

export function Btn({
  label,
  onPress,
  color = C.sun,
  disabled,
  busy,
  small,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        { backgroundColor: off ? '#DDD' : color },
        pressed && !off && { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOffset: { width: 0, height: 0 } },
      ]}
    >
      {busy ? <ActivityIndicator color={C.ink} /> : <Text style={[s.btnText, small && { fontSize: 14 }]}>{label}</Text>}
    </Pressable>
  );
}

export function Stat({ label, value, color = C.sun }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={[s.stat, { backgroundColor: color }]}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export function Bar({ value, max, color = C.jungle, label }: { value: number; max: number; color?: string; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={{ gap: 2 }}>
      {label ? <Text style={s.barLabel}>{label}</Text> : null}
      <View style={s.barOuter}>
        <View style={[s.barInner, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export function Row({ children, gap = 8, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: 'wrap' }, style]}>{children}</View>;
}

const shadow = {
  shadowColor: C.ink,
  shadowOffset: { width: 4, height: 4 },
  shadowOpacity: 1,
  shadowRadius: 0,
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  padded: { padding: 16 },
  title: { fontFamily: F.title, color: C.ink, letterSpacing: 1 },
  h: { fontFamily: F.ui, fontSize: 18, color: C.ink },
  p: { fontFamily: F.body, fontSize: 14, color: C.ink },
  panel: { borderWidth: 3, borderColor: C.ink, padding: 14, gap: 8, ...shadow },
  btn: { borderWidth: 3, borderColor: C.ink, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', minHeight: 48, justifyContent: 'center', ...shadow },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 10, minHeight: 40 },
  btnText: { fontFamily: F.ui, fontSize: 16, color: C.ink },
  stat: { borderWidth: 3, borderColor: C.ink, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', minWidth: 72 },
  statValue: { fontFamily: F.ui, fontSize: 22, color: C.ink },
  statLabel: { fontFamily: F.bodyBold, fontSize: 11, color: C.ink },
  barLabel: { fontFamily: F.bodyBold, fontSize: 12, color: C.ink },
  barOuter: { height: 14, borderWidth: 2, borderColor: C.ink, backgroundColor: C.white },
  barInner: { height: '100%' },
});
