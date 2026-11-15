/** Sign in: SSOJet (real accounts, resumes your voyage) or a dev quick-join fallback. */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { Btn, C, F, P, Panel, Row, Screen, Title } from '@/components/kit';
import { Sprite } from '@/components/sprites';
import { ssojetConfigured } from '@/features/auth/ssojet';
import { useSession } from '@/state/session';

const SEA = '#0D1B2A';
const PARCHMENT = '#F4EBD0';
const BRASS = '#C8963E';

export default function Welcome() {
  const { height } = useWindowDimensions();
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
      <View style={[s.page, { minHeight: height }]}>
        <View style={s.hero}>
          <Row gap={0} style={{ justifyContent: 'center' }}>
            <Sprite name="b_angler" size={84} style={{ transform: [{ rotate: '-8deg' }] }} />
            <Sprite name="b_crab" size={120} />
            <Sprite name="b_serpent" size={84} style={{ transform: [{ rotate: '8deg' }] }} />
          </Row>
          <Text style={s.route}>CHARTERED FOR THE UNCHARTED</Text>
          <Title size={52} color={PARCHMENT}>
            THE LAST VOYAGE
          </Title>
          <P center color={PARCHMENT}>
            Real life fills your sails. Walk, read, see friends and put the phone down, and your crew sails further.
          </P>
        </View>

        <View style={s.pass}>
          <View style={s.passTop}>
            <View>
              <Text style={s.passKicker}>BOARDING PASS · 01</Text>
              <Text style={s.passTitle}>THE LAST VOYAGE</Text>
            </View>
            <View style={s.seal}>
              <Sprite name="t_anchor" size={42} />
            </View>
          </View>
          <View style={s.passFields}>
            <PassField label="DEPARTS" value="Real life" />
            <PassField label="DESTINATION" value="Your crew's island" />
            <PassField label="BERTH" value="Captain" />
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
              color={BRASS}
              onPress={() => run('sso')}
              busy={busy === 'sso'}
              disabled={!ssojetConfigured || busy !== null}
            />
            <Text style={s.passFine}>SECURED BY SSOJET · CREW, ISLAND & STREAK FOLLOW YOUR ACCOUNT</Text>
          </View>
        </View>

        <Panel color={SEA} style={s.devPanel}>
          <Text style={s.devKicker}>AUXILIARY DOCK</Text>
          <P color={PARCHMENT}>Quick join · offline / dev</P>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Pirate name"
            placeholderTextColor="#8D9AA3"
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
      </View>
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
  page: {
    margin: -16,
    padding: 20,
    paddingBottom: 36,
    gap: 18,
    backgroundColor: SEA,
    justifyContent: 'center',
  },
  pass: {
    backgroundColor: PARCHMENT,
    borderWidth: 2,
    borderColor: BRASS,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 8,
  },
  passTop: {
    backgroundColor: SEA,
    borderBottomWidth: 1,
    borderColor: BRASS,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  seal: { width: 58, height: 58, borderWidth: 1, borderColor: BRASS, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  passKicker: { fontFamily: F.bodyBold, fontSize: 10, letterSpacing: 2.5, color: BRASS },
  passTitle: { fontFamily: F.title, fontSize: 29, letterSpacing: 1.5, color: PARCHMENT },
  passFields: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },
  fieldLabel: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 1.3, color: '#746A55' },
  fieldValue: { fontFamily: F.ui, fontSize: 14, color: SEA },
  perforation: { height: 28, justifyContent: 'center' },
  dash: { marginHorizontal: 18, borderTopWidth: 1, borderStyle: 'dashed', borderColor: BRASS },
  notch: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: SEA, borderWidth: 1, borderColor: BRASS },
  passBottom: { paddingHorizontal: 18, paddingBottom: 18, gap: 10 },
  passFine: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 0.65, color: '#746A55', textAlign: 'center' },
  hero: { alignItems: 'center', gap: 8, paddingTop: 8 },
  route: { fontFamily: F.bodyBold, fontSize: 10, letterSpacing: 2.2, color: BRASS, textAlign: 'center' },
  devPanel: { borderColor: BRASS, borderWidth: 1 },
  devKicker: { fontFamily: F.bodyBold, fontSize: 10, letterSpacing: 2, color: BRASS },
  input: {
    borderWidth: 1,
    borderColor: BRASS,
    borderRadius: 12,
    padding: 12,
    fontFamily: F.ui,
    fontSize: 18,
    backgroundColor: PARCHMENT,
    color: SEA,
  },
});
