const mongoose = require('mongoose');

const syllabusProgressSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    syllabus: { type: mongoose.Schema.Types.ObjectId, ref: 'Syllabus', required: true },
    completedTopics: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
  },
  { timestamps: true }
);

syllabusProgressSchema.index({ student: 1, syllabus: 1 }, { unique: true });

module.exports = mongoose.model('SyllabusProgress', syllabusProgressSchema);
