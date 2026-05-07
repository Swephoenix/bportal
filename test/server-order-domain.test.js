const test = require('node:test');
const assert = require('node:assert/strict');

const { isAllowedOrderEmail } = require('../server.js');

test('order submission accepts only ambitionsverige.se addresses', () => {
  assert.equal(isAllowedOrderEmail('person@ambitionsverige.se'), true);
  assert.equal(isAllowedOrderEmail('PERSON@AMBITIONSVERIGE.SE'), true);
  assert.equal(isAllowedOrderEmail(' person@ambitionsverige.se '), true);
  assert.equal(isAllowedOrderEmail('person@example.com'), false);
  assert.equal(isAllowedOrderEmail('person@ambitionsverige.se.evil.com'), false);
});
