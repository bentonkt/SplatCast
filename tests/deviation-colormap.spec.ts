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

test('deviation colormap toggle button appears on room load', async ({ page }) => {
  const room = uniqueRoom('deviation-toggle');
  await waitForAppReady(page, room);

  const toggleBtn = page.locator('#deviation-toggle');
  await expect(toggleBtn).toBeVisible({ timeout: 3000 });
});

test('clicking toggle shows deviation panel', async ({ page }) => {
  const room = uniqueRoom('deviation-panel');
  await waitForAppReady(page, room);

  const panel = page.locator('#deviation-panel');
  await expect(panel).toBeHidden();

  await page.click('#deviation-toggle');
  await expect(panel).toBeVisible({ timeout: 3000 });

  // Should have tolerance slider, compute button, status, drop zone, legend
  await expect(page.locator('#deviation-tolerance')).toBeVisible();
  await expect(page.locator('#deviation-compute-btn')).toBeVisible();
  await expect(page.locator('#deviation-status')).toBeVisible();
  await expect(page.locator('#deviation-drop-zone')).toBeVisible();
  await expect(page.locator('#deviation-legend')).toBeVisible();
});

test('pressing M key toggles deviation panel', async ({ page }) => {
  const room = uniqueRoom('deviation-key');
  await waitForAppReady(page, room);

  const panel = page.locator('#deviation-panel');
  await expect(panel).toBeHidden();

  await page.keyboard.press('m');
  await expect(panel).toBeVisible({ timeout: 3000 });

  await page.keyboard.press('m');
  await expect(panel).toBeHidden();
});

test('M key does not toggle when input is focused', async ({ page }) => {
  const room = uniqueRoom('deviation-key-input');
  await waitForAppReady(page, room);

  const panel = page.locator('#deviation-panel');
  await expect(panel).toBeHidden();

  await page.click('#deviation-toggle');
  await expect(panel).toBeVisible({ timeout: 3000 });

  await page.focus('#deviation-tolerance');
  await page.keyboard.press('m');
  // Panel should still be visible because M was pressed while input focused
  await expect(panel).toBeVisible();
});

test('clicking Compute Deviation runs self-comparison on loaded scene', async ({ page }) => {
  const room = uniqueRoom('deviation-compute');
  await waitForAppReady(page, room);

  await page.click('#deviation-toggle');
  await expect(page.locator('#deviation-panel')).toBeVisible({ timeout: 3000 });

  // Click compute (no reference loaded — self comparison)
  await page.click('#deviation-compute-btn');

  // Wait for status to update with results
  await page.waitForFunction(() => {
    const label = document.getElementById('deviation-status');
    return label && label.textContent !== null && label.textContent.includes('splats');
  }, { timeout: 10000 });

  const statusText = await page.locator('#deviation-status').textContent();
  expect(statusText).toContain('splats');
  expect(statusText).toContain('avg deviation');
});

test('deviation overlay canvas is rendered after computation', async ({ page }) => {
  const room = uniqueRoom('deviation-overlay');
  await waitForAppReady(page, room);

  await page.click('#deviation-toggle');
  await expect(page.locator('#deviation-panel')).toBeVisible({ timeout: 3000 });

  // Overlay should be visible but empty
  const overlay = page.locator('#deviation-overlay');
  await expect(overlay).toBeVisible();

  await page.click('#deviation-compute-btn');

  // Wait for computation and rendering
  await page.waitForFunction(() => {
    const label = document.getElementById('deviation-status');
    return label && label.textContent !== null && label.textContent.includes('splats');
  }, { timeout: 10000 });

  // Canvas overlay should have non-zero pixels rendered
  const hasContent = await page.evaluate(() => {
    const canvas = document.getElementById('deviation-overlay') as HTMLCanvasElement;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });
  expect(hasContent).toBe(true);
});

test('tolerance slider changes value label', async ({ page }) => {
  const room = uniqueRoom('deviation-tolerance');
  await waitForAppReady(page, room);

  await page.click('#deviation-toggle');
  await expect(page.locator('#deviation-panel')).toBeVisible({ timeout: 3000 });

  // Default tolerance value is 0.50
  const valueLabel = page.locator('#deviation-tolerance-value');
  await expect(valueLabel).toHaveText('0.50');

  // Move slider via JavaScript
  await page.evaluate(() => {
    const slider = document.getElementById('deviation-tolerance') as HTMLInputElement;
    slider.value = '1.00';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(valueLabel).toHaveText('1.00');
});

test('toggling off hides deviation panel and overlay', async ({ page }) => {
  const room = uniqueRoom('deviation-off');
  await waitForAppReady(page, room);

  await page.click('#deviation-toggle');
  await expect(page.locator('#deviation-panel')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#deviation-overlay')).toBeVisible();

  await page.click('#deviation-toggle');
  await expect(page.locator('#deviation-panel')).toBeHidden();
  await expect(page.locator('#deviation-overlay')).toBeHidden();
});

test('two users see synced deviation results', async ({ browser }) => {
  const room = uniqueRoom('deviation-sync');

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await waitForAppReady(page1, room);
  await waitForAppReady(page2, room);

  // User 1 opens deviation panel and computes
  await page1.click('#deviation-toggle');
  await expect(page1.locator('#deviation-panel')).toBeVisible({ timeout: 3000 });
  await page1.click('#deviation-compute-btn');

  // Wait for user 1 to complete computation
  await page1.waitForFunction(() => {
    const label = document.getElementById('deviation-status');
    return label && label.textContent !== null && label.textContent.includes('splats');
  }, { timeout: 10000 });

  // User 2 opens panel — should see synced deviation status
  await page2.click('#deviation-toggle');
  await expect(page2.locator('#deviation-panel')).toBeVisible({ timeout: 3000 });

  // Wait for synced results to arrive at user 2
  await page2.waitForFunction(() => {
    const label = document.getElementById('deviation-status');
    return label && label.textContent !== null && label.textContent.includes('splats');
  }, { timeout: 10000 });

  const status1 = await page1.locator('#deviation-status').textContent();
  const status2 = await page2.locator('#deviation-status').textContent();
  expect(status1).toBe(status2);

  await ctx1.close();
  await ctx2.close();
});
