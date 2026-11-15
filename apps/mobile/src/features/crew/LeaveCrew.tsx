import { LocalizedTextInput as TextInput } from '@/features/language/LocalizedControls';
/**
 * Leave your crew to sail with another. Typing the crew's name unlocks the button, so nobody
 * leaves by accident. Nothing is lost: Legend, skills and your pirate come with you.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Btn, C, F, H, P, Panel } from '@/components/kit';
import { api } from '@/lib/api';
import { useSession } from '@/state/session';
import { useT } from '@/features/language/i18n';

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function LeaveCrew() {
  const tx = useT();
  const crew = useSession((s) => s.me?.crew);
  const refresh = useSession((s) => s.refresh);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!crew) return null;

  const matches = norm(typed) === norm(crew.name);
  const leave = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/crew/leave', { confirmName: typed });
      await refresh();
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (!open) {
    return <Btn small label="Leave this crew" color={C.cloud} onPress={() => setOpen(true)} />;
  }
  return (
    <Panel>
      <H translatable={false}>{tx('Leave {crew}?', { crew: crew.name })}</H>
      <P>You keep your Legend, skills and pirate. The crew keeps its stores and island, and you can come back any time with the invite code.</P>
      <P dim>Type the crew name to confirm.</P>
      <TextInput
        value={typed}
        onChangeText={setTyped}
        placeholder={crew.name}
        translatePlaceholder={false}
        placeholderTextColor={C.dimDark}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={80}
        accessibilityLabel={tx('Type {crew} to confirm leaving', { crew: crew.name })}
        style={s.input}
      />
      {error ? <P color={C.red}>{error}</P> : null}
      <Btn label="Leave crew" color={C.red} disabled={!matches} busy={busy} onPress={leave} />
      <Btn small label="Stay aboard" color={C.cloud} onPress={() => { setOpen(false); setTyped(''); setError(null); }} />
    </Panel>
  );
}

const s = StyleSheet.create({
  input: { borderWidth: 1, borderColor: '#D8D3C8', borderRadius: 10, padding: 14, minHeight: 52, fontFamily: F.body, fontSize: 16, backgroundColor: C.cloud, color: C.ink },
});
