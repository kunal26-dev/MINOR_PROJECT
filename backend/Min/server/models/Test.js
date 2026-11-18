const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    prompt: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
      maxlength: [1000, 'Question text cannot exceed 1000 characters'],
    },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (options) =>
          options.length >= 2 &&
          options.length <= 6 &&
          options.every((option) => typeof option === 'string' && option.trim().length > 0),
        message: 'Each question needs 2 to 6 non-empty options',
      },
    },
    correctOption: {
      type: Number,
      required: true,
      validate: {
        validator(value) {
          return Number.isInteger(value) && value >= 0 && value < this.options.length;
        },
        message: 'Correct option must identify one of the question options',
      },
    },
    marks: { type: Number, min: 1, max: 100, default: 1 },
    explanation: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { _id: true }
);

const testSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    questions: {
      type: [questionSchema],
      required: true,
      validate: {
        validator: (questions) => questions.length >= 1 && questions.length <= 100,
        message: 'A test needs between 1 and 100 questions',
      },
    },
    maxAttempts: { type: Number, required: true, min: 1, max: 20, default: 1 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

testSchema.index({ isPublished: 1, createdAt: -1 });
testSchema.index({ createdBy: 1, createdAt: -1 });

testSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.questions = ret.questions.map(({ correctOption, ...question }) => question);
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Test', testSchema);
