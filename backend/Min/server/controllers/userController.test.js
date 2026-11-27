const assert = require('node:assert/strict');
const test = require('node:test');
const { applyProfileUpdates } = require('./userController');

test('students cannot raise their semester from their profile', async () => {
  const student = { role: 'Student', semester: 5 };

  await assert.rejects(
    applyProfileUpdates(student, { semester: 6 }),
    (error) => error.statusCode === 400 && error.errors.includes('Students cannot move themselves to a later semester')
  );
  assert.equal(student.semester, 5);
});

test('students may set their semester during onboarding or choose an earlier semester', async () => {
  const newStudent = { role: 'Student' };
  const existingStudent = { role: 'Student', semester: 5 };

  await applyProfileUpdates(newStudent, { semester: 3 });
  await applyProfileUpdates(existingStudent, { semester: 4 });

  assert.equal(newStudent.semester, 3);
  assert.equal(existingStudent.semester, 4);
});
