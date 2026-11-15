/**
 * SSOJet lands here: https://<site>/auth/callback on web, lastvoyage://auth/callback on Android
 * (via the server bridge). Finishes the sign-in, even if it started in another tab/app.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Btn, C, P, Panel, Screen } from '@/components/kit';
import { completeSsojet, relayWebCallback } from '@/features/auth/ssojet';
import { loadToken } from '@/lib/api';
import { useSession } from '@/state/session';
import { useT } from '@/features/language/i18n';

export default function AuthCallback() {
  const tx = useT();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // A sign-in started on our main site may land on the trusted relay address: hand it back.
    relayWebCallback(typeof globalThis.location === 'undefined' ? '' : globalThis.location.search)
      .then((relayed) => (relayed ? new Promise<never>(() => {}) : completeSsojet({ code: params.code, state: params.state, error: params.error })))
      .then(async () => {
        // Signed in here, or already signed in by the other path: either way, refresh and go.
        if (await loadToken()) {
          useSession.setState({ token: await loadToken() });
          await useSession.getState().refresh();
        }
        if (alive) router.replace('/');
      })
      .catch((e: unknown) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [params.code, params.state, params.error]);

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        {err ? (
          <Panel color={C.red}>
            <P>{tx('Couldn’t board: {error}', { error: err })}</P>
            <Btn small label="Back to sign in" color={C.cloud} onPress={() => router.replace('/welcome')} />
          </Panel>
        ) : (
          <>
            <ActivityIndicator color={C.cloud} size="large" />
            <P>Boarding the ship…</P>
          </>
        )}
      </View>
    </Screen>
  );
}
