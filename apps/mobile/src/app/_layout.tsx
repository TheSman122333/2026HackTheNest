import { Bangers_400Regular } from '@expo-google-fonts/bangers';
import { Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { Nunito_600SemiBold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useApplySurfaceRules } from '@/features/scroll/useScrollSentinel';
import { useSession } from '@/state/session';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Bangers_400Regular,
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
    Nunito_600SemiBold,
    Nunito_800ExtraBold,
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
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#27187E' } }}>
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="fight" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="dev/scroll-lab" options={{ headerShown: true, title: 'Scroll Lab', headerStyle: { backgroundColor: '#1B1160' }, headerTintColor: '#F1F2F6' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
