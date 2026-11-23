const assert = require('node:assert/strict');
const test = require('node:test');
const { buildTestFilter, serializeTestForList } = require('./testController');

test('students get published tests limited to their semester subjects, including scheduled tests', () => {
  const subjectIds = ['semester-five-subject'];
  const filter = buildTestFilter({ role: 'Student', semester: 5 }, subjectIds);

  assert.deepEqual(filter, {
    isPublished: true,
    subject: { $in: subjectIds },
  });
});

test('future scheduled tests are listed without revealing their questions to students', () => {
  const now = new Date('2026-11-24T00:00:00.000Z');
  const scheduledAt = new Date('2026-11-24T01:00:00.000Z');
  const testDoc = {
    scheduledAt,
    questions: [{}, {}],
    toJSON: () => ({ scheduledAt, questions: [{ prompt: 'Hidden question' }] }),
  };

  const result = serializeTestForList(testDoc, 'Student', undefined, now);

  assert.equal(result.isAvailable, false);
  assert.equal(result.questionCount, 2);
  assert.deepEqual(result.questions, []);
});

test('immediately available tests include questions for students', () => {
  const now = new Date('2026-11-24T00:00:00.000Z');
  const testDoc = {
    scheduledAt: null,
    questions: [{}],
    toJSON: () => ({ scheduledAt: null, questions: [{ prompt: 'Available question' }] }),
  };

  const result = serializeTestForList(testDoc, 'Student', undefined, now);

  assert.equal(result.isAvailable, true);
  assert.equal(result.questionCount, 1);
  assert.deepEqual(result.questions, [{ prompt: 'Available question' }]);
});
