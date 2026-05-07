const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('department buttons use a tooltip instead of the hint box below the grid', () => {
  assert.match(html, /id="deptTooltip"/);
  assert.match(html, /showDepartmentTooltip/);
  assert.match(html, /hideDepartmentTooltip/);
  assert.doesNotMatch(html, /id="deptHint"/);
  assert.doesNotMatch(html, /Håll musen över en avdelning \(eller tryck\) för att se exempel på vad som passar där\./);
});
