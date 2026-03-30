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

test('diff toggle button appears on room load', async ({ page }) => {
  const room = uniqueRoom('diff-btn');
  await waitForAppReady(page, room);
  const btn = page.locator('#diff-toggle');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('Diff');
});

test('clicking diff activates overlay view with composite canvas', async ({ page }) => {
  const room = uniqueRoom('diff-overlay');
  await waitForAppReady(page, room);

  await page.locator('#diff-toggle').click();

  // Diff container should appear
  const container = page.locator('#diff-container');
  await expect(container).toBeVisible();

  // Composite canvas should exist
  const diffCanvas = page.locator('#diff-canvas');
  await expect(diffCanvas).toBeVisible();

  // Main canvas should be hidden
  const mainCanvas = page.locator('canvas#canvas');
  await expect(mainCanvas).toBeHidden();
});

test('diff toolbar shows blend slider with A/B labels', async ({ page }) => {
  const room = uniqueRoom('diff-toolbar');
  await waitForAppReady(page, room);

  await page.locator('#diff-toggle').click();

  const toolbar = page.locator('#diff-toolbar');
  await expect(toolbar).toBeVisible();

  const slider = page.locator('#diff-blend-slider');
  await expect(slider).toBeVisible();
  await expect(slider).toHaveValue('50');

  // A and B labels should exist
  await expect(toolbar).toContainText('A');
  await expect(toolbar).toContainText('B');

  // Percentage label
  const pct = page.locator('#diff-blend-pct');
  await expect(pct).toHaveText('50%');
});

test('pressing V key toggles diff mode', async ({ page }) => {
  const room = uniqueRoom('diff-key');
  await waitForAppReady(page, room);

  // Activate via V key
  await page.keyboard.press('v');
  await expect(page.locator('#diff-container')).toBeVisible();

  // Deactivate via V key
  await page.keyboard.press('v');
  await expect(page.locator('#diff-container')).not.toBeAttached();
  await expect(page.locator('canvas#canvas')).toBeVisible();
});

test('deactivating diff restores main canvas', async ({ page }) => {
  const room = uniqueRoom('diff-restore');
  await waitForAppReady(page, room);

  // Activate
  await page.locator('#diff-toggle').click();
  await expect(page.locator('#diff-container')).toBeVisible();
  await expect(page.locator('canvas#canvas')).toBeHidden();

  // Deactivate
  await page.locator('#diff-toggle').click();
  await expect(page.locator('#diff-container')).not.toBeAttached();
  await expect(page.locator('canvas#canvas')).toBeVisible();
});

test('blend slider changes value and updates percentage label', async ({ page }) => {
  const room = uniqueRoom('diff-slider');
  await waitForAppReady(page, room);

  await page.locator('#diff-toggle').click();

  const slider = page.locator('#diff-blend-slider');
  const pct = page.locator('#diff-blend-pct');

  // Move slider to 80%
  await slider.fill('80');
  await slider.dispatchEvent('input');
  await expect(pct).toHaveText('80%');

  // Move slider to 20%
  await slider.fill('20');
  await slider.dispatchEvent('input');
  await expect(pct).toHaveText('20%');
});

test('diff labels show version A and B names', async ({ page }) => {
  const room = uniqueRoom('diff-labels');
  await waitForAppReady(page, room);

  await page.locator('#diff-toggle').click();

  const labelA = page.locator('#diff-label-a');
  const labelB = page.locator('#diff-label-b');

  await expect(labelA).toBeVisible();
  await expect(labelB).toBeVisible();

  await expect(labelA).toContainText('A:');
  await expect(labelB).toContainText('B:');
});

test('diff composite canvas renders after activation', async ({ page }) => {
  const room = uniqueRoom('diff-render');
  await waitForAppReady(page, room);

  // Wait for initial scene load
  await page.waitForTimeout(500);

  await page.locator('#diff-toggle').click();

  // Wait for renderers to initialize and composite
  await page.waitForTimeout(1000);

  // Composite canvas should be visible and sized
  const diffCanvas = page.locator('#diff-canvas');
  await expect(diffCanvas).toBeVisible();

  // Verify it has dimensions
  const hasSize = await page.evaluate(() => {
    const c = document.getElementById('diff-canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.height > 0;
  });
  expect(hasSize).toBe(true);
});

test('camera interaction works in diff mode', async ({ page }) => {
  const room = uniqueRoom('diff-camera');
  await waitForAppReady(page, room);

  await page.locator('#diff-toggle').click();
  await page.waitForTimeout(500);

  const diffCanvas = page.locator('#diff-canvas');
  const box = await diffCanvas.boundingBox();
  if (!box) throw new Error('Diff canvas not found');

  // Drag on canvas to rotate
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 40, { steps: 5 });
  await page.mouse.up();

  await page.waitForTimeout(200);

  // Canvas should still be visible (no crash)
  await expect(diffCanvas).toBeVisible();
  await expect(page.locator('#diff-container')).toBeVisible();
});

test('V key does not toggle diff when input is focused', async ({ page }) => {
  const room = uniqueRoom('diff-key-input');
  await waitForAppReady(page, room);

  // Focus on the room input in the bookmark panel or similar
  // We'll use the bookmark name input as a proxy
  // First verify diff is not active
  await expect(page.locator('#diff-container')).not.toBeAttached();

  // Create an input element to focus
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'test-input';
    input.style.cssText = 'position:fixed;top:0;left:0;z-index:9999;';
    document.body.appendChild(input);
  });

  await page.locator('#test-input').focus();
  await page.keyboard.press('v');

  // Diff should NOT activate when input is focused
  await expect(page.locator('#diff-container')).not.toBeAttached();
});
