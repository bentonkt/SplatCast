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

test('measurement button appears in toolbar', async ({ page }) => {
  const room = uniqueRoom('measure-btn');
  await waitForAppReady(page, room);
  const btn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="measurement"]');
  await expect(btn).toBeVisible();
});

test('clicking measurement button activates measurement mode', async ({ page }) => {
  const room = uniqueRoom('measure-mode');
  await waitForAppReady(page, room);
  const btn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="measurement"]');
  await btn.click();
  await expect(btn).toHaveCSS('border-color', 'rgb(78, 205, 196)');
});

test('measurement mode — two double-clicks create measurement annotation', async ({ page }) => {
  const room = uniqueRoom('measure-create');
  await waitForAppReady(page, room);

  const measurements = page.locator('#pin-overlay > svg[data-annotation-type="measurement"]');
  const initialCount = await measurements.count();

  const box = await page.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  await page.locator('#annotation-toolbar .toolbar-btn[data-mode="measurement"]').click();

  await page.mouse.dblclick(box.x + 100, box.y + 200);
  await page.mouse.dblclick(box.x + 300, box.y + 200);

  await expect(measurements).toHaveCount(initialCount + 1, { timeout: 5000 });
});

test('measurement annotation shows distance label', async ({ page }) => {
  const room = uniqueRoom('measure-label');
  await waitForAppReady(page, room);

  const box = await page.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  await page.locator('#annotation-toolbar .toolbar-btn[data-mode="measurement"]').click();

  await page.mouse.dblclick(box.x + 100, box.y + 200);
  await page.mouse.dblclick(box.x + 300, box.y + 200);

  const measurement = page.locator('#pin-overlay > svg[data-annotation-type="measurement"]');
  await expect(measurement).toHaveCount(1, { timeout: 5000 });

  // SVG should contain a text element with a numeric distance
  const textEl = measurement.locator('text');
  await expect(textEl).toHaveCount(1);
  const label = await textEl.textContent();
  expect(label).toBeTruthy();
  expect(parseFloat(label!)).toBeGreaterThan(0);
});

test('single double-click in measurement mode does not create annotation yet', async ({ page }) => {
  const room = uniqueRoom('measure-half');
  await waitForAppReady(page, room);

  const measurements = page.locator('#pin-overlay > svg[data-annotation-type="measurement"]');
  const initialCount = await measurements.count();

  const box = await page.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  await page.locator('#annotation-toolbar .toolbar-btn[data-mode="measurement"]').click();
  await page.mouse.dblclick(box.x + 100, box.y + 200);

  await page.waitForTimeout(500);
  await expect(measurements).toHaveCount(initialCount);
});

test('two users see synced measurement annotations', async ({ browser }) => {
  const room = uniqueRoom('measure-sync');
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    const measurements1 = page1.locator('#pin-overlay > svg[data-annotation-type="measurement"]');
    const measurements2 = page2.locator('#pin-overlay > svg[data-annotation-type="measurement"]');
    const initialCount1 = await measurements1.count();
    const initialCount2 = await measurements2.count();

    const box = await page1.locator('canvas#canvas').boundingBox();
    if (!box) throw new Error('Canvas bounding box not found');

    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    await page1.locator('#annotation-toolbar .toolbar-btn[data-mode="measurement"]').click();
    await page1.mouse.dblclick(box.x + 100, box.y + 150);
    await page1.mouse.dblclick(box.x + 300, box.y + 150);

    await expect(measurements1).toHaveCount(initialCount1 + 1, { timeout: 5000 });
    await expect(measurements2).toHaveCount(initialCount2 + 1, { timeout: 10000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});
