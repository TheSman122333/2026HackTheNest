import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F } from '@/components/kit';
import { fetchAudio, releaseAudio } from '@/lib/audio';
import { useSession } from '@/state/session';
import { useOpening } from '@/state/opening';
import { useDeviceMotionEnabled } from '@/ui/motion';

import { useNarrator, type NarrationClip, type NarrationScene } from './useNarrator';

const SCENES: Record<string, NarrationScene> = { ship: 'ship', island: 'island', quests: 'quests' };

/** One host above the navigator: changing tabs never cuts off a spoken sentence. */
export function TidekeeperSubtitles() {
  const pathname = usePathname();
  const userId = useSession((s) => s.me?.user.id);
  const crewId = useSession((s) => s.me?.crew?.id);
  const { current, queue, busy, playNext, reset, narrate, hydrate, hydrated } = useNarrator();
  const opening = useOpening((s) => s.visible);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const previous = useRef<string | null>(null);
  const identity = useRef<string | null>(null);

  useEffect(() => {
    let awayAt: number | null = null;
    const listener = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state !== 'active') { awayAt ??= Date.now(); return; }
      if (awayAt !== null && Date.now() - awayAt > 60_000 && useSession.getState().me?.crew) {
        void useSession.getState().refresh();
      }
      awayAt = null;
    });
    return () => listener.remove();
  }, []);

  useEffect(() => {
    const key = userId && crewId ? `${userId}:${crewId}` : null;
    if (identity.current !== key) {
      identity.current = key;
      previous.current = null;
      reset();
      if (key) void hydrate(`lv_narrator_v3_${userId}_${crewId}`);
      return;
    }
    if (!key || opening || !hydrated || previous.current === pathname) return;
    previous.current = pathname;
    const scene = SCENES[pathname.split('/').filter(Boolean).pop() ?? ''];
    if (scene) narrate(scene);
  }, [userId, crewId, pathname, opening, hydrated, reset, narrate, hydrate]);

  useEffect(() => {
    if (!opening && hydrated && foreground && crewId && !current && !busy && queue.length) void playNext();
  }, [opening, hydrated, foreground, crewId, current, busy, queue, playNext]);

  if (opening || !userId || !crewId || !current) return null;
  return <SubtitlePlayback key={current.id} clip={current} foreground={foreground} tabbed={['ship', 'quests', 'island', 'log', 'me'].includes(pathname.split('/').pop() ?? '')} />;
}

function SubtitlePlayback({ clip, foreground, tabbed }: { clip: NarrationClip; foreground: boolean; tabbed: boolean }) {
  const player = useAudioPlayer(null, { updateInterval: 150 });
  const motion = useDeviceMotionEnabled();
  const insets = useSafeAreaInsets();
  const { complete, muted, toggleMute } = useNarrator();
  const [mode, setMode] = useState<'audio' | 'text' | 'closing'>(clip.audioPath ? 'audio' : 'text');
  const [opacity] = useState(() => new Animated.Value(0));
  const [paused, setPaused] = useState(false);
  const active = useRef(foreground);
  const ready = useRef(false);

  useEffect(() => {
    active.current = foreground;
    if (!foreground) player.pause();
    else if (ready.current && mode === 'audio') player.play();
  }, [foreground, player, mode]);

  useEffect(() => {
    // expo-audio exposes muted as a writable native property, including on Safari.
    // eslint-disable-next-line react-hooks/immutability
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    const animation = Animated.timing(opacity, { toValue: mode === 'closing' ? 0 : 1, duration: motion ? 220 : 0, useNativeDriver: true });
    animation.start();
    if (mode !== 'closing') return () => animation.stop();
    const done = setTimeout(() => complete(clip.id), motion ? 240 : 0);
    return () => { animation.stop(); clearTimeout(done); };
  }, [mode, opacity, motion, complete, clip.id]);

  useEffect(() => {
    if (!clip.audioPath) return;
    let live = true;
    let started = false;
    let elapsed = 0;
    let uri: string | null = null;
    const fallback = () => {
      if (!live) return;
      live = false;
      ready.current = false;
      player.pause();
      setMode('text');
    };
    const listener = player.addListener('playbackStatusUpdate', (status) => {
      if (!live) return;
      if (status.playing || status.currentTime > 0) started = true;
      if (status.playing) setPaused(false);
      else if (ready.current && status.isLoaded && !status.isBuffering && !status.didJustFinish) setPaused(true);
      if (status.error) fallback();
      // A paused or buffering player has NOT finished. Only the actual end ends the caption.
      else if (started && status.didJustFinish) { ready.current = false; setMode('closing'); }
    });
    const watchdog = setInterval(() => {
      if (!active.current || started || !live) return;
      elapsed += 1000;
      if (elapsed >= 15_000) fallback();
    }, 1000);
    void (async () => {
      try {
        const audio = await fetchAudio(clip.audioPath!, `tidekeeper-${clip.id}`);
        uri = audio;
        if (!live) { releaseAudio(audio); return; }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: false, interruptionMode: 'duckOthers' });
        if (!live) return;
        player.replace({ uri: audio });
        ready.current = true;
        if (active.current) player.play();
      } catch { fallback(); }
    })();
    return () => {
      live = false;
      ready.current = false;
      clearInterval(watchdog);
      listener.remove();
      player.pause();
      if (uri) releaseAudio(uri);
    };
  }, [clip.id, clip.audioPath, player]);

  useEffect(() => {
    if (mode !== 'text' || !foreground) return;
    // No voice configured/offline: give the entire passage a comfortable reading window.
    const words = clip.text.trim().split(/\s+/).length;
    const timer = setTimeout(() => setMode('closing'), Math.max(4500, words * 380 + 1200));
    return () => clearTimeout(timer);
  }, [mode, foreground, clip.text]);

  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <Animated.View pointerEvents="box-none" style={[s.caption, { bottom: tabbed ? 82 + Math.max(insets.bottom, 10) : 20 + insets.bottom, opacity,
      transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [motion ? 12 : 0, 0] }) }] }]}>
      <View pointerEvents="box-none" style={s.heading}>
        <View pointerEvents="none" style={s.speaker}><View style={s.signal} /><Text style={s.name}>THE TIDEKEEPER</Text></View>
        {paused && mode === 'audio' ? <Pressable accessibilityRole="button" accessibilityLabel="Continue the Tidekeeper's narration" onPress={() => player.play()} style={s.sound}><Text style={s.soundText}>Continue</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Turn narration sound on' : 'Mute narration sound'} accessibilityState={{ selected: !muted }} onPress={toggleMute} style={s.sound}>
          <Text style={s.soundText}>{muted ? 'Sound off' : 'Sound on'}</Text>
        </Pressable>
      </View>
      <View pointerEvents="none"><Text accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined} style={s.words}>{clip.text}</Text></View>
    </Animated.View>
  </View>;
}

const s = StyleSheet.create({
  caption: { position: 'absolute', left: 20, right: 20, paddingHorizontal: 18, paddingBottom: 18, paddingTop: 4, borderRadius: 18, backgroundColor: '#052D55F2', borderWidth: 1, borderColor: '#71C9F199', shadowColor: '#031E36', shadowOffset: { width: 0, height: 6 }, shadowRadius: 18, shadowOpacity: 0.24, elevation: 9 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speaker: { flexDirection: 'row', alignItems: 'center', gap: 7 }, signal: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.gold },
  name: { fontFamily: F.bodyBold, color: C.gold, fontSize: 9, letterSpacing: 1.6 },
  sound: { minWidth: 68, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' },
  soundText: { color: '#BCE6FF', fontFamily: F.bodyBold, fontSize: 10 },
  words: { fontFamily: F.bodyBold, fontSize: 15, lineHeight: 23, color: '#FFFCF6' },
});
