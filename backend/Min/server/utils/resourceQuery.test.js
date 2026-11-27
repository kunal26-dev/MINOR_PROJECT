const assert = require('node:assert/strict');
const test = require('node:test');
const { buildResourceFilter } = require('./resourceQuery');

test('a semester filter cannot override a student access limit', async () => {
  const filter = await buildResourceFilter(
    { semester: '6' },
    { status: 'Approved', semester: { $lte: 5 } }
  );

  assert.deepEqual(filter, {
    status: 'Approved',
    semester: { $lte: 5 },
    $and: [{ semester: 6 }],
  });
});
