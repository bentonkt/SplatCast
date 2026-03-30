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

test('cross-section toggle button appears on room load', async ({ page }) => {
  const room = uniqueRoom('cs-toggle');
  await waitForAppReady(page, room);

  const toggleBtn = page.locator('#cross-section-toggle');
  await expect(toggleBtn).toBeVisible({ timeout: 3000 });
});

test('clicking toggle shows cross-section panel', async ({ page }) => {
  const room = uniqueRoom('cs-panel');
  await waitForAppReady(page, room);

  const panel = page.locator('#cross-section-panel');
  await expect(panel).toBeHidden();

  await page.click('#cross-section-toggle');
  await expect(panel).toBeVisible({ timeout: 3000 });

  // Should have axis selector, position slider, thickness slider
  await expect(page.locator('#cross-section-axis')).toBeVisible();
  await expect(page.locator('#cross-section-position')).toBeVisible();
  await expect(page.locator('#cross-section-thickness')).toBeVisible();
});

test('pressing X key toggles cross-section panel', async ({ page }) => {
  const room = uniqueRoom('cs-key');
  await waitForAppReady(page, room);

  const panel = page.locator('#cross-section-panel');
  await expect(panel).toBeHidden();

  await page.keyboard.press('x');
  await expect(panel).toBeVisible({ timeout: 3000 });

  await page.keyboard.press('x');
  await expect(panel).toBeHidden();
});

test('X key does not toggle when input is focused', async ({ page }) => {
  const room = uniqueRoom('cs-key-input');
  await waitForAppReady(page, room);

  // Focus an input (room input is not present in viewer, so use the axis select)
  await page.click('#cross-section-toggle');
  await expect(page.locator('#cross-section-panel')).toBeVisible({ timeout: 3000 });

  // Focus the axis select and press X
  await page.focus('#cross-section-axis');
  await page.keyboard.press('x');

  // Panel should still be visible (X key ignored while input focused)
  await expect(page.locator('#cross-section-panel')).toBeVisible();
});

test('changing axis selector updates preview title', async ({ page }) => {
  const room = uniqueRoom('cs-axis');
  await waitForAppReady(page, room);

  await page.click('#cross-section-toggle');
  await expect(page.locator('#cross-section-panel')).toBeVisible({ timeout: 3000 });

  // Default axis is X — title should contain "X ="
  const preview = page.locator('#cross-section-preview');
  await expect(preview).toBeVisible();

  const titleText = await preview.locator('.cross-section-title').textContent();
  expect(titleText).toContain('X =');

  // Change axis to Y
  await page.selectOption('#cross-section-axis', 'Y');
  const titleTextY = await preview.locator('.cross-section-title').textContent();
  expect(titleTextY).toContain('Y =');

  // Change axis to Z
  await page.selectOption('#cross-section-axis', 'Z');
  const titleTextZ = await preview.locator('.cross-section-title').textContent();
  expect(titleTextZ).toContain('Z =');
});

test('moving position slider updates preview and value label', async ({ page }) => {
  const room = uniqueRoom('cs-pos');
  await waitForAppReady(page, room);

  await page.click('#cross-section-toggle');
  await expect(page.locator('#cross-section-panel')).toBeVisible({ timeout: 3000 });

  const posSlider = page.locator('#cross-section-position');
  const posVal = page.locator('#cross-section-pos-val');

  // Initial value should be near 0
  const initialPosText = await posVal.textContent();
  expect(Math.abs(parseFloat(initialPosText!))).toBeLessThan(0.01);

  // Move slider
  await posSlider.evaluate((el: HTMLInputElement) => {
    el.value = '1';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const updatedPosText = await posVal.textContent();
  expect(parseFloat(updatedPosText!)).toBeCloseTo(1.0, 0);
});

test('moving thickness slider updates value label', async ({ page }) => {
  const room = uniqueRoom('cs-thick');
  await waitForAppReady(page, room);

  await page.click('#cross-section-toggle');
  await expect(page.locator('#cross-section-panel')).toBeVisible({ timeout: 3000 });

  const thickSlider = page.locator('#cross-section-thickness');
  const thickVal = page.locator('#cross-section-thick-val');

  // Move slider to specific value
  await thickSlider.evaluate((el: HTMLInputElement) => {
    el.value = '0.50';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const updatedThickText = await thickVal.textContent();
  expect(parseFloat(updatedThickText!)).toBeCloseTo(0.5, 0);
});

test('preview shows point count label', async ({ page }) => {
  const room = uniqueRoom('cs-count');
  await waitForAppReady(page, room);

  await page.click('#cross-section-toggle');
  await expect(page.locator('#cross-section-panel')).toBeVisible({ timeout: 3000 });

  const countLabel = page.locator('#cross-section-count');
  await expect(countLabel).toBeVisible();
  const text = await countLabel.textContent();
  expect(text).toMatch(/\d+ points in slice/);
});

test('export SVG button triggers download', async ({ page }) => {
  const room = uniqueRoom('cs-export');
  await waitForAppReady(page, room);

  await page.click('#cross-section-toggle');
  await expect(page.locator('#cross-section-panel')).toBeVisible({ timeout: 3000 });

  // Set a wide thickness to catch points
  const thickSlider = page.locator('#cross-section-thickness');
  await thickSlider.evaluate((el: HTMLInputElement) => {
    el.value = el.max;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Listen for download
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#cross-section-export-btn'),
  ]);

  expect(download.suggestedFilename()).toMatch(/^cross-section-X-\d+\.svg$/);
});

test('exported SVG has valid content', async ({ page }) => {
  const room = uniqueRoom('cs-svg-content');
  await waitForAppReady(page, room);

  await page.click('#cross-section-toggle');
  await expect(page.locator('#cross-section-panel')).toBeVisible({ timeout: 3000 });

  // Set wide thickness
  const thickSlider = page.locator('#cross-section-thickness');
  await thickSlider.evaluate((el: HTMLInputElement) => {
    el.value = el.max;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#cross-section-export-btn'),
  ]);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) {
    chunks.push(chunk as Buffer);
  }
  const svgContent = Buffer.concat(chunks).toString('utf-8');

  // Should be valid SVG
  expect(svgContent).toContain('<svg');
  expect(svgContent).toContain('xmlns="http://www.w3.org/2000/svg"');
  // Should contain cross-section title
  expect(svgContent).toContain('X =');
  // Should have point circles
  expect(svgContent).toContain('<circle');
});

test('preview SVG renders points from splat data', async ({ page }) => {
  const room = uniqueRoom('cs-preview-pts');
  await waitForAppReady(page, room);

  await page.click('#cross-section-toggle');
  await expect(page.locator('#cross-section-panel')).toBeVisible({ timeout: 3000 });

  // Set max thickness to capture all points
  const thickSlider = page.locator('#cross-section-thickness');
  await thickSlider.evaluate((el: HTMLInputElement) => {
    el.value = el.max;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Preview SVG should have circle elements
  const circles = page.locator('#cross-section-preview circle');
  const count = await circles.count();
  expect(count).toBeGreaterThan(0);
});

test('toggling off hides cross-section panel', async ({ page }) => {
  const room = uniqueRoom('cs-toggle-off');
  await waitForAppReady(page, room);

  await page.click('#cross-section-toggle');
  await expect(page.locator('#cross-section-panel')).toBeVisible({ timeout: 3000 });

  await page.click('#cross-section-toggle');
  await expect(page.locator('#cross-section-panel')).toBeHidden();
});
