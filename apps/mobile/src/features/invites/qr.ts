/** QR Model 2, byte mode, low error correction, versions 1–9. No network or native dependency. */
const CAPACITY = [0, 19, 34, 55, 80, 108, 136, 156, 194, 232];
const ECC = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30];
const ALIGNMENT = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46]];
type Matrix = boolean[][];

function bytes(text: string): number[] {
  const result: number[] = [];
  for (const char of text) {
    const point = char.codePointAt(0)!;
    if (point < 0x80) result.push(point);
    else if (point < 0x800) result.push(0xC0 | point >> 6, 0x80 | point & 63);
    else if (point < 0x10000) result.push(0xE0 | point >> 12, 0x80 | point >> 6 & 63, 0x80 | point & 63);
    else result.push(0xF0 | point >> 18, 0x80 | point >> 12 & 63, 0x80 | point >> 6 & 63, 0x80 | point & 63);
  }
  return result;
}

function multiply(a: number, b: number) {
  let product = 0;
  for (let bit = 0; bit < 8; bit++) {
    if (b & 1) product ^= a;
    b >>= 1;
    a <<= 1;
    if (a & 256) a ^= 0x11D;
  }
  return product;
}

function parity(data: number[], degree: number): number[] {
  let polynomial = [1];
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const next = Array<number>(polynomial.length + 1).fill(0);
    polynomial.forEach((value, j) => { next[j] ^= value; next[j + 1] ^= multiply(value, root); });
    polynomial = next;
    root = multiply(root, 2);
  }
  const work = [...data, ...Array<number>(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = work[i];
    for (let j = 0; j < polynomial.length; j++) work[i + j] ^= multiply(polynomial[j], factor);
  }
  return work.slice(data.length);
}

const masked = (mask: number, x: number, y: number): boolean => [
  (x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0,
  (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  x * y % 2 + x * y % 3 === 0,
  (x * y % 2 + x * y % 3) % 2 === 0,
  ((x + y) % 2 + x * y % 3) % 2 === 0,
][mask];

function penalty(matrix: Matrix) {
  const size = matrix.length;
  let score = 0;
  let dark = 0;
  for (let axis = 0; axis < 2; axis++) {
    for (let line = 0; line < size; line++) {
      const values = Array.from({ length: size }, (_, i) => axis ? matrix[i][line] : matrix[line][i]);
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && values[i] === values[i - 1]) run++;
        else { if (run >= 5) score += run - 2; run = 1; }
      }
      const binary = values.map(Number).join('');
      for (let i = 0; i <= size - 11; i++) {
        const pattern = binary.slice(i, i + 11);
        if (pattern === '00001011101' || pattern === '10111010000') score += 40;
      }
    }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (matrix[y][x]) dark++;
    if (x && y && matrix[y][x] === matrix[y - 1][x] && matrix[y][x] === matrix[y][x - 1] && matrix[y][x] === matrix[y - 1][x - 1]) score += 3;
  }
  return score + Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
}

/** Returns the dark modules without the required four-module quiet zone. */
export function qrMatrix(text: string): Matrix {
  const data = bytes(text);
  const version = CAPACITY.findIndex((capacity, index) => index > 0 && data.length * 8 + 12 <= capacity * 8);
  if (version < 1) throw new Error('This invite link is too long for a QR code. Share the invite code instead.');
  const bits: number[] = [];
  const append = (value: number, length: number) => { for (let shift = length - 1; shift >= 0; shift--) bits.push(value >>> shift & 1); };
  append(4, 4); // Byte mode; versions below 10 use an eight-bit byte count.
  append(data.length, 8);
  data.forEach((byte) => append(byte, 8));
  append(0, Math.min(4, CAPACITY[version] * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const payload: number[] = [];
  for (let i = 0; i < bits.length; i += 8) payload.push(bits.slice(i, i + 8).reduce((value, bit) => value * 2 + bit, 0));
  for (let pad = 0; payload.length < CAPACITY[version]; pad++) payload.push(pad % 2 ? 0x11 : 0xEC);
  const blockCount = version >= 6 ? 2 : 1;
  const length = payload.length / blockCount;
  const blocks = Array.from({ length: blockCount }, (_, i) => payload.slice(i * length, (i + 1) * length));
  const checks = blocks.map((block) => parity(block, ECC[version]));
  const codewords: number[] = [];
  for (let i = 0; i < length; i++) blocks.forEach((block) => codewords.push(block[i]));
  for (let i = 0; i < ECC[version]; i++) checks.forEach((block) => codewords.push(block[i]));
  const size = version * 4 + 17;
  const base = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const draw = (x: number, y: number, value: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    base[y][x] = value; fixed[y][x] = true;
  };
  for (let i = 0; i < size; i++) { draw(6, i, i % 2 === 0); draw(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      draw(cx + dx, cy + dy, distance !== 2 && distance !== 4);
    }
  }
  const positions = ALIGNMENT[version];
  for (let i = 0; i < positions.length; i++) for (let j = 0; j < positions.length; j++) {
    if (i === 0 && (j === 0 || j === positions.length - 1) || j === 0 && i === positions.length - 1) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) draw(positions[i] + dx, positions[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const format = (matrix: Matrix, mask: number, reserve = false) => {
    const value = 8 | mask; // Low correction's format selector is 01.
    let remainder = value;
    for (let i = 0; i < 10; i++) remainder = remainder << 1 ^ ((remainder >>> 9) * 0x537);
    const encoded = (value << 10 | remainder) ^ 0x5412;
    const set = (x: number, y: number, bit: number) => { matrix[y][x] = Boolean(encoded >>> bit & 1); if (reserve) fixed[y][x] = true; };
    for (let i = 0; i < 6; i++) set(8, i, i);
    set(8, 7, 6); set(8, 8, 7); set(7, 8, 8);
    for (let i = 9; i < 15; i++) set(14 - i, 8, i);
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, i);
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, i);
    matrix[size - 8][8] = true;
    if (reserve) fixed[size - 8][8] = true;
  };
  format(base, 0, true);
  if (version >= 7) {
    let remainder = version;
    for (let i = 0; i < 12; i++) remainder = remainder << 1 ^ ((remainder >>> 11) * 0x1F25);
    const encoded = version << 12 | remainder;
    for (let bit = 0; bit < 18; bit++) {
      const x = size - 11 + bit % 3;
      const y = Math.floor(bit / 3);
      draw(x, y, Boolean(encoded >>> bit & 1)); draw(y, x, Boolean(encoded >>> bit & 1));
    }
  }
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) {
      const y = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset++) {
        const x = right - offset;
        if (!fixed[y][x]) { base[y][x] = Boolean((codewords[bit >>> 3] ?? 0) >>> (7 - bit % 8) & 1); bit++; }
      }
    }
  }
  let best = base;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = base.map((row, y) => row.map((value, x) => fixed[y][x] ? value : value !== masked(mask, x, y)));
    format(candidate, mask);
    const score = penalty(candidate);
    if (score < bestPenalty) { best = candidate; bestPenalty = score; }
  }
  return best;
}
