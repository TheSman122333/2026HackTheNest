import { Redirect, Tabs, usePathname } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F } from '@/components/kit';
import { Sprite, type SpriteName } from '@/components/sprites';
import { useDeviceSync } from '@/features/sync/deviceSync';
import { useSession } from '@/state/session';
import { Float } from '@/ui/motion';
import { useNarrator, type NarrationScene } from '@/features/narrator/useNarrator';

const icon = (name: SpriteName) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <View style={{ alignItems: 'center', gap: 4 }}>
      <Float amplitude={focused ? 1.5 : 0} duration={2500}>
        <Sprite name={name} size={24} style={{ opacity: focused ? 1 : 0.45 }} />
      </Float>
      <View style={{ width: focused ? 12 : 3, height: 2, borderRadius: 1, backgroundColor: focused ? C.gold : 'transparent' }} />
    </View>;
  };

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const repeatStory = (scene: NarrationScene) => ({ tabPress: () => {
    if (pathname === `/${scene}`) useNarrator.getState().narrate(scene);
  } });
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
        tabBarStyle: { backgroundColor: C.navy, borderTopWidth: 1, borderTopColor: '#29414B', height: 66 + Math.max(insets.bottom, 10), paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10), elevation: 0 },
        tabBarLabelStyle: { fontFamily: F.bodyBold, fontSize: 10, letterSpacing: 0.5, marginTop: 3 },
      }}
    >
      <Tabs.Screen name="ship" listeners={repeatStory('ship')} options={{ title: 'Ship', tabBarIcon: icon('t_anchor') }} />
      <Tabs.Screen name="island" listeners={repeatStory('island')} options={{ title: 'Island', tabBarIcon: icon('t_flag') }} />
      <Tabs.Screen name="quests" listeners={repeatStory('quests')} options={{ title: 'Quests', tabBarIcon: icon('t_star') }} />
      <Tabs.Screen name="log" listeners={repeatStory('log')} options={{ title: 'Log', tabBarIcon: icon('t_book') }} />
      <Tabs.Screen name="me" listeners={repeatStory('me')} options={{ title: 'Me', tabBarIcon: icon('t_heart') }} />
    </Tabs>
  );
}
