import { Platform } from 'react-native';

import { inviteCode } from './pending';

/** Public web URL when available; otherwise the already registered app scheme. No auth tokens. */
export function crewInviteLink(value: string) {
  const code = inviteCode(value);
  if (!code) throw new Error('Your crew does not have a valid invite code.');
  const publicBase = Platform.OS === 'web' ? globalThis.location?.origin : process.env.EXPO_PUBLIC_APP_URL;
  if (publicBase) {
    try {
      const base = new URL(publicBase);
      if ((base.protocol === 'https:' || base.protocol === 'http:') && !base.username && !base.password) {
        return new URL(`/join?code=${code}`, base.origin).toString();
      }
    } catch { /* A native invite still works through the app's registered scheme. */ }
  }
  return `lastvoyage://join?code=${code}`;
}
