const Notification = require('../models/Notification');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { isValidObjectId } = require('../utils/validators');

const getNotifications = asyncHandler(async (req, res) => {
  const limitValue = Number(req.query.limit || 20);
  const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 50) : 20;
  const filter = { recipient: req.user._id };
  if (req.query.unread === 'true') filter.readAt = null;
  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit)
      .populate('resource', 'title semester status'),
    Notification.countDocuments({ recipient: req.user._id, readAt: null }),
  ]);
  sendSuccess(res, 200, 'Notifications retrieved successfully', { notifications, unreadCount });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) throw new AppError('Invalid notification id', 400);
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id, readAt: null },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!notification) {
    const existing = await Notification.exists({ _id: req.params.id, recipient: req.user._id });
    if (!existing) throw new AppError('Notification not found', 404);
  }
  sendSuccess(res, 200, 'Notification marked as read', { notification });
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  sendSuccess(res, 200, 'Notifications marked as read');
});

module.exports = { getNotifications, markNotificationRead, markAllNotificationsRead };
