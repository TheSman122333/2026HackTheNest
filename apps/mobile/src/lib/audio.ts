/**
 * Server audio (narrator replies, theme songs) needs our auth header. Android's player can
 * ignore custom headers, so we download to the cache first and play the local file.
 */
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

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
  const file = await File.downloadFileAsync(src.uri, dest, { headers: src.headers, idempotent: true });
  console.log('[audio] ready', file.uri, file.size, 'bytes');
  return file.uri;
}
