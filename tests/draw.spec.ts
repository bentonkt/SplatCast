import { test, expect } from '@playwright/test';

let roomCounter = 0;
function uniqueRoom(): string {
  return `draw-test-${Date.now()}-${roomCounter++}`;
}

async function waitForAppReady(page: import('@playwright/test').Page, room: string) {
  await page.goto(`/room/${room}`);
  await expect(page.locator('canvas#canvas')).toBeVisible();
  await page.waitForFunction(() => {
    const c = document.getElementById('canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.height > 0;
  }, { timeout: 10000 });
}

test('draw toggle button appears', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom());
  const btn = page.locator('#draw-toggle');
  await expect(btn).toBeVisible({ timeout: 5000 });
  await expect(btn).toHaveText('Draw');
});

test('clicking draw button enables draw mode', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom());
  const btn = page.locator('#draw-toggle');
  await btn.click();
  await expect(btn).toHaveText('Drawing...');
});

test('freehand stroke creates an SVG path', async ({ page }) => {
  const room = uniqueRoom();
  await waitForAppReady(page, room);
  await page.waitForSelector('#draw-overlay', { timeout: 5000 });

  // Enable drawing mode
  await page.locator('#draw-toggle').click();

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  const startX = box.x + 100;
  const startY = box.y + 100;

  // Draw a stroke
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 50, startY + 30, { steps: 5 });
  await page.mouse.move(startX + 100, startY + 60, { steps: 5 });
  await page.mouse.up();

  // One stroke should appear
  const paths = page.locator('#draw-overlay path.stroke-path');
  await expect(paths).toHaveCount(1, { timeout: 5000 });
});

test('multiple strokes accumulate', async ({ page }) => {
  const room = uniqueRoom();
  await waitForAppReady(page, room);
  await page.waitForSelector('#draw-overlay', { timeout: 5000 });

  await page.locator('#draw-toggle').click();

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Draw first stroke
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 50, { steps: 5 });
  await page.mouse.up();

  await expect(page.locator('#draw-overlay path.stroke-path')).toHaveCount(1, { timeout: 5000 });

  // Draw second stroke
  await page.mouse.move(box.x + 50, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 150, { steps: 5 });
  await page.mouse.up();

  const paths = page.locator('#draw-overlay path.stroke-path');
  await expect(paths).toHaveCount(2, { timeout: 5000 });
});

test('two users see synced strokes', async ({ browser }) => {
  const room = uniqueRoom();
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    await page1.waitForSelector('#draw-overlay', { timeout: 5000 });
    await page2.waitForSelector('#draw-overlay', { timeout: 5000 });

    // Give Yjs WebSocket time to connect
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    // Enable draw mode on page1
    await page1.locator('#draw-toggle').click();

    const box = await page1.locator('canvas#canvas').boundingBox();
    if (!box) throw new Error('Canvas bounding box not found');

    // Draw a stroke on page1
    await page1.mouse.move(box.x + 100, box.y + 100);
    await page1.mouse.down();
    await page1.mouse.move(box.x + 200, box.y + 150, { steps: 5 });
    await page1.mouse.up();

    // Verify stroke on page1
    await expect(page1.locator('#draw-overlay path.stroke-path')).toHaveCount(1, { timeout: 5000 });

    // Verify stroke synced to page2
    await expect(page2.locator('#draw-overlay path.stroke-path')).toHaveCount(1, { timeout: 10000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('pressing D key toggles draw mode', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom());
  const btn = page.locator('#draw-toggle');
  await expect(btn).toHaveText('Draw');

  await page.keyboard.press('d');
  await expect(btn).toHaveText('Drawing...');

  await page.keyboard.press('d');
  await expect(btn).toHaveText('Draw');
});
