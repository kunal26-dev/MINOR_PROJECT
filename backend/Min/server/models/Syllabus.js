const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
  },
  { timestamps: false }
);

const unitSchema = new mongoose.Schema(
  {
    unitNumber: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    topics: {
      type: [topicSchema],
      required: true,
      validate: {
        validator: (topics) => topics.length >= 1 && topics.length <= 100,
        message: 'Each unit must contain between 1 and 100 topics',
      },
    },
  },
  { timestamps: false }
);

const syllabusSchema = new mongoose.Schema(
  {
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, unique: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    units: {
      type: [unitSchema],
      required: true,
      validate: {
        validator: (units) => units.length >= 1 && units.length <= 5 &&
          new Set(units.map((unit) => unit.unitNumber)).size === units.length,
        message: 'A syllabus must contain 1 to 5 uniquely numbered units',
      },
    },
  },
  { timestamps: true }
);

syllabusSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('Syllabus', syllabusSchema);
