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

test('clicking a pin opens label editor', async ({ page }) => {
  const room = uniqueRoom('label-editor');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Place a pin
  await page.mouse.dblclick(box.x + 200, box.y + 200);

  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

  // Click the pin to open the editor
  await page.locator(pinSelector).first().click();

  // Editor should appear with an input
  await expect(page.locator('#pin-label-input')).toBeVisible({ timeout: 3000 });
});

test('typing a label and pressing Enter saves it to the pin', async ({ page }) => {
  const room = uniqueRoom('label-save');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Place a pin
  await page.mouse.dblclick(box.x + 200, box.y + 200);

  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

  // Click pin to open editor
  await page.locator(pinSelector).first().click();
  await expect(page.locator('#pin-label-input')).toBeVisible({ timeout: 3000 });

  // Type a label and press Enter
  await page.locator('#pin-label-input').fill('Test Label');
  await page.keyboard.press('Enter');

  // Editor should close
  await expect(page.locator('#pin-label-input')).toHaveCount(0, { timeout: 3000 });

  // Label should appear on the pin
  await expect(page.locator('[data-pin-label="true"]')).toHaveText('Test Label', { timeout: 5000 });
});

test('editing a label updates the existing text', async ({ page }) => {
  const room = uniqueRoom('label-edit');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Place a pin
  await page.mouse.dblclick(box.x + 200, box.y + 200);

  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

  // Add label
  await page.locator(pinSelector).first().click();
  await page.locator('#pin-label-input').fill('First');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-pin-label="true"]')).toHaveText('First', { timeout: 5000 });

  // Edit label — click pin again
  await page.locator(pinSelector).first().click();
  await expect(page.locator('#pin-label-input')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#pin-label-input')).toHaveValue('First');
  await page.locator('#pin-label-input').fill('Updated');
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-pin-label="true"]')).toHaveText('Updated', { timeout: 5000 });
});

test('pin label syncs between two users', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('label-sync');
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    // Give Yjs time to connect
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    const canvas = page1.locator('canvas#canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas bounding box not found');

    const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';

    // User 1 places a pin
    await page1.mouse.dblclick(box.x + 200, box.y + 200);
    await expect(page1.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

    // Wait for sync to page 2
    await expect(page2.locator(pinSelector)).toHaveCount(1, { timeout: 10000 });

    // User 1 adds a label
    await page1.locator(pinSelector).first().click();
    await page1.locator('#pin-label-input').fill('Shared Label');
    await page1.keyboard.press('Enter');

    // Label should appear on page 1
    await expect(page1.locator('[data-pin-label="true"]')).toHaveText('Shared Label', { timeout: 5000 });

    // Label should sync to page 2
    await expect(page2.locator('[data-pin-label="true"]')).toHaveText('Shared Label', { timeout: 10000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('pressing Escape cancels label editing', async ({ page }) => {
  const room = uniqueRoom('label-escape');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Place a pin
  await page.mouse.dblclick(box.x + 200, box.y + 200);

  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
  await expect(page.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

  // Click pin, type, then Escape
  await page.locator(pinSelector).first().click();
  await page.locator('#pin-label-input').fill('Should Not Save');
  await page.keyboard.press('Escape');

  // Editor should close
  await expect(page.locator('#pin-label-input')).toHaveCount(0, { timeout: 3000 });

  // No label should appear (Escape discards)
  await expect(page.locator('[data-pin-label="true"]')).toHaveCount(0);
});
