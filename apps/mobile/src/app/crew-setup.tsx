/** Find a crew: start one (get an invite code) or join a friend's. */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Btn, C, F, H, P, Panel, Screen, Title } from '@/components/kit';
import { api } from '@/lib/api';
import { useSession } from '@/state/session';

export default function CrewSetup() {
  const refresh = useSession((s) => s.refresh);
  const [crewName, setCrewName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (kind: 'create' | 'join') => {
    setBusy(kind);
    setErr(null);
    try {
      if (kind === 'create') await api('POST', '/crews', { name: crewName.trim() });
      else await api('POST', '/crews/join', { code: code.trim() });
      await refresh();
      router.replace('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Title>FIND A CREW</Title>
      <P>Your crew is your friends. You share one ship, one island and one boss.</P>
      <Panel>
        <H>Start a crew</H>
        <TextInput value={crewName} onChangeText={setCrewName} placeholder="Crew name" placeholderTextColor={C.dim} style={s.input} maxLength={40} />
        <Btn label="Create crew" onPress={() => run('create')} busy={busy === 'create'} disabled={!crewName.trim()} />
      </Panel>
      <Panel>
        <H>Join a friend</H>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="6-letter code"
          placeholderTextColor={C.dim}
          style={s.input}
          autoCapitalize="characters"
          maxLength={6}
        />
        <Btn label="Join crew" color={C.seaLight} onPress={() => run('join')} busy={busy === 'join'} disabled={code.trim().length !== 6} />
      </Panel>
      {err ? <P dim>{err}</P> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  input: { borderWidth: 3, borderColor: C.ink, padding: 12, fontFamily: F.ui, fontSize: 18, backgroundColor: C.paper, color: C.ink },
});
