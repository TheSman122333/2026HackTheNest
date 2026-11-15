/** The Lodestar ceremony: the star rises and the year's top Legend pirate is crowned. */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { Btn, C, F, P, Screen, Title } from '@/components/kit';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Sprite } from '@/components/sprites';
import { api } from '@/lib/api';
import type { LegendBoard } from '@/lib/types';
import { useMotionEnabled } from '@/ui/motion';

export default function Lodestar() {
  const motion = useMotionEnabled();
  const [board, setBoard] = useState<LegendBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rise] = useState(() => new Animated.Value(0));
  const [crown] = useState(() => new Animated.Value(0));

  useEffect(() => {
    api<LegendBoard>('GET', '/legend').then(setBoard).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!board) return;
    const d = motion ? 1 : 0;
    Animated.sequence([
      Animated.timing(rise, { toValue: 1, duration: 1800 * d, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(crown, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
  }, [board, motion, rise, crown]);

  const season = board?.lodestar;
  const winner = season?.winner;
  return (
    <Screen scroll={false}>
      <View style={s.wrap}>
        {!board && !error ? <ActivityIndicator color={C.gold} size="large" /> : null}
        {error ? <P color={C.red}>{error}</P> : null}
        {board ? (
          <>
            <Animated.View style={{ opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [160, 0] }) }, { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
              <Sprite name="t_star" size={120} />
            </Animated.View>
            <Text style={s.eyebrow}>THE YEAR&apos;S VOYAGE IS COMPLETE · {season?.year ?? new Date().getFullYear()}</Text>
            <Title size={40}>The Lodestar</Title>
            {winner ? (
              <>
                <View style={{ alignItems: 'center' }}>
                  <Animated.Text style={[s.crown, { opacity: crown, transform: [{ translateY: crown.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }] }]}>👑</Animated.Text>
                  <PlayerAvatar userId={winner.id} avatarId={winner.avatarId} size={120} />
                </View>
                <Title size={30}>{winner.isYou ? 'You claimed it!' : winner.name}</Title>
                <P center>
                  {winner.isYou ? 'With' : `${winner.crewName ? `Of ${winner.crewName}, with` : 'With'}`} {winner.legend} Legend, the greatest pirate among {season!.players} sailors. {winner.isYou ? 'Your' : 'Their'} crew earns the legendary ship, and next year&apos;s sea will carry an island in {winner.isYou ? 'your' : 'their'} name.
                </P>
              </>
            ) : (
              <P center>No pirate earned Legend this year. The star waits for whoever lives boldest next year.</P>
            )}
            <P dim center>Go live. The sea will wait.</P>
            <Btn label="Back to the voyage" color={C.gold} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 8 },
  eyebrow: { fontFamily: F.bodyBold, color: C.gold, fontSize: 10, letterSpacing: 1.8, textAlign: 'center' },
  crown: { fontSize: 48, marginBottom: -14, zIndex: 2 },
});
