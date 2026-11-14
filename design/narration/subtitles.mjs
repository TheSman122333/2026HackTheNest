/**
 * Text-only captions. Timing is estimated for reading, never aligned to speech.
 * Browser-safe: share these cues with a preview/player without a voice API call.
 */
const defaults = { wordsPerMinute: 155, charsPerLine: 38, maxLines: 2, minCueMs: 1600 };
const graphemeSegmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (text) => graphemeSegmenter
  ? Array.from(graphemeSegmenter.segment(text), (part) => part.segment) : Array.from(text);

function settings(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some((key) => !Object.hasOwn(defaults, key))) throw new TypeError('Unknown subtitle options.');
  const config = { ...defaults, ...options };
  const between = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  if (!between(config.wordsPerMinute, 40, 400)) throw new RangeError('wordsPerMinute must be between 40 and 400.');
  if (!Number.isInteger(config.charsPerLine) || !between(config.charsPerLine, 16, 64)) throw new RangeError('charsPerLine must be an integer between 16 and 64.');
  if (![1, 2].includes(config.maxLines)) throw new RangeError('maxLines must be 1 or 2.');
  if (!Number.isInteger(config.minCueMs) || !between(config.minCueMs, 500, 10_000)) throw new RangeError('minCueMs must be an integer between 500 and 10000.');
  return config;
}

/**
 * @param {string} text Plain narration, at most 4000 UTF-16 code units.
 * @param {{wordsPerMinute?:number,charsPerLine?:number,maxLines?:number,minCueMs?:number}} [options]
 * @returns {{timingBasis:'estimated',durationMs:number,cues:Array<{id:number,startMs:number,endMs:number,text:string}>}}
 */
export function createSubtitles(text, options = {}) {
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw new TypeError('Subtitle text must contain 1-4000 characters.');
  if (/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) throw new TypeError('Use plain narration without markup or control characters.');
  const config = settings(options);
  const words = text.trim().replace(/\s+/gu, ' ').split(' ');
  const cues = [];
  let lines = [''];
  let lineLength = 0;
  let time = 0;
  const emit = () => {
    const caption = lines.join('\n');
    if (!caption) return;
    // Character count also gives long words and unspaced scripts enough reading time.
    const effectiveWords = Math.max(caption.match(/\S+/gu)?.length ?? 0, graphemes(caption.replace(/\s/gu, '')).length / 6);
    const duration = Math.max(config.minCueMs, Math.round(effectiveWords * 60_000 / config.wordsPerMinute));
    cues.push({ id: cues.length + 1, startMs: time, endMs: time + duration, text: caption });
    time += duration;
    lines = [''];
    lineLength = 0;
  };
  for (const word of words) {
    const characters = graphemes(word);
    // Break only overlong tokens; preserve every grapheme, including joined emoji.
    for (let offset = 0; offset < characters.length; offset += config.charsPerLine) {
      const part = characters.slice(offset, offset + config.charsPerLine);
      const separator = offset === 0 && lineLength > 0 ? ' ' : '';
      if (lineLength + separator.length + part.length > config.charsPerLine) {
        if (lines.length === config.maxLines) emit();
        else { lines.push(''); lineLength = 0; }
      }
      const space = offset === 0 && lineLength > 0 ? ' ' : '';
      lines[lines.length - 1] += space + part.join('');
      lineLength += space.length + part.length;
    }
    // Prefer sentence boundaries once there is a useful amount of text on screen.
    if (/[.!?…]["'”’)]*$/u.test(word) && lines.join('').length >= 20) emit();
  }
  emit();
  return { timingBasis: 'estimated', durationMs: time, cues };
}

function checkedTrack(track) {
  if (!track || track.timingBasis !== 'estimated' || !Number.isSafeInteger(track.durationMs) || track.durationMs <= 0
      || !Array.isArray(track.cues) || !track.cues.length) throw new TypeError('Expected an estimated subtitle track.');
  let end = 0;
  for (const cue of track.cues) {
    if (!cue || cue.startMs !== end || !Number.isSafeInteger(cue.endMs) || cue.endMs <= cue.startMs
        || typeof cue.text !== 'string' || !cue.text.trim() || /[<>\r]/u.test(cue.text)) throw new TypeError('Invalid subtitle cue.');
    end = cue.endMs;
  }
  if (end !== track.durationMs) throw new TypeError('Subtitle duration does not match its cues.');
  return track;
}

function clock(ms, separator) {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${separator}${String(ms % 1000).padStart(3, '0')}`;
}

/** Export estimated reading timings; replace with real alignment when speech exists. */
export function toSrt(track) {
  return checkedTrack(track).cues.map((cue, index) => `${index + 1}\n${clock(cue.startMs, ',')} --> ${clock(cue.endMs, ',')}\n${cue.text}\n`).join('\n');
}

/** WebVTT escapes ampersands so ordinary names and prose display literally. */
export function toVtt(track) {
  return `WEBVTT\n\n${checkedTrack(track).cues.map((cue, index) => `${index + 1}\n${clock(cue.startMs, '.')} --> ${clock(cue.endMs, '.')}\n${cue.text.replaceAll('&', '&amp;')}\n`).join('\n')}`;
}

/** Start-inclusive, end-exclusive lookup. The caller owns the playback clock. */
export function cueAt(track, positionMs) {
  if (!Number.isFinite(positionMs)) throw new TypeError('Subtitle position must be finite milliseconds.');
  if (!track || !Array.isArray(track.cues)) throw new TypeError('Expected a subtitle track.');
  if (positionMs < 0 || positionMs >= track.durationMs) return null;
  let low = 0;
  let high = track.cues.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const cue = track.cues[middle];
    if (positionMs < cue.startMs) high = middle - 1;
    else if (positionMs >= cue.endMs) low = middle + 1;
    else return cue;
  }
  return null;
}
