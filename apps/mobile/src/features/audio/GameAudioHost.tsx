import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useNarrator } from '@/features/narrator/useNarrator';
import { api, uuid } from '@/lib/api';
import { configureAudioPlayer, fetchAudio, releaseAudio } from '@/lib/audio';
import { listenForAudioUnlock, listenForGameSounds, useGameAudio, type GameSound } from '@/state/gameAudio';
import { useOpening } from '@/state/opening';
import { useSession } from '@/state/session';

type Catalog = { enabled: boolean; effects: Record<GameSound, string>; music: string | null };
const SOUNDS: GameSound[] = ['move', 'strike', 'cannon', 'heal', 'brace'];

/** One music player survives tab changes. All playback stops outside the foreground game. */
export function GameAudioHost() {
  const me = useSession((state) => state.me);
  const opening = useOpening((state) => state.visible);
  const hydrated = useGameAudio((state) => state.hydrated);
  useEffect(() => { void useGameAudio.getState().hydrate(); }, []);
  if (!hydrated || opening || !me?.crew || !me.user.avatarId || !me.user.preferences) return null;
  return <AudioSession key={me.user.id} userId={me.user.id} />;
}

function AudioSession({ userId }: { userId: string }) {
  const move = useAudioPlayer(null);
  const strike = useAudioPlayer(null);
  const cannon = useAudioPlayer(null);
  const heal = useAudioPlayer(null);
  const brace = useAudioPlayer(null);
  const music = useAudioPlayer(null);
  const players = useMemo(() => ({ move, strike, cannon, heal, brace }), [move, strike, cannon, heal, brace]);
  const musicPlayback = useAudioPlayerStatus(music);
  const { musicEnabled, effectsEnabled, unlocked, previewPlaying, retryNonce } = useGameAudio();
  const narration = useNarrator((state) => Boolean(state.current) || state.busy === 'command');
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const ready = useRef(new Set<GameSound | 'music'>());
  const playbackGeneration = useRef(0);
  const cueSequence = useRef(0);
  const invalidatePlayback = useCallback(() => { ++playbackGeneration.current; }, []);
  const currentForeground = useRef(foreground);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      currentForeground.current = active;
      setForeground(active);
      if (!active) { invalidatePlayback(); music.pause(); Object.values(players).forEach((player) => player.pause()); }
    });
    return () => listener.remove();
  }, [music, players, invalidatePlayback]);

  useEffect(() => {
    let live = true;
    const batch = uuid();
    const sources: string[] = [];
    const available = ready.current;
    available.clear();
    const sameUser = () => live && useSession.getState().me?.user.id === userId;
    useGameAudio.setState({ musicStatus: musicEnabled ? 'loading' : 'idle', effectsStatus: effectsEnabled ? 'loading' : 'idle' });
    void (async () => {
      if (!musicEnabled && !effectsEnabled) return;
      try {
        const catalog = await api<Catalog>('GET', '/audio/catalog');
        if (!sameUser()) return;
        if (!catalog.enabled) throw new Error('Audio service is not configured');
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: false, interruptionMode: 'duckOthers' });
        if (!sameUser()) return;
        const jobs: Promise<void>[] = [];
        if (musicEnabled && catalog.music) jobs.push((async () => {
          try {
            const uri = await fetchAudio(catalog.music!, `voyage-music-${batch}`);
            if (!sameUser()) { releaseAudio(uri); return; }
            sources.push(uri);
            music.replace({ uri });
            configureAudioPlayer(music, { loop: true });
            available.add('music');
            useGameAudio.setState({ musicStatus: 'ready' });
          } catch { if (sameUser()) useGameAudio.setState({ musicStatus: 'unavailable' }); }
        })());
        if (effectsEnabled) jobs.push((async () => {
          const results = await Promise.allSettled(SOUNDS.map(async (key) => {
            const uri = await fetchAudio(catalog.effects[key], `voyage-${key}-${batch}`);
            if (!sameUser()) { releaseAudio(uri); return; }
            sources.push(uri);
            players[key].replace({ uri });
            configureAudioPlayer(players[key], { volume: key === 'cannon' ? 0.5 : 0.65 });
            available.add(key);
          }));
          if (sameUser()) useGameAudio.setState({ effectsStatus: results.every((result) => result.status === 'fulfilled') ? 'ready' : 'unavailable' });
        })());
        await Promise.allSettled(jobs);
      } catch {
        if (sameUser()) useGameAudio.setState({ musicStatus: musicEnabled ? 'unavailable' : 'idle', effectsStatus: effectsEnabled ? 'unavailable' : 'idle' });
      }
    })();
    return () => {
      live = false;
      invalidatePlayback();
      available.clear();
      music.pause();
      music.replace(null);
      for (const player of Object.values(players)) { player.pause(); player.replace(null); }
      sources.forEach(releaseAudio);
    };
  }, [userId, retryNonce, musicEnabled, effectsEnabled, music, players, invalidatePlayback]);

  useEffect(() => {
    configureAudioPlayer(music, { volume: narration ? 0.04 : 0.2 });
    if (musicEnabled && foreground && unlocked && !previewPlaying && musicPlayback.isLoaded) music.play();
    else music.pause();
  }, [music, musicEnabled, foreground, unlocked, previewPlaying, narration, musicPlayback.isLoaded]);

  useEffect(() => listenForGameSounds((key) => {
    const settings = useGameAudio.getState();
    const player = players[key];
    if (!currentForeground.current || !settings.effectsEnabled || !settings.unlocked || !ready.current.has(key) || !player.isLoaded || useSession.getState().me?.user.id !== userId) return;
    const cue = ++cueSequence.current;
    const generation = playbackGeneration.current;
    const started = Date.now();
    player.pause();
    void player.seekTo(0).then(() => {
      if (cue === cueSequence.current && generation === playbackGeneration.current && Date.now() - started < 350 && currentForeground.current && useGameAudio.getState().effectsEnabled && useSession.getState().me?.user.id === userId && ready.current.has(key)) player.play();
    }).catch(() => {});
  }), [players, userId]);

  // Prime web media elements in the actual click handler, before async gameplay requests.
  useEffect(() => listenForAudioUnlock(() => {
    const settings = useGameAudio.getState();
    if (!currentForeground.current || useSession.getState().me?.user.id !== userId) return;
    if (settings.musicEnabled && music.isLoaded && !settings.previewPlaying) music.play();
    if (Platform.OS === 'web' && settings.effectsEnabled) for (const [key, player] of Object.entries(players)) {
      if (!ready.current.has(key as GameSound) || !player.isLoaded || player.playing) continue;
      const volume = player.volume;
      configureAudioPlayer(player, { volume: 0 });
      player.play();
      player.pause();
      configureAudioPlayer(player, { volume });
    }
  }), [music, players, userId]);

  return null;
}
