import { storage } from '@/lib/api';

export const onceScene = (scene: string) => ['arrival', 'ship', 'island', 'quests', 'log', 'me'].includes(scene);
export const normalizeNarration = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Two independent integer hashes keep SecureStore keys short, regardless of passage length. */
function lineKey(scope: string, text: string) {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return `${scope}_line_${(a >>> 0).toString(36)}_${(b >>> 0).toString(36)}_${text.length}`;
}
export async function loadVisited(scope: string): Promise<string[]> {
  try {
    const value: unknown = JSON.parse(await storage.get(`${scope}_scenes`) ?? '[]');
    return Array.isArray(value) ? value.filter((scene): scene is string => typeof scene === 'string' && onceScene(scene)) : [];
  } catch { return []; }
}
export async function heardLine(scope: string, text: string) {
  const normalized = normalizeNarration(text);
  try { return await storage.get(lineKey(scope, normalized)) === normalized; } catch { return false; }
}
export async function rememberNarration(scope: string, text: string, visited: string[]) {
  const normalized = normalizeNarration(text);
  // Individual compact keys avoid a growing single SecureStore document. Never expire old lines.
  await Promise.allSettled([
    storage.set(lineKey(scope, normalized), normalized),
    storage.set(`${scope}_scenes`, JSON.stringify(visited)),
  ]);
}
