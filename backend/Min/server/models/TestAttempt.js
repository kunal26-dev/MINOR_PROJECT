const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, required: true },
    selectedOption: { type: Number, default: null },
    isCorrect: { type: Boolean, required: true },
    marksEarned: { type: Number, required: true },
  },
  { _id: false }
);

const testAttemptSchema = new mongoose.Schema(
  {
    test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    answers: { type: [answerSchema], required: true },
    score: { type: Number, required: true, min: 0 },
    totalMarks: { type: Number, required: true, min: 1 },
    percentage: { type: Number, required: true, min: 0, max: 100 },
  },
  { timestamps: true }
);

testAttemptSchema.index({ test: 1, student: 1, attemptNumber: 1 }, { unique: true });
testAttemptSchema.index({ student: 1, createdAt: -1 });

testAttemptSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('TestAttempt', testAttemptSchema);
