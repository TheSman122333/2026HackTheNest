import { LocalizedText as Text } from '@/features/language/LocalizedText';
/** The Lodestar ceremony: the star rises and the one ship with the most Honor is crowned. */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, View } from 'react-native';

import { Btn, C, F, P, Row, Screen, Title } from '@/components/kit';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Sprite } from '@/components/sprites';
import { useT } from '@/features/language/i18n';
import { useLanguage } from '@/state/language';
import { api } from '@/lib/api';
import type { LegendBoard } from '@/lib/types';
import { useMotionEnabled } from '@/ui/motion';

export default function Lodestar() {
  const tx = useT();
  const language = useLanguage((state) => state.language);
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
  const crew = winner?.members.slice(0, 6) ?? [];
  return (
    <Screen scroll={false}>
      <View style={s.wrap}>
        {!board && !error ? <ActivityIndicator color={C.gold} size="large" /> : null}
        {error ? <P color={C.red}>{error}</P> : null}
        {board ? (
          <>
            <Animated.View style={{ opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [160, 0] }) }, { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
              <Sprite name="t_star" size={110} />
            </Animated.View>
            <Text style={s.eyebrow}>{tx('THE ONE LODESTAR · {year}', { year: (season?.year ?? new Date().getFullYear()).toLocaleString(language, { useGrouping: false }) })}</Text>
            <Title size={38}>The Lodestar</Title>
            {winner ? (
              <>
                <Animated.Text style={[s.crown, { opacity: crown, transform: [{ translateY: crown.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }] }]}>👑</Animated.Text>
                <Title size={30} translatable={false}>{winner.isYours ? tx('Your ship claimed it!') : tx('The {crew}', { crew: winner.crewName })}</Title>
                <Row gap={6} style={{ justifyContent: 'center' }}>
                  {crew.map((m) => <PlayerAvatar key={m.id} userId={m.id} avatarId={m.avatarId} size={52} />)}
                </Row>
                <P center>
                  {tx(winner.isYours
                    ? 'With {honor} Honor, the greatest ship of {ships} in the Tidewake. There is only one Lodestar, and your crew holds it: the legendary ship form, and an island named in your honor.'
                    : 'With {honor} Honor, the greatest ship of {ships} in the Tidewake. There is only one Lodestar, and their crew holds it: the legendary ship form, and an island named in their honor.',
                  { honor: winner.honor.toLocaleString(language), ships: season!.ships.toLocaleString(language) })}
                </P>
              </>
            ) : (
              <P center>No ship has earned Honor yet. The star waits for the boldest crew.</P>
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
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 8 },
  eyebrow: { fontFamily: F.bodyBold, color: C.gold, fontSize: 10, letterSpacing: 1.8, textAlign: 'center' },
  crown: { fontSize: 44, marginBottom: -6 },
});
