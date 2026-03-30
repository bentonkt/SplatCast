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

test('timeline toggle button appears on room load', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('timeline-btn'));
  const btn = page.locator('#timeline-toggle');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('Timeline');
});

test('clicking timeline button shows timeline panel', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('timeline-panel'));
  await page.locator('#timeline-toggle').click();
  const panel = page.locator('#timeline-panel');
  await expect(panel).toBeVisible();
  await expect(page.locator('#timeline-slider')).toBeVisible();
  await expect(page.locator('#timeline-play-btn')).toBeVisible();
});

test('pressing P key toggles timeline panel', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('timeline-key'));
  const panel = page.locator('#timeline-panel');

  await expect(panel).toBeHidden();
  await page.keyboard.press('p');
  await expect(panel).toBeVisible();
  await page.keyboard.press('p');
  await expect(panel).toBeHidden();
});

test('timeline slider filters annotations by time', async ({ page }) => {
  const room = uniqueRoom('timeline-filter');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';

  // Place 3 annotations with time gaps
  await page.mouse.dblclick(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });
  await page.waitForTimeout(50);

  await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(page.locator(pinSelector)).toHaveCount(2, { timeout: 5000 });
  await page.waitForTimeout(50);

  await page.mouse.dblclick(box.x + box.width * 0.7, box.y + box.height * 0.7);
  await expect(page.locator(pinSelector)).toHaveCount(3, { timeout: 5000 });

  // Open timeline
  await page.locator('#timeline-toggle').click();
  await expect(page.locator('#timeline-panel')).toBeVisible();

  // Slider should have max = 2 (3 items, indices 0-2)
  const slider = page.locator('#timeline-slider');
  const max = await slider.getAttribute('max');
  expect(parseInt(max ?? '0', 10)).toBeGreaterThanOrEqual(2);

  // Move slider to show only first annotation
  await slider.fill('0');
  await slider.dispatchEvent('input');

  // Should only show 1 pin
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

  // Move slider to show first two
  await slider.fill('1');
  await slider.dispatchEvent('input');
  await expect(page.locator(pinSelector)).toHaveCount(2, { timeout: 5000 });

  // Move slider to max — show all
  await slider.fill(max ?? '2');
  await slider.dispatchEvent('input');
  await expect(page.locator(pinSelector)).toHaveCount(3, { timeout: 5000 });
});

test('timeline playback auto-advances through annotations', async ({ page }) => {
  const room = uniqueRoom('timeline-play');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';

  // Place 2 annotations
  await page.mouse.dblclick(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });
  await page.waitForTimeout(50);

  await page.mouse.dblclick(box.x + box.width * 0.7, box.y + box.height * 0.7);
  await expect(page.locator(pinSelector)).toHaveCount(2, { timeout: 5000 });

  // Open timeline
  await page.locator('#timeline-toggle').click();
  await expect(page.locator('#timeline-panel')).toBeVisible();

  // Click play button
  const playBtn = page.locator('#timeline-play-btn');
  await playBtn.click();

  // Initially should start from 0 (1 pin visible)
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 2000 });

  // After ~800ms it should advance to show 2
  await expect(page.locator(pinSelector)).toHaveCount(2, { timeout: 3000 });
});

test('closing timeline panel resets filter to show all annotations', async ({ page }) => {
  const room = uniqueRoom('timeline-reset');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';

  // Place 2 annotations
  await page.mouse.dblclick(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });
  await page.waitForTimeout(50);

  await page.mouse.dblclick(box.x + box.width * 0.7, box.y + box.height * 0.7);
  await expect(page.locator(pinSelector)).toHaveCount(2, { timeout: 5000 });

  // Open timeline, filter to show only 1
  await page.locator('#timeline-toggle').click();
  const slider = page.locator('#timeline-slider');
  await slider.fill('0');
  await slider.dispatchEvent('input');
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

  // Close timeline — all should reappear
  await page.locator('#timeline-toggle').click();
  await expect(page.locator('#timeline-panel')).toBeHidden();
  await expect(page.locator(pinSelector)).toHaveCount(2, { timeout: 5000 });
});

test('two users see synced timeline filtering', async ({ browser }) => {
  const room = uniqueRoom('timeline-sync');
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  await waitForAppReady(page1, room);
  await waitForAppReady(page2, room);

  const canvas1 = page1.locator('canvas#canvas');
  const box1 = await canvas1.boundingBox();
  if (!box1) throw new Error('canvas has no bounding box');
  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';

  // User 1 places 2 annotations
  await page1.mouse.dblclick(box1.x + box1.width * 0.3, box1.y + box1.height * 0.3);
  await expect(page1.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });
  await page1.waitForTimeout(50);

  await page1.mouse.dblclick(box1.x + box1.width * 0.7, box1.y + box1.height * 0.7);
  await expect(page1.locator(pinSelector)).toHaveCount(2, { timeout: 5000 });

  // Both users should see 2 annotations
  await expect(page2.locator(pinSelector)).toHaveCount(2, { timeout: 10000 });

  // User 2 opens timeline and filters to 1
  await page2.locator('#timeline-toggle').click();
  const slider2 = page2.locator('#timeline-slider');
  await slider2.fill('0');
  await slider2.dispatchEvent('input');

  // User 2 sees only 1, but user 1 still sees 2 (timeline is local)
  await expect(page2.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });
  await expect(page1.locator(pinSelector)).toHaveCount(2);

  await context1.close();
  await context2.close();
});
