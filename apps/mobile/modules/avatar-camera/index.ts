import { requireOptionalNativeModule } from 'expo';

import type { AvatarPhoto } from './AvatarCamera.types';
export type { AvatarPhoto } from './AvatarCamera.types';

type NativeCamera = {
  isSupported: () => boolean;
  takePhoto: () => Promise<AvatarPhoto | null>;
  choosePhoto: () => Promise<AvatarPhoto | null>;
};
const native = requireOptionalNativeModule<NativeCamera>('AvatarCamera');

export const isSupported = () => native?.isSupported() ?? false;
const missing = () => new Error('Photo capture needs a new development build with the avatar camera module.');
export async function takePhoto(): Promise<AvatarPhoto | null> {
  if (!native) throw missing();
  return native.takePhoto();
}
export async function choosePhoto(): Promise<AvatarPhoto | null> {
  if (!native) throw missing();
  return native.choosePhoto();
}
export default { isSupported, takePhoto, choosePhoto };
