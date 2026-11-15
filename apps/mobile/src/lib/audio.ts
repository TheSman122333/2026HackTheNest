/**
 * Server audio (narrator replies, theme songs) needs our auth header. Android's player can
 * ignore custom headers, so we download to the cache first and play the local file.
 */
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { AudioPlayer } from 'expo-audio';

import { authedSource } from '@/lib/api';

export async function fetchAudio(path: string, name: string): Promise<string> {
  const src = await authedSource(path);
  if (Platform.OS === 'web') {
    const res = await fetch(src.uri, { headers: src.headers });
    if (!res.ok) throw new Error(`audio ${res.status}`);
    return URL.createObjectURL(await res.blob());
  }
  const dest = new File(Paths.cache, `${name}.mp3`);
  console.log('[audio] downloading', path);
  try {
    const file = await File.downloadFileAsync(src.uri, dest, { headers: src.headers, idempotent: true });
    return file.uri;
  } catch (error) {
    try { if (dest.exists) dest.delete(); } catch { /* The cache may already be gone. */ }
    throw error;
  }
}

/** Expo players are imperative native resources, not React state objects. */
export function configureAudioPlayer(player: AudioPlayer, settings: { volume?: number; loop?: boolean }) {
  if (settings.volume !== undefined) player.volume = settings.volume;
  if (settings.loop !== undefined) player.loop = settings.loop;
}

/** Release short-lived narration files and browser object URLs after playback. */
export function releaseAudio(uri: string) {
  if (Platform.OS === 'web') { URL.revokeObjectURL(uri); return; }
  try { new File(uri).delete(); } catch { /* The OS may already have reclaimed the cache. */ }
}
