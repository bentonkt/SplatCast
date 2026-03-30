import { test, expect } from '@playwright/test';

let roomCounter = 0;
function uniqueRoom(prefix: string): string {
  return `${prefix}-${Date.now()}-${roomCounter++}`;
}

async function waitForAppReady(page: import('@playwright/test').Page, room: string) {
  await page.goto(`/room/${room}`);
  await expect(page.locator('canvas#canvas')).toBeVisible();
  await page.waitForFunction(() => {
    const c = document.getElementById('canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.height > 0;
  }, { timeout: 10000 });
}

test('real splat file renders without crashing — canvas has non-background content', async ({ page }) => {
  const room = uniqueRoom('real-splat-render');
  await waitForAppReady(page, room);

  // Wait for the renderer to draw several frames with real splat data
  await page.waitForTimeout(600);

  // Verify the canvas is not just the clear color — real data produces visible output
  const hasContent = await page.evaluate(() => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(canvas, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    // Check if any pixel differs from the clear color (0.05, 0.05, 0.1) = (13, 13, 26)
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.abs(r - 13) > 10 || Math.abs(g - 13) > 10 || Math.abs(b - 26) > 10) {
        return true;
      }
    }
    return false;
  });

  expect(hasContent).toBe(true);
});

test('real splat file has 10000 splats with diverse colors in binary data', async ({ page }) => {
  const room = uniqueRoom('real-splat-data');
  await waitForAppReady(page, room);

  // Fetch and parse the splat data in-browser to verify the real file
  const splatInfo = await page.evaluate(async () => {
    const resp = await fetch('/sample.splat');
    const buffer = await resp.arrayBuffer();
    const BYTES_PER_SPLAT = 32;
    const count = Math.floor(buffer.byteLength / BYTES_PER_SPLAT);
    const view = new DataView(buffer);

    // Collect unique RGB colors from the binary data
    const colorSet = new Set<string>();
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < count; i++) {
      const offset = i * BYTES_PER_SPLAT;
      const x = view.getFloat32(offset, true);
      const y = view.getFloat32(offset + 4, true);
      const z = view.getFloat32(offset + 8, true);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;

      const r = view.getUint8(offset + 24);
      const g = view.getUint8(offset + 25);
      const b = view.getUint8(offset + 26);
      colorSet.add(`${r},${g},${b}`);
    }

    return {
      splatCount: count,
      byteLength: buffer.byteLength,
      uniqueColors: colorSet.size,
      spatialExtent: {
        x: maxX - minX,
        y: maxY - minY,
        z: maxZ - minZ,
      },
    };
  });

  // Verify this is a real splat file (10K splats, 320KB)
  expect(splatInfo.splatCount).toBe(10000);
  expect(splatInfo.byteLength).toBe(320000);

  // Real 3DGS reconstruction should have highly diverse colors (not synthetic patterns)
  // The Christmas tree scene has 9697 unique RGB triplets
  expect(splatInfo.uniqueColors).toBeGreaterThan(1000);

  // Real scene should span meaningful 3D space (not a flat grid)
  expect(splatInfo.spatialExtent.x).toBeGreaterThan(1);
  expect(splatInfo.spatialExtent.y).toBeGreaterThan(1);
  expect(splatInfo.spatialExtent.z).toBeGreaterThan(1);
});

test('camera auto-frames to scene bounds after loading real splat data', async ({ page }) => {
  const room = uniqueRoom('real-splat-autoframe');
  await waitForAppReady(page, room);

  // Verify the camera target was updated to the scene center (not origin)
  const cameraState = await page.evaluate(() => {
    const cam = (window as Record<string, unknown>)['__camera'] as {
      getOrbitalState(): { theta: number; phi: number; radius: number; target: [number, number, number] };
    };
    return cam.getOrbitalState();
  });

  // The real scene center is not at origin — auto-framing should move the target
  const [tx, ty, tz] = cameraState.target;
  const isNotOrigin = Math.abs(tx) > 0.01 || Math.abs(ty) > 0.01 || Math.abs(tz) > 0.01;
  expect(isNotOrigin).toBe(true);

  // Camera radius should be adjusted for the scene extent (not the default 5)
  expect(cameraState.radius).not.toBe(5);
});

test('synthetic fallback splat file is still available', async ({ page }) => {
  const room = uniqueRoom('real-splat-fallback');
  await waitForAppReady(page, room);

  // The synthetic sample should still be served at its fallback path
  const info = await page.evaluate(async () => {
    const resp = await fetch('/sample-synthetic.splat');
    if (!resp.ok) return { status: resp.status, splatCount: 0 };
    const buffer = await resp.arrayBuffer();
    return {
      status: resp.status,
      splatCount: Math.floor(buffer.byteLength / 32),
    };
  });

  expect(info.status).toBe(200);
  expect(info.splatCount).toBe(100); // original synthetic had 100 splats
});
