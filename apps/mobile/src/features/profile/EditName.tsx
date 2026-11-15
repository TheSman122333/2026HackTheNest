/** Your name on the Me screen, with a pencil to change it in place. */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Btn, C, F, P, Row, Title } from '@/components/kit';
import { api } from '@/lib/api';
import { useSession } from '@/state/session';

export function EditName() {
  const name = useSession((s) => s.me?.user.name ?? '');
  const refresh = useSession((s) => s.refresh);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = draft.trim().replace(/\s+/g, ' ');
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('PUT', '/me/name', { name: clean });
      await refresh();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <Row gap={8} style={{ flexWrap: 'nowrap' }}>
        <View style={{ flexShrink: 1 }}><Title>{name}</Title></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit your name" hitSlop={10} onPress={() => { setDraft(name); setEditing(true); }} style={s.pencil}>
          <Text style={s.pencilText}>✎</Text>
        </Pressable>
      </Row>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <TextInput value={draft} onChangeText={setDraft} autoFocus maxLength={32} placeholder="Your pirate name" placeholderTextColor={C.dimDark}
        accessibilityLabel="Your name" returnKeyType="done" onSubmitEditing={() => clean && save()} style={s.input} />
      {error ? <P color={C.red}>{error}</P> : null}
      <Row>
        <Btn small label="Save" color={C.gold} busy={busy} disabled={!clean || clean === name} onPress={save} />
        <Btn small label="Cancel" color={C.cloud} onPress={() => { setEditing(false); setError(null); }} />
      </Row>
    </View>
  );
}

const s = StyleSheet.create({
  pencil: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  pencilText: { fontFamily: F.ui, fontSize: 16, color: C.gold },
  input: { borderWidth: 1, borderColor: '#D8D3C8', borderRadius: 10, padding: 12, minHeight: 50, fontFamily: F.bodyBold, fontSize: 20, backgroundColor: C.cloud, color: C.ink },
});
