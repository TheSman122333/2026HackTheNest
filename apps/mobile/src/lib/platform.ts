import { Platform } from 'react-native';

/**
 * Real-life tracking (scroll detection + steps) only exists in the Android app.
 * iPhone (Safari/Expo Go) and the website hide those parts of the UI entirely.
 */
export const TRACKING = Platform.OS === 'android';
