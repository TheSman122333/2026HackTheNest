/** Sign in: SSOJet (real accounts, resumes your voyage) or a dev quick-join fallback. */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Btn, C, F, P, Panel, Row, Screen, Title } from '@/components/kit';
import { Sprite } from '@/components/sprites';
import { ssojetConfigured } from '@/features/auth/ssojet';
import { useSession } from '@/state/session';

export default function Welcome() {
  const login = useSession((s) => s.login);
  const ssoLogin = useSession((s) => s.ssoLogin);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'sso' | 'dev' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (kind: 'sso' | 'dev') => {
    setBusy(kind);
    setErr(null);
    try {
      if (kind === 'sso') {
        if (!(await ssoLogin())) return;
      } else {
        await login(name.trim());
      }
      router.replace('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View style={s.hero}>
        <Row gap={0} style={{ justifyContent: 'center' }}>
          <Sprite name="b_angler" size={84} style={{ transform: [{ rotate: '-8deg' }] }} />
          <Sprite name="b_crab" size={120} />
          <Sprite name="b_serpent" size={84} style={{ transform: [{ rotate: '8deg' }] }} />
        </Row>
        <Title size={56}>THE LAST VOYAGE</Title>
        <P center>Real life fills your sails. Walk, read, see friends and put the phone down, and your crew sails further.</P>
      </View>

      <Panel>
        <Btn
          label={ssojetConfigured ? 'Sign in with SSOJet' : 'SSOJet (not set up in this build)'}
          icon={<Sprite name="t_anchor" size={26} />}
          color={C.sky}
          onPress={() => run('sso')}
          busy={busy === 'sso'}
          disabled={!ssojetConfigured || busy !== null}
        />
        <P dim center>Your crew, island and streak follow your account.</P>
      </Panel>

      <Panel color={C.indigo}>
        <P>Quick join (offline / dev)</P>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Pirate name"
          placeholderTextColor={C.dimDark}
          style={s.input}
          maxLength={32}
        />
        <Btn label="Set sail" onPress={() => run('dev')} busy={busy === 'dev'} disabled={!name.trim() || busy !== null} />
      </Panel>
      {err ? (
        <Panel color={C.red}>
          <P>Couldn&apos;t board: {err}</P>
        </Panel>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6, paddingTop: 12 },
  input: {
    borderWidth: 3,
    borderColor: C.ink,
    borderRadius: 12,
    padding: 12,
    fontFamily: F.ui,
    fontSize: 18,
    backgroundColor: C.cloud,
    color: C.ink,
  },
});
