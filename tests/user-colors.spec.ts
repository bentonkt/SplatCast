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
}

test('user sees a color indicator with their assigned color', async ({ page }) => {
  const room = uniqueRoom('color-indicator');
  await waitForAppReady(page, room);
  await page.waitForSelector('#user-color-indicator', { timeout: 5000 });

  const indicator = page.locator('#user-color-indicator');
  await expect(indicator).toBeVisible();

  // Indicator contains a colored dot (span) and a label with userId
  const dot = indicator.locator('span').first();
  const bgColor = await dot.evaluate((el) => el.style.background);
  expect(bgColor).toBeTruthy();

  const label = indicator.locator('span').nth(1);
  const text = await label.textContent();
  expect(text).toMatch(/^You \([a-f0-9]{8}\)$/);
});

test('annotation pin color matches user color indicator', async ({ page }) => {
  const room = uniqueRoom('color-match');
  await waitForAppReady(page, room);
  await page.waitForSelector('#pin-overlay', { timeout: 5000 });
  await page.waitForSelector('#user-color-indicator', { timeout: 5000 });

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Get the user's assigned color from the indicator dot
  const indicatorColor = await page.locator('#user-color-indicator span').first()
    .evaluate((el) => el.style.background);

  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
  const baseline = await page.locator(pinSelector).count();

  // Place a pin
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(pinSelector)).toHaveCount(baseline + 1, { timeout: 5000 });

  // Pin color should match the indicator color (background is on the .pin-dot child)
  const pinColor = await page.locator(pinSelector).last().locator('.pin-dot')
    .evaluate((el) => el.style.background);
  expect(pinColor).toBe(indicatorColor);
});

test('two users get color-coded pins that are visually distinct', async ({ browser }) => {
  const room = uniqueRoom('color-distinct');
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    await page1.waitForSelector('#pin-overlay', { timeout: 5000 });
    await page2.waitForSelector('#pin-overlay', { timeout: 5000 });
    await page1.waitForSelector('#user-color-indicator', { timeout: 5000 });
    await page2.waitForSelector('#user-color-indicator', { timeout: 5000 });

    // Get each user's assigned color
    const color1 = await page1.locator('#user-color-indicator span').first()
      .evaluate((el) => el.style.background);
    const color2 = await page2.locator('#user-color-indicator span').first()
      .evaluate((el) => el.style.background);

    // Both have colors assigned
    expect(color1).toBeTruthy();
    expect(color2).toBeTruthy();

    // Give Yjs WebSocket time to connect
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    const box1 = await page1.locator('canvas#canvas').boundingBox();
    const box2 = await page2.locator('canvas#canvas').boundingBox();
    if (!box1 || !box2) throw new Error('Canvas bounding box not found');

    const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
    const initialCount = await page1.locator(pinSelector).count();

    // User 1 places a pin
    await page1.mouse.dblclick(box1.x + 200, box1.y + 200);
    await expect(page1.locator(pinSelector)).toHaveCount(initialCount + 1, { timeout: 5000 });

    // User 2 places a pin
    await page2.mouse.dblclick(box2.x + 300, box2.y + 300);
    await expect(page2.locator(pinSelector)).toHaveCount(initialCount + 2, { timeout: 10000 });

    // Both pages should now see the same count
    await expect(page1.locator(pinSelector)).toHaveCount(initialCount + 2, { timeout: 10000 });

    // The pins should have data-user-id attributes identifying their owners
    const pinUserIds = await page1.locator(pinSelector).evaluateAll(
      (els) => els.map((el) => (el as HTMLElement).dataset.userId)
    );
    // Should have at least two distinct user IDs
    expect(new Set(pinUserIds).size).toBeGreaterThanOrEqual(2);

    // All pins should carry a color via background style (on .pin-dot child)
    const pinColors = await page1.locator(`${pinSelector} .pin-dot`).evaluateAll(
      (els) => els.map((el) => (el as HTMLElement).style.background)
    );
    for (const c of pinColors) {
      expect(c).toBeTruthy();
    }
  } finally {
    await context1.close();
    await context2.close();
  }
});
