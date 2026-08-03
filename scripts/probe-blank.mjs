/**
 * scripts/probe-blank.mjs — 一次性浏览器探针：抓 Console 错误与 #root 内容
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const executableCandidates = [
  process.env.EDGE_PATH,
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter((candidate) => candidate && fs.existsSync(candidate));

const executablePath = executableCandidates[0];
if (!executablePath) {
  const skipped = {
    skipped: true,
    reason: 'No Chromium-compatible browser executable was found.',
    configureWith: 'EDGE_PATH, CHROME_PATH, or PUPPETEER_EXECUTABLE_PATH',
  };
  fs.writeFileSync('probe-blank-result.json', JSON.stringify(skipped, null, 2));
  console.log(JSON.stringify(skipped, null, 2));
  process.exit(0);
}

const errors = [];
const logs = [];

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});

const page = await browser.newPage();
page.on('console', (msg) => {
  logs.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => {
  errors.push(String(err));
});
page.on('requestfailed', (req) => {
  logs.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`);
});

await page.goto('http://localhost:5173/', {
  waitUntil: 'networkidle0',
  timeout: 30000,
});
await new Promise((r) => setTimeout(r, 2000));

const info = await page.evaluate(() => {
  const root = document.getElementById('root');
  return {
    title: document.title,
    dataTheme: document.documentElement.getAttribute('data-theme'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    rootHTML: root ? root.innerHTML.slice(0, 2000) : null,
    rootChildCount: root ? root.childElementCount : -1,
    hasAppShell: !!document.querySelector('.app-shell'),
    hasSidebar: !!document.querySelector('.sidebar'),
    textSample: (root?.innerText || '').slice(0, 500),
  };
});

const out = { errors, logs: logs.slice(0, 80), info };
fs.writeFileSync('probe-blank-result.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
