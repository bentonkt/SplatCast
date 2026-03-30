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

test('lasso toggle button appears on room load', async ({ page }) => {
  const room = uniqueRoom('lasso-btn');
  await waitForAppReady(page, room);
  const btn = page.locator('#lasso-toggle-btn');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('\u2B55');
});

test('clicking lasso button enables lasso mode with toolbar', async ({ page }) => {
  const room = uniqueRoom('lasso-toolbar');
  await waitForAppReady(page, room);

  const btn = page.locator('#lasso-toggle-btn');
  await btn.click();

  // Toolbar should be visible
  const toolbar = page.locator('#lasso-toolbar');
  await expect(toolbar).toBeVisible();

  // SVG overlay should accept pointer events
  const svg = page.locator('#lasso-overlay');
  await expect(svg).toHaveCSS('pointer-events', 'auto');

  // Button should have active border
  await expect(btn).toHaveCSS('border-color', 'rgb(78, 205, 196)');
});

test('pressing L key toggles lasso mode', async ({ page }) => {
  const room = uniqueRoom('lasso-key');
  await waitForAppReady(page, room);

  await page.keyboard.press('l');
  const toolbar = page.locator('#lasso-toolbar');
  await expect(toolbar).toBeVisible();

  await page.keyboard.press('l');
  await expect(toolbar).not.toBeVisible();
});

test('lasso draw creates a visible path on the overlay', async ({ page }) => {
  const room = uniqueRoom('lasso-draw');
  await waitForAppReady(page, room);

  // Enable lasso mode
  await page.locator('#lasso-toggle-btn').click();

  // Draw a lasso on the overlay
  const svg = page.locator('#lasso-overlay');
  const box = (await svg.boundingBox())!;

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx - 50, cy - 50);
  await page.mouse.down();
  await page.mouse.move(cx + 50, cy - 50, { steps: 5 });
  await page.mouse.move(cx + 50, cy + 50, { steps: 5 });
  await page.mouse.move(cx - 50, cy + 50, { steps: 5 });
  await page.mouse.up();

  // The SVG path should have a non-empty 'd' attribute
  const path = page.locator('#lasso-overlay path');
  const d = await path.getAttribute('d');
  expect(d).toBeTruthy();
  expect(d!.length).toBeGreaterThan(10);
  expect(d).toContain('Z'); // Path should be closed
});

test('lasso hide removes splats and show all restores them', async ({ page }) => {
  const room = uniqueRoom('lasso-hide');
  await waitForAppReady(page, room);

  // Enable lasso mode
  await page.locator('#lasso-toggle-btn').click();

  // Draw a lasso covering most of the canvas
  const canvas = page.locator('canvas#canvas');
  const box = (await canvas.boundingBox())!;

  const svg = page.locator('#lasso-overlay');
  const svgBox = (await svg.boundingBox())!;
  const cx = svgBox.x + svgBox.width / 2;
  const cy = svgBox.y + svgBox.height / 2;
  const hw = svgBox.width * 0.4;
  const hh = svgBox.height * 0.4;

  await page.mouse.move(cx - hw, cy - hh);
  await page.mouse.down();
  await page.mouse.move(cx + hw, cy - hh, { steps: 5 });
  await page.mouse.move(cx + hw, cy + hh, { steps: 5 });
  await page.mouse.move(cx - hw, cy + hh, { steps: 5 });
  await page.mouse.up();

  // Click hide
  await page.locator('#lasso-hide-btn').click();

  // Check that hidden splats were synced (via SyncManager)
  const hiddenCount = await page.evaluate(() => {
    const sm = (window as Record<string, unknown>)['__syncManager'] as { getHiddenSplats: () => number[] } | undefined;
    return sm ? sm.getHiddenSplats().length : -1;
  });
  // We should have hidden some splats (the exact number depends on projection)
  expect(hiddenCount).toBeGreaterThan(0);

  // Click show all
  await page.locator('#lasso-show-all-btn').click();

  const afterShowAll = await page.evaluate(() => {
    const sm = (window as Record<string, unknown>)['__syncManager'] as { getHiddenSplats: () => number[] } | undefined;
    return sm ? sm.getHiddenSplats().length : -1;
  });
  expect(afterShowAll).toBe(0);
});

test('lasso isolate keeps only selected splats visible', async ({ page }) => {
  const room = uniqueRoom('lasso-isolate');
  await waitForAppReady(page, room);

  // Enable lasso mode
  await page.locator('#lasso-toggle-btn').click();

  // Draw a small lasso in the center
  const svg = page.locator('#lasso-overlay');
  const svgBox = (await svg.boundingBox())!;
  const cx = svgBox.x + svgBox.width / 2;
  const cy = svgBox.y + svgBox.height / 2;

  await page.mouse.move(cx - 30, cy - 30);
  await page.mouse.down();
  await page.mouse.move(cx + 30, cy - 30, { steps: 3 });
  await page.mouse.move(cx + 30, cy + 30, { steps: 3 });
  await page.mouse.move(cx - 30, cy + 30, { steps: 3 });
  await page.mouse.up();

  // Click isolate
  await page.locator('#lasso-isolate-btn').click();

  // Some splats should be hidden (those outside the selection)
  const hiddenCount = await page.evaluate(() => {
    const sm = (window as Record<string, unknown>)['__syncManager'] as { getHiddenSplats: () => number[] } | undefined;
    return sm ? sm.getHiddenSplats().length : -1;
  });
  expect(hiddenCount).toBeGreaterThan(0);
});

test('two users see synced hidden splats', async ({ browser }) => {
  const room = uniqueRoom('lasso-sync');

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  await waitForAppReady(p1, room);
  await waitForAppReady(p2, room);

  // Allow Yjs sync
  await p1.waitForTimeout(500);

  // User 1 enables lasso and hides some splats
  await p1.locator('#lasso-toggle-btn').click();

  const svg1 = p1.locator('#lasso-overlay');
  const box1 = (await svg1.boundingBox())!;
  const cx1 = box1.x + box1.width / 2;
  const cy1 = box1.y + box1.height / 2;
  const hw1 = box1.width * 0.4;
  const hh1 = box1.height * 0.4;

  await p1.mouse.move(cx1 - hw1, cy1 - hh1);
  await p1.mouse.down();
  await p1.mouse.move(cx1 + hw1, cy1 - hh1, { steps: 5 });
  await p1.mouse.move(cx1 + hw1, cy1 + hh1, { steps: 5 });
  await p1.mouse.move(cx1 - hw1, cy1 + hh1, { steps: 5 });
  await p1.mouse.up();

  await p1.locator('#lasso-hide-btn').click();

  // Wait for sync to propagate
  await p2.waitForTimeout(1000);

  // User 2 should see hidden splats
  const hiddenOnP2 = await p2.evaluate(() => {
    const sm = (window as Record<string, unknown>)['__syncManager'] as { getHiddenSplats: () => number[] } | undefined;
    return sm ? sm.getHiddenSplats().length : -1;
  });
  expect(hiddenOnP2).toBeGreaterThan(0);

  await ctx1.close();
  await ctx2.close();
});
