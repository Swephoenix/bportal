const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('login page shows the Kanslihuset logo at the top', () => {
  const headingIndex = html.indexOf('<img src="kanslihuset_logo.svg" alt="Kanslihuset" class="kanslihuset-logo">');
  const loginIndex = html.indexOf('<div id="view-login"');

  assert.notEqual(headingIndex, -1);
  assert.notEqual(loginIndex, -1);
  assert.ok(headingIndex < loginIndex);
  assert.doesNotMatch(html, /<h1 class="site-title">Kanslihuset<\/h1>/);
  assert.doesNotMatch(html, /<img src="logo\.png" alt="Beställningsportalen" class="site-logo">/);
});

test('portal login opens a choice view before the order form', () => {
  assert.match(html, /<div id="view-home" class="view">/);
  assert.match(html, /Kanslifunktioner/);
  assert.match(html, /Beställningsportalen/);
  assert.match(html, /showView\('view-home'\)/);
  assert.doesNotMatch(html, /sessionStorage\.setItem\('portal_unlocked', 'true'\);\s*showView\('view-portal'\);/);
});

test('login animation uses the Kanslihuset logo instead of the blue symbol', () => {
  assert.match(html, /<div class="login-splash-heart" aria-hidden="true">\s*<img src="kanslihuset_logo\.svg" alt="">\s*<\/div>/);
  assert.doesNotMatch(html, /<div class="login-splash-heart" aria-hidden="true">\s*<svg viewBox="0 0 24 24">/);
});

test('login animation includes orange feedback particles returning to the center', () => {
  assert.match(html, /\.login-splash-feedback/);
  assert.match(html, /path="M300,60 L300,300"/);
  assert.match(html, /path="M500,500 L300,300"/);
});
