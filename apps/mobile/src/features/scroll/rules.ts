import type { SurfaceRules } from 'scroll-sentinel';

/**
 * Which scrolls count as short-form. Pushed to the native service on app start, so rules can be
 * tuned here without a native rebuild. View-id patterns are UNVERIFIED: confirm them with
 * Scroll Lab discovery mode on the Pixel and update.
 */
export const SURFACE_RULES: SurfaceRules = {
  'com.zhiliaoapp.musically': {
    app: 'tiktok',
    surface: 'feed',
    mode: 'all',
    excludePatterns: ['comment', 'profile'],
  },
  'com.ss.android.ugc.trill': {
    app: 'tiktok',
    surface: 'feed',
    mode: 'all',
    excludePatterns: ['comment', 'profile'],
  },
  'com.instagram.android': {
    app: 'instagram',
    surface: 'reels',
    mode: 'match',
    idPatterns: ['clips_viewer', 'clips_.*pager', 'reel_viewer'],
  },
  'com.google.android.youtube': {
    app: 'youtube',
    surface: 'shorts',
    mode: 'match',
    idPatterns: ['reel_recycler', 'reel_player', 'shorts'],
  },
};

export const TRACKED_PACKAGES = Object.keys(SURFACE_RULES);

export const APP_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram Reels',
  youtube: 'YouTube Shorts',
};

export function appForPackage(pkg: string): string {
  return SURFACE_RULES[pkg]?.app ?? pkg;
}
