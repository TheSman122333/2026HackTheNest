import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F } from '@/components/kit';
import { Sprite, type SpriteName } from '@/components/sprites';
import { useDeviceSync } from '@/features/sync/deviceSync';
import { usePendingInvite } from '@/features/invites/pending';
import { useSession } from '@/state/session';
import { Float } from '@/ui/motion';

const icon = (name: SpriteName) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Float amplitude={focused ? 2 : 0} duration={2500}>
      <Sprite name={name} size={focused ? 32 : 28} style={{ opacity: focused ? 1 : 0.7 }} />
    </Float>;
  };

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { token, me } = useSession();
  const invite = usePendingInvite((state) => state.code);
  useDeviceSync();
  if (!token || !me) return <Redirect href="/welcome" />;
  if (!me.user.avatarId) return <Redirect href={{ pathname: '/avatar', params: { onboarding: '1' } }} />;
  if (!me.user.preferences) return <Redirect href="/preferences" />;
  if (invite) return <Redirect href="/join" />;
  if (!me.crew) return <Redirect href="/crew-setup" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Parchment strip with an ink edge; the active tab gets a red label and a brush underline.
        tabBarActiveTintColor: C.red,
        tabBarInactiveTintColor: C.ink,
        tabBarStyle: { backgroundColor: C.paper, borderTopWidth: 3, borderTopColor: C.ink, height: 74 + Math.max(insets.bottom, 10), paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), elevation: 0 },
        tabBarLabelStyle: { fontFamily: F.ui, fontSize: 15, lineHeight: 19, marginTop: 2 },
        tabBarActiveBackgroundColor: '#F9E7B8',
        tabBarItemStyle: { borderRadius: 10, marginHorizontal: 2 },
      }}
    >
      <Tabs.Screen name="ship" options={{ title: 'Ship', tabBarIcon: icon('t_anchor') }} />
      <Tabs.Screen name="quests" options={{ title: 'Quests', tabBarIcon: icon('compass') }} />
      <Tabs.Screen name="island" options={{ title: 'Island', tabBarIcon: icon('map') }} />
      <Tabs.Screen name="log" options={{ title: 'Log', tabBarIcon: icon('journal') }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('t_heart') }} />
    </Tabs>
  );
}
