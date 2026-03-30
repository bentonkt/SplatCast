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

test('role badge appears on room load', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('roles-badge'));
  const badge = page.locator('#role-badge');
  await expect(badge).toBeVisible({ timeout: 5000 });
  const label = badge.locator('.role-label');
  await expect(label).toHaveText(/Editor|Commenter|Viewer/);
});

test('first user gets editor role', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('roles-first-editor'));
  const badge = page.locator('#role-badge .role-label');
  await expect(badge).toHaveText('Editor', { timeout: 5000 });
});

test('second user gets commenter role by default', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('roles-second-commenter');
    await waitForAppReady(page1, room);
    // Wait for first user's role to be committed to the server
    await expect(page1.locator('#role-badge .role-label')).toHaveText('Editor', { timeout: 5000 });
    await page1.waitForTimeout(500);

    // Now connect second user — they should sync the first user's editor role
    await waitForAppReady(page2, room);
    // Second user is commenter
    await expect(page2.locator('#role-badge .role-label')).toHaveText('Commenter', { timeout: 10000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('presence sidebar shows role labels for each user', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('roles-presence-labels');
    await waitForAppReady(page1, room);
    await expect(page1.locator('#role-badge .role-label')).toHaveText('Editor', { timeout: 5000 });
    await page1.waitForTimeout(500);
    await waitForAppReady(page2, room);
    await page2.waitForTimeout(500);

    // Both users should see role labels in the presence sidebar
    const roleLabels1 = page1.locator('#presence-user-list .presence-role');
    await expect(roleLabels1).not.toHaveCount(0, { timeout: 5000 });

    // Editor should see at least one role label
    const firstRole = roleLabels1.first();
    await expect(firstRole).toHaveText(/editor|commenter|viewer/);
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('editor can change another user role via dropdown', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('roles-change');
    await waitForAppReady(page1, room);
    await expect(page1.locator('#role-badge .role-label')).toHaveText('Editor', { timeout: 5000 });
    await page1.waitForTimeout(500);
    await waitForAppReady(page2, room);
    await page2.waitForTimeout(500);

    // Wait for page1 (editor) to see the role-select dropdown for the other user
    const roleSelect = page1.locator('#presence-user-list .role-select');
    await expect(roleSelect).toBeVisible({ timeout: 5000 });

    // Change the other user's role to viewer
    await roleSelect.selectOption('viewer');

    // Wait for the change to sync to page2
    await expect(page2.locator('#role-badge .role-label')).toHaveText('Viewer', { timeout: 10000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('viewer cannot place annotations', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('roles-viewer-block');
    await waitForAppReady(page1, room);
    await expect(page1.locator('#role-badge .role-label')).toHaveText('Editor', { timeout: 5000 });
    await page1.waitForTimeout(500);
    await waitForAppReady(page2, room);
    await page2.waitForTimeout(500);

    // Editor changes second user's role to viewer
    const roleSelect = page1.locator('#presence-user-list .role-select');
    await expect(roleSelect).toBeVisible({ timeout: 5000 });
    await roleSelect.selectOption('viewer');
    await expect(page2.locator('#role-badge .role-label')).toHaveText('Viewer', { timeout: 10000 });

    // Now the viewer tries to place a pin
    await page2.waitForSelector('#pin-overlay', { timeout: 5000 });
    const canvas2 = page2.locator('canvas#canvas');
    const box = await canvas2.boundingBox();
    if (!box) throw new Error('Canvas bounding box not found');

    const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
    const baseline = await page2.locator(pinSelector).count();

    await page2.mouse.dblclick(box.x + 200, box.y + 200);
    // Wait a moment and verify no pin was created
    await page2.waitForTimeout(500);
    const afterCount = await page2.locator(pinSelector).count();
    expect(afterCount).toBe(baseline);
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('commenter can place annotations', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('roles-commenter-annotate');
    await waitForAppReady(page1, room);
    await expect(page1.locator('#role-badge .role-label')).toHaveText('Editor', { timeout: 5000 });
    await page1.waitForTimeout(500);

    await waitForAppReady(page2, room);

    // Verify page2 is commenter
    await expect(page2.locator('#role-badge .role-label')).toHaveText('Commenter', { timeout: 10000 });

    // Commenter places a pin
    await page2.waitForSelector('#pin-overlay', { timeout: 5000 });
    const canvas2 = page2.locator('canvas#canvas');
    const box = await canvas2.boundingBox();
    if (!box) throw new Error('Canvas bounding box not found');

    const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
    const baseline = await page2.locator(pinSelector).count();

    await page2.mouse.dblclick(box.x + 200, box.y + 200);
    await expect(page2.locator(pinSelector)).toHaveCount(baseline + 1, { timeout: 5000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('editor role selector not visible to non-editors', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('roles-no-select');
    await waitForAppReady(page1, room);
    await expect(page1.locator('#role-badge .role-label')).toHaveText('Editor', { timeout: 5000 });
    await page1.waitForTimeout(500);
    await waitForAppReady(page2, room);
    await page2.waitForTimeout(500);

    // Wait for presence to show up on page2
    await expect(page2.locator('#presence-user-list .presence-user')).not.toHaveCount(0, { timeout: 5000 });

    // Commenter (page2) should NOT see role-select dropdown
    const roleSelects = page2.locator('#presence-user-list .role-select');
    await expect(roleSelects).toHaveCount(0);
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('two users see synced role changes in presence sidebar', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('roles-sync');
    await waitForAppReady(page1, room);
    await expect(page1.locator('#role-badge .role-label')).toHaveText('Editor', { timeout: 5000 });
    await page1.waitForTimeout(500);
    await waitForAppReady(page2, room);
    await page2.waitForTimeout(500);

    // Editor (page1) changes page2's role to viewer
    const roleSelect = page1.locator('#presence-user-list .role-select');
    await expect(roleSelect).toBeVisible({ timeout: 5000 });
    await roleSelect.selectOption('viewer');

    // Verify role label updates on page1's presence sidebar
    const otherUserRole = page1.locator('#presence-user-list .presence-role').last();
    await expect(otherUserRole).toHaveText('viewer', { timeout: 5000 });

    // Verify role badge updates on page2
    await expect(page2.locator('#role-badge .role-label')).toHaveText('Viewer', { timeout: 10000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});
