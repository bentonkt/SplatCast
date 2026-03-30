import { test, expect } from '@playwright/test';

let roomCounter = 0;
function uniqueRoom(prefix: string): string {
  return `${prefix}-${Date.now()}-${roomCounter++}`;
}

// Helper: wait for app to finish initializing (canvas sized + either GPU or fallback text rendered)
async function waitForAppReady(page: import('@playwright/test').Page, room?: string) {
  const url = room ? `/?room=${room}` : '/';
  await page.goto(url);
  // Canvas must be visible
  await expect(page.locator('canvas#canvas')).toBeVisible();
  // Wait for canvas to be sized (JS has run)
  await page.waitForFunction(() => {
    const c = document.getElementById('canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.height > 0;
  }, { timeout: 10000 });
}

test('loads the app and renders canvas', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('smoke-load'));
  const canvas = page.locator('canvas#canvas');
  await expect(canvas).toBeVisible();
  // Canvas should be full-viewport sized
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);
});

test('camera orbit — mouse drag rotates view', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('smoke-orbit'));
  const canvas = page.locator('canvas#canvas');

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  // Simulate a drag — should not throw
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 100, centerY + 50, { steps: 10 });
  await page.mouse.up();

  // Page should still be alive with a canvas after interaction
  await expect(canvas).toBeVisible();
});

test('scroll to zoom — wheel event on canvas', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('smoke-zoom'));
  const canvas = page.locator('canvas#canvas');

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  await page.mouse.move(centerX, centerY);
  await page.mouse.wheel(0, -120); // scroll up (zoom in)
  await page.mouse.wheel(0, 120);  // scroll down (zoom out)

  await expect(canvas).toBeVisible();
});

test('double-click places an annotation pin', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('smoke-pin'));
  const canvas = page.locator('canvas#canvas');

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Wait for pin-overlay to be mounted (PinManager runs regardless of WebGPU)
  await page.waitForSelector('#pin-overlay', { timeout: 5000 });

  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
  const baseline = await page.locator(pinSelector).count();

  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator(pinSelector)).toHaveCount(baseline + 1, { timeout: 5000 });
});

test('multiple double-clicks accumulate pins', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('smoke-multi-pin'));
  const canvas = page.locator('canvas#canvas');

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  await page.waitForSelector('#pin-overlay', { timeout: 5000 });

  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
  const baseline = await page.locator(pinSelector).count();

  await page.mouse.dblclick(box.x + 100, box.y + 100);
  await page.mouse.dblclick(box.x + 200, box.y + 200);
  await page.mouse.dblclick(box.x + 300, box.y + 300);

  await expect(page.locator(pinSelector)).toHaveCount(baseline + 3, { timeout: 5000 });
});

test('two users see synced annotations', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('smoke-sync');
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    await page1.waitForSelector('#pin-overlay', { timeout: 5000 });
    await page2.waitForSelector('#pin-overlay', { timeout: 5000 });

    const box = await page1.locator('canvas#canvas').boundingBox();
    if (!box) throw new Error('Canvas bounding box not found');

    // Give Yjs WebSocket time to connect on both clients
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
    const baseline1 = await page1.locator(pinSelector).count();
    const baseline2 = await page2.locator(pinSelector).count();

    await page1.mouse.dblclick(box.x + 200, box.y + 200);

    // Verify pin appears on page1 first
    await expect(page1.locator(pinSelector)).toHaveCount(baseline1 + 1, { timeout: 5000 });

    // Verify sync to page2
    await expect(page2.locator(pinSelector)).toHaveCount(baseline2 + 1, { timeout: 10000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});
