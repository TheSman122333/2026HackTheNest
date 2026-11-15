import { LocalizedText as Text } from '@/features/language/LocalizedText';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { Btn, C, F, H, P, Panel, Screen, Title } from '@/components/kit';
import { InviteQr } from '@/features/invites/InviteQr';
import { crewInviteLink } from '@/features/invites/links';
import { useT } from '@/features/language/i18n';
import { useSession } from '@/state/session';

export default function InviteScreen() {
  const tx = useT();
  const me = useSession((state) => state.me);
  const [error, setError] = useState<string | null>(null);
  if (!me) return <Redirect href="/welcome" />;
  if (!me.crew) return <Redirect href="/crew-setup" />;
  const crew = me.crew;
  const link = crewInviteLink(crew.inviteCode);
  const share = async () => {
    setError(null);
    try {
      const message = tx('Join {crew} on The Last Voyage. Your crew invite code is {code}. {link}', { crew: crew.name, code: crew.inviteCode, link });
      if (Platform.OS === 'web' && globalThis.navigator?.share) {
        await globalThis.navigator.share({ title: tx('Join {crew}', { crew: crew.name }), text: tx('Your invite code is {code}.', { code: crew.inviteCode }), url: link });
      } else if (Platform.OS === 'web' && globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(message);
        setError('Invite copied. Send it to your friends to bring them aboard.');
      } else await Share.share({ title: tx('Join {crew}', { crew: crew.name }), message });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setError('Sharing is unavailable here. You can copy the link or six-character code below.');
    }
  };
  return <Screen>
    <Btn small label="Back to ship" color={C.deep} onPress={() => router.replace('/ship')} />
    <Title>Bring your crew aboard</Title>
    <P>Share one voyage with your friends. They can scan this QR code with their phone camera.</P>
    <Panel style={{ alignItems: 'center', gap: 16 }}>
      <H translatable={false}>{crew.name}</H>
      <View style={s.qrFrame}><InviteQr value={link} /></View>
      <Text translatable={false} selectable accessibilityLabel={tx('Crew invite code {code}', { code: crew.inviteCode.split('').join(' ') })} style={s.code}>{crew.inviteCode}</Text>
      <P dim center>Already have the app? Enter this code in Join a friend.</P>
    </Panel>
    <Btn label="Share crew invite" onPress={share} />
    {error ? <Panel><P>{error}</P></Panel> : null}
    <Panel>
      <H>Your invitation link</H>
      <Text translatable={false} selectable style={s.link}>{link}</Text>
      <P dim>Your friends sign in with SSOJet, choose their quest preferences, and confirm joining your crew.</P>
      {link.startsWith('lastvoyage:') ? <P dim>This link opens the installed app. Friends can also open your game website and enter the code.</P> : null}
    </Panel>
  </Screen>;
}

const s = StyleSheet.create({
  qrFrame: { backgroundColor: '#FFFFFF', padding: 6, borderRadius: 12 },
  code: { fontFamily: F.ui, fontSize: 31, letterSpacing: 5, color: C.ink, textAlign: 'center' },
  link: { fontFamily: F.body, fontSize: 14, color: C.indigo, lineHeight: 22 },
});
