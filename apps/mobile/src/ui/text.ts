/** Keep generated narration and activity copy as clean text, too. */
export const cleanText = (value: string): string => value
  // Remove an emoji's joiners with its sequence. Standalone ZWJ is meaningful in Indic text.
  .replace(/\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})*)*|\p{Regional_Indicator}|\p{Emoji_Modifier}|[0-9#*]\uFE0F?\u20E3|[\uFE0F\u20E3]/gu, '')
  .replace(/[ \t]{2,}/g, ' ');
