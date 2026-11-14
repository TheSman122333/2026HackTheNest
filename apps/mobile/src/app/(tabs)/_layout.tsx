import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';

import { C, F } from '@/components/kit';
import { useDeviceSync } from '@/features/sync/deviceSync';
import { useSession } from '@/state/session';

const icon = (glyph: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.6 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const { token, me } = useSession();
  useDeviceSync();
  if (!token || !me) return <Redirect href="/welcome" />;
  if (!me.crew) return <Redirect href="/crew-setup" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.ink,
        tabBarInactiveTintColor: C.dim,
        tabBarStyle: { backgroundColor: C.paper, borderTopWidth: 3, borderTopColor: C.ink, height: 64 },
        tabBarLabelStyle: { fontFamily: F.uiBold, fontSize: 12 },
      }}
    >
      <Tabs.Screen name="ship" options={{ title: 'Ship', tabBarIcon: icon('⛵') }} />
      <Tabs.Screen name="island" options={{ title: 'Island', tabBarIcon: icon('🏝️') }} />
      <Tabs.Screen name="quests" options={{ title: 'Quests', tabBarIcon: icon('📜') }} />
      <Tabs.Screen name="log" options={{ title: 'Log', tabBarIcon: icon('📖') }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('🧭') }} />
    </Tabs>
  );
}
