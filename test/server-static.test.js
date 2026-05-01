const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('server allows the Kanslihuset logo asset', () => {
  assert.match(serverSource, /\/kanslihuset_logo\.svg/);
});
