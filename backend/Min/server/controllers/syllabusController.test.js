const assert = require('node:assert/strict');
const test = require('node:test');
const { validateUnits } = require('./syllabusController');

const makeUnits = (count) => Array.from({ length: count }, (_, index) => ({
  title: `Unit ${index + 1}`,
  topics: [{ title: `Topic ${index + 1}` }],
}));

test('syllabus validation accepts up to five units', () => {
  const { errors, units } = validateUnits(makeUnits(5));

  assert.deepEqual(errors, []);
  assert.equal(units.length, 5);
});

test('syllabus validation rejects more than five units', () => {
  const { errors } = validateUnits(makeUnits(6));

  assert.deepEqual(errors, ['A syllabus must contain between 1 and 5 units']);
});

test('syllabus validation permits a unit to be published independently by its number', () => {
  const { errors, units } = validateUnits([
    { unitNumber: 4, title: 'Linked lists', topics: [{ title: 'Reverse a list' }] },
  ]);

  assert.deepEqual(errors, []);
  assert.equal(units[0].unitNumber, 4);
});

test('syllabus edits preserve existing topic ids and reject unknown ids', () => {
  const topicId = '507f1f77bcf86cd799439011';
  const existingSyllabus = { units: [{ topics: [{ _id: topicId }] }] };
  const retained = validateUnits([{ title: 'Unit 1', topics: [{ _id: topicId, title: 'Updated topic' }] }], existingSyllabus);
  const unknown = validateUnits([{ title: 'Unit 1', topics: [{ _id: '507f1f77bcf86cd799439012', title: 'Topic' }] }], existingSyllabus);

  assert.deepEqual(retained.errors, []);
  assert.equal(retained.units[0].topics[0]._id, topicId);
  assert.match(unknown.errors[0], /invalid topic id/);
});
