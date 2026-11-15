/** Ship's log: everything that happened to you and your crew. */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C, P, Panel, Title } from '@/components/kit';
import { ITEM_SPRITE, Sprite } from '@/components/sprites';
import { api } from '@/lib/api';
import type { LogEntry } from '@/lib/types';

const GLYPH: Record<string, string> = {
  supplies: '📦',
  timber: '🪵',
  iron: '⛓️',
  spice: '🌶️',
  shard: '💎',
  island: '🚩',
  voyage: '⛵',
  night: '🌙',
  hp: '🌊',
};

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Log() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries((await api<{ entries: LogEntry[] }>('GET', '/log')).entries);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.cloud} />}>
        <Title>SHIP&apos;S LOG</Title>
        {entries.length === 0 ? <P dim>Nothing yet. Log an activity or explore the island!</P> : null}
        {entries.map((e) => (
          <Panel key={e.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            {ITEM_SPRITE[e.item] ? <Sprite name={ITEM_SPRITE[e.item]!} size={30} /> : <P>{GLYPH[e.item] ?? '•'}</P>}
            <View style={{ flex: 1 }}>
              <P>{e.text}</P>
              <P dim>{ago(e.at)}</P>
            </View>
          </Panel>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.navy },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
});
