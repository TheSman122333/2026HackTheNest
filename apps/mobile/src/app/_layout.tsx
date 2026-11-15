import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { C } from '@/components/kit';
import { TidekeeperSubtitles } from '@/features/narrator/TidekeeperSubtitles';
import { OpeningVoyage } from '@/features/opening/OpeningVoyage';
import { usePendingInvite } from '@/features/invites/pending';
import { GameAudioHost } from '@/features/audio/GameAudioHost';
import { useApplySurfaceRules } from '@/features/scroll/useScrollSentinel';
import { useSession } from '@/state/session';
import { MotionProvider } from '@/ui/motion';
import { useGameAudio } from '@/state/gameAudio';
import { useLanguage } from '@/state/language';
import { LanguagePicker } from '@/features/language/LanguagePicker';
import { useT } from '@/features/language/i18n';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const tx = useT();
  const pathname = usePathname();
  const [loaded, error] = useFonts({
    VoyageSerif: require('../../assets/fonts/VoyageSerif.ttf'),
    VoyageSans: require('../../assets/fonts/VoyageSans.ttf'),
    VoyageSansMedium: require('../../assets/fonts/VoyageSansMedium.ttf'),
    VoyageSansBold: require('../../assets/fonts/VoyageSansBold.ttf'),
  });
  const ready = useSession((s) => s.ready);
  const invitesReady = usePendingInvite((s) => s.ready);
  const languageReady = useLanguage((s) => s.ready);
  const languageSelected = useLanguage((s) => s.selected);
  useApplySurfaceRules();

  useEffect(() => {
    void useLanguage.getState().hydrate().then(() => useSession.getState().boot());
    void usePendingInvite.getState().hydrate();
  }, []);

  useEffect(() => {
    if ((loaded || error) && ready && invitesReady && languageReady) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error, ready, invitesReady, languageReady]);

  if ((!loaded && !error) || !ready || !invitesReady || !languageReady) return null;

  if (!languageSelected && !pathname.startsWith('/auth/callback')) return (
    <GestureHandlerRootView style={{ flex: 1 }}><MotionProvider><StatusBar style="light" /><LanguagePicker initial /></MotionProvider></GestureHandlerRootView>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MotionProvider>
        <View style={{ flex: 1 }} onTouchStart={() => useGameAudio.getState().unlock()} onPointerDown={() => useGameAudio.getState().unlock()}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.navy } }}>
            <Stack.Screen name="auth/callback" />
            <Stack.Screen name="fight" options={{ presentation: 'card', animation: 'fade' }} />
            <Stack.Screen name="deck" options={{ presentation: 'card', animation: 'fade' }} />
            <Stack.Screen name="avatar" options={{ presentation: 'card', animation: 'fade' }} />
            <Stack.Screen name="preferences" options={{ presentation: 'card', animation: 'fade' }} />
            <Stack.Screen name="language" options={{ presentation: 'card', animation: 'fade' }} />
            <Stack.Screen name="invite" options={{ presentation: 'card', animation: 'fade' }} />
            <Stack.Screen name="join" options={{ presentation: 'card', animation: 'fade' }} />
            <Stack.Screen name="legend" options={{ presentation: 'card', animation: 'fade' }} />
            <Stack.Screen name="lodestar" options={{ presentation: 'card', animation: 'fade' }} />
            <Stack.Screen name="dev/scroll-lab" options={{ headerShown: true, title: tx('Scroll Lab'), headerStyle: { backgroundColor: C.navy }, headerTintColor: C.cloud }} />
          </Stack>
          <TidekeeperSubtitles />
          <OpeningVoyage />
          <GameAudioHost />
        </View>
      </MotionProvider>
    </GestureHandlerRootView>
  );
}
