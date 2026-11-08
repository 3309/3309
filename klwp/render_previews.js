// Renders klwp/previews/*.html to PNG at Galaxy S22 resolution (1080 x 2340).
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
(async () => {
  const dir = path.join(__dirname, "previews");
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 720, height: 1560 }, deviceScaleFactor: 1.5 });
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".html"))) {
    await p.goto("file://" + path.join(dir, f)); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(dir, f.replace(".html", ".png")) });
  }
  await b.close();
})();
