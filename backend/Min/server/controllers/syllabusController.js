const Syllabus = require('../models/Syllabus');
const SyllabusProgress = require('../models/SyllabusProgress');
const Subject = require('../models/Subject');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { isValidObjectId, isString } = require('../utils/validators');
const { isSemesterAccessible, getMaxAccessibleSemester } = require('../utils/semesterSubjects');

const validateUnits = (input, existingSyllabus) => {
  const errors = [];
  if (!Array.isArray(input) || input.length < 1 || input.length > 5) {
    return { errors: ['A syllabus must contain between 1 and 5 units'], units: [] };
  }

  const existingTopicIds = new Set(
    existingSyllabus?.units.flatMap((unit) => unit.topics.map((topic) => String(topic._id))) || []
  );
  const usedTopicIds = new Set();
  const usedUnitNumbers = new Set();
  const units = input.map((unit, unitIndex) => {
    const unitNumber = unit?.unitNumber === undefined ? unitIndex + 1 : Number(unit.unitNumber);
    const title = isString(unit?.title) ? unit.title.trim() : '';
    const topicsInput = unit?.topics;
    if (!Number.isInteger(unitNumber) || unitNumber < 1 || unitNumber > 5 || usedUnitNumbers.has(unitNumber)) {
      errors.push(`Unit ${unitIndex + 1} must have a unique unit number from 1 to 5`);
    } else {
      usedUnitNumbers.add(unitNumber);
    }
    if (title.length < 2 || title.length > 120) {
      errors.push(`Unit ${unitIndex + 1} title must be between 2 and 120 characters`);
    }
    if (!Array.isArray(topicsInput) || topicsInput.length < 1 || topicsInput.length > 100) {
      errors.push(`Unit ${unitIndex + 1} must contain between 1 and 100 topics`);
      return { unitNumber, title, topics: [] };
    }
    const topics = topicsInput.map((topic, topicIndex) => {
      const topicTitle = isString(topic?.title) ? topic.title.trim() : '';
      if (topicTitle.length < 2 || topicTitle.length > 160) {
        errors.push(`Unit ${unitIndex + 1}, topic ${topicIndex + 1} must be between 2 and 160 characters`);
      }
      const topicValue = { title: topicTitle };
      if (topic?._id !== undefined) {
        const id = String(topic._id);
        if (!isValidObjectId(id) || !existingTopicIds.has(id) || usedTopicIds.has(id)) {
          errors.push(`Unit ${unitIndex + 1}, topic ${topicIndex + 1} has an invalid topic id`);
        } else {
          topicValue._id = id;
          usedTopicIds.add(id);
        }
      }
      return topicValue;
    });
    return { unitNumber, title, topics };
  }).sort((a, b) => a.unitNumber - b.unitNumber);
  return { errors, units };
};

const assertStudentSemester = (user, syllabus) => {
  if (!isSemesterAccessible(user, syllabus.subject.semester)) {
    throw new AppError('Syllabus not found', 404);
  }
};

const getSyllabusStudentSemesterLimit = (user) => getMaxAccessibleSemester(user);

const getSyllabi = asyncHandler(async (req, res) => {
  const baseQuery = Syllabus.find().populate('subject', 'subjectName subjectCode semester').populate('createdBy', 'name');
  const maxStudentSemester = getSyllabusStudentSemesterLimit(req.user);
  const syllabi = req.user.role === 'Student'
    ? await Syllabus.find()
      .sort({ createdAt: -1 })
      .populate({ path: 'subject', select: 'subjectName subjectCode semester', match: { semester: { $lte: maxStudentSemester } } })
      .populate('createdBy', 'name')
    : await baseQuery.sort({ createdAt: -1 });
  const visibleSyllabi = syllabi.filter((syllabus) => syllabus.subject);
  const progress = req.user.role === 'Student' && visibleSyllabi.length
    ? await SyllabusProgress.find({
      student: req.user._id,
      syllabus: { $in: visibleSyllabi.map((syllabus) => syllabus._id) },
    })
    : [];
  const progressBySyllabus = new Map(progress.map((entry) => [
    String(entry.syllabus),
    entry.completedTopics.map(String),
  ]));

  sendSuccess(res, 200, 'Syllabi retrieved successfully', {
    syllabi: visibleSyllabi.map((syllabus) => {
      const validTopicIds = new Set(syllabus.units.flatMap((unit) => unit.topics.map((topic) => String(topic._id))));
      const serialized = syllabus.toJSON();
      serialized.units = serialized.units.map((unit, index) => ({
        ...unit,
        unitNumber: unit.unitNumber || index + 1,
      }));
      return {
        ...serialized,
        completedTopics: (progressBySyllabus.get(String(syllabus._id)) || []).filter((id) => validTopicIds.has(id)),
      };
    }),
  });
});

const createSyllabus = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.body.subject)) throw new AppError('A valid subject id is required', 400);
  const semester = Number(req.body.semester);
  if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
    throw new AppError('Semester must be a whole number from 1 to 8', 400);
  }
  const { errors, units } = validateUnits(req.body.units);
  if (errors.length) throw new AppError('Validation failed', 400, errors);
  const subject = await Subject.findById(req.body.subject);
  if (!subject) throw new AppError('Subject not found', 400);
  if (subject.semester !== semester) throw new AppError('The selected subject does not belong to the chosen semester', 400);

  const syllabus = await Syllabus.create({
    subject: subject._id,
    createdBy: req.user._id,
    units,
  });
  await syllabus.populate([
    { path: 'subject', select: 'subjectName subjectCode semester' },
    { path: 'createdBy', select: 'name' },
  ]);
  sendSuccess(res, 201, 'Syllabus published successfully', { syllabus });
});

const updateSyllabus = asyncHandler(async (req, res) => {
  const syllabus = await Syllabus.findById(req.params.id);
  if (!syllabus) throw new AppError('Syllabus not found', 404);
  if (req.body.subject && String(req.body.subject) !== String(syllabus.subject)) {
    throw new AppError('A syllabus cannot be moved to another subject', 400);
  }
  const subject = await Subject.findById(syllabus.subject).select('semester');
  if (!subject) throw new AppError('Subject not found', 400);
  if (req.body.semester !== undefined && Number(req.body.semester) !== subject.semester) {
    throw new AppError('The selected subject does not belong to the chosen semester', 400);
  }
  const { errors, units } = validateUnits(req.body.units, syllabus);
  if (errors.length) throw new AppError('Validation failed', 400, errors);
  syllabus.units = units;
  await syllabus.save();
  await syllabus.populate([
    { path: 'subject', select: 'subjectName subjectCode semester' },
    { path: 'createdBy', select: 'name' },
  ]);
  sendSuccess(res, 200, 'Syllabus updated successfully', { syllabus });
});

const updateSyllabusProgress = asyncHandler(async (req, res) => {
  const syllabus = await Syllabus.findById(req.params.id)
    .populate('subject', 'subjectName subjectCode semester');
  if (!syllabus) throw new AppError('Syllabus not found', 404);
  assertStudentSemester(req.user, syllabus);

  const { completedTopics } = req.body;
  if (!Array.isArray(completedTopics) || completedTopics.some((id) => !isValidObjectId(id))) {
    throw new AppError('Completed topics must be an array of valid topic ids', 400);
  }
  const topicIds = new Set(syllabus.units.flatMap((unit) => unit.topics.map((topic) => String(topic._id))));
  const uniqueIds = [...new Set(completedTopics.map(String))];
  if (uniqueIds.some((id) => !topicIds.has(id))) {
    throw new AppError('One or more topics do not belong to this syllabus', 400);
  }

  const progress = await SyllabusProgress.findOneAndUpdate(
    { student: req.user._id, syllabus: syllabus._id },
    { completedTopics: uniqueIds },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  sendSuccess(res, 200, 'Syllabus progress saved', {
    completedTopics: progress.completedTopics.map(String),
  });
});

module.exports = {
  getSyllabi,
  createSyllabus,
  updateSyllabus,
  updateSyllabusProgress,
  validateUnits,
  getSyllabusStudentSemesterLimit,
};
