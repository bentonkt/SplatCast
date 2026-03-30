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
  await page.waitForSelector('#pin-overlay', { timeout: 5000 });
}

const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';

test('clicking a pin opens thread panel', async ({ page }) => {
  const room = uniqueRoom('thread-open');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Place a pin
  await page.mouse.dblclick(box.x + 200, box.y + 200);
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

  // Click pin to open thread panel
  await page.locator(pinSelector).first().click();
  await expect(page.locator('#thread-panel')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#pin-label-input')).toBeVisible();
  await expect(page.locator('#thread-reply-input')).toBeVisible();
});

test('adding a reply via thread panel', async ({ page }) => {
  const room = uniqueRoom('thread-reply');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Place a pin
  await page.mouse.dblclick(box.x + 200, box.y + 200);
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

  // Open thread panel
  await page.locator(pinSelector).first().click();
  await expect(page.locator('#thread-reply-input')).toBeVisible({ timeout: 3000 });

  // Type a reply and press Enter
  await page.locator('#thread-reply-input').fill('First reply');
  await page.keyboard.press('Enter');

  // Reply input should clear
  await expect(page.locator('#thread-reply-input')).toHaveValue('');

  // Reply should appear in the thread
  await expect(page.locator('.thread-reply')).toHaveCount(1, { timeout: 5000 });
});

test('thread badge shows reply count', async ({ page }) => {
  const room = uniqueRoom('thread-badge');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Place a pin
  await page.mouse.dblclick(box.x + 200, box.y + 200);
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

  // No badge initially
  await expect(page.locator('[data-thread-badge="true"]')).toHaveCount(0);

  // Open thread panel and add a reply
  await page.locator(pinSelector).first().click();
  await page.locator('#thread-reply-input').fill('Reply one');
  await page.keyboard.press('Enter');

  // Close panel by pressing Escape
  await page.keyboard.press('Escape');
  await expect(page.locator('#thread-panel')).toHaveCount(0, { timeout: 3000 });

  // Badge should appear with count "1"
  await expect(page.locator('[data-thread-badge="true"]')).toHaveText('1', { timeout: 5000 });
});

test('Escape closes thread panel', async ({ page }) => {
  const room = uniqueRoom('thread-escape');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Place a pin
  await page.mouse.dblclick(box.x + 200, box.y + 200);
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

  // Open thread panel
  await page.locator(pinSelector).first().click();
  await expect(page.locator('#thread-panel')).toBeVisible({ timeout: 3000 });

  // Press Escape on the reply input to close
  await page.locator('#thread-reply-input').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#thread-panel')).toHaveCount(0, { timeout: 3000 });
});

test('thread replies sync between two users', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('thread-sync');
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    const canvas = page1.locator('canvas#canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas bounding box not found');

    // User 1 places a pin
    await page1.mouse.dblclick(box.x + 200, box.y + 200);
    await expect(page1.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });
    await expect(page2.locator(pinSelector)).toHaveCount(1, { timeout: 10000 });

    // User 1 opens thread and adds a reply
    await page1.locator(pinSelector).first().click();
    await page1.locator('#thread-reply-input').fill('User 1 reply');
    await page1.keyboard.press('Enter');

    // Close panel on page 1
    await page1.keyboard.press('Escape');
    await expect(page1.locator('#thread-panel')).toHaveCount(0, { timeout: 3000 });

    // User 2 should see the badge
    await expect(page2.locator('[data-thread-badge="true"]')).toHaveText('1', { timeout: 10000 });

    // User 2 opens thread and sees the reply
    await page2.locator(pinSelector).first().click();
    await expect(page2.locator('#thread-panel')).toBeVisible({ timeout: 3000 });
    await expect(page2.locator('.thread-reply')).toHaveCount(1, { timeout: 5000 });

    // User 2 adds their own reply
    await page2.locator('#thread-reply-input').fill('User 2 reply');
    await page2.keyboard.press('Enter');
    await expect(page2.locator('.thread-reply')).toHaveCount(2, { timeout: 5000 });

    // Close panel on page 2
    await page2.keyboard.press('Escape');

    // Badge on both pages should show "2"
    await expect(page1.locator('[data-thread-badge="true"]')).toHaveText('2', { timeout: 10000 });
    await expect(page2.locator('[data-thread-badge="true"]')).toHaveText('2', { timeout: 10000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('label editing still works in thread panel', async ({ page }) => {
  const room = uniqueRoom('thread-label');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Place a pin
  await page.mouse.dblclick(box.x + 200, box.y + 200);
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

  // Open thread panel and edit label
  await page.locator(pinSelector).first().click();
  await page.locator('#pin-label-input').fill('Thread Label');
  await page.keyboard.press('Enter');

  // Close panel by pressing Escape
  await page.keyboard.press('Escape');
  await expect(page.locator('#thread-panel')).toHaveCount(0, { timeout: 3000 });

  // Label should appear on the pin
  await expect(page.locator('[data-pin-label="true"]')).toHaveText('Thread Label', { timeout: 5000 });
});
