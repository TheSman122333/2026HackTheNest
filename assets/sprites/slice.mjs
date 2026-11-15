// Slice approved atlases into individual sprites for the app.
// usage: node slice.mjs <repoRoot>
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
const src = join(root, 'assets/sprites/atlases');
const out = join(root, 'apps/mobile/assets/game');

const SHEETS = [
  { file: 'inventory_items_16.png', dir: 'items', cols: 4, rows: 4, trim: true,
    names: ['cutlass', 'tonic', 'chest', 'chest_open', 'cannon', 'shield', 'boots', 'map', 'key', 'hourglass', 'coin', 'shard', 'dice', 'journal', 'compass', 'ring'] },
  { file: 'productivity_quest_icons_12.png', dir: 'quests', cols: 4, rows: 3, trim: true,
    names: ['walk', 'read', 'workout', 'mindful', 'chores', 'friends', 'study', 'savings', 'food', 'water', 'sleep', 'hobby'] },
  { file: 'adventure_tokens_12.png', dir: 'tokens', cols: 4, rows: 3, trim: true,
    names: ['leaf', 'book', 'chest', 'mystery', 'campfire', 'heart', 'swirl', 'rage', 'flag', 'star', 'anchor', 'lock'] },
  { file: 'monthly_adventure_tiles_12.png', dir: 'months', cols: 4, rows: 3, trim: true,
    names: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] },
  { file: 'raid_bosses_set_01.png', dir: 'bosses', cols: 3, rows: 2, trim: false,
    names: ['crab', 'octopus', 'beetle', 'jellyfish', 'turtle', 'manta_rainbow'] },
  { file: 'raid_bosses_set_02.png', dir: 'bosses', cols: 3, rows: 2, trim: false,
    names: ['scorpion', 'nautilus', 'golem', 'angler', 'manta_storm', 'serpent'] },
  { file: 'class_avatars_set_01.png', dir: 'avatars', cols: 3, rows: 2, trim: false,
    names: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'] },
  { file: 'class_avatars_set_02.png', dir: 'avatars', cols: 3, rows: 2, trim: false,
    names: ['a7', 'a8', 'a9', 'a10', 'a11', 'a12'] },
  { file: 'boss_ability_effects_12.png', dir: 'effects', cols: 4, rows: 3, trim: true,
    names: ['claw','ink','storm','beam','time','wave','heal','shield_break','footsteps','smoke','spark','slam'] },
  { file: 'boss_cosmetic_rewards_12.png', dir: 'cosmetics', cols: 4, rows: 3, trim: true,
    names: Array.from({ length: 12 }, (_, i) => `c${i + 1}`) },
];

for (const s of SHEETS) {
  const path = join(src, s.file);
  const { width, height } = await sharp(path).metadata();
  const cw = Math.floor(width / s.cols);
  const ch = Math.floor(height / s.rows);
  mkdirSync(join(out, s.dir), { recursive: true });
  for (let i = 0; i < s.names.length; i++) {
    const x = (i % s.cols) * cw;
    const y = Math.floor(i / s.cols) * ch;
    const m = s.trim ? 0 : Math.round(cw * 0.05);
    let img = sharp(path).extract({ left: x + m, top: y + m, width: cw - 2 * m, height: ch - 2 * m });
    if (s.trim) img = sharp(await img.png().toBuffer()).trim({ threshold: 10 });
    const size = s.dir === 'bosses' || s.dir === 'avatars' ? 384 : 192;
    await img
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toFile(join(out, s.dir, `${s.names[i]}.png`));
  }
  console.log(`${s.file} → ${s.dir}/ (${s.names.length})`);
}
