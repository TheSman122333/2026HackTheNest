import { LocalizedTextInput as TextInput } from '@/features/language/LocalizedControls';
/** Find a crew: start one (get an invite code) or join a friend's. */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Btn, C, F, H, P, Panel, Row, Screen, Title } from '@/components/kit';
import { Sprite } from '@/components/sprites';
import { api } from '@/lib/api';
import { useSession } from '@/state/session';
import { Float } from '@/ui/motion';

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
      <Row style={{ justifyContent: 'center' }}>
        <Float amplitude={3} duration={3400} tilt={2}><Sprite name="a4" size={72} /></Float>
        <Float amplitude={5} duration={4100} tilt={-2}><Sprite name="a2" size={88} /></Float>
        <Float amplitude={3} duration={3600} tilt={2}><Sprite name="a8" size={72} /></Float>
      </Row>
      <Title>Find your crew</Title>
      <P>Your crew is your friends. You share one ship, one island and one boss.</P>
      <Panel>
        <H>Start a crew</H>
        <TextInput value={crewName} onChangeText={setCrewName} placeholder="Crew name" placeholderTextColor={C.dimDark} style={s.input} maxLength={40} />
        <Btn label="Create crew" onPress={() => run('create')} busy={busy === 'create'} disabled={!crewName.trim()} />
      </Panel>
      <Panel color={C.deep}>
        <H>Join a friend</H>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="6-letter code"
          placeholderTextColor={C.dimDark}
          style={s.input}
          autoCapitalize="characters"
          maxLength={6}
        />
        <Btn label="Join crew" color={C.sky} onPress={() => run('join')} busy={busy === 'join'} disabled={code.trim().length !== 6} />
      </Panel>
      {err ? (
        <Panel color={C.red}>
          <P>{err}</P>
        </Panel>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  input: { borderWidth: 1, borderColor: '#D8D3C8', borderRadius: 10, padding: 14, minHeight: 52, fontFamily: F.body, fontSize: 16, backgroundColor: C.cloud, color: C.ink },
});
