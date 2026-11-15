import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { F } from '@/components/kit';
import { API_BASE } from '@/lib/api';
import { useOpening } from '@/state/opening';
import { useSession } from '@/state/session';
import { useDeviceMotionEnabled } from '@/ui/motion';

// The supplied narration, with the missing opening W restored.
export const OPENING_WORDS = 'Long ago, a star fell into the Tidewake, and every captain who ever lived has chased it. The greatest of them sailed every sea, and before the waves took him, he left one last word: the Lodestar belongs to whoever lives the boldest life. So raise your sails. Your voyage begins today.';

/** Auth callbacks finish behind their own screen; the opening never steals their URL. */
export function OpeningVoyage() {
  const pathname = usePathname();
  const token = useSession((s) => s.token);
  const me = useSession((s) => s.me);
  const { visible, mode, identity, start, deferCallback } = useOpening();
  const authId = token && me ? me.user.id : null;
  const hasCrew = Boolean(me?.crew);
  useEffect(() => {
    if (pathname.startsWith('/auth/callback')) { deferCallback(); return; }
    const key = authId ? `user:${authId}` : 'guest';
    if (identity === key) return;
    start(authId ? 'reveal' : 'storm', key);
    if (authId) router.replace(hasCrew ? '/ship' : '/crew-setup');
  }, [pathname, authId, hasCrew, identity, start, deferCallback]);
  if (!visible) return null;
  if (!mode) return <View style={s.initialCover} />;
  return <OpeningScene key={`${identity}-${mode}`} mode={mode} />;
}

function Cloud({ side, travel, width, pale, y }: { side: number; travel: Animated.Value; width: number; pale: boolean; y: number }) {
  return <Animated.View pointerEvents="none" style={[s.cloudBank, {
    top: y, left: side < 0 ? -width * 0.22 : width * 0.34, width: width * 0.9,
    backgroundColor: pale ? '#DDF1FF' : '#132E4D',
    transform: [{ translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [0, side * width * 1.05] }) }],
  }]}>
    {[0, 1, 2, 3].map((n) => <View key={n} style={[s.cloudPuff, { left: n * width * 0.19, top: -45 - (n % 2) * 34, backgroundColor: pale ? '#DDF1FF' : '#132E4D' }]} />)}
  </Animated.View>;
}

function OpeningScene({ mode }: { mode: 'storm' | 'reveal' }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const motion = useDeviceMotionEnabled();
  const finish = useOpening((s) => s.finish);
  const player = useAudioPlayer(null, { updateInterval: 150 });
  const [parting, setParting] = useState(mode === 'reveal');
  const [voice, setVoice] = useState<'loading' | 'playing' | 'paused' | 'text'>('loading');
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [cover] = useState(() => new Animated.Value(1));
  const [clouds] = useState(() => new Animated.Value(0));
  const [weather] = useState(() => new Animated.Value(0));
  const active = useRef(foreground);
  const ready = useRef(false);
  const begun = useRef(false);
  const ending = useRef(false);
  const depart = useCallback(() => { if (!ending.current) { ending.current = true; player.pause(); setParting(true); } }, [player]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    active.current = foreground;
    if (!foreground) player.pause();
    else if (ready.current && begun.current && !ending.current) player.play();
  }, [foreground, player]);

  useEffect(() => {
    if (!parting || !foreground) return;
    const duration = motion ? (mode === 'reveal' ? 2100 : 1500) : 500;
    const animation = Animated.parallel([
      Animated.timing(clouds, { toValue: 1, duration, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.timing(cover, { toValue: 0, delay: duration * 0.2, duration: duration * 0.8, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => { if (finished) finish(); });
    return () => animation.stop();
  }, [parting, foreground, clouds, cover, finish, mode, motion]);

  useEffect(() => {
    if (!motion || !foreground || parting) return;
    const storm = Animated.loop(Animated.timing(weather, { toValue: 1, duration: 4800, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    storm.start();
    return () => storm.stop();
  }, [weather, motion, foreground, parting]);

  useEffect(() => {
    if (mode !== 'storm') return;
    let live = true;
    let fallbackUsed = false;
    let waited = 0;
    const controller = new AbortController();
    const fallBack = () => { if (live && !ending.current) { fallbackUsed = true; ready.current = false; player.pause(); setVoice('text'); } };
    const listener = player.addListener('playbackStatusUpdate', (status) => {
      if (!live || fallbackUsed || ending.current) return;
      if (status.playing || status.currentTime > 0) begun.current = true;
      if (status.playing) setVoice('playing');
      else if (status.isLoaded && !status.isBuffering && !status.didJustFinish) setVoice('paused');
      if (status.error) fallBack();
      else if (begun.current && status.didJustFinish) depart();
    });
    const watchdog = setInterval(() => {
      if (!active.current || fallbackUsed || begun.current || ending.current) return;
      waited += 1000;
      if (waited >= 18_000) { controller.abort(); fallBack(); }
    }, 1000);
    void (async () => {
      try {
        const response = await fetch(`${API_BASE}/opening/narration`, { signal: controller.signal });
        if (!response.ok) throw new Error('opening unavailable');
        const data = await response.json() as { audioUrl?: string | null };
        if (!live || fallbackUsed || ending.current) return;
        if (!data.audioUrl) { fallBack(); return; }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: false, interruptionMode: 'duckOthers' });
        if (!live || fallbackUsed || ending.current) return;
        player.replace({ uri: `${API_BASE}${data.audioUrl}` });
        ready.current = true;
        if (Platform.OS === 'web') setVoice('paused');
        else if (active.current) player.play();
      } catch { fallBack(); }
    })();
    return () => { live = false; controller.abort(); clearInterval(watchdog); listener.remove(); player.pause(); };
  }, [mode, player, depart]);

  useEffect(() => {
    if (voice !== 'text' || mode !== 'storm' || parting || !foreground) return;
    const timer = setTimeout(depart, Math.max(10_000, OPENING_WORDS.split(/\s+/).length * 390));
    return () => clearTimeout(timer);
  }, [voice, mode, parting, foreground, depart]);

  const begin = () => { if (ready.current && !ending.current) { player.play(); setVoice('loading'); } };
  return <Animated.View accessibilityViewIsModal importantForAccessibility="yes" style={[s.scene, { opacity: cover, backgroundColor: mode === 'storm' ? '#061A32' : '#0C4D82' }]}>
    {mode === 'storm' ? <>
      <View pointerEvents="none" style={[s.moon, { top: insets.top + 80 }]} />
      <Animated.View pointerEvents="none" style={[s.lightning, { opacity: motion ? weather.interpolate({ inputRange: [0, 0.7, 0.74, 0.8, 1], outputRange: [0, 0, 0.09, 0, 0] }) : 0 }]} />
      <Animated.View pointerEvents="none" style={[s.sea, { top: height * 0.5, transform: [{ translateX: weather.interpolate({ inputRange: [0, 1], outputRange: [-25, 25] }) }] }]}>
        {[0, 1, 2, 3].map((n) => <View key={n} style={[s.wave, { top: 45 + n * 44, left: n % 2 ? 30 : -20, width: width + 40 }]} />)}
      </Animated.View>
      <Animated.View pointerEvents="none" style={[s.shipPosition, { top: height * 0.23, transform: [
        { translateY: weather.interpolate({ inputRange: [0, 0.5, 1], outputRange: [4, -8, 4] }) },
        { rotate: weather.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-4deg', '4deg', '-4deg'] }) },
      ] }]}><Image source={require('../../../assets/game/ships/voyage_ship.png')} style={s.ship} contentFit="contain" /></Animated.View>
      {motion ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.28, transform: [{ translateY: weather.interpolate({ inputRange: [0, 1], outputRange: [-70, 70] }) }] }]}>
        {Array.from({ length: 14 }, (_, n) => <View key={n} style={[s.rain, { left: (n * 83) % Math.max(width, 1), top: (n * 137) % Math.max(height, 1) }]} />)}
      </Animated.View> : null}
    </> : <View pointerEvents="none" style={s.revealGlow} />}

    <Cloud side={-1} travel={clouds} width={width} pale={mode === 'reveal'} y={mode === 'reveal' ? height * 0.08 : -70} />
    <Cloud side={1} travel={clouds} width={width} pale={mode === 'reveal'} y={mode === 'reveal' ? height * 0.36 : 50} />
    <Cloud side={-1} travel={clouds} width={width} pale={mode === 'reveal'} y={mode === 'reveal' ? height * 0.65 : height - 120} />

    {mode === 'storm' && !parting ? <View style={[s.copy, { paddingBottom: insets.bottom + 28 }]}>
      <Text style={s.eyebrow}>BEFORE THE VOYAGE</Text>
      <Text style={s.title}>A tale carried by the storm.</Text>
      <Text accessibilityLiveRegion="polite" style={s.words}>{OPENING_WORDS}</Text>
      {voice === 'paused' ? <Pressable accessibilityRole="button" onPress={begin} style={s.begin}><Text style={s.beginText}>Hear the tale</Text></Pressable> : null}
      {voice === 'loading' ? <Text style={s.hint}>The tide is gathering its voice…</Text> : null}
      {voice === 'text' ? <Text style={s.hint}>The tale lives in the words.</Text> : null}
    </View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Skip opening cutscene" onPress={() => { player.pause(); finish(); }} style={[s.skip, { top: insets.top + 10 }]}><Text style={s.skipText}>Skip</Text></Pressable>
  </Animated.View>;
}

const s = StyleSheet.create({
  initialCover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#061A32', zIndex: 100, elevation: 100 },
  scene: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, elevation: 100, overflow: 'hidden' },
  moon: { position: 'absolute', right: 58, width: 72, height: 72, borderRadius: 36, backgroundColor: '#E7E7CF', opacity: 0.6 },
  lightning: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#D5EAFF' },
  sea: { position: 'absolute', left: -40, right: -40, bottom: 0, backgroundColor: '#05294D' },
  wave: { position: 'absolute', height: 38, borderTopWidth: 2, borderTopColor: '#6194B144', borderRadius: 90 },
  shipPosition: { alignSelf: 'center', position: 'absolute', opacity: 0.64 }, ship: { width: 180, height: 180 },
  rain: { position: 'absolute', height: 58, width: 1, backgroundColor: '#9BC5E7', transform: [{ rotate: '16deg' }] },
  cloudBank: { position: 'absolute', height: 235, borderRadius: 95, opacity: 0.94 },
  cloudPuff: { position: 'absolute', width: 150, height: 155, borderRadius: 90 },
  revealGlow: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#74C8ED', opacity: 0.45 },
  copy: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 28, paddingTop: 22, gap: 14, backgroundColor: '#061A32D9' },
  eyebrow: { color: '#FFD16A', fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 2.5 },
  title: { fontFamily: F.title, fontSize: 35, color: '#FFF5DE' },
  words: { color: '#ECF4FA', fontFamily: F.body, fontSize: 15, lineHeight: 25 },
  hint: { fontFamily: F.body, color: '#A3C3DB', fontSize: 11, minHeight: 26 },
  begin: { backgroundColor: '#FFD16A', alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 22, minHeight: 48, justifyContent: 'center' },
  beginText: { fontFamily: F.bodyBold, color: '#123B5D', fontSize: 14 },
  skip: { position: 'absolute', right: 14, minWidth: 64, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#05172E99', borderRadius: 12 },
  skipText: { color: '#ECF4FA', fontFamily: F.bodyBold, fontSize: 12 },
});
