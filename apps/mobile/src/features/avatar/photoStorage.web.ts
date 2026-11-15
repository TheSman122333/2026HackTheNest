import type { FacePhoto } from '@/state/avatarPhoto';

const DB = 'last-voyage-private-portraits';
const TABLE = 'faces';
const key = (userId: string) => `lv_avatar_face_web_v1_${encodeURIComponent(userId)}`;
let database: Promise<IDBDatabase> | null = null;
let latestRevision = 0;
type SavedPhoto = { version: 1; revision: number; photo: FacePhoto | null };

export function validPhoto(value: unknown): value is FacePhoto {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<FacePhoto>;
  return typeof p.uri === 'string' && /^data:image\/(jpeg|png|webp);base64,/i.test(p.uri) && p.uri.length <= 3_000_000 &&
    typeof p.width === 'number' && p.width > 0 && Number.isFinite(p.width) &&
    typeof p.height === 'number' && p.height > 0 && Number.isFinite(p.height) &&
    typeof p.zoom === 'number' && p.zoom >= 1 && p.zoom <= 4 &&
    typeof p.offsetX === 'number' && Number.isFinite(p.offsetX) &&
    typeof p.offsetY === 'number' && Number.isFinite(p.offsetY);
}

function openDatabase() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Private image storage is unavailable.')); return; }
    const request = globalThis.indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(TABLE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local image storage.'));
    request.onblocked = () => reject(new Error('Local image storage is busy. Close another open game tab and retry.'));
  }).catch((error) => { database = null; throw error; });
  return database;
}

function record(value: unknown): SavedPhoto | null {
  if (!value || typeof value !== 'object') return null;
  const saved = value as Partial<SavedPhoto>;
  return saved.version === 1 && typeof saved.revision === 'number' && Number.isFinite(saved.revision) &&
    (saved.photo === null || validPhoto(saved.photo)) ? saved as SavedPhoto : null;
}

async function indexedRead(userId: string): Promise<unknown> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TABLE, 'readonly');
    const request = transaction.objectStore(TABLE).get(userId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function readPhoto(userId: string): Promise<FacePhoto | null> {
  const results = await Promise.allSettled([indexedRead(userId), Promise.resolve().then(() => {
    const serialized = globalThis.localStorage?.getItem(key(userId));
    return serialized ? JSON.parse(serialized) as unknown : null;
  })]);
  const saved = results.flatMap((result) => result.status === 'fulfilled' ? [record(result.value)] : []).filter((value): value is SavedPhoto => value !== null)
    .sort((a, b) => b.revision - a.revision)[0];
  if (saved) { latestRevision = Math.max(latestRevision, saved.revision); return saved.photo; }
  if (results[0].status === 'rejected') throw new Error('Could not read private image storage on this browser.');
  return null;
}

export async function writePhoto(userId: string, photo: FacePhoto | null): Promise<FacePhoto | null> {
  if (photo && !validPhoto(photo)) throw new Error('That photo is too large to keep here. Try taking a smaller photo.');
  const saved: SavedPhoto = { version: 1, revision: latestRevision = Math.max(Date.now(), latestRevision + 1), photo };
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(TABLE, 'readwrite');
      const store = transaction.objectStore(TABLE);
      // A removal is a revisioned tombstone so an older fallback cannot revive it.
      store.put(saved, userId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save this photo on the device.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Photo save was interrupted.'));
    });
    try { globalThis.localStorage?.removeItem(key(userId)); } catch { /* IndexedDB already committed the image. */ }
  } catch {
    const fallback = globalThis.localStorage;
    if (!fallback) throw new Error('This browser cannot keep a private photo. Avatar selection still works.');
    fallback.setItem(key(userId), JSON.stringify(saved));
  }
  return photo;
}

// IndexedDB owns the saved value. Replaced data URLs are reclaimed by the browser.
export async function releasePhoto(_userId: string, _photo: FacePhoto | null, _keepUri?: string) {}

// Web drafts are in-memory data URLs, so dropping the editor reference releases them.
export async function releaseTemporaryPhoto(_photo: Pick<FacePhoto, 'uri'> | null) {}

export async function encodePhoto(photo: FacePhoto) {
  if (!photo.uri.startsWith('data:image/jpeg;base64,')) throw new Error('Choose a JPEG portrait using the photo picker.');
  return photo.uri.split(',')[1];
}
