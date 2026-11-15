import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { C } from '@/components/kit';
import { useApplySurfaceRules } from '@/features/scroll/useScrollSentinel';
import { useSession } from '@/state/session';
import { MotionProvider } from '@/ui/motion';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    VoyageSerif: require('../../assets/fonts/VoyageSerif.ttf'),
    VoyageSans: require('../../assets/fonts/VoyageSans.ttf'),
    VoyageSansMedium: require('../../assets/fonts/VoyageSansMedium.ttf'),
    VoyageSansBold: require('../../assets/fonts/VoyageSansBold.ttf'),
  });
  const ready = useSession((s) => s.ready);
  useApplySurfaceRules();

  useEffect(() => {
    useSession.getState().boot();
  }, []);

  useEffect(() => {
    if ((loaded || error) && ready) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error, ready]);

  if ((!loaded && !error) || !ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MotionProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.navy } }}>
          <Stack.Screen name="auth/callback" />
          <Stack.Screen name="fight" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="dev/scroll-lab" options={{ headerShown: true, title: 'Scroll Lab', headerStyle: { backgroundColor: C.navy }, headerTintColor: C.cloud }} />
        </Stack>
      </MotionProvider>
    </GestureHandlerRootView>
  );
}
