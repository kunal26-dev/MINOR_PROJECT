const Notification = require('../models/Notification');
const User = require('../models/User');

const buildResourceNotifications = (resource, students) => {
  const uploaderId = String(resource.uploadedBy?._id || resource.uploadedBy);
  return [
    {
      recipient: uploaderId,
      type: 'upload_approved',
      title: 'Your resource was approved',
      message: `"${resource.title}" is now available in the library.`,
      resource: resource._id,
    },
    ...students
      .filter((student) => String(student._id) !== uploaderId)
      .map((student) => ({
        recipient: student._id,
        type: 'new_material',
        title: 'New study material is available',
        message: `"${resource.title}" was added for semester ${resource.semester}.`,
        resource: resource._id,
      })),
  ];
};

const buildStudentAudienceFilter = (resource) => ({
  role: 'Student',
  accountStatus: 'Active',
  semester: { $gte: resource.semester },
});

const notifyResourcePublished = async (resource) => {
  try {
    const students = await User.find(buildStudentAudienceFilter(resource)).select('_id').lean();
    const notifications = buildResourceNotifications(resource, students);
    if (!notifications.length) return true;
    await Notification.bulkWrite(
      notifications.map((notification) => ({
        updateOne: {
          filter: {
            recipient: notification.recipient,
            resource: notification.resource,
            type: notification.type,
          },
          update: { $setOnInsert: notification },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    return true;
  } catch (error) {
    console.error(`Could not create notifications for resource ${resource._id}: ${error.message}`);
    return false;
  }
};

module.exports = {
  notifyResourcePublished,
  buildResourceNotifications,
  buildStudentAudienceFilter,
};
