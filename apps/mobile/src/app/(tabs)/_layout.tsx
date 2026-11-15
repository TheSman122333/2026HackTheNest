import { Redirect, Tabs } from 'expo-router';

import { C, F } from '@/components/kit';
import { Sprite, type SpriteName } from '@/components/sprites';
import { useDeviceSync } from '@/features/sync/deviceSync';
import { useSession } from '@/state/session';

const icon = (name: SpriteName) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Sprite name={name} size={focused ? 30 : 24} style={{ opacity: focused ? 1 : 0.55 }} />;
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
        tabBarActiveTintColor: C.orange,
        tabBarInactiveTintColor: C.dimLight,
        tabBarStyle: { backgroundColor: C.deep, borderTopWidth: 3, borderTopColor: C.ink, height: 68, paddingTop: 4 },
        tabBarLabelStyle: { fontFamily: F.uiBold, fontSize: 12 },
      }}
    >
      <Tabs.Screen name="ship" options={{ title: 'Ship', tabBarIcon: icon('t_anchor') }} />
      <Tabs.Screen name="island" options={{ title: 'Island', tabBarIcon: icon('t_flag') }} />
      <Tabs.Screen name="quests" options={{ title: 'Quests', tabBarIcon: icon('t_star') }} />
      <Tabs.Screen name="log" options={{ title: 'Log', tabBarIcon: icon('t_book') }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('t_heart') }} />
    </Tabs>
  );
}
