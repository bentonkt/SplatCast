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

async function addKeyframe(page: import('@playwright/test').Page, name: string) {
  await page.evaluate((n) => {
    window.prompt = () => n;
  }, name);
  await page.locator('#flythrough-add-btn').click();
}

test('flythrough toggle button appears on room load', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('fly-btn'));
  const btn = page.locator('#flythrough-toggle-btn');
  await expect(btn).toBeVisible();
});

test('clicking toggle shows flythrough panel', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('fly-panel'));
  await page.locator('#flythrough-toggle-btn').click();
  const panel = page.locator('#flythrough-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Flythrough');
});

test('pressing F key toggles flythrough panel', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('fly-key'));
  const panel = page.locator('#flythrough-panel');

  await page.keyboard.press('f');
  await expect(panel).toBeVisible();

  await page.keyboard.press('f');
  await expect(panel).toBeHidden();
});

test('F key does not toggle when input is focused', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('fly-input'));
  const panel = page.locator('#flythrough-panel');

  // Open panel first
  await page.keyboard.press('f');
  await expect(panel).toBeVisible();

  // Add a keyframe to get a duration input
  await addKeyframe(page, 'Test KF');
  await expect(page.locator('.flythrough-keyframe-item')).toHaveCount(1);

  // Focus the duration input and press F
  const durationInput = page.locator('.flythrough-keyframe-item input[type="number"]').first();
  await durationInput.focus();
  await page.keyboard.press('f');

  // Panel should still be visible (F was consumed by input)
  await expect(panel).toBeVisible();
});

test('adding keyframes populates the list', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('fly-add'));
  await page.locator('#flythrough-toggle-btn').click();

  await addKeyframe(page, 'Start');
  await expect(page.locator('.flythrough-keyframe-item')).toHaveCount(1);

  // Orbit camera to different position
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await addKeyframe(page, 'End');
  await expect(page.locator('.flythrough-keyframe-item')).toHaveCount(2);
});

test('removing a keyframe updates the list', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('fly-remove'));
  await page.locator('#flythrough-toggle-btn').click();

  await addKeyframe(page, 'KF1');
  await addKeyframe(page, 'KF2');
  await expect(page.locator('.flythrough-keyframe-item')).toHaveCount(2);

  // Remove first keyframe
  await page.locator('.flythrough-remove-btn').first().click();
  await expect(page.locator('.flythrough-keyframe-item')).toHaveCount(1);
});

test('preview plays through keyframes with indicator', async ({ page }) => {
  const room = uniqueRoom('fly-preview');
  await waitForAppReady(page, room);
  await page.locator('#flythrough-toggle-btn').click();

  // Add two keyframes
  await addKeyframe(page, 'Alpha');

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await addKeyframe(page, 'Beta');
  await expect(page.locator('.flythrough-keyframe-item')).toHaveCount(2);

  // Click preview
  await page.locator('#flythrough-preview-btn').click();

  // Indicator should appear
  const indicator = page.locator('#flythrough-indicator');
  await expect(indicator).toBeVisible();
  await expect(indicator).toContainText('Flythrough');
  await expect(indicator).toContainText('Alpha');

  // Preview button should show stop text
  await expect(page.locator('#flythrough-preview-btn')).toContainText('Stop');

  // Wait for animation to advance to second keyframe
  await expect(indicator).toContainText('Beta', { timeout: 10000 });

  // Wait for playback to finish
  await expect(indicator).toBeHidden({ timeout: 10000 });
  await expect(page.locator('#flythrough-preview-btn')).toContainText('Preview');
});

test('stop button stops preview', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('fly-stop'));
  await page.locator('#flythrough-toggle-btn').click();

  await addKeyframe(page, 'A');
  await addKeyframe(page, 'B');

  await page.locator('#flythrough-preview-btn').click();
  await expect(page.locator('#flythrough-indicator')).toBeVisible();

  // Stop
  await page.locator('#flythrough-preview-btn').click();
  await expect(page.locator('#flythrough-indicator')).toBeHidden();
  await expect(page.locator('#flythrough-preview-btn')).toContainText('Preview');
});

test('go-to button snaps camera to keyframe position', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('fly-goto'));
  await page.locator('#flythrough-toggle-btn').click();

  // Get initial camera state
  const initialState = await page.evaluate(() => {
    const cam = (window as Record<string, unknown>)['__camera'] as { getOrbitalState(): { theta: number; phi: number; radius: number } };
    return cam.getOrbitalState();
  });

  await addKeyframe(page, 'Here');

  // Move camera to a very different position
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 100, { steps: 5 });
  await page.mouse.up();

  // Camera should have changed
  const movedState = await page.evaluate(() => {
    const cam = (window as Record<string, unknown>)['__camera'] as { getOrbitalState(): { theta: number; phi: number; radius: number } };
    return cam.getOrbitalState();
  });
  expect(movedState.theta).not.toBeCloseTo(initialState.theta, 1);

  // Click go-to button on the keyframe
  await page.locator('.flythrough-keyframe-item button').first().click();

  // Camera should snap back to the keyframe position (close to initial)
  const snappedState = await page.evaluate(() => {
    const cam = (window as Record<string, unknown>)['__camera'] as { getOrbitalState(): { theta: number; phi: number; radius: number } };
    return cam.getOrbitalState();
  });
  expect(snappedState.theta).toBeCloseTo(initialState.theta, 1);
});

test('export button exists and is disabled without keyframes', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('fly-export'));
  await page.locator('#flythrough-toggle-btn').click();

  const exportBtn = page.locator('#flythrough-export-btn');
  await expect(exportBtn).toBeVisible();
  await expect(exportBtn).toContainText('Export');

  // Should be visually disabled (opacity 0.4) without enough keyframes
  const opacity = await exportBtn.evaluate((el) => getComputedStyle(el).opacity);
  expect(parseFloat(opacity)).toBeLessThan(0.5);
});

test('export button becomes active with 2+ keyframes', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('fly-export-active'));
  await page.locator('#flythrough-toggle-btn').click();

  await addKeyframe(page, 'Start');
  await addKeyframe(page, 'End');

  const exportBtn = page.locator('#flythrough-export-btn');
  const opacity = await exportBtn.evaluate((el) => getComputedStyle(el).opacity);
  expect(parseFloat(opacity)).toBeGreaterThan(0.9);
});

test('two users see synced flythrough keyframes', async ({ browser }) => {
  const room = uniqueRoom('fly-sync');
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await waitForAppReady(page1, room);
  await waitForAppReady(page2, room);

  // Open flythrough panel on both
  await page1.locator('#flythrough-toggle-btn').click();
  await page2.locator('#flythrough-toggle-btn').click();

  // User 1 adds a keyframe
  await addKeyframe(page1, 'SharedKF');
  await expect(page1.locator('.flythrough-keyframe-item')).toHaveCount(1);

  // User 2 should see it sync
  await expect(page2.locator('.flythrough-keyframe-item')).toHaveCount(1, { timeout: 5000 });

  await ctx1.close();
  await ctx2.close();
});
