/** SSOJet redirects here (lastvoyage://auth/callback). The sign-in promise finishes the job. */
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { C, P, Screen } from '@/components/kit';

export default function AuthCallback() {
  useEffect(() => {
    // If nothing navigates us away (e.g. app was cold-started by the link), go home.
    const t = setTimeout(() => router.replace('/'), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={C.cloud} size="large" />
        <P>Boarding the ship…</P>
      </View>
    </Screen>
  );
}
