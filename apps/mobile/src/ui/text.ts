/** Keep generated narration and activity copy as clean text, too. */
export const cleanText = (value: string): string => value
  .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D\u20E3]/gu, '')
  .replace(/[ \t]{2,}/g, ' ');
