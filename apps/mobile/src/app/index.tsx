/** Router gate: no login → welcome, no crew → crew setup, else the game. */
import { Redirect } from 'expo-router';

import { useSession } from '@/state/session';

export default function Index() {
  const { token, me } = useSession();
  if (!token || !me) return <Redirect href="/welcome" />;
  if (!me.crew) return <Redirect href="/crew-setup" />;
  return <Redirect href="/ship" />;
}
