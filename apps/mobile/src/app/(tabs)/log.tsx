/** Ship's log: everything that happened to you and your crew. */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { C, P, Panel, Screen, Title } from '@/components/kit';
import { ITEM_SPRITE, Sprite, type SpriteName } from '@/components/sprites';
import { api } from '@/lib/api';
import type { LogEntry } from '@/lib/types';

const EVENT_SPRITE: Record<string, SpriteName> = {
  island: 't_flag',
  voyage: 't_anchor',
  night: 'q_sleep',
  hp: 'fx_wave',
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
    <Screen scroll={false} padded={false}>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.cloud} />}>
        <Title>Ship&apos;s log</Title>
        <P dim>Every small effort. Every new horizon.</P>
        {entries.length === 0 ? <P dim>Nothing yet. Log an activity or explore the island!</P> : null}
        {entries.map((e) => (
          <Panel key={e.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Sprite name={ITEM_SPRITE[e.item] ?? EVENT_SPRITE[e.item] ?? 'journal'} size={30} />
            <View style={{ flex: 1 }}>
              <P>{e.text}</P>
              <P dim>{ago(e.at)}</P>
            </View>
          </Panel>
        ))}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: 20, gap: 14, paddingBottom: 32 },
});
