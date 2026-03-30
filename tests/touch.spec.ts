import { test, expect, Page, CDPSession } from '@playwright/test';

let roomCounter = 0;
function uniqueRoom(prefix: string): string {
  return `${prefix}-${Date.now()}-${roomCounter++}`;
}

async function waitForAppReady(page: Page, room: string) {
  await page.goto(`/room/${room}`);
  await expect(page.locator('canvas#canvas')).toBeVisible();
  await page.waitForFunction(() => {
    const c = document.getElementById('canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.height > 0;
  }, { timeout: 10000 });
}

async function getCanvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dispatchTouchEvent(cdp: CDPSession, type: string, touches: Array<{ x: number; y: number; id?: number }>) {
  const touchPoints = touches.map((t, i) => ({
    x: t.x,
    y: t.y,
    id: t.id ?? i,
    radiusX: 10,
    radiusY: 10,
    force: 1,
  }));
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints,
  });
}

test('single-finger touch drag orbits camera', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('touch-orbit'));
  const canvas = page.locator('canvas#canvas');
  const { x, y } = await getCanvasCenter(page);

  const cdp = await page.context().newCDPSession(page);

  // Single finger drag
  await dispatchTouchEvent(cdp, 'touchStart', [{ x, y, id: 0 }]);
  for (let i = 1; i <= 5; i++) {
    await dispatchTouchEvent(cdp, 'touchMove', [{ x: x + i * 20, y: y + i * 10, id: 0 }]);
  }
  await dispatchTouchEvent(cdp, 'touchEnd', []);

  // Page should still be alive
  await expect(canvas).toBeVisible();
});

test('pinch-to-zoom with two fingers', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('touch-pinch'));
  const canvas = page.locator('canvas#canvas');
  const { x, y } = await getCanvasCenter(page);

  const cdp = await page.context().newCDPSession(page);

  // Two fingers start close together
  await dispatchTouchEvent(cdp, 'touchStart', [
    { x: x - 30, y, id: 0 },
    { x: x + 30, y, id: 1 },
  ]);

  // Spread apart (zoom in)
  for (let i = 1; i <= 5; i++) {
    await dispatchTouchEvent(cdp, 'touchMove', [
      { x: x - 30 - i * 10, y, id: 0 },
      { x: x + 30 + i * 10, y, id: 1 },
    ]);
  }

  // Pinch together (zoom out)
  for (let i = 5; i >= 0; i--) {
    await dispatchTouchEvent(cdp, 'touchMove', [
      { x: x - 30 - i * 10, y, id: 0 },
      { x: x + 30 + i * 10, y, id: 1 },
    ]);
  }

  await dispatchTouchEvent(cdp, 'touchEnd', []);

  await expect(canvas).toBeVisible();
});

test('double-tap places annotation pin', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('touch-dbl-tap'));

  await page.waitForSelector('#pin-overlay', { timeout: 5000 });

  const { x, y } = await getCanvasCenter(page);
  const cdp = await page.context().newCDPSession(page);

  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
  const baseline = await page.locator(pinSelector).count();

  // First tap
  await dispatchTouchEvent(cdp, 'touchStart', [{ x, y, id: 0 }]);
  await dispatchTouchEvent(cdp, 'touchEnd', []);

  // Short delay, then second tap (double-tap)
  await page.waitForTimeout(100);
  await dispatchTouchEvent(cdp, 'touchStart', [{ x, y, id: 0 }]);
  await dispatchTouchEvent(cdp, 'touchEnd', []);

  await expect(page.locator(pinSelector)).toHaveCount(baseline + 1, { timeout: 5000 });
});

test('touch draw creates a stroke', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('touch-draw'));

  // Enable draw mode
  await page.waitForSelector('#draw-toggle', { timeout: 5000 });
  await page.click('#draw-toggle');

  const { x, y } = await getCanvasCenter(page);
  const cdp = await page.context().newCDPSession(page);

  const strokeSelector = '#draw-overlay path.stroke-path';
  const baseline = await page.locator(strokeSelector).count();

  // Single-finger draw stroke
  await dispatchTouchEvent(cdp, 'touchStart', [{ x, y, id: 0 }]);
  for (let i = 1; i <= 10; i++) {
    await dispatchTouchEvent(cdp, 'touchMove', [{ x: x + i * 10, y: y + i * 5, id: 0 }]);
  }
  await dispatchTouchEvent(cdp, 'touchEnd', []);

  // Wait for the stroke to be synced back
  await expect(page.locator(strokeSelector)).toHaveCount(baseline + 1, { timeout: 5000 });
});
