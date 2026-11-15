/** Refresh the public, static English catalog. Never includes player-entered text. */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const strings = new Set();
// Keep this normalization aligned with ui/text.ts; Indic ZWJ must survive.
const emojiSequence = /\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})*)*|\p{Regional_Indicator}|\p{Emoji_Modifier}|[0-9#*]\uFE0F?\u20E3|[\uFE0F\u20E3]/gu;
function add(value) {
  const text = value.replace(emojiSequence, '').replace(/\s+/g, ' ').trim();
  if (text.length < 2 || !/[A-Za-z]/.test(text) || text.length > 1200) return;
  // Exclude code identifiers, file names, colors, routes and URLs.
  if (/^(?:[@#/.]|https?:|lv_|VoyageSans|VoyageSerif)/.test(text) || (/[\\/]/.test(text) && !/\s/.test(text)) || /^[a-z][a-z0-9_.:-]*$/.test(text)) return;
  strings.add(text);
}
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'language') walk(path); continue; }
    if (!/\.tsx?$/.test(entry.name)) continue;
    const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node) {
      if (ts.isJsxText(node)) add(ts.decodeHtmlEntities ? ts.decodeHtmlEntities(node.text) : node.text.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent)) add(node.text);
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
}
walk(resolve('apps/mobile/src'));
for (const file of ['packages/game/src/activities.ts', 'packages/game/src/island.ts', 'packages/game/src/combat.ts', 'packages/game/src/config.ts', 'packages/game/src/shipwright.ts', 'server/src/quests.ts', 'server/src/ship.ts', 'server/src/titles.ts', 'apps/mobile/src/features/language/logText.ts']) {
  const parsed = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) { if (ts.isStringLiteral(node) && /[ A-Z]/.test(node.text)) add(node.text); ts.forEachChild(node, visit); }
  visit(parsed);
}
// Include the picker itself, which is excluded along with the translation implementation.
for (const text of ['Choose your language', 'Language', 'Search languages', 'Continue', 'App language', 'The app and the Tidekeeper will use this language.', 'Change language', 'Settings', 'Preparing translations…', 'Translations are unavailable. You can continue and try again later.', 'Try again', 'Cancel', 'Back', 'Save', 'Done']) add(text);
// Bundled labels are the offline contract, including labels introduced before their screen exists.
const bundled = JSON.parse(readFileSync('content/localization/bundled.json', 'utf8'));
for (const dictionary of Object.values(bundled)) for (const key of Object.keys(dictionary)) add(key);
mkdirSync('content/localization', { recursive: true });
writeFileSync('content/localization/source.json', `${JSON.stringify([...strings].sort(), null, 2)}\n`);
console.log(`Extracted ${strings.size} static phrases.`);
