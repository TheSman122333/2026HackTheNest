import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

const svg = (body: string, width: number, height: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`)}`;

// Original code-drawn paper and sea details, kept separate from the approved character sprites.
const scratches = Array.from({ length: 95 }, (_, n) => {
  const x = 8 + (n * 71) % 384;
  const y = 5 + (n * 37) % 144;
  const edge = x < 34 || x > 366 || y < 20 || y > 130;
  return `<path d="M${x} ${y}l${n % 2 ? -2 : 2} ${2 + n % 4}" stroke="#79542d" stroke-width="${edge ? 0.8 : 0.45}" opacity="${edge ? 0.35 : 0.1}"/>`;
}).join('');
const paper = svg(`<defs><linearGradient id="p" x2="0.8" y2="1"><stop stop-color="#ffe8aa"/><stop offset=".5" stop-color="#f8dda0"/><stop offset="1" stop-color="#eac277"/></linearGradient></defs><path d="M11 7L42 5L68 7L112 4L155 6L199 4L235 7L279 5L316 7L355 5L386 9L391 17L387 31L393 34L390 65L393 88L388 105L391 127L382 140L359 143L334 141L299 145L267 142L231 145L194 142L157 146L113 143L78 145L44 142L15 145L7 137L9 120L5 108L8 82L5 56L9 37L6 24Z" fill="url(#p)" stroke="#25221c" stroke-width="2.2" vector-effect="non-scaling-stroke"/><path d="M14 22l-3 16m2 76l-2 16M386 22l-2 11m0 82l-3 17M18 11l14-2m327 131l18-2" stroke="#63462b" stroke-width="1" opacity=".6"/>${scratches}`, 400, 150);

export function PaperArt() {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <Image source={{ uri: paper }} contentFit="fill" accessible={false} style={StyleSheet.absoluteFill} />
  </View>;
}

const cloud = (x: number, y: number, scale = 1) => `<path transform="translate(${x} ${y}) scale(${scale})" d="M0 53C-9 45-4 29 10 27C5 11 24 2 36 12C45-9 70-2 73 15C93 6 111 22 104 36C119 37 124 52 113 57L-1 62" fill="#fff1ce" stroke="#8bbbd0" stroke-width="1.2"/><path transform="translate(${x} ${y}) scale(${scale})" d="M6 52C1 40 15 34 24 40C25 26 44 25 50 38C60 24 79 33 80 44L108 53" fill="#c6e2e7" opacity=".8"/>`;
const wave = (y: number, offset: number, color: string) => `<path d="M-80 ${y + 19}Q-25 ${y - 3} 18 ${y - 21}Q45 ${y - 41} 61 ${y - 21}L48 ${y - 13}Q94 ${y + 6} 140 ${y - 15}Q190 ${y - 37} 223 ${y - 11}Q273 ${y + 13} 316 ${y - 17}Q352 ${y - 42} 381 ${y - 15}Q425 ${y + 6} 478 ${y - 22}L490 ${y + 90}H-80Z" transform="translate(${offset} 0)" fill="${color}" stroke="#084e81" stroke-width="1.2"/><path d="M-62 ${y + 15}Q-9 ${y - 3} 22 ${y - 23}Q43 ${y - 34} 57 ${y - 22}M51 ${y - 12}Q94 ${y + 3} 140 ${y - 18}M156 ${y - 20}Q193 ${y - 33} 220 ${y - 11}M258 ${y}Q295 ${y - 4} 321 ${y - 22}M340 ${y - 25}Q361 ${y - 34} 381 ${y - 14}M382 ${y - 13}Q425 ${y + 2} 474 ${y - 22}" transform="translate(${offset} 0)" fill="none" stroke="#e7f7ef" stroke-width="3" stroke-linecap="round"/><path d="M-10 ${y + 31}q24-12 49-5m48 11q29-8 52-3m60-6q29 7 56-3m70 12q23-11 55-6" fill="none" stroke="#63c4e8" stroke-width="1.4"/>`;
const inkMarks = Array.from({ length: 38 }, (_, n) => `<path d="M${(n * 113) % 400} ${(n * 197) % 900}l${4 + n % 8} -${5 + n % 9}" stroke="#064771" stroke-width=".7" opacity=".23"/>`).join('');

export const OCEAN_ART = svg(`<defs><linearGradient id="o" x2=".2" y2="1"><stop stop-color="#087dbb"/><stop offset=".42" stop-color="#32afe1"/><stop offset=".68" stop-color="#087dbb"/><stop offset="1" stop-color="#05679f"/></linearGradient></defs><rect width="400" height="900" fill="url(#o)"/><circle cx="357" cy="107" r="46" fill="#ffe6a0"/>${cloud(-55, 140, 1.1)}${cloud(326, 192, 1.05)}${cloud(-34, 375, 0.7)}${cloud(307, 434, 0.82)}<path d="M96 101q9-9 17 0q7-8 15-4M258 170q8-9 16-1q8-7 16-4M137 340q8-8 15 0q8-8 17-4" fill="none" stroke="#fff2d1" stroke-width="2"/>${wave(545, -12, '#198fc6')}${wave(608, 14, '#137fb9')}${wave(674, -21, '#218dc3')}${wave(742, 9, '#0978b3')}${wave(814, -5, '#0870ab')}${inkMarks}`, 400, 900);
export const WAVE_ART = svg(`${wave(44, 0, '#1d99cf')}${wave(100, 14, '#117eb7')}${wave(161, -14, '#096da5')}`, 460, 235);
