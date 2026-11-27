const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildResourceNotifications,
  buildStudentAudienceFilter,
} = require('./resourceNotifications');

test('publishing a resource notifies its uploader and eligible students once', () => {
  const notifications = buildResourceNotifications({
    _id: 'resource-id',
    title: 'Algebra notes',
    semester: 4,
    uploadedBy: 'uploader-id',
  }, [{ _id: 'uploader-id' }, { _id: 'student-id' }]);

  assert.deepEqual(notifications.map(({ recipient, type }) => ({ recipient, type })), [
    { recipient: 'uploader-id', type: 'upload_approved' },
    { recipient: 'student-id', type: 'new_material' },
  ]);
  assert.match(notifications[1].message, /semester 4/);
});

test('new-material alerts target only active students who can access that semester', () => {
  assert.deepEqual(buildStudentAudienceFilter({ semester: 4 }), {
    role: 'Student',
    accountStatus: 'Active',
    semester: { $gte: 4 },
  });
});
