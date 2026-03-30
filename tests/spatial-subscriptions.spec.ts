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

test('subscription toggle button appears on room load', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('sub-btn'));
  const btn = page.locator('#subscription-toggle-btn');
  await expect(btn).toBeVisible({ timeout: 5000 });
});

test('clicking toggle shows subscription panel', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('sub-panel'));
  await page.click('#subscription-toggle-btn');
  await expect(page.locator('#subscription-panel')).toBeVisible();
  await expect(page.locator('#subscription-list')).toBeVisible();
});

test('pressing J key toggles subscription panel', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('sub-j'));
  await expect(page.locator('#subscription-panel')).not.toBeVisible();
  await page.keyboard.press('j');
  await expect(page.locator('#subscription-panel')).toBeVisible();
  await page.keyboard.press('j');
  await expect(page.locator('#subscription-panel')).not.toBeVisible();
});

test('J key does not toggle when input is focused', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('sub-j-input'));
  await page.keyboard.press('j');
  await expect(page.locator('#subscription-panel')).toBeVisible();
});

test('drawing a box creates a subscription', async ({ page }) => {
  const room = uniqueRoom('sub-draw');
  await waitForAppReady(page, room);

  await page.click('#subscription-toggle-btn');
  await expect(page.locator('#subscription-panel')).toBeVisible();

  page.on('dialog', async (dialog) => {
    if (dialog.message().includes('name')) {
      await dialog.accept('Watch area');
    }
  });

  await page.click('#subscription-draw-btn');
  await expect(page.locator('#subscription-draw-btn')).toHaveText('Drawing...');

  const canvas = page.locator('canvas#canvas');
  const box = (await canvas.boundingBox())!;
  const startX = box.x + box.width * 0.3;
  const startY = box.y + box.height * 0.3;
  const endX = box.x + box.width * 0.7;
  const endY = box.y + box.height * 0.7;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 5 });
  await page.mouse.up();

  // Should create a subscription box overlay
  await expect(page.locator('#subscription-overlay .subscription-box')).toHaveCount(1, { timeout: 5000 });

  // Subscription list should show the entry
  await expect(page.locator('.subscription-name')).toHaveText('Watch area');
});

test('subscription can be deleted', async ({ page }) => {
  const room = uniqueRoom('sub-delete');
  await waitForAppReady(page, room);

  await page.click('#subscription-toggle-btn');

  page.on('dialog', async (dialog) => {
    if (dialog.message().includes('name')) {
      await dialog.accept('Temp watch');
    }
  });

  await page.click('#subscription-draw-btn');
  const canvas = page.locator('canvas#canvas');
  const box = (await canvas.boundingBox())!;

  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 5 });
  await page.mouse.up();

  await expect(page.locator('.subscription-row')).toHaveCount(1, { timeout: 5000 });

  await page.click('.subscription-delete-btn');
  await expect(page.locator('.subscription-row')).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator('#subscription-overlay .subscription-box')).toHaveCount(0);
});

test('notification appears when annotation is placed inside subscription box', async ({ page }) => {
  const room = uniqueRoom('sub-notify');
  await waitForAppReady(page, room);

  // Create a subscription covering the center of the canvas
  await page.click('#subscription-toggle-btn');

  page.on('dialog', async (dialog) => {
    if (dialog.message().includes('name')) {
      await dialog.accept('Center watch');
    }
  });

  await page.click('#subscription-draw-btn');
  const canvas = page.locator('canvas#canvas');
  const box = (await canvas.boundingBox())!;

  // Draw a large box covering most of the canvas
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.9, { steps: 5 });
  await page.mouse.up();

  await expect(page.locator('.subscription-row')).toHaveCount(1, { timeout: 5000 });

  // Now place an annotation (double-click) inside the subscription region
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  // A toast notification should appear
  await expect(page.locator('.subscription-toast')).toHaveCount(1, { timeout: 5000 });
});

test('two users see synced subscriptions', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('sub-sync');
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    // User 1 creates a subscription
    await page1.click('#subscription-toggle-btn');

    page1.on('dialog', async (dialog) => {
      if (dialog.message().includes('name')) {
        await dialog.accept('Synced region');
      }
    });

    await page1.click('#subscription-draw-btn');
    const canvas1 = page1.locator('canvas#canvas');
    const box1 = (await canvas1.boundingBox())!;

    await page1.mouse.move(box1.x + box1.width * 0.2, box1.y + box1.height * 0.2);
    await page1.mouse.down();
    await page1.mouse.move(box1.x + box1.width * 0.8, box1.y + box1.height * 0.8, { steps: 5 });
    await page1.mouse.up();

    // User 1 should see the subscription box
    await expect(page1.locator('#subscription-overlay .subscription-box')).toHaveCount(1, { timeout: 5000 });

    // User 2 should also see the subscription box via sync
    await expect(page2.locator('#subscription-overlay .subscription-box')).toHaveCount(1, { timeout: 10000 });

    // User 2 opens panel and sees the subscription
    await page2.click('#subscription-toggle-btn');
    await expect(page2.locator('.subscription-name')).toHaveText('Synced region', { timeout: 5000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});
