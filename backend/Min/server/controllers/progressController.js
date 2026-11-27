const Progress = require('../models/Progress');
const TestAttempt = require('../models/TestAttempt');
const Subject = require('../models/Subject');
const Test = require('../models/Test');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { isValidObjectId, isString } = require('../utils/validators');
const { getStudentSubjectIds, isSemesterAccessible } = require('../utils/semesterSubjects');

const validateProgressInput = (body, partial = false) => {
  const errors = [];
  const values = {};
  const provided = (key) => body[key] !== undefined;

  if (!partial || provided('subject')) {
    if (!isValidObjectId(body.subject)) errors.push('A valid subject id is required');
    else values.subject = body.subject;
  }
  if (!partial || provided('topic')) {
    if (!isString(body.topic) || body.topic.trim().length < 2 || body.topic.trim().length > 120) {
      errors.push('Topic must be between 2 and 120 characters');
    } else values.topic = body.topic.trim();
  }
  if (!partial || provided('completion')) {
    if (!Number.isInteger(body.completion) || body.completion < 0 || body.completion > 100) {
      errors.push('Completion must be a whole number between 0 and 100');
    } else values.completion = body.completion;
  }
  if (provided('notes')) {
    if (!isString(body.notes) || body.notes.length > 500) errors.push('Notes must be text of at most 500 characters');
    else values.notes = body.notes.trim();
  }

  return { errors, values };
};

const assertSubjectExists = async (subjectId, user) => {
  if (!subjectId) return;
  const subject = await Subject.findById(subjectId).select('semester');
  if (!subject) throw new AppError('Subject not found', 400);
  if (!isSemesterAccessible(user, subject.semester)) {
    throw new AppError('You can only track progress for your current or earlier semesters', 403);
  }
};

const getProgress = asyncHandler(async (req, res) => {
  const subjectIds = await getStudentSubjectIds(req.user);
  const progressFilter = { user: req.user._id };
  if (subjectIds) progressFilter.subject = { $in: subjectIds };
  let attemptFilter = { student: req.user._id };
  if (subjectIds) {
    const testIds = await Test.find({ subject: { $in: subjectIds } }).distinct('_id');
    attemptFilter.test = { $in: testIds };
  }
  const [entries, testStats] = await Promise.all([
    Progress.find(progressFilter).sort({ updatedAt: -1 }).populate('subject', 'subjectName subjectCode semester'),
    TestAttempt.aggregate([
      { $match: attemptFilter },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          marksEarned: { $sum: '$score' },
          marksAvailable: { $sum: '$totalMarks' },
          averagePercentage: { $avg: '$percentage' },
        },
      },
    ]),
  ]);
  const bySubject = new Map();
  entries.forEach((entry) => {
    const subjectId = String(entry.subject._id);
    const summary = bySubject.get(subjectId) || {
      subjectId,
      subjectName: entry.subject.subjectName,
      topics: 0,
      completed: 0,
      totalCompletion: 0,
    };
    summary.topics += 1;
    summary.totalCompletion += entry.completion;
    if (entry.completion === 100) summary.completed += 1;
    bySubject.set(subjectId, summary);
  });
  const completedTopics = entries.filter((entry) => entry.completion === 100).length;
  const stats = testStats[0] || {};

  sendSuccess(res, 200, 'Progress retrieved successfully', {
    progress: entries,
    report: {
      trackedTopics: entries.length,
      completedTopics,
      averageCompletion: entries.length
        ? Math.round(entries.reduce((total, entry) => total + entry.completion, 0) / entries.length)
        : 0,
      subjects: [...bySubject.values()].map((summary) => ({
        ...summary,
        averageCompletion: Math.round(summary.totalCompletion / summary.topics),
      })),
      testAttempts: stats.attempts || 0,
      marksEarned: stats.marksEarned || 0,
      marksAvailable: stats.marksAvailable || 0,
      averageTestPercentage: Math.round(stats.averagePercentage || 0),
    },
  });
});

const createProgress = asyncHandler(async (req, res) => {
  const { errors, values } = validateProgressInput(req.body);
  if (errors.length) throw new AppError('Validation failed', 400, errors);
  await assertSubjectExists(values.subject, req.user);

  const progress = await Progress.create({ ...values, user: req.user._id });
  await progress.populate('subject', 'subjectName subjectCode');
  sendSuccess(res, 201, 'Progress entry created successfully', { progress });
});

const updateProgress = asyncHandler(async (req, res) => {
  const progress = await Progress.findOne({ _id: req.params.id, user: req.user._id });
  if (!progress) throw new AppError('Progress entry not found', 404);

  const { errors, values } = validateProgressInput(req.body, true);
  if (errors.length) throw new AppError('Validation failed', 400, errors);
  if (!Object.keys(values).length) throw new AppError('Provide at least one progress field to update', 400);
  await assertSubjectExists(values.subject || progress.subject, req.user);

  Object.assign(progress, values);
  await progress.save();
  await progress.populate('subject', 'subjectName subjectCode');
  sendSuccess(res, 200, 'Progress entry updated successfully', { progress });
});

const deleteProgress = asyncHandler(async (req, res) => {
  const progress = await Progress.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!progress) throw new AppError('Progress entry not found', 404);
  sendSuccess(res, 200, 'Progress entry deleted successfully');
});

module.exports = { getProgress, createProgress, updateProgress, deleteProgress };
