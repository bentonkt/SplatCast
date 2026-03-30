import { test, expect } from '@playwright/test';

let roomCounter = 0;
function uniqueRoom(prefix: string): string {
  return `${prefix}-${Date.now()}-${roomCounter++}`;
}

async function waitForAppReady(page: import('@playwright/test').Page, room?: string) {
  const url = room ? `/room/${room}` : '/';
  await page.goto(url);
  await expect(page.locator('canvas#canvas')).toBeVisible();
  await page.waitForFunction(() => {
    const c = document.getElementById('canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.height > 0;
  }, { timeout: 10000 });
  await page.waitForSelector('#annotation-toolbar', { timeout: 5000 });
  await page.waitForSelector('#pin-overlay', { timeout: 5000 });
}

test('inspector button appears in toolbar', async ({ page }) => {
  const room = uniqueRoom('inspector');
  await waitForAppReady(page, room);
  const btn = page.locator('#inspector-btn');
  await expect(btn).toBeVisible();
});

test('clicking inspector button toggles inspector mode', async ({ page }) => {
  const room = uniqueRoom('inspector-toggle');
  await waitForAppReady(page, room);

  const btn = page.locator('#inspector-btn');
  const canvas = page.locator('canvas#canvas');

  // Initially not active — cursor should be default
  await expect(canvas).toHaveCSS('cursor', 'auto');

  // Click to activate
  await btn.click();
  await expect(canvas).toHaveCSS('cursor', 'crosshair');

  // Click again to deactivate
  await btn.click();
  await expect(canvas).toHaveCSS('cursor', 'auto');
});

test('pressing I key toggles inspector mode', async ({ page }) => {
  const room = uniqueRoom('inspector-key');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  await expect(canvas).toHaveCSS('cursor', 'auto');

  await page.keyboard.press('i');
  await expect(canvas).toHaveCSS('cursor', 'crosshair');

  await page.keyboard.press('i');
  await expect(canvas).toHaveCSS('cursor', 'auto');
});

test('clicking a splat in inspector mode shows tooltip with properties', async ({ page }) => {
  const room = uniqueRoom('inspector-pick');
  await waitForAppReady(page, room);

  // Wait for splats to load
  await page.waitForFunction(() => {
    const r = (window as Record<string, unknown>)['__renderer'] as { getSplatCount: () => number } | undefined;
    return r && r.getSplatCount() > 0;
  }, { timeout: 10000 });

  // Activate inspector mode
  await page.keyboard.press('i');

  // Click center of the canvas where splats are likely rendered
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.click(cx, cy);

  // Tooltip should appear
  const tooltip = page.locator('#splat-inspector-tooltip');
  await expect(tooltip).toBeVisible({ timeout: 3000 });

  // Tooltip should contain splat properties
  const text = await tooltip.textContent();
  expect(text).toContain('Splat #');
  expect(text).toContain('XYZ:');
  expect(text).toContain('RGB:');
  expect(text).toContain('Opacity:');
  expect(text).toContain('Scale:');
});

test('tooltip hides when clicking empty area in inspector mode', async ({ page }) => {
  const room = uniqueRoom('inspector-miss');
  await waitForAppReady(page, room);

  await page.waitForFunction(() => {
    const r = (window as Record<string, unknown>)['__renderer'] as { getSplatCount: () => number } | undefined;
    return r && r.getSplatCount() > 0;
  }, { timeout: 10000 });

  // Activate inspector mode and click splat
  await page.keyboard.press('i');
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');

  // Click center (where splats are)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const tooltip = page.locator('#splat-inspector-tooltip');
  await expect(tooltip).toBeVisible({ timeout: 3000 });

  // Click far corner (unlikely to have splats)
  await page.mouse.click(box.x + 2, box.y + 2);
  await expect(tooltip).toBeHidden({ timeout: 3000 });
});

test('deactivating inspector hides tooltip', async ({ page }) => {
  const room = uniqueRoom('inspector-deactivate');
  await waitForAppReady(page, room);

  await page.waitForFunction(() => {
    const r = (window as Record<string, unknown>)['__renderer'] as { getSplatCount: () => number } | undefined;
    return r && r.getSplatCount() > 0;
  }, { timeout: 10000 });

  // Activate and click splat
  await page.keyboard.press('i');
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const tooltip = page.locator('#splat-inspector-tooltip');
  await expect(tooltip).toBeVisible({ timeout: 3000 });

  // Deactivate with I key
  await page.keyboard.press('i');
  await expect(tooltip).toBeHidden();
});

test('I key does not toggle inspector when input is focused', async ({ page }) => {
  const room = uniqueRoom('inspector-input');
  await waitForAppReady(page, room);

  // Create a double-click to get a label input
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');

  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
  await page.mouse.dblclick(box.x + 200, box.y + 200);
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

  // Click pin to open label editor
  await page.locator(pinSelector).first().click();

  const input = page.locator('#pin-label-input');
  await expect(input).toBeVisible({ timeout: 3000 });

  // Press I while input focused — should type, not toggle
  await input.press('i');
  const canvasCursor = await canvas.evaluate((el) => getComputedStyle(el).cursor);
  expect(canvasCursor).not.toBe('crosshair');
});
