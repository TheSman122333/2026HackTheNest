/** Sign in: SSOJet (real accounts, resumes your voyage) or a dev quick-join fallback. */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Btn, C, F, P, Panel, Screen } from '@/components/kit';
import { Sprite } from '@/components/sprites';
import { ssojetConfigured } from '@/features/auth/ssojet';
import { useSession } from '@/state/session';
import { Float } from '@/ui/motion';

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
        <Float amplitude={5} duration={3800} tilt={3}>
          <View style={s.emblem}><Sprite name="compass" size={88} /></View>
        </Float>
        <Text style={s.kicker}>A LIFE WELL LIVED. A VOYAGE WELL EARNED.</Text>
        <Text accessibilityRole="header" style={s.wordmark}>The Last Voyage</Text>
        <P center dim>Real life fills your sails. Walk, read, see friends. Every day takes your crew a little further.</P>
      </View>

      {/* Boarding pass: SSOJet sign-in */}
      <View style={s.pass}>
        <View style={s.passTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.passKicker}>BOARDING PASS</Text>
            <Text style={s.passTitle}>Your adventure awaits</Text>
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
            label={ssojetConfigured ? 'Board with SSOJet' : 'Account sign-in unavailable'}
            icon={<Sprite name="key" size={26} />}
            color={C.orange}
            onPress={() => run('sso')}
            busy={busy === 'sso'}
            disabled={!ssojetConfigured || busy !== null}
          />
          <Text style={s.passFine}>Secured by SSOJet · your voyage follows your account</Text>
        </View>
      </View>

      <Panel color={C.deep}>
        <P>Quick boarding</P>
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
    borderWidth: 1,
    borderColor: '#D8D3C8',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
  passTop: {
    backgroundColor: C.cloud,
    borderBottomWidth: 1,
    borderColor: '#D8D3C8',
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  passKicker: { fontFamily: F.bodyBold, fontSize: 10, letterSpacing: 2.5, color: C.dimDark },
  passTitle: { fontFamily: F.title, fontSize: 28, color: C.ink },
  passFields: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  fieldLabel: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 1.5, color: C.dimDark },
  fieldValue: { fontFamily: F.ui, fontSize: 15, color: C.navy },
  perforation: { height: 28, justifyContent: 'center' },
  dash: { marginHorizontal: 18, borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#C8C2B7' },
  notch: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: C.navy },
  passBottom: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  passFine: { fontFamily: F.bodyBold, fontSize: 11, color: C.dimDark, textAlign: 'center' },
  hero: { alignItems: 'center', gap: 12, paddingTop: 14, paddingBottom: 12 },
  wordmark: { fontFamily: F.title, fontSize: 44, color: C.cloud, textAlign: 'center' },
  emblem: { width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: '#37505A', alignItems: 'center', justifyContent: 'center', backgroundColor: C.deep },
  kicker: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 1.5, color: C.gold, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#D8D3C8',
    borderRadius: 12,
    padding: 12,
    fontFamily: F.body,
    fontSize: 16,
    minHeight: 52,
    backgroundColor: C.cloud,
    color: C.ink,
  },
});
