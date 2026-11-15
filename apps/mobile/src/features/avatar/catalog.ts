import type { AvatarId } from '@/lib/types';

export type { AvatarId } from '@/lib/types';
export type FaceSlot = { x: number; y: number; width: number; height: number };
export type AvatarOption = { id: AvatarId; label: string; face: FaceSlot };

// Measured transparent face apertures in the approved 384 px avatar sprites.
// A slight overlap sits under the painted rim, preventing fine seams.
const bounds: [AvatarId, number, number, number, number][] = [
  ['a1', 125, 54, 142, 146], ['a2', 115, 53, 145, 148],
  ['a3', 100, 54, 143, 146], ['a4', 136, 48, 141, 149],
  ['a5', 117, 53, 142, 144], ['a6', 96, 54, 147, 146],
  ['a7', 153, 54, 132, 136], ['a8', 122, 55, 134, 136],
  ['a9', 86, 56, 134, 136], ['a10', 150, 43, 135, 137],
  ['a11', 114, 47, 133, 135], ['a12', 78, 46, 136, 137],
];

export const AVATARS: AvatarOption[] = bounds.map(([id, x, y, width, height], index) => ({
  id, label: `Pirate ${String(index + 1).padStart(2, '0')}`,
  face: { x: x / 384, y: y / 384, width: width / 384, height: height / 384 },
}));
export const isAvatarId = (value: unknown): value is AvatarId => typeof value === 'string' && AVATARS.some((avatar) => avatar.id === value);
