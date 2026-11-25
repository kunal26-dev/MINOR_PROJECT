const path = require('path');
const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Subject = require('../models/Subject');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { isValidObjectId, isString } = require('../utils/validators');
const { resolveUploadPath, fileExists, deleteStoredFile } = require('../utils/fileHelpers');

const sendFileDownload = async (res, storedName, originalName) => {
  const fullPath = resolveUploadPath(storedName);
  if (!(await fileExists(fullPath))) throw new AppError('The uploaded PDF file is missing', 404);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(originalName).replace(/"/g, '')}"`);
  res.download(fullPath, originalName);
};

const createAssignment = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new AppError('A PDF assignment file is required', 400);
  try {
    const title = isString(req.body.title) ? req.body.title.trim() : '';
    const description = isString(req.body.description) ? req.body.description.trim() : '';
    const deadline = new Date(req.body.deadline);
    const semester = Number(req.body.semester);
    const errors = [];
    if (title.length < 3 || title.length > 150) errors.push('Title must be between 3 and 150 characters');
    if (description.length > 2000) errors.push('Description must be at most 2000 characters');
    if (!isValidObjectId(req.body.subject)) errors.push('A valid subject id is required');
    if (!Number.isInteger(semester) || semester < 1 || semester > 8) errors.push('Semester must be a whole number from 1 to 8');
    if (Number.isNaN(deadline.getTime()) || deadline <= new Date()) errors.push('Deadline must be a valid future date');
    if (errors.length) throw new AppError('Validation failed', 400, errors);

    const subject = await Subject.findById(req.body.subject);
    if (!subject) throw new AppError('Subject not found', 400);
    if (subject.semester !== semester) throw new AppError('The selected subject does not belong to the chosen semester', 400);
    const assignment = await Assignment.create({
      title,
      description,
      subject: subject._id,
      semester: subject.semester,
      deadline,
      createdBy: req.user._id,
      originalFileName: path.basename(file.originalname),
      storedFileName: file.filename,
    });
    await assignment.populate([
      { path: 'subject', select: 'subjectName subjectCode semester' },
      { path: 'createdBy', select: 'name role' },
    ]);
    sendSuccess(res, 201, 'Assignment published successfully', { assignment });
  } catch (error) {
    await deleteStoredFile(file.filename);
    throw error;
  }
});

const getAssignments = asyncHandler(async (req, res) => {
  let filter = {};
  if (req.user.role === 'Student') {
    if (!Number.isInteger(req.user.semester)) throw new AppError('Select your semester in your profile first', 400);
    filter = { semester: req.user.semester };
  } else if (req.user.role === 'Teacher') {
    filter = { createdBy: req.user._id };
  }
  const assignments = await Assignment.find(filter)
    .sort({ deadline: 1, createdAt: -1 })
    .populate('subject', 'subjectName subjectCode semester')
    .populate('createdBy', 'name role');
  sendSuccess(res, 200, 'Assignments retrieved successfully', { assignments });
});

const submitAssignment = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new AppError('A PDF submission file is required', 400);
  try {
    const assignment = await Assignment.findById(req.params.id).populate('subject', 'semester subjectName');
    if (!assignment) throw new AppError('Assignment not found', 404);
    if (assignment.semester !== req.user.semester) throw new AppError('Assignment not found', 404);
    if (assignment.deadline <= new Date()) throw new AppError('The assignment deadline has passed', 409);

    const previousSubmission = await AssignmentSubmission.findOne({
      assignment: assignment._id,
      student: req.user._id,
    }).select('storedFileName');
    const submission = await AssignmentSubmission.findOneAndUpdate(
      { assignment: assignment._id, student: req.user._id },
      {
        originalFileName: path.basename(file.originalname),
        storedFileName: file.filename,
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await submission.populate('student', 'name email semester');
    if (previousSubmission?.storedFileName && previousSubmission.storedFileName !== file.filename) {
      await deleteStoredFile(previousSubmission.storedFileName);
    }
    sendSuccess(res, 200, 'Assignment submitted successfully', { submission });
  } catch (error) {
    await deleteStoredFile(file.filename);
    throw error;
  }
});

const getSubmissions = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findOne({ _id: req.params.id, createdBy: req.user._id });
  if (!assignment) throw new AppError('Assignment not found', 404);
  const submissions = await AssignmentSubmission.find({ assignment: assignment._id })
    .sort({ createdAt: -1 })
    .populate('student', 'name email semester');
  sendSuccess(res, 200, 'Submissions retrieved successfully', { assignment, submissions });
});

const downloadAssignment = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) throw new AppError('Assignment not found', 404);
  if (req.user.role === 'Student' && (assignment.semester !== req.user.semester)) throw new AppError('Assignment not found', 404);
  if (req.user.role === 'Teacher' && String(assignment.createdBy) !== String(req.user._id)) throw new AppError('Assignment not found', 404);
  await sendFileDownload(res, assignment.storedFileName, assignment.originalFileName);
});

const downloadSubmission = asyncHandler(async (req, res) => {
  const submission = await AssignmentSubmission.findById(req.params.submissionId).populate('assignment');
  if (!submission) throw new AppError('Submission not found', 404);
  const ownsAssignment = req.user.role === 'Teacher' && String(submission.assignment.createdBy) === String(req.user._id);
  const ownsSubmission = String(submission.student) === String(req.user._id);
  if (!ownsAssignment && !ownsSubmission) throw new AppError('Submission not found', 404);
  await sendFileDownload(res, submission.storedFileName, submission.originalFileName);
});

module.exports = { createAssignment, getAssignments, submitAssignment, getSubmissions, downloadAssignment, downloadSubmission };
