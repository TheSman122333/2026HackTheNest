import { router, useLocalSearchParams } from 'expo-router';

import { Btn, P, Screen, Title } from '@/components/kit';
import { AvatarEditor } from '@/features/avatar/AvatarEditor';
import { useSession } from '@/state/session';

export default function AvatarScreen() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const user = useSession((state) => state.me?.user);
  if (!user) return <Screen><Title>Your pirate awaits</Title><P>Sign in to choose your pirate and add a face photo.</P><Btn label="Return to boarding" onPress={() => router.replace('/welcome')} /></Screen>;
  return <AvatarEditor key={user.id} user={user} onboarding={onboarding === '1' || !user.avatarId} />;
}
