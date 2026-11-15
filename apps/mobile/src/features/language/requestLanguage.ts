import type { AppLanguage } from '@last-voyage/game';

// Keep this module independent of api/store to avoid an initialization cycle.
let requestLanguage: AppLanguage = 'en';
export const getRequestLanguage = () => requestLanguage;
export const setRequestLanguage = (language: AppLanguage) => { requestLanguage = language; };
