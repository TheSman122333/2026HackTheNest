/** Router gate: no login → welcome, no crew → crew setup, else the game. */
import { Redirect } from 'expo-router';

import { useSession } from '@/state/session';
import { usePendingInvite } from '@/features/invites/pending';

export default function Index() {
  const { token, me } = useSession();
  const invite = usePendingInvite((state) => state.code);
  if (!token || !me) return <Redirect href="/welcome" />;
  if (!me.user.avatarId) return <Redirect href={{ pathname: '/avatar', params: { onboarding: '1' } }} />;
  if (!me.user.preferences) return <Redirect href="/preferences" />;
  if (invite) return <Redirect href="/join" />;
  if (!me.crew) return <Redirect href="/crew-setup" />;
  return <Redirect href="/ship" />;
}
