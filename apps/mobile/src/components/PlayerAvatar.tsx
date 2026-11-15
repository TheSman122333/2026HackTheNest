import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AVATARS, isAvatarId } from '@/features/avatar/catalog';
import { useAvatarPhoto, type FacePhoto } from '@/state/avatarPhoto';
import { useSession } from '@/state/session';

import { avatarFor, Sprite } from './sprites';

/** Original outfit in front, a device-local portrait (or drawn face) behind its clear aperture. */
export function PlayerAvatar({ userId, avatarId, size = 48, photo, style, label }: {
  userId?: string; avatarId?: string | null; size?: number; photo?: FacePhoto | null;
  style?: StyleProp<ViewStyle>; label?: string;
}) {
  const me = useSession((state) => state.me?.user);
  const { userId: photoOwner, photo: savedPhoto, hydrate } = useAvatarPhoto();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const self = Boolean(userId && userId === me?.id);
  useEffect(() => { if (self && userId && photo === undefined) void hydrate(userId); }, [self, userId, photo, hydrate]);
  const preferred = self && photo === undefined ? me?.avatarId ?? avatarId : avatarId;
  const fallback = avatarFor(userId ?? '');
  const chosen = isAvatarId(preferred) ? preferred : isAvatarId(fallback) ? fallback : 'a1';
  const option = AVATARS.find((avatar) => avatar.id === chosen)!;
  const portrait = photo !== undefined ? photo : self && photoOwner === userId ? savedPhoto : null;
  // A face image can never become a remote image request through this renderer.
  const available = portrait && /^(file:|content:|data:image\/|blob:)/.test(portrait.uri) && failedUri !== portrait.uri ? portrait : null;
  const slot = { left: option.face.x * size, top: option.face.y * size, width: option.face.width * size, height: option.face.height * size };
  const zoom = Math.max(1, Math.min(4, Number.isFinite(available?.zoom) ? available!.zoom : 1));
  const pan = (value: number) => Math.max(-(zoom - 1) / 2, Math.min((zoom - 1) / 2, Number.isFinite(value) ? value : 0));

  return <View accessible={Boolean(label)} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label}
    importantForAccessibility={label ? 'yes' : 'no-hide-descendants'} style={[{ width: size, height: size }, style]}>
    <View style={[s.face, slot]}>
      {available ? <Image source={{ uri: available.uri }} contentFit="cover" cachePolicy="none" accessible={false}
        onError={() => setFailedUri(available.uri)}
        style={{ position: 'absolute', width: slot.width * zoom, height: slot.height * zoom,
          left: slot.width * (1 - zoom) / 2 + pan(available.offsetX) * slot.width,
          top: slot.height * (1 - zoom) / 2 + pan(available.offsetY) * slot.height }} /> : <>
        <View style={[s.eye, { left: '28%', top: '42%', width: Math.max(1.3, slot.width * 0.055), height: Math.max(1.7, slot.height * 0.075) }]} />
        <View style={[s.eye, { right: '28%', top: '42%', width: Math.max(1.3, slot.width * 0.055), height: Math.max(1.7, slot.height * 0.075) }]} />
        <View style={{ position: 'absolute', left: '36%', top: '61%', width: '28%', height: '12%', borderBottomWidth: Math.max(1, slot.height * 0.025), borderColor: '#694831', borderRadius: slot.width * 0.15 }} />
      </>}
    </View>
    <Sprite name={chosen} size={size} />
  </View>;
}
const s = StyleSheet.create({
  face: { position: 'absolute', borderRadius: 1000, overflow: 'hidden', backgroundColor: '#EBC8A6' },
  eye: { position: 'absolute', backgroundColor: '#332B35', borderRadius: 8 },
});
