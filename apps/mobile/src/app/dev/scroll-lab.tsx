/**
 * Scroll Lab: debug screen for tuning short-form detection on a real device.
 * Functional-first, deliberately plain (Codex may restyle later with src/ui components).
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import ScrollSentinel, { type DiscoveryEntry } from 'scroll-sentinel';

import { APP_LABEL, SURFACE_RULES } from '@/features/scroll/rules';
import {
  useLiveSwipes,
  useSentinelPermissions,
  useTodayScreen,
} from '@/features/scroll/useScrollSentinel';

export default function ScrollLab() {
  const perms = useSentinelPermissions();
  const live = useLiveSwipes();
  const today = useTodayScreen(perms);
  const [disclosure, setDisclosure] = useState(false);
  const [discovery, setDiscovery] = useState(false);
  const [entries, setEntries] = useState<DiscoveryEntry[]>([]);

  useEffect(() => {
    if (!discovery) return;
    const tick = () => ScrollSentinel.getDiscoverySnapshot().then(setEntries).catch(() => {});
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [discovery]);

  const grouped = useMemo(() => {
    const m = new Map<string, { e: DiscoveryEntry; n: number }>();
    for (const e of entries) {
      const k = `${e.pkg}|${e.kind}|${e.className}|${e.viewId}`;
      const cur = m.get(k);
      m.set(k, { e, n: (cur?.n ?? 0) + 1 });
    }
    return [...m.values()].sort((a, b) => b.e.ts - a.e.ts);
  }, [entries]);

  const toggleDiscovery = (on: boolean) => {
    ScrollSentinel.setDiscoveryMode(on);
    setDiscovery(on);
    if (!on) setEntries([]);
  };

  const clear = () =>
    Alert.alert('Clear all scroll data?', 'Deletes sessions and daily totals stored on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => ScrollSentinel.clearData().then(today.refresh),
      },
    ]);

  if (!perms.supported) {
    return (
      <View style={s.screen}>
        <Card title="Not supported here">
          <Text style={s.body}>
            Scroll tracking needs the Android development build (not Expo Go). iOS support will come
            through Apple Screen Time later.
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Card title="Permissions">
        <Row label="Accessibility service" ok={perms.accessibility} />
        <Btn label="Open accessibility settings" onPress={() => setDisclosure(true)} />
        <Row label="Usage access (minutes and opens)" ok={perms.usageAccess} />
        <Btn label="Open usage access settings" onPress={ScrollSentinel.openUsageAccessSettings} />
      </Card>

      <Card title={`Calm Seas today: ${today.verdict.verdict.toUpperCase()}`}>
        <Text style={s.body}>
          {today.day.swipes} swipes · {today.day.minutes} min · {today.day.opens} opens
        </Text>
        <Text style={s.body}>
          Left: {today.progress.swipesLeft} swipes / {today.progress.minutesLeft} min
          {today.progress.shoreLeaveSoFar ? ' · Shore Leave so far!' : ''}
        </Text>
      </Card>

      <Card title="Live swipes (since opening this screen)">
        {Object.keys(live).length === 0 ? (
          <Text style={s.dim}>Open TikTok, Reels or Shorts and swipe; counts appear here.</Text>
        ) : (
          Object.entries(live).map(([app, n]) => <KV key={app} k={APP_LABEL[app] ?? app} v={String(n)} />)
        )}
      </Card>

      <Card title={`Today's summary ${today.summary.date}`}>
        {Object.keys(SURFACE_RULES).map((pkg) => {
          const a = today.summary.perApp[pkg];
          const u = today.usage[pkg];
          const name = APP_LABEL[SURFACE_RULES[pkg]!.app] ?? pkg;
          return (
            <View key={pkg} style={s.kvBlock}>
              <Text style={s.kvTitle}>{name}</Text>
              <Text style={s.mono}>{pkg}</Text>
              <Text style={s.body}>
                swipes {a?.swipes ?? 0} · short-form {fmt(a?.minutes)} min · sessions {a?.sessions ?? 0}
              </Text>
              <Text style={s.body}>
                foreground {fmt(u?.minutes)} min · opens {u?.opens ?? 0}
              </Text>
            </View>
          );
        })}
      </Card>

      <Card title="Discovery mode">
        <View style={s.row}>
          <Text style={s.body}>Record scrollable view IDs and classes</Text>
          <Switch value={discovery} onValueChange={toggleDiscovery} />
        </View>
        <Text style={s.dim}>
          Turn on, open Reels or Shorts, swipe a few times, come back. Look for the viewId of the
          pager, then add it to src/features/scroll/rules.ts.
        </Text>
        {grouped.slice(0, 80).map(({ e, n }, i) => (
          <View key={i} style={s.disc}>
            <Text style={s.mono}>
              [{e.kind}] {e.pkg.split('.').slice(-2).join('.')} ×{n}
              {e.fromIndex !== undefined ? ` idx ${e.fromIndex}→${e.toIndex}/${e.itemCount}` : ''}
            </Text>
            <Text style={s.mono}>id: {e.viewId ?? '—'}</Text>
            <Text style={s.mono}>cls: {e.className ?? '—'}</Text>
          </View>
        ))}
      </Card>

      <Card title="Data">
        <Btn label="Re-apply rules" onPress={() => ScrollSentinel.setRules(SURFACE_RULES)} />
        <Btn label="Clear all scroll data" danger onPress={clear} />
      </Card>

      <Modal visible={disclosure} transparent animationType="fade" onRequestClose={() => setDisclosure(false)}>
        <View style={s.backdrop}>
          <View style={s.modal}>
            <Text style={s.cardTitle}>Calm Seas tracker</Text>
            <Text style={s.body}>
              The Last Voyage uses Android&apos;s Accessibility Service to count how many short-form
              videos you swipe through in TikTok, Instagram Reels and YouTube Shorts. That&apos;s how
              we reward phone-free days with bonus Island Moves.
            </Text>
            <Text style={s.body}>• We only see app names and screen layout IDs.</Text>
            <Text style={s.body}>• We never read text, messages, captions or anything you type.</Text>
            <Text style={s.body}>• Data stays on your phone. Only totals sync, if you opt in.</Text>
            <Text style={s.body}>
              {'On the next screen, tap "The Last Voyage: Calm Seas tracker" and turn it on.'}
            </Text>
            <Btn
              label="I understand, open settings"
              onPress={() => {
                setDisclosure(false);
                ScrollSentinel.openAccessibilitySettings();
              }}
            />
            <Btn label="Not now" onPress={() => setDisclosure(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const fmt = (n?: number) => (n ?? 0).toFixed(1);

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.body}>{label}</Text>
      <Text style={[s.badge, { backgroundColor: ok ? '#43AA8B' : '#E63946' }]}>{ok ? 'ON' : 'OFF'}</Text>
    </View>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.row}>
      <Text style={s.body}>{k}</Text>
      <Text style={s.kvTitle}>{v}</Text>
    </View>
  );
}

function Btn({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.btn, danger && s.btnDanger, pressed && s.btnPressed]}
    >
      <Text style={[s.btnText, danger && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const ink = '#141414';
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF6E3' },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  card: {
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: ink,
    padding: 14,
    gap: 8,
    shadowColor: ink,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 0,
  },
  cardTitle: { fontFamily: 'Baloo2_800ExtraBold', fontSize: 18, color: ink },
  body: { fontFamily: 'Nunito_600SemiBold', fontSize: 14, color: ink, flexShrink: 1 },
  dim: { fontFamily: 'Nunito_600SemiBold', fontSize: 13, color: '#666' },
  mono: { fontFamily: 'monospace', fontSize: 11, color: ink },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  badge: { color: '#fff', fontFamily: 'Baloo2_800ExtraBold', paddingHorizontal: 8, borderWidth: 2, borderColor: ink },
  kvBlock: { borderTopWidth: 1, borderColor: '#ddd', paddingTop: 6 },
  kvTitle: { fontFamily: 'Baloo2_700Bold', fontSize: 15, color: ink },
  disc: { borderTopWidth: 1, borderColor: '#eee', paddingVertical: 4 },
  btn: { borderWidth: 3, borderColor: ink, backgroundColor: '#FFC72C', paddingVertical: 10, alignItems: 'center' },
  btnDanger: { backgroundColor: '#E63946' },
  btnPressed: { transform: [{ translateX: 2 }, { translateY: 2 }] },
  btnText: { fontFamily: 'Baloo2_800ExtraBold', fontSize: 15, color: ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: '#FFF6E3', borderWidth: 3, borderColor: ink, padding: 18, gap: 10 },
});
