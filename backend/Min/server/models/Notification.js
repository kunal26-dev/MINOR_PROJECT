const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['upload_approved', 'new_material'], required: true },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 240 },
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, resource: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Notification', notificationSchema);
