/**
 * Generates a synthetic sample.splat file with 100 random Gaussian splats.
 * Binary format: 32 bytes per splat
 *   position: 3x f32 (12 bytes) — xyz in range [-1, 1]
 *   scale:    3x f32 (12 bytes) — uniform small scale ~0.05
 *   color:    4x u8  (4 bytes)  — random RGB, alpha=200
 *   rotation: 4x u8  (4 bytes)  — identity quaternion encoded as bytes
 *
 * Run with: npx tsx scripts/generate-sample.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const COUNT = 100;
const BYTES_PER_SPLAT = 32;
const buffer = Buffer.alloc(COUNT * BYTES_PER_SPLAT);

for (let i = 0; i < COUNT; i++) {
  const offset = i * BYTES_PER_SPLAT;

  // Position: random in [-1.5, 1.5]
  buffer.writeFloatLE((Math.random() - 0.5) * 3, offset + 0);
  buffer.writeFloatLE((Math.random() - 0.5) * 3, offset + 4);
  buffer.writeFloatLE((Math.random() - 0.5) * 3, offset + 8);

  // Scale: small uniform splats
  const scale = 0.03 + Math.random() * 0.07;
  buffer.writeFloatLE(scale, offset + 12);
  buffer.writeFloatLE(scale, offset + 16);
  buffer.writeFloatLE(scale, offset + 20);

  // Color: random RGB with high alpha
  buffer.writeUInt8(Math.floor(Math.random() * 256), offset + 24); // R
  buffer.writeUInt8(Math.floor(Math.random() * 256), offset + 25); // G
  buffer.writeUInt8(Math.floor(Math.random() * 256), offset + 26); // B
  buffer.writeUInt8(220,                              offset + 27); // A

  // Rotation: identity quaternion (0, 0, 0, 1) encoded as bytes (128=0, 255=~1)
  buffer.writeUInt8(128, offset + 28); // x=0
  buffer.writeUInt8(128, offset + 29); // y=0
  buffer.writeUInt8(128, offset + 30); // z=0
  buffer.writeUInt8(255, offset + 31); // w=1
}

const outPath = join(__dirname, '..', 'src', 'public', 'sample.splat');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buffer);
console.log(`Wrote ${COUNT} splats to ${outPath} (${buffer.length} bytes)`);
