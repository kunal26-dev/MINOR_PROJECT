const assert = require('node:assert/strict');
const test = require('node:test');
const { buildAssignmentFilter } = require('./assignmentController');

test('student assignment lists include current and earlier semesters only', () => {
  assert.deepEqual(buildAssignmentFilter({ role: 'Student', semester: 5 }), {
    semester: { $lte: 5 },
  });
});

test('teacher assignment lists remain limited to the teacher’s own assignments', () => {
  assert.deepEqual(buildAssignmentFilter({ role: 'Teacher', _id: 'teacher-id' }), {
    createdBy: 'teacher-id',
  });
});
