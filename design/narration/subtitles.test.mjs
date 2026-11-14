import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubtitles, cueAt, toSrt, toVtt } from './subtitles.mjs';

const compact = (text) => text.replace(/\s/gu, '');
const normalize = (text) => text.trim().replace(/\s+/gu, ' ');
const count = (text) => Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length;

test('subtitle text is readable in two bounded lines without losing words or punctuation', () => {
  const text = '  Aye, Maya!\nYou logged a walk, earning 2 Supplies, 1 Island Move, and 1 Legend.\tReal life keeps us sailing.  ';
  const track = createSubtitles(text);
  assert.equal(track.timingBasis, 'estimated');
  assert.equal(normalize(track.cues.map((cue) => cue.text).join(' ')), normalize(text));
  assert.ok(track.cues.length >= 2);
  let previousEnd = 0;
  track.cues.forEach((cue, index) => {
    assert.equal(cue.id, index + 1);
    assert.equal(cue.startMs, previousEnd);
    assert.ok(cue.endMs - cue.startMs >= 1600);
    assert.ok(cue.text.split('\n').length <= 2);
    cue.text.split('\n').forEach((line) => assert.ok(count(line) <= 38));
    previousEnd = cue.endMs;
  });
  assert.equal(track.durationMs, previousEnd);
});

test('long unbroken tokens and Unicode graphemes wrap without dropping characters', () => {
  const longName = 'TheVeryLongNameOfTheShipThatSimplyKeepsGoingAndGoingAcrossEverySea';
  const text = `Élodie & 李 found treasure. ${longName} ${'👩🏽‍🚀'.repeat(45)} e\u0301lan.`;
  const track = createSubtitles(text);
  assert.equal(compact(track.cues.map((cue) => cue.text).join('')), compact(text));
  for (const cue of track.cues) {
    for (const line of cue.text.split('\n')) assert.ok(count(line) <= 38);
  }
  assert.equal((track.cues.map((cue) => cue.text).join('').match(/👩🏽‍🚀/gu) ?? []).length, 45);
});

test('cue lookup uses start-inclusive/end-exclusive boundaries with no overlaps or gaps', () => {
  const track = createSubtitles('Welcome back aboard, mate. The ship has a fresh page waiting in the log.');
  assert.ok(track.cues.length > 1);
  assert.equal(cueAt(track, -1), null);
  for (let i = 0; i < track.cues.length; i++) {
    const cue = track.cues[i];
    assert.equal(cueAt(track, cue.startMs), cue);
    assert.equal(cueAt(track, cue.endMs - 0.1), cue);
    assert.equal(cueAt(track, cue.endMs), track.cues[i + 1] ?? null);
  }
  assert.equal(cueAt(track, track.durationMs + 1), null);
  assert.throws(() => cueAt(track, NaN));
  assert.throws(() => cueAt(null, 0));
});

test('reading-speed options affect timing, and custom wrapping remains within bounds', () => {
  const text = 'A measured account of an ordinary adventure that deserves its own careful telling.';
  const fast = createSubtitles(text, { wordsPerMinute: 300, minCueMs: 500 });
  const slow = createSubtitles(text, { wordsPerMinute: 100, minCueMs: 500 });
  assert.ok(slow.durationMs > fast.durationMs);
  const narrow = createSubtitles(text, { charsPerLine: 16, maxLines: 1 });
  assert.equal(normalize(narrow.cues.map((cue) => cue.text).join(' ')), text);
  assert.ok(narrow.cues.every((cue) => !cue.text.includes('\n') && count(cue.text) <= 16));
});

test('SRT and WebVTT export correct timestamps and literal text', () => {
  const track = {
    timingBasis: 'estimated', durationMs: 3_661_007,
    cues: [
      { id: 1, startMs: 0, endMs: 1501, text: 'Maya & Ash\nare aboard.' },
      { id: 2, startMs: 1501, endMs: 3_661_007, text: 'The next page.' },
    ],
  };
  assert.equal(toSrt(track), '1\n00:00:00,000 --> 00:00:01,501\nMaya & Ash\nare aboard.\n\n2\n00:00:01,501 --> 01:01:01,007\nThe next page.\n');
  assert.equal(toVtt(track), 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.501\nMaya &amp; Ash\nare aboard.\n\n2\n00:00:01.501 --> 01:01:01.007\nThe next page.\n');
});

test('invalid text, options and malformed exported tracks are rejected', () => {
  for (const value of ['', ' \n ', null, 10, 'x'.repeat(4001), '<script>bad</script>', 'bad\u0000text']) assert.throws(() => createSubtitles(value));
  for (const options of [null, [], { nope: true }, { wordsPerMinute: 0 }, { wordsPerMinute: Infinity }, { charsPerLine: 15 }, { charsPerLine: 16.5 }, { maxLines: 3 }, { minCueMs: 0 }]) assert.throws(() => createSubtitles('A short line.', options));
  const valid = createSubtitles('A short line.');
  for (const value of [null, {}, { ...valid, durationMs: 1 }, { ...valid, timingBasis: 'aligned' }, { ...valid, cues: [{ ...valid.cues[0], startMs: 1 }] }]) {
    assert.throws(() => toSrt(value));
    assert.throws(() => toVtt(value));
  }
});
