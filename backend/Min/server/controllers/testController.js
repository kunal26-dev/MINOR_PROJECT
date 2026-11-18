const Test = require('../models/Test');
const TestAttempt = require('../models/TestAttempt');
const Subject = require('../models/Subject');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { isValidObjectId, isString } = require('../utils/validators');
const { getStudentSubjectIds } = require('../utils/semesterSubjects');

const validateTestInput = (body) => {
  const errors = [];
  const title = isString(body.title) ? body.title.trim() : '';
  const description = body.description === undefined ? '' : body.description;
  const safeDescription = isString(description) ? description.trim() : '';
  const maxAttempts = body.maxAttempts === undefined ? 1 : body.maxAttempts;

  if (title.length < 3 || title.length > 150) errors.push('Title must be between 3 and 150 characters');
  if (!isString(description) || description.length > 1000) errors.push('Description must be text of at most 1000 characters');
  if (!isValidObjectId(body.subject)) errors.push('A valid subject id is required');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    errors.push('Maximum attempts must be a whole number between 1 and 20');
  }
  if (!Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 100) {
    errors.push('A test must contain between 1 and 100 questions');
  }

  const questions = Array.isArray(body.questions) ? body.questions.map((question, index) => {
    const input = question && typeof question === 'object' ? question : {};
    const prompt = isString(input.prompt) ? input.prompt.trim() : '';
    const options = Array.isArray(input.options)
      ? input.options.map((option) => isString(option) ? option.trim() : '')
      : [];
    const marks = input.marks === undefined ? 1 : input.marks;
    const explanation = input.explanation === undefined ? '' : input.explanation;
    const safeExplanation = isString(explanation) ? explanation.trim() : '';

    if (!prompt || prompt.length > 1000) errors.push(`Question ${index + 1} needs text of at most 1000 characters`);
    if (options.length < 2 || options.length > 6 || options.some((option) => !option)) {
      errors.push(`Question ${index + 1} needs 2 to 6 non-empty options`);
    }
    if (!Number.isInteger(input.correctOption) || input.correctOption < 0 || input.correctOption >= options.length) {
      errors.push(`Question ${index + 1} needs a valid correct option`);
    }
    if (!Number.isInteger(marks) || marks < 1 || marks > 100) errors.push(`Question ${index + 1} marks must be between 1 and 100`);
    if (!isString(explanation) || explanation.length > 1000) errors.push(`Question ${index + 1} explanation must be text of at most 1000 characters`);

    return { prompt, options, correctOption: input.correctOption, marks, explanation: safeExplanation };
  }) : [];

  return {
    errors,
    values: { title, description: safeDescription, subject: body.subject, maxAttempts, questions },
  };
};

const createTest = asyncHandler(async (req, res) => {
  const { errors, values } = validateTestInput(req.body);
  if (errors.length) throw new AppError('Validation failed', 400, errors);
  if (!(await Subject.exists({ _id: values.subject }))) throw new AppError('Subject not found', 400);

  const test = await Test.create({ ...values, createdBy: req.user._id, isPublished: true });
  await test.populate([
    { path: 'subject', select: 'subjectName subjectCode' },
    { path: 'createdBy', select: 'name role' },
  ]);
  sendSuccess(res, 201, 'Test created and published successfully', { test });
});

const getTests = asyncHandler(async (req, res) => {
  const subjectIds = await getStudentSubjectIds(req.user);
  const testFilter = { isPublished: true };
  if (subjectIds) testFilter.subject = { $in: subjectIds };
  const tests = await Test.find(testFilter)
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('subject', 'subjectName subjectCode')
    .populate('createdBy', 'name role');
  const ids = tests.map((test) => test._id);
  const attempts = req.user.role === 'Student' && ids.length
    ? await TestAttempt.find({ student: req.user._id, test: { $in: ids } }).sort({ createdAt: -1 })
    : [];
  const attemptsByTest = new Map();
  attempts.forEach((attempt) => {
    const key = String(attempt.test);
    const existing = attemptsByTest.get(key) || { attempts: [], bestPercentage: 0 };
    existing.attempts.push(attempt);
    existing.bestPercentage = Math.max(existing.bestPercentage, attempt.percentage);
    attemptsByTest.set(key, existing);
  });
  const results = tests.map((test) => {
    const summary = attemptsByTest.get(String(test._id));
    const latestAttempt = summary?.attempts[0];
    return {
      ...test.toJSON(),
      attemptsUsed: summary?.attempts.length || 0,
      bestPercentage: summary?.bestPercentage || 0,
      latestAttempt: latestAttempt ? {
        score: latestAttempt.score,
        totalMarks: latestAttempt.totalMarks,
        percentage: latestAttempt.percentage,
        attemptNumber: latestAttempt.attemptNumber,
        createdAt: latestAttempt.createdAt,
      } : null,
    };
  });
  sendSuccess(res, 200, 'Tests retrieved successfully', { tests: results });
});

const getMyTestAttempts = asyncHandler(async (req, res) => {
  const subjectIds = await getStudentSubjectIds(req.user);
  const testIds = subjectIds ? await Test.find({ subject: { $in: subjectIds } }).distinct('_id') : null;
  const attemptFilter = { student: req.user._id };
  if (testIds) attemptFilter.test = { $in: testIds };
  const attempts = await TestAttempt.find(attemptFilter)
    .sort({ createdAt: -1 })
    .limit(100)
    .populate({ path: 'test', select: 'title subject', populate: { path: 'subject', select: 'subjectName subjectCode' } });
  sendSuccess(res, 200, 'Your test marks retrieved successfully', {
    attempts: attempts.map((attempt) => ({
      _id: attempt._id,
      test: attempt.test,
      attemptNumber: attempt.attemptNumber,
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      percentage: attempt.percentage,
      createdAt: attempt.createdAt,
    })),
  });
});

const submitAttempt = asyncHandler(async (req, res) => {
  const test = await Test.findOne({ _id: req.params.id, isPublished: true });
  if (!test) throw new AppError('Test not found', 404);
  if (req.user.role === 'Student') {
    if (!Number.isInteger(req.user.semester) || !(await Subject.exists({ _id: test.subject, semester: req.user.semester }))) {
      throw new AppError('Test not found', 404);
    }
  }
  const { answers } = req.body;
  if (!Array.isArray(answers) || answers.length !== test.questions.length) {
    throw new AppError(`Submit one answer for each of the ${test.questions.length} questions`, 400);
  }
  const invalidAnswer = answers.some((answer, index) =>
    answer !== null && (!Number.isInteger(answer) || answer < 0 || answer >= test.questions[index].options.length)
  );
  if (invalidAnswer) throw new AppError('Each answer must be a valid option index or null', 400);

  const attemptsUsed = await TestAttempt.countDocuments({ test: test._id, student: req.user._id });
  if (attemptsUsed >= test.maxAttempts) throw new AppError('You have used all attempts for this test', 409);

  const totalMarks = test.questions.reduce((total, question) => total + question.marks, 0);
  let score = 0;
  const storedAnswers = test.questions.map((question, index) => {
    const isCorrect = answers[index] === question.correctOption;
    const marksEarned = isCorrect ? question.marks : 0;
    score += marksEarned;
    return {
      question: question._id,
      selectedOption: answers[index],
      isCorrect,
      marksEarned,
    };
  });
  const attempt = new TestAttempt({
    test: test._id,
    student: req.user._id,
    attemptNumber: attemptsUsed + 1,
    answers: storedAnswers,
    score,
    totalMarks,
    percentage: Math.round((score / totalMarks) * 10000) / 100,
  });

  try {
    await attempt.save();
  } catch (error) {
    if (error.code === 11000) throw new AppError('Another attempt was submitted. Refresh the test before trying again.', 409);
    throw error;
  }

  const results = test.questions.map((question, index) => ({
    questionId: question._id,
    prompt: question.prompt,
    options: question.options,
    selectedOption: answers[index],
    correctOption: question.correctOption,
    isCorrect: answers[index] === question.correctOption,
    marks: question.marks,
    marksEarned: answers[index] === question.correctOption ? question.marks : 0,
    explanation: question.explanation,
  }));
  sendSuccess(res, 201, 'Test submitted and marked successfully', {
    attempt: {
      _id: attempt._id,
      attemptNumber: attempt.attemptNumber,
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      percentage: attempt.percentage,
      submittedAt: attempt.createdAt,
      maxAttempts: test.maxAttempts,
    },
    results,
  });
});

const getTestMarks = asyncHandler(async (req, res) => {
  const test = await Test.findOne({ _id: req.params.id, createdBy: req.user._id }).select('title');
  if (!test) throw new AppError('Test not found', 404);
  const attempts = await TestAttempt.find({ test: test._id })
    .sort({ createdAt: -1 })
    .populate('student', 'name');
  sendSuccess(res, 200, 'Test marks retrieved successfully', {
    test: { _id: test._id, title: test.title },
    marks: attempts.map((attempt) => ({
      student: attempt.student,
      attemptNumber: attempt.attemptNumber,
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      percentage: attempt.percentage,
      submittedAt: attempt.createdAt,
    })),
  });
});

module.exports = { createTest, getTests, getMyTestAttempts, submitAttempt, getTestMarks };
