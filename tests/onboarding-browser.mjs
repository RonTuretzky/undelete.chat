import { chromium, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { guides, platformGuides, platformOrder } from '../web/guides.mjs';

const base = process.env.TEST_URL || 'http://127.0.0.1:5178';
const output = resolve(process.env.TEST_OUTPUT || '/tmp/afterword-onboarding');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const issues = [];
page.on('pageerror', error => issues.push(error.message));
const username = `onboard-${randomBytes(6).toString('hex')}`;
const password = randomBytes(20).toString('base64url');
let created = false;
async function noOverflow() {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  if (await page.locator('dialog').count()) expect(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
}
async function connections() {
  if (page.viewportSize().width < 768) await page.getByLabel('Toggle navigation').click();
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
}
try {
  // Public guides must work as direct links, with no account or demo overlay.
  await page.goto(`${base}/docs`);
  await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
  await expect(page.locator('.demo-banner')).toHaveCount(0);
  await page.screenshot({ path: join(output, 'help-desktop.png'), fullPage: true });
  for (const [slug, guide] of Object.entries(guides)) {
    await page.goto(`${base}/docs/${slug}`);
    await expect(page.getByRole('heading', { name: guide.title + '.', exact: true })).toBeVisible();
    for (const section of guide.sections) await expect(page.locator(`article section#${section.id}`)).toHaveCount(1);
    await noOverflow();
  }
  await page.goto(`${base}/docs/discord`);
  await expect(page.getByRole('button', { name: 'Connect Discord', exact: true })).toHaveCount(1);
  await expect(page.getByText(platformGuides.discord.coverage, { exact: true })).toBeVisible();
  await page.screenshot({ path: join(output, 'discord-guide-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const slug of ['getting-started', ...platformOrder, 'troubleshooting']) {
    await page.goto(`${base}/docs/${slug}`);
    await expect(page.getByRole('heading', { name: guides[slug].title + '.', exact: true })).toBeVisible();
    await noOverflow();
  }
  await page.goto(`${base}/docs/whatsapp`);
  await page.screenshot({ path: join(output, 'whatsapp-guide-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1080 });
  // Starting in a guide must preserve the chosen platform through registration.
  await page.getByRole('button', { name: 'Connect WhatsApp', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  if (await page.getByLabel('Invitation code').count()) {
    if (!process.env.TEST_INVITE_FILE) throw new Error('Set TEST_INVITE_FILE for an invite-only server.');
    await page.getByLabel('Invitation code').fill(readFileSync(process.env.TEST_INVITE_FILE, 'utf8').trim());
  }
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('dialog').getByRole('heading', { name: 'Connect WhatsApp', exact: true })).toBeVisible();
  created = true;
  const availablePlatforms = platformOrder.filter(p => platformGuides[p].available !== false);
  for (const platform of availablePlatforms) {
    const name = platformGuides[platform].name;
    if (platform !== 'whatsapp') {
      await connections();
      await page.getByRole('button', { name: `Connect ${name}`, exact: true }).click();
    }
    if (platform === 'signal') await page.setViewportSize({ width: 390, height: 844 });
    const dialog = page.locator('dialog');
    await expect(dialog.getByRole('heading', { name: 'Have these ready' })).toBeVisible();
    await page.screenshot({ path: join(output, `${platform}-checklist.png`) });
    await dialog.locator('input[type=checkbox]').check();
    await dialog.getByRole('button', { name: 'Continue to setup', exact: true }).click();
    let code = await page.getByLabel('Pairing code', { exact: true }).innerText();
    await expect(dialog.getByRole('status')).toContainText(platform === 'discord' ? 'Waiting for your extension' : 'Waiting for your companion');
    if (platform === 'whatsapp') {
      await dialog.getByRole('button', { name: 'Windows', exact: true }).click();
      await expect(dialog.locator('.command-block').first()).toContainText('npm.cmd ci --omit=dev');
      const oldCode = code;
      await dialog.getByRole('button', { name: 'Finish later', exact: true }).click();
      await page.reload();
      await connections();
      await page.getByRole('button', { name: 'Continue setup', exact: true }).click();
      await dialog.getByRole('button', { name: 'Generate pairing code', exact: true }).click();
      code = await page.getByLabel('Pairing code', { exact: true }).innerText();
      expect(code).not.toBe(oldCode);
      expect((await page.request.post(`${base}/api/pair`, { data: { code: oldCode } })).status()).toBe(400);
      const data = await (await page.request.get(`${base}/api/connections`)).json();
      expect(data.connections.filter(c => c.platform === platform)).toHaveLength(1);
      const download = page.waitForEvent('download');
      await page.getByRole('link', { name: 'Download companion ZIP' }).click();
      await (await download).saveAs(join(output, 'companion.zip'));
    }
    await dialog.locator('.wizard-platform').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, `${platform}-pairing.png`) });
    await noOverflow();
    const pairResponse = await page.request.post(`${base}/api/pair`, { data: { code, ...(platform === 'discord' ? { platform: 'discord' } : {}) } });
    expect(pairResponse.ok()).toBeTruthy();
    const { connection } = await pairResponse.json();
    expect(connection.platform).toBe(platform);
    await expect(dialog.getByRole('status')).toContainText(platform === 'discord' ? 'Waiting for Discord capture' : 'Waiting for platform sign-in', { timeout: 10000 });
    await expect(dialog.getByRole('heading', { name: `${name} is connected`, exact: true })).toHaveCount(0);
    // Simulated collectors exercise actual pairing, heartbeat, ingestion, and UI polling.
    // They intentionally do not sign into provider accounts or send platform messages.
    const headers = { Authorization: `Bearer ${connection.token}` };
    expect((await page.request.post(`${base}/api/heartbeat`, { headers, data: { health: 'connected', detail: 'Onboarding test collector' } })).ok()).toBeTruthy();
    await expect(dialog.getByRole('heading', { name: `${name} is connected`, exact: true })).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText('Waiting for your first captured message', { exact: true })).toBeVisible();
    const occurredAt = new Date().toISOString();
    const result = await (await page.request.post(`${base}/api/ingest`, { headers, data: { events: [{ eventId: `onboard-${platform}`, kind: 'create', scope: 'test', externalId: platform, chatId: 'test', chatName: 'Setup check', authorName: 'Test sender', text: `Undelete ${name} connection test`, occurredAt }] } })).json();
    expect(result.results[0].error).toBeUndefined();
    await expect(dialog.getByText('A message has reached your archive', { exact: true })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: join(output, `${platform}-verified.png`) });
    await noOverflow();
    await dialog.getByRole('button', { name: 'Open my archive', exact: true }).click();
    await expect(page.locator('.message-row')).toHaveCount(availablePlatforms.indexOf(platform) + 1);
  }
  await connections();
  await expect(page.locator('.source-row')).toHaveCount(availablePlatforms.length);
  await noOverflow();
  await page.screenshot({ path: join(output, 'connected-sources-mobile.png'), fullPage: true });
  expect(issues).toEqual([]);
  console.log('PASS: eight public guides, direct links, mobile layouts, guide-to-signup intent, all available guided connections, Windows commands, resume without duplicates, code replacement, ZIP download, honest pending states, and first-message verification. Collector events were simulated; no provider sign-ins were attempted.');
} finally {
  if (created) {
    const removed = await page.request.delete(`${base}/api/account`, { data: { password } });
    expect(removed.ok()).toBeTruthy();
  }
  await browser.close();
}
