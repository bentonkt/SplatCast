/**
 * Generates a synthetic sample.ply file with 100 random Gaussian splats.
 * Binary little-endian PLY format matching the standard Gaussian splatting export.
 *
 * Run with: npx tsx scripts/generate-sample-ply.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const COUNT = 100;

// Build header
const header = [
  'ply',
  'format binary_little_endian 1.0',
  `element vertex ${COUNT}`,
  'property float x',
  'property float y',
  'property float z',
  'property float scale_0',
  'property float scale_1',
  'property float scale_2',
  'property float f_dc_0',
  'property float f_dc_1',
  'property float f_dc_2',
  'property float opacity',
  'property float rot_0',
  'property float rot_1',
  'property float rot_2',
  'property float rot_3',
  'end_header',
].join('\n') + '\n';

const headerBuf = Buffer.from(header, 'ascii');

// 14 float properties × 4 bytes = 56 bytes per vertex
const FLOATS_PER_VERTEX = 14;
const dataBuf = Buffer.alloc(COUNT * FLOATS_PER_VERTEX * 4);

for (let i = 0; i < COUNT; i++) {
  const offset = i * FLOATS_PER_VERTEX * 4;
  let off = offset;

  // Position: random in [-1.5, 1.5]
  dataBuf.writeFloatLE((Math.random() - 0.5) * 3, off); off += 4;
  dataBuf.writeFloatLE((Math.random() - 0.5) * 3, off); off += 4;
  dataBuf.writeFloatLE((Math.random() - 0.5) * 3, off); off += 4;

  // Scale (log-encoded): log(0.03..0.10)
  const scale = 0.03 + Math.random() * 0.07;
  dataBuf.writeFloatLE(Math.log(scale), off); off += 4;
  dataBuf.writeFloatLE(Math.log(scale), off); off += 4;
  dataBuf.writeFloatLE(Math.log(scale), off); off += 4;

  // SH DC color (f_dc_0..2): values in range that produce visible colors
  // SH_C0 = 0.2821, so color = val * 0.2821 + 0.5 → val ≈ (color - 0.5) / 0.2821
  const SH_C0 = 0.28209479177387814;
  dataBuf.writeFloatLE((Math.random() - 0.5) / SH_C0, off); off += 4;
  dataBuf.writeFloatLE((Math.random() - 0.5) / SH_C0, off); off += 4;
  dataBuf.writeFloatLE((Math.random() - 0.5) / SH_C0, off); off += 4;

  // Opacity (logit-encoded): sigmoid(val) ≈ 0.86 → val ≈ 1.8
  dataBuf.writeFloatLE(1.8, off); off += 4;

  // Rotation quaternion (w, x, y, z) — identity
  dataBuf.writeFloatLE(1.0, off); off += 4;
  dataBuf.writeFloatLE(0.0, off); off += 4;
  dataBuf.writeFloatLE(0.0, off); off += 4;
  dataBuf.writeFloatLE(0.0, off); off += 4;
}

const outPath = join(__dirname, '..', 'src', 'public', 'sample.ply');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.concat([headerBuf, dataBuf]));
console.log(`Wrote ${COUNT} splats to ${outPath} (${headerBuf.length + dataBuf.length} bytes)`);
