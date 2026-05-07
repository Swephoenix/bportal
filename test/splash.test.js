const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'Splash.html'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('splash screen uses the Kanslihuset logo and video', () => {
  assert.match(html, /<img src="kanslihuset_logo\.svg" alt="Kanslihuset Logotyp">/);
  assert.match(html, /<source src="kanslihuset\.mp4" type="video\/mp4">/);
  assert.match(html, /Välkommen till Kanslihuset/);
  assert.match(html, /Beställningsportalen/);
  assert.match(html, /Ansluter till servern\.\.\./);
  assert.match(html, /id="progressFill"/);
  assert.match(html, /index\.html/);
  assert.match(html, /window\.location\.href = 'index\.html';/);
});

test('server allows the splash video asset', () => {
  assert.match(serverSource, /\/kanslihuset\.mp4/);
});
