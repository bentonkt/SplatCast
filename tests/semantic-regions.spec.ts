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

async function drawRegionAndPickPreset(
  page: import('@playwright/test').Page,
  presetLabel: string,
) {
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

  // Wait for the label picker to appear
  await expect(page.locator('#semantic-label-picker')).toBeVisible({ timeout: 5000 });

  // Click the preset button
  await page.click(`.semantic-preset-btn[data-label="${presetLabel}"]`);
}

test('semantic toggle button appears on room load', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('sem-btn'));
  const btn = page.locator('#semantic-toggle-btn');
  await expect(btn).toBeVisible({ timeout: 5000 });
});

test('clicking toggle shows semantic panel', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('sem-panel'));
  await page.click('#semantic-toggle-btn');
  await expect(page.locator('#semantic-panel')).toBeVisible();
  await expect(page.locator('#semantic-region-list')).toBeVisible();
  await expect(page.locator('#semantic-filter-input')).toBeVisible();
});

test('pressing K key toggles semantic panel', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('sem-k'));
  await expect(page.locator('#semantic-panel')).not.toBeVisible();
  await page.keyboard.press('k');
  await expect(page.locator('#semantic-panel')).toBeVisible();
  await page.keyboard.press('k');
  await expect(page.locator('#semantic-panel')).not.toBeVisible();
});

test('K key does not toggle when input is focused', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('sem-k-input'));
  await page.keyboard.press('k');
  await expect(page.locator('#semantic-panel')).toBeVisible();

  // Focus the filter input and press K — panel should stay open
  await page.click('#semantic-filter-input');
  await page.keyboard.press('k');
  await expect(page.locator('#semantic-panel')).toBeVisible();
});

test('drawing a region and selecting preset creates tagged region', async ({ page }) => {
  const room = uniqueRoom('sem-draw');
  await waitForAppReady(page, room);

  await page.click('#semantic-toggle-btn');
  await expect(page.locator('#semantic-panel')).toBeVisible();

  await page.click('#semantic-tag-btn');
  await expect(page.locator('#semantic-tag-btn')).toHaveText('Drawing...');

  await drawRegionAndPickPreset(page, 'Structural Column');

  // Should create a region box overlay
  await expect(page.locator('#semantic-overlay .semantic-region-box')).toHaveCount(1, { timeout: 5000 });

  // Region list should show the entry
  await expect(page.locator('.semantic-region-name')).toHaveText('Structural Column');
});

test('drawing a region with custom label creates tagged region', async ({ page }) => {
  const room = uniqueRoom('sem-custom');
  await waitForAppReady(page, room);

  await page.click('#semantic-toggle-btn');
  await page.click('#semantic-tag-btn');

  const canvas = page.locator('canvas#canvas');
  const box = (await canvas.boundingBox())!;

  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 });
  await page.mouse.up();

  await expect(page.locator('#semantic-label-picker')).toBeVisible({ timeout: 5000 });

  // Type a custom label and click Add
  await page.fill('#semantic-custom-input', 'Fire Sprinkler');
  await page.click('#semantic-custom-btn');

  await expect(page.locator('#semantic-overlay .semantic-region-box')).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('.semantic-region-name')).toHaveText('Fire Sprinkler');
});

test('cancelling label picker does not create a region', async ({ page }) => {
  const room = uniqueRoom('sem-cancel');
  await waitForAppReady(page, room);

  await page.click('#semantic-toggle-btn');
  await page.click('#semantic-tag-btn');

  const canvas = page.locator('canvas#canvas');
  const box = (await canvas.boundingBox())!;

  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 5 });
  await page.mouse.up();

  await expect(page.locator('#semantic-label-picker')).toBeVisible({ timeout: 5000 });
  await page.click('#semantic-cancel-btn');
  await expect(page.locator('#semantic-label-picker')).not.toBeVisible();

  await expect(page.locator('#semantic-overlay .semantic-region-box')).toHaveCount(0);
});

test('semantic region can be deleted', async ({ page }) => {
  const room = uniqueRoom('sem-delete');
  await waitForAppReady(page, room);

  await page.click('#semantic-toggle-btn');
  await page.click('#semantic-tag-btn');

  await drawRegionAndPickPreset(page, 'HVAC Duct');

  await expect(page.locator('.semantic-region-row')).toHaveCount(1, { timeout: 5000 });

  await page.click('.semantic-region-delete-btn');
  await expect(page.locator('.semantic-region-row')).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator('#semantic-overlay .semantic-region-box')).toHaveCount(0);
});

test('filter input filters regions by label', async ({ page }) => {
  const room = uniqueRoom('sem-filter');
  await waitForAppReady(page, room);

  await page.click('#semantic-toggle-btn');

  // Create first region
  await page.click('#semantic-tag-btn');
  await drawRegionAndPickPreset(page, 'Structural Column');
  await expect(page.locator('.semantic-region-row')).toHaveCount(1, { timeout: 5000 });

  // Create second region
  await page.click('#semantic-tag-btn');

  const canvas = page.locator('canvas#canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#semantic-label-picker')).toBeVisible({ timeout: 5000 });
  await page.click('.semantic-preset-btn[data-label="HVAC Duct"]');

  await expect(page.locator('.semantic-region-row')).toHaveCount(2, { timeout: 5000 });

  // Filter by "HVAC"
  await page.fill('#semantic-filter-input', 'HVAC');
  await expect(page.locator('.semantic-region-row')).toHaveCount(1);
  await expect(page.locator('.semantic-region-name')).toHaveText('HVAC Duct');

  // Clear filter
  await page.fill('#semantic-filter-input', '');
  await expect(page.locator('.semantic-region-row')).toHaveCount(2);
});

test('two users see synced semantic regions', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('sem-sync');
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    // User 1 creates a semantic region
    await page1.click('#semantic-toggle-btn');
    await page1.click('#semantic-tag-btn');

    const canvas1 = page1.locator('canvas#canvas');
    const box1 = (await canvas1.boundingBox())!;

    await page1.mouse.move(box1.x + box1.width * 0.2, box1.y + box1.height * 0.2);
    await page1.mouse.down();
    await page1.mouse.move(box1.x + box1.width * 0.8, box1.y + box1.height * 0.8, { steps: 5 });
    await page1.mouse.up();

    await expect(page1.locator('#semantic-label-picker')).toBeVisible({ timeout: 5000 });
    await page1.click('.semantic-preset-btn[data-label="Exterior Wall"]');

    // User 1 sees the region
    await expect(page1.locator('#semantic-overlay .semantic-region-box')).toHaveCount(1, { timeout: 5000 });

    // User 2 should also see the region via sync
    await expect(page2.locator('#semantic-overlay .semantic-region-box')).toHaveCount(1, { timeout: 10000 });

    // User 2 opens panel and sees the region
    await page2.click('#semantic-toggle-btn');
    await expect(page2.locator('.semantic-region-name')).toHaveText('Exterior Wall', { timeout: 5000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});
