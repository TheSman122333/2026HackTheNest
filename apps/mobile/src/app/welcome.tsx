/** Sign in. Dev login (name only) for now; SSOJet replaces this later. */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Btn, C, F, P, Panel, Screen, Title } from '@/components/kit';
import { useSession } from '@/state/session';

export default function Welcome() {
  const login = useSession((s) => s.login);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await login(name.trim());
      router.replace('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 20 }}>
        <Title size={52}>THE LAST VOYAGE</Title>
        <P>Real life fills your sails. Walk, read, see friends, put the phone down, and your crew sails further.</P>
        <Panel>
          <P>What should your crew call you?</P>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Pirate name"
            placeholderTextColor={C.dim}
            style={s.input}
            maxLength={32}
            autoFocus
          />
          <Btn label="Set sail" onPress={go} busy={busy} disabled={!name.trim()} />
          {err ? <P dim>Couldn&apos;t reach the ship: {err}. Is the server running?</P> : null}
        </Panel>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  input: { borderWidth: 3, borderColor: C.ink, padding: 12, fontFamily: F.ui, fontSize: 18, backgroundColor: C.paper, color: C.ink },
});
