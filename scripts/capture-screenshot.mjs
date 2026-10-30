import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:3000');
  await page.getByRole('button', { name: /Load sample venue/ }).click();
  await page.getByLabel('Prior show cohort').selectOption('past-1');
  await page.getByRole('button', { name: 'Draft campaign', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Next up after Japanese Breakfast');
  await expect(page.locator('.queue-show h3').first()).toHaveText('Alvvays');
  const sizes = [];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole('button', { name: 'Review invitation', exact: true })).toBeInViewport();
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    if (dimensions.scrollWidth > dimensions.width) throw new Error(`Horizontal overflow at ${width}px`);
    sizes.push(dimensions);
    if (width === 390) await page.screenshot({ path: 'artifacts/SecondShow-current-mobile.png', fullPage: false });
    if (width === 1440) await page.screenshot({ path: 'artifacts/SecondShow-current-desktop.png', fullPage: false });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await fs.writeFile('artifacts/SecondShow-screenshots.verification.json', JSON.stringify({
    actualApplication: true, mode: 'Fictional sample; deterministic baseline; nothing sent',
    cohort: 'Japanese Breakfast', sizes, browserErrors: errors,
    files: ['SecondShow-current-desktop.png', 'SecondShow-current-mobile.png'],
  }, null, 2));
  console.log(JSON.stringify({ sizes, browserErrors: errors }));
} finally {
  await browser.close();
}
