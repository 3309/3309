// Renders the mockup to a PNG at Galaxy S22 resolution (1080 x 2340).
// Usage: node mockup/render.js
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3 });
  await page.goto('file://' + path.join(__dirname, 'nexus-mockup.html'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, 'nexus-mockup.png') });
  await browser.close();
  console.log('wrote mockup/nexus-mockup.png');
})();
