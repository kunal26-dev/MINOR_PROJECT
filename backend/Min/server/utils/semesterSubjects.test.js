const assert = require('node:assert/strict');
const test = require('node:test');
const { isSemesterAccessible } = require('./semesterSubjects');

test('students can access current and earlier semesters but not future semesters', () => {
  const student = { role: 'Student', semester: 5 };

  assert.equal(isSemesterAccessible(student, 1), true);
  assert.equal(isSemesterAccessible(student, 5), true);
  assert.equal(isSemesterAccessible(student, 6), false);
});

test('students without a valid semester cannot access semester content', () => {
  assert.equal(isSemesterAccessible({ role: 'Student' }, 1), false);
  assert.equal(isSemesterAccessible({ role: 'Student', semester: 5 }, undefined), false);
});

test('semester access restrictions do not apply to non-student roles', () => {
  assert.equal(isSemesterAccessible({ role: 'Teacher' }, 8), true);
});
