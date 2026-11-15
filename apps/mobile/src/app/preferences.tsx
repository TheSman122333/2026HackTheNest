import { Redirect } from 'expo-router';

import { PreferenceQuestionnaire } from '@/features/preferences/PreferenceQuestionnaire';
import { useSession } from '@/state/session';

export default function PreferencesScreen() {
  const { token, me } = useSession();
  if (!token || !me) return <Redirect href="/welcome" />;
  return <PreferenceQuestionnaire key={me.user.id} user={me.user} />;
}
