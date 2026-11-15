/** Sign in: SSOJet (real accounts, resumes your voyage) or a dev quick-join fallback. */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

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

      {/* Boarding pass: SSOJet sign-in */}
      <View style={s.pass}>
        <View style={s.passTop}>
          <View>
            <Text style={s.passKicker}>BOARDING PASS</Text>
            <Text style={s.passTitle}>THE LAST VOYAGE</Text>
          </View>
          <Sprite name="t_anchor" size={48} />
        </View>
        <View style={s.passFields}>
          <PassField label="DEPARTS" value="Real life" />
          <PassField label="DESTINATION" value="Your crew's island" />
          <PassField label="SEAT" value="Captain" />
        </View>
        <View style={s.perforation}>
          <View style={[s.notch, { left: -14 }]} />
          <View style={s.dash} />
          <View style={[s.notch, { right: -14 }]} />
        </View>
        <View style={s.passBottom}>
          <Btn
            label={ssojetConfigured ? 'Board with SSOJet' : 'SSOJet (not set up in this build)'}
            icon={<Sprite name="key" size={26} />}
            color={C.orange}
            onPress={() => run('sso')}
            busy={busy === 'sso'}
            disabled={!ssojetConfigured || busy !== null}
          />
          <Text style={s.passFine}>🔒 Secured by SSOJet · your crew, island and streak follow your account</Text>
        </View>
      </View>

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

function PassField({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pass: {
    backgroundColor: C.cloud,
    borderWidth: 3,
    borderColor: C.ink,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  passTop: {
    backgroundColor: C.sky,
    borderBottomWidth: 3,
    borderColor: C.ink,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  passKicker: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 3, color: C.navy },
  passTitle: { fontFamily: F.title, fontSize: 30, letterSpacing: 1.5, color: C.white, textShadowColor: C.ink, textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
  passFields: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  fieldLabel: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 1.5, color: C.dimDark },
  fieldValue: { fontFamily: F.ui, fontSize: 15, color: C.navy },
  perforation: { height: 28, justifyContent: 'center' },
  dash: { marginHorizontal: 18, borderTopWidth: 3, borderStyle: 'dashed', borderColor: C.peri },
  notch: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: C.navy, borderWidth: 3, borderColor: C.ink },
  passBottom: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  passFine: { fontFamily: F.bodyBold, fontSize: 11, color: C.dimDark, textAlign: 'center' },
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
