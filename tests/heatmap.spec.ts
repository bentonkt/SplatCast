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

test('heatmap button appears in toolbar', async ({ page }) => {
  const room = uniqueRoom('heatmap');
  await waitForAppReady(page, room);
  const btn = page.locator('#heatmap-btn');
  await expect(btn).toBeVisible();
});

test('clicking heatmap button shows heatmap canvas', async ({ page }) => {
  const room = uniqueRoom('heatmap-toggle');
  await waitForAppReady(page, room);

  const heatCanvas = page.locator('#heatmap-canvas');
  await expect(heatCanvas).toBeHidden();

  await page.click('#heatmap-btn');
  await expect(heatCanvas).toBeVisible();
});

test('pressing H key toggles heatmap overlay', async ({ page }) => {
  const room = uniqueRoom('heatmap-key');
  await waitForAppReady(page, room);

  const heatCanvas = page.locator('#heatmap-canvas');
  await expect(heatCanvas).toBeHidden();

  await page.keyboard.press('h');
  await expect(heatCanvas).toBeVisible();

  await page.keyboard.press('h');
  await expect(heatCanvas).toBeHidden();
});

test('heatmap renders density for annotation clusters', async ({ page }) => {
  const room = uniqueRoom('heatmap-density');
  await waitForAppReady(page, room);

  // Place several pins near each other to create a cluster
  const canvas = page.locator('canvas#canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Place 3 pins in a cluster (spaced enough to avoid merge, close enough for density)
  await page.mouse.dblclick(cx - 40, cy);
  await page.mouse.dblclick(cx + 40, cy);
  await page.mouse.dblclick(cx, cy + 40);

  // Wait for pins to appear
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(3);

  // Enable heatmap
  await page.click('#heatmap-btn');

  const heatCanvas = page.locator('#heatmap-canvas');
  await expect(heatCanvas).toBeVisible();

  // Verify heatmap canvas has non-zero dimensions and content
  const hasContent = await page.evaluate(() => {
    const hc = document.getElementById('heatmap-canvas') as HTMLCanvasElement;
    if (!hc || hc.width === 0 || hc.height === 0) return false;
    const ctx = hc.getContext('2d');
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, hc.width, hc.height).data;
    // Check if any pixel has non-zero alpha (heatmap was painted)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });

  expect(hasContent).toBe(true);
});

test('heatmap updates when new annotations are added', async ({ page }) => {
  const room = uniqueRoom('heatmap-update');
  await waitForAppReady(page, room);

  // Enable heatmap first (no annotations yet — canvas should be empty)
  await page.click('#heatmap-btn');

  const isEmpty = await page.evaluate(() => {
    const hc = document.getElementById('heatmap-canvas') as HTMLCanvasElement;
    if (!hc || hc.width === 0) return true;
    const ctx = hc.getContext('2d');
    if (!ctx) return true;
    const data = ctx.getImageData(0, 0, hc.width, hc.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return false;
    }
    return true;
  });
  expect(isEmpty).toBe(true);

  // Now place a pin
  const canvas = page.locator('canvas#canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  // Wait for pin
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);

  // Heatmap should now have content
  await page.waitForFunction(() => {
    const hc = document.getElementById('heatmap-canvas') as HTMLCanvasElement;
    if (!hc || hc.width === 0) return false;
    const ctx = hc.getContext('2d');
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, hc.width, hc.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  }, { timeout: 5000 });
});

test('two users see synced heatmap data', async ({ browser }) => {
  const room = uniqueRoom('heatmap-sync');
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await waitForAppReady(page1, room);
  await waitForAppReady(page2, room);

  // User 1 places pins
  const canvas1 = page1.locator('canvas#canvas');
  const box1 = (await canvas1.boundingBox())!;
  await page1.mouse.dblclick(box1.x + box1.width / 2, box1.y + box1.height / 2);
  await page1.mouse.dblclick(box1.x + box1.width / 2 + 15, box1.y + box1.height / 2 + 15);

  // Wait for sync to user 2
  await expect(page2.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(2, { timeout: 5000 });

  // User 2 enables heatmap and should see density from user 1's pins
  await page2.click('#heatmap-btn');

  const hasContent = await page2.evaluate(() => {
    const hc = document.getElementById('heatmap-canvas') as HTMLCanvasElement;
    if (!hc || hc.width === 0) return false;
    const ctx = hc.getContext('2d');
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, hc.width, hc.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });

  expect(hasContent).toBe(true);

  await ctx1.close();
  await ctx2.close();
});
