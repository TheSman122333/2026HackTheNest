import { forwardRef, type ComponentRef } from 'react';
import { Pressable, TextInput, type PressableProps, type TextInputProps } from 'react-native';

import { useT } from './i18n';
import { useLanguage } from '@/state/language';

/** Translate only app-owned labels; input values and player-entered text stay untouched. */
export const LocalizedTextInput = forwardRef<ComponentRef<typeof TextInput>, TextInputProps & { translatePlaceholder?: boolean }>(function LocalizedTextInput({ translatePlaceholder = true, ...props }, ref) {
  const t = useT();
  const rtl = useLanguage((state) => state.language === 'ar');
  return <TextInput {...props} ref={ref}
    placeholder={props.placeholder && translatePlaceholder ? t(props.placeholder) : props.placeholder}
    accessibilityLabel={props.accessibilityLabel ? t(props.accessibilityLabel) : undefined}
    style={[props.style, rtl && { writingDirection: 'rtl' }]} />;
});

export const LocalizedPressable = forwardRef<ComponentRef<typeof Pressable>, PressableProps>(function LocalizedPressable(props, ref) {
  const t = useT();
  return <Pressable {...props} ref={ref}
    accessibilityLabel={props.accessibilityLabel ? t(props.accessibilityLabel) : undefined}
    accessibilityHint={props.accessibilityHint ? t(props.accessibilityHint) : undefined} />;
});
