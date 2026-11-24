// Standalone Playwright screenshot server
// Run: node screenshot-server.mjs
// Listens on port 3456, takes screenshots of scoresheet pages

import http from 'http';
import { chromium } from 'playwright';

const PORT = 3456;
const VITE_URL = 'http://localhost:6173';

let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/screenshot') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { scoresheetData, selector, width, height, scale, pageId } = JSON.parse(body);

        const b = await getBrowser();
        const context = await b.newContext({
          viewport: { width: width || 1400, height: height || 1000 },
          deviceScaleFactor: scale || 2,
        });
        const page = await context.newPage();

        // Navigate to the scoresheet page
        await page.goto(`${VITE_URL}/scoresheet_beach.html`, { waitUntil: 'networkidle' });

        // Inject the scoresheet data into sessionStorage and reload
        await page.evaluate((data) => {
          sessionStorage.setItem('scoresheetData', data);
        }, scoresheetData);

        await page.goto(`${VITE_URL}/scoresheet_beach.html`, { waitUntil: 'networkidle' });

        // Wait for the page content to render
        await page.waitForSelector(selector || '#page-1', { timeout: 10000 });
        await page.waitForTimeout(1000); // extra time for fonts/layout

        // Screenshot the specific element
        const element = await page.$(selector || '#page-1');
        if (!element) {
          throw new Error(`Element "${selector || '#page-1'}" not found`);
        }

        const screenshot = await element.screenshot({
          type: 'png',
          omitBackground: false,
        });

        await context.close();

        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(screenshot);
      } catch (error) {
        console.error('Screenshot error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(error.message || 'Screenshot failed');
      }
    });
  } else if (req.method === 'POST' && req.url === '/pdf') {
    // Full PDF generation via Playwright
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { scoresheetData, width, height, scale } = JSON.parse(body);

        const b = await getBrowser();
        const context = await b.newContext({
          viewport: { width: width || 1400, height: height || 1000 },
          deviceScaleFactor: scale || 2,
        });
        const page = await context.newPage();

        await page.goto(`${VITE_URL}/scoresheet_beach.html`, { waitUntil: 'networkidle' });
        await page.evaluate((data) => {
          sessionStorage.setItem('scoresheetData', data);
        }, scoresheetData);
        await page.goto(`${VITE_URL}/scoresheet_beach.html`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#page-1', { timeout: 10000 });
        await page.waitForTimeout(1000);

        // Count pages
        const pageCount = await page.evaluate(() => {
          let count = 0;
          while (document.getElementById(`page-${count + 1}`)) count++;
          return count;
        });

        // Screenshot each page and build response
        const screenshots = [];
        for (let i = 1; i <= pageCount; i++) {
          const el = await page.$(`#page-${i}`);
          if (el) {
            const shot = await el.screenshot({ type: 'png', omitBackground: false });
            screenshots.push(shot.toString('base64'));
          }
        }

        await context.close();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pages: screenshots }));
      } catch (error) {
        console.error('PDF generation error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(error.message || 'PDF generation failed');
      }
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Playwright screenshot server running. POST to /screenshot or /pdf');
  }
});

server.listen(PORT, () => {
  console.log(`Screenshot server listening on http://localhost:${PORT}`);
  console.log(`POST /screenshot - Screenshot a single element`);
  console.log(`POST /pdf - Get all page screenshots as base64 JSON`);
});

// Cleanup on exit
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit(0);
});
