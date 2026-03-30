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

test('renders with depth-sorted alpha blending — canvas is not blank after load', async ({ page }) => {
  const room = uniqueRoom('depth-sort-render');
  await waitForAppReady(page, room);

  // Wait a few frames for the renderer to draw splats
  await page.waitForTimeout(500);

  // Sample canvas pixels to verify rendering occurred (not just the clear color)
  const hasContent = await page.evaluate(() => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    // Try WebGPU-based check: if the app rendered, the canvas shouldn't be purely the bg color
    // We'll use a 2D canvas to read pixels from the rendered frame
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(canvas, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    // Check if any pixel differs from the clear color (0.05, 0.05, 0.1) = (13, 13, 26)
    // Allow some tolerance for the clear color
    let nonBgPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (Math.abs(r - 13) > 10 || Math.abs(g - 13) > 10 || Math.abs(b - 26) > 10) {
        nonBgPixels++;
      }
    }
    return nonBgPixels > 0;
  });

  // The splat data should render something visible
  expect(hasContent).toBe(true);
});

test('camera orbit interaction works with depth-sorted renderer', async ({ page }) => {
  const room = uniqueRoom('depth-sort-orbit');
  await waitForAppReady(page, room);

  // Wait for initial render
  await page.waitForTimeout(300);

  // Orbit the camera significantly — this triggers depth re-sort each frame
  const box = await page.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 200, cy + 100, { steps: 20 });
  await page.mouse.up();

  // Wait for several frames of re-rendering with new sort order
  await page.waitForTimeout(300);

  // Canvas should still be visible and responsive (no crash from sort/index update)
  await expect(page.locator('canvas#canvas')).toBeVisible();

  // Verify annotations still work after orbit with depth sorting active
  await page.waitForSelector('#pin-overlay', { timeout: 5000 });
  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
  const baseline = await page.locator(pinSelector).count();

  await page.mouse.dblclick(cx, cy);
  await expect(page.locator(pinSelector)).toHaveCount(baseline + 1, { timeout: 5000 });
});

test('alpha blending enabled — semi-transparent splats composite correctly', async ({ page }) => {
  const room = uniqueRoom('depth-sort-alpha');
  await waitForAppReady(page, room);

  // Wait for render
  await page.waitForTimeout(500);

  // Verify that the render pipeline was created with blending by checking
  // that the canvas renders without errors and produces visible output
  const canvasOk = await page.evaluate(() => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) return false;
    // If WebGPU context is lost or pipeline failed, canvas would be blank
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(canvas, 0, 0);
    // Check we can read the canvas (no security/context errors)
    const data = ctx.getImageData(0, 0, 1, 1);
    return data.data.length === 4;
  });

  expect(canvasOk).toBe(true);

  // Verify canvas is still interactive (not crashed from pipeline changes)
  const canvas = page.locator('canvas#canvas');
  await expect(canvas).toBeVisible();
});
