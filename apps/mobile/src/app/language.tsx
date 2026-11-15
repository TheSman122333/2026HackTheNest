import { router } from 'expo-router';
import { LanguagePicker } from '@/features/language/LanguagePicker';

export default function Language() {
  return <LanguagePicker onDone={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} />;
}
