/**
 * scripts/probe-blank.mjs — 一次性浏览器探针：抓 Console 错误与 #root 内容
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const edge =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const errors = [];
const logs = [];

const browser = await puppeteer.launch({
  executablePath: edge,
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
