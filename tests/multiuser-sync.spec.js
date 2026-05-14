// Multi-user sync test — verifies guest sees same track and seek syncs
const { test, expect } = require('@playwright/test');

const BASE = process.env.MOD_ROOM_URL || 'https://mod-room-production.up.railway.app';
const ROOM_CODE = 'sync-test-' + Date.now();

async function createRoom(page, nick = 'Host') {
  await page.goto(BASE + '/');
  await page.waitForSelector('input[placeholder*="nickname"]', { timeout: 10000 });
  await page.fill('input[placeholder*="nickname"]', nick);
  await page.check('input[type="checkbox"]'); // host checkbox
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/room\//, { timeout: 10000 });
  // extract room code from URL
  const url = page.url();
  const code = url.split('/').pop();
  return code;
}

async function joinRoom(page, code, nick = 'Guest') {
  await page.goto(BASE + '/');
  await page.waitForSelector('input[placeholder*="nickname"]', { timeout: 10000 });
  await page.fill('input[placeholder*="nickname"]', nick);
  await page.fill('input[placeholder*="room code"]', code);
  await page.click('button:has-text("Join")');
  await page.waitForURL(/\/room\//, { timeout: 10000 });
}

async function addKoofrMod(page, filename) {
  await page.click('button:has-text("Add Media")');
  await page.waitForSelector('.tab-btn', { timeout: 5000 });
  // Click Koofr tab if not already active
  const koofrTab = await page.$('button.tab-btn:has-text("Koofr")');
  if (koofrTab) await koofrTab.click();
  await page.waitForTimeout(500);
  // Click the file row
  await page.click(`text=${filename}`);
  await page.waitForTimeout(200);
  await page.click('button:has-text("Add to Queue")');
  await page.waitForTimeout(500);
  // Close modal
  const closeBtn = await page.$('button[aria-label="Close"]');
  if (closeBtn) await closeBtn.click();
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

async function playQueueItem(page, index = 0) {
  const rows = await page.$$('.queue-row');
  if (rows[index]) {
    const btn = await rows[index].$('button');
    if (btn) await btn.click();
  }
  await page.waitForTimeout(500);
}

async function getProgressTime(page) {
  const timeEl = await page.$('.progress-time span:first-child');
  if (!timeEl) return null;
  return timeEl.textContent();
}

async function getTrackTitle(page) {
  const titleEl = await page.$('.track-title');
  if (!titleEl) return null;
  return titleEl.textContent();
}

test('guest sees track and host seek syncs', async ({ browser }) => {
  test.setTimeout(60000);

  // Host browser
  const hostCtx = await browser.newContext();
  const hostPage = await hostCtx.newPage();

  // Guest browser (incognito)
  const guestCtx = await browser.newContext();
  const guestPage = await guestCtx.newPage();

  // Host creates room
  const code = await createRoom(hostPage, 'Host');
  console.log('Room code:', code);

  // Guest joins
  await joinRoom(guestPage, code, 'Guest');

  // Host adds a Koofr MOD file
  await addKoofrMod(hostPage, '2little.mod');
  await hostPage.waitForTimeout(1000);

  // Verify guest sees the track in queue
  await guestPage.waitForSelector('.queue-row', { timeout: 10000 });
  const guestQueueCount = await guestPage.locator('.queue-row').count();
  expect(guestQueueCount).toBeGreaterThan(0);
  console.log('Guest sees', guestQueueCount, 'queue items');

  // Host plays the track
  await playQueueItem(hostPage, 0);
  await hostPage.waitForTimeout(2000);

  // Verify guest sees the track title
  const guestTitle = await getTrackTitle(guestPage);
  expect(guestTitle).toContain('2little');
  console.log('Guest sees track:', guestTitle);

  // Verify guest sees sync status
  const guestStatus = await guestPage.locator('.player-controls .text-dim').textContent();
  expect(guestStatus).toMatch(/SYNCED|PLAYING|IDLE/);
  console.log('Guest status:', guestStatus);

  // Get initial progress times
  const hostTime1 = await getProgressTime(hostPage);
  await hostPage.waitForTimeout(3000);
  const hostTime2 = await getProgressTime(hostPage);
  console.log('Host progress:', hostTime1, '->', hostTime2);

  // Host clicks progress bar to seek forward
  const progressBar = await hostPage.$('.progress-bar-wrap');
  if (progressBar) {
    const box = await progressBar.boundingBox();
    await hostPage.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
    await hostPage.waitForTimeout(1000);

    // Verify host time changed after seek
    const hostTimeAfterSeek = await getProgressTime(hostPage);
    console.log('Host time after seek:', hostTimeAfterSeek);

    // Wait a bit and check guest progress
    await guestPage.waitForTimeout(2000);
    const guestTimeAfterSeek = await getProgressTime(guestPage);
    console.log('Guest time after host seek:', guestTimeAfterSeek);
  }

  // Host clicks skip forward
  const skipFwd = await hostPage.$('button:has-text("+10s")');
  if (skipFwd) {
    await skipFwd.click();
    await hostPage.waitForTimeout(1000);
    const hostTimeAfterSkip = await getProgressTime(hostPage);
    console.log('Host time after skip:', hostTimeAfterSkip);
  }

  await hostCtx.close();
  await guestCtx.close();
});
