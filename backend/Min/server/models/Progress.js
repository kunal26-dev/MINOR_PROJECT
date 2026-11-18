const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    topic: {
      type: String,
      required: [true, 'Topic is required'],
      trim: true,
      minlength: [2, 'Topic must be at least 2 characters'],
      maxlength: [120, 'Topic cannot exceed 120 characters'],
    },
    completion: {
      type: Number,
      required: true,
      min: [0, 'Completion must be between 0 and 100'],
      max: [100, 'Completion must be between 0 and 100'],
      validate: { validator: Number.isInteger, message: 'Completion must be a whole number' },
      default: 0,
    },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

progressSchema.index({ user: 1, updatedAt: -1 });

progressSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Progress', progressSchema);
