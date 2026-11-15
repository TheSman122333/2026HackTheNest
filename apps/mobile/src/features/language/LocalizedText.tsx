import { Children, type ReactNode } from 'react';
import { Text as NativeText, type TextProps } from 'react-native';
import type { TranslationParams } from '@last-voyage/game';

import { useT } from './i18n';
import { useLanguage } from '@/state/language';

export type LocalizedTextProps = TextProps & { translatable?: boolean; params?: TranslationParams };
const systemScripts = new Set(['ar', 'hi', 'ta', 'zh', 'ja', 'ko', 'ru', 'uk', 'bg', 'el']);

/** Use translatable={false} for names, invite codes and player-written content. */
export function LocalizedText({ children, style, translatable = true, params, accessibilityLabel, ...props }: LocalizedTextProps) {
  const t = useT();
  const language = useLanguage((state) => state.language);
  const nodes = Children.toArray(children);
  let content: ReactNode = children;
  if (translatable) {
    // React splits adjacent string literals; joining only string nodes does not alter player values.
    content = nodes.every((node) => typeof node === 'string')
      ? t(nodes.join(''), params)
      : Children.map(children, (child) => typeof child === 'string' ? t(child, params) : child);
  }
  return <NativeText {...props} accessibilityLabel={accessibilityLabel && translatable ? t(accessibilityLabel) : accessibilityLabel}
    style={[language === 'ar' && { writingDirection: 'rtl', textAlign: 'auto' }, style, systemScripts.has(language) && { fontFamily: undefined }]}>{content}</NativeText>;
}
