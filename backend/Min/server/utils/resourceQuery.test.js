const assert = require('node:assert/strict');
const test = require('node:test');
const { buildResourceFilter, getSort } = require('./resourceQuery');

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

  test('uploader filters combine with the existing ownership restriction', async () => {
    const filter = await buildResourceFilter(
      { uploader: '507f1f77bcf86cd799439012' },
      { uploadedBy: '507f1f77bcf86cd799439011' }
    );

    assert.deepEqual(filter, {
      uploadedBy: '507f1f77bcf86cd799439011',
      $and: [{ uploadedBy: '507f1f77bcf86cd799439012' }],
    });
  });

  test('resource sorting supports the discovery options and rejects unknown values', () => {
    assert.deepEqual(getSort({ sort: 'newest' }), { createdAt: -1, _id: -1 });
    assert.deepEqual(getSort({ sort: 'title' }), { title: 1, _id: 1 });
    assert.deepEqual(getSort({ order: 'asc' }), { createdAt: 1, _id: 1 });
    assert.throws(() => getSort({ sort: 'unknown' }), /Invalid sort/);
  });
});
