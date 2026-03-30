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
  await page.waitForSelector('#presence-sidebar', { timeout: 5000 });
}

test('presence sidebar appears on room load', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('presence-show'));
  await expect(page.locator('#presence-sidebar')).toBeVisible();
  await expect(page.locator('#presence-count')).toHaveText('1');
});

test('presence sidebar shows local user with color dot', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('presence-local'));

  const userRow = page.locator('.presence-user');
  await expect(userRow).toHaveCount(1);

  // Should show "(you)" for local user
  await expect(userRow.locator('.presence-name')).toContainText('(you)');

  // Should have a colored dot
  await expect(userRow.locator('.presence-dot')).toBeVisible();
});

test('clicking header toggles user list', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('presence-toggle'));

  const userList = page.locator('#presence-user-list');
  await expect(userList).toBeVisible();

  // Click header to collapse
  await page.locator('#presence-header').click();
  await expect(userList).toBeHidden();

  // Click again to expand
  await page.locator('#presence-header').click();
  await expect(userList).toBeVisible();
});

test('two users see each other in presence sidebar', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('presence-sync');
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    // Give Yjs awareness time to sync
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    // Both pages should show 2 users
    await expect(page1.locator('#presence-count')).toHaveText('2', { timeout: 10000 });
    await expect(page2.locator('#presence-count')).toHaveText('2', { timeout: 10000 });

    // Both pages should have 2 user rows
    await expect(page1.locator('.presence-user')).toHaveCount(2, { timeout: 5000 });
    await expect(page2.locator('.presence-user')).toHaveCount(2, { timeout: 5000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('user disappears from sidebar when they disconnect', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('presence-disconnect');
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    // Wait for both users to appear
    await expect(page1.locator('#presence-count')).toHaveText('2', { timeout: 10000 });

    // Navigate page2 away (triggers clean WebSocket close)
    await page2.goto('about:blank');

    // Page1 should eventually show only 1 user (awareness timeout may take a few seconds)
    await expect(page1.locator('#presence-count')).toHaveText('1', { timeout: 30000 });
    await expect(page1.locator('.presence-user')).toHaveCount(1);
  } finally {
    await context1.close();
    await context2.close();
  }
});
