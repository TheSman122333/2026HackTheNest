import { Directory, File, Paths } from 'expo-file-system';

import { storage, uuid } from '@/lib/api';
import type { FacePhoto } from '@/state/avatarPhoto';

const safeId = (userId: string) => userId.split('').map((char) => char.charCodeAt(0).toString(16)).join('-');
const key = (userId: string) => `lv_avatar_face_v1_${safeId(userId)}`;
const directory = (userId: string) => new Directory(Paths.document, 'avatar-faces', safeId(userId));
const ownedPrefix = (userId: string) => `${directory(userId).uri.replace(/\/+$/, '')}/`;

export function validPhoto(value: unknown): value is FacePhoto {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<FacePhoto>;
  return typeof p.uri === 'string' && p.uri.startsWith('file://') &&
    typeof p.width === 'number' && p.width > 0 && Number.isFinite(p.width) &&
    typeof p.height === 'number' && p.height > 0 && Number.isFinite(p.height) &&
    typeof p.zoom === 'number' && p.zoom >= 1 && p.zoom <= 4 &&
    typeof p.offsetX === 'number' && Number.isFinite(p.offsetX) &&
    typeof p.offsetY === 'number' && Number.isFinite(p.offsetY);
}

export async function readPhoto(userId: string): Promise<FacePhoto | null> {
  const serialized = await storage.get(key(userId));
  if (!serialized) return null;
  const value: unknown = JSON.parse(serialized);
  if (!validPhoto(value) || !value.uri.startsWith(ownedPrefix(userId))) return null;
  return new File(value.uri).exists ? value : null;
}

/** Keep the previous owned file until the editor commits both local and server changes. */
export async function writePhoto(userId: string, photo: FacePhoto | null): Promise<FacePhoto | null> {
  if (!photo) { await storage.del(key(userId)); return null; }
  if (!validPhoto(photo)) throw new Error('That photo could not be saved. Try taking it again.');
  const folder = directory(userId);
  folder.create({ intermediates: true, idempotent: true });
  let owned = photo;
  let copied: File | null = null;
  if (!photo.uri.startsWith(ownedPrefix(userId))) {
    copied = new File(folder, `face-${uuid()}.jpg`);
    await new File(photo.uri).copy(copied);
    owned = { ...photo, uri: copied.uri };
  }
  try {
    await storage.set(key(userId), JSON.stringify(owned));
    return owned;
  } catch (error) {
    try { if (copied?.exists) copied.delete(); } catch { /* A later app cleanup may reclaim this copy. */ }
    throw error;
  }
}

/** Only an old face file owned by this account can be reclaimed. */
export async function releasePhoto(userId: string, photo: FacePhoto | null, keepUri?: string) {
  if (!photo || photo.uri === keepUri || !photo.uri.startsWith(ownedPrefix(userId))) return;
  try { const file = new File(photo.uri); if (file.exists) file.delete(); } catch { /* Best effort after a committed save. */ }
}

/** Reclaim only normalized camera JPEGs; document photos and unrelated cache files are never touched. */
export async function releaseTemporaryPhoto(photo: Pick<FacePhoto, 'uri'> | null) {
  if (!photo) return;
  try {
    const file = new File(photo.uri);
    const prefix = `${new Directory(Paths.cache, 'avatar-camera').uri.replace(/\/+$/, '')}/`;
    if (!file.uri.startsWith(prefix) || !/^photo-[0-9a-f-]+\.jpg$/i.test(file.uri.slice(prefix.length))) return;
    if (file.exists) file.delete();
  } catch { /* A missing or already reclaimed draft requires no further work. */ }
}
