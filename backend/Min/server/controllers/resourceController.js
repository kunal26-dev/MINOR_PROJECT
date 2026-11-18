const Resource = require('../models/Resource');
const Subject = require('../models/Subject');
const Category = require('../models/Category');
const Bookmark = require('../models/Bookmark');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { isValidObjectId, isString, parseTags } = require('../utils/validators');
const {
  resolveUploadPath,
  fileExists,
  deleteStoredFile,
  getExtension,
} = require('../utils/fileHelpers');
const { populateOptions, parseStatus, findResources } = require('../utils/resourceQuery');
const { getStudentSubjectIds } = require('../utils/semesterSubjects');
const path = require('path');

const isAdmin = (user) => user.role === 'Admin';
const isTeacher = (user) => user.role === 'Teacher';
const isOwner = (user, resource) => String(resource.uploadedBy._id || resource.uploadedBy) === String(user._id);

// Approved resources are visible to everyone logged in; teachers can inspect pending submissions.
const isInStudentSemester = (user, resource) =>
  user.role !== 'Student' ||
  (Number.isInteger(user.semester) &&
    resource.subject?.semester === user.semester &&
    resource.semester === user.semester);

const canView = (user, resource) =>
  (isInStudentSemester(user, resource) && (resource.status === 'Approved' || isOwner(user, resource))) ||
  isAdmin(user) ||
  (isTeacher(user) && (resource.status === 'Approved' || resource.status === 'Pending'));

const canDownload = (user, resource) =>
  (isInStudentSemester(user, resource) && resource.status === 'Approved') ||
  isAdmin(user) ||
  (isTeacher(user) && resource.status === 'Pending');

const assertCanReview = (user, resource) => {
  if (isAdmin(user)) return;
  if (isOwner(user, resource)) throw new AppError('You cannot review your own resource', 403);
  if (resource.status !== 'Pending') throw new AppError('Only pending resources can be reviewed', 409);
};

// Owner or admin may modify. Hides pending/rejected resources from other users (404 instead of 403).
const assertCanModify = (user, resource) => {
  if (isOwner(user, resource) || isAdmin(user)) return;
  throw new AppError(
    resource.status === 'Approved' ? 'You can only modify your own resources' : 'Resource not found',
    resource.status === 'Approved' ? 403 : 404
  );
};

// Validates the editable fields. With partial=true only provided fields are checked.
const validateResourceInput = (body, partial = false) => {
  const errors = [];
  const values = {};
  const provided = (key) => body[key] !== undefined;

  if (!partial || provided('title')) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 3 || title.length > 150) errors.push('Title is required (3-150 characters)');
    else values.title = title;
  }
  if (!partial || provided('description')) {
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!description || description.length > 2000) errors.push('Description is required (max 2000 characters)');
    else values.description = description;
  }
  if (!partial || provided('subject')) {
    if (!isValidObjectId(body.subject)) errors.push('A valid subject id is required');
    else values.subject = body.subject;
  }
  if (!partial || provided('category')) {
    if (!isValidObjectId(body.category)) errors.push('A valid category id is required');
    else values.category = body.category;
  }
  if (!partial || provided('semester')) {
    const semester = typeof body.semester === 'string' || typeof body.semester === 'number' ? Number(body.semester) : NaN;
    if (body.semester === '' || !Number.isInteger(semester) || semester < 1 || semester > 8) {
      errors.push('Semester is required (a whole number from 1 to 8)');
    } else values.semester = semester;
  }
  if (provided('tags')) {
    const tags = parseTags(body.tags);
    if (tags === null) errors.push('Tags must be a comma separated string or an array of strings');
    else if (tags.length > 15) errors.push('A resource can have at most 15 tags');
    else if (tags.some((t) => t.length > 30)) errors.push('Each tag can be at most 30 characters');
    else values.tags = tags;
  }

  return { errors, values };
};

const assertSubjectAndCategoryExist = async (values, user, existing = {}) => {
  const subjectId = values.subject || existing.subject;
  const semester = values.semester === undefined ? existing.semester : values.semester;
  if (subjectId) {
    const subject = await Subject.findById(subjectId).select('semester');
    if (!subject) throw new AppError('Subject not found', 400);
    if (semester !== subject.semester) {
      throw new AppError('Resource semester must match the selected subject semester', 400);
    }
    if (user.role === 'Student' && (!user.semester || subject.semester !== user.semester)) {
      throw new AppError('You can only upload resources for your current semester', 403);
    }
  }
  const categoryId = values.category || existing.category;
  if (categoryId && !(await Category.exists({ _id: categoryId }))) {
    throw new AppError('Category not found', 400);
  }
};

// Removes the DB record, related bookmarks and the stored file
const removeResource = async (resource) => {
  await Bookmark.deleteMany({ resource: resource._id });
  await resource.deleteOne();
  await deleteStoredFile(resource.storedFileName);
};

// POST /api/resources  (multipart/form-data, file field name: "file")
const uploadResource = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) {
    throw new AppError('A file is required. Send multipart/form-data with the file in the "file" field.', 400);
  }

  try {
    const { errors, values } = validateResourceInput(req.body, false);
    if (errors.length) throw new AppError('Validation failed', 400, errors);
    await assertSubjectAndCategoryExist(values, req.user);

    const resource = await Resource.create({
      ...values,
      tags: values.tags || [],
      originalFileName: path.basename(file.originalname),
      storedFileName: file.filename,
      filePath: `uploads/${file.filename}`,
      fileType: getExtension(file.originalname),
      fileSize: file.size,
      uploadedBy: req.user._id,
      // Admin uploads are trusted; everything else waits for review
      status: isAdmin(req.user) ? 'Approved' : 'Pending',
    });

    await resource.populate(populateOptions(isAdmin(req.user)));

    sendSuccess(
      res,
      201,
      isAdmin(req.user)
        ? 'Resource uploaded successfully'
        : 'Resource uploaded successfully and is awaiting teacher approval',
      { resource }
    );
  } catch (err) {
    // Do not leave orphan files when the request fails after the upload
    await deleteStoredFile(file.filename);
    throw err;
  }
});

// GET /api/resources  (approved only; supports search, filters, sort, pagination)
const getResources = asyncHandler(async (req, res) => {
  const subjectIds = await getStudentSubjectIds(req.user);
  const baseFilter = { status: 'Approved' };
  if (subjectIds) {
    baseFilter.subject = { $in: subjectIds };
    if (Number.isInteger(req.user.semester)) baseFilter.semester = req.user.semester;
  }
  const data = await findResources(req.query, baseFilter, false);
  sendSuccess(res, 200, 'Resources retrieved successfully', data);
});

// GET /api/resources/my  (the logged-in user's uploads, optional ?status=)
const getMyResources = asyncHandler(async (req, res) => {
  const base = { uploadedBy: req.user._id };
  const subjectIds = await getStudentSubjectIds(req.user);
  if (subjectIds) {
    base.subject = { $in: subjectIds };
    if (Number.isInteger(req.user.semester)) base.semester = req.user.semester;
  }
  const status = parseStatus(req.query.status);
  if (status) base.status = status;
  const data = await findResources(req.query, base, false);
  sendSuccess(res, 200, 'Your resources retrieved successfully', data);
});

// GET /api/resources/pending  (teacher or admin)
const getPendingResources = asyncHandler(async (req, res) => {
  const filter = { status: 'Pending' };
  if (isTeacher(req.user)) filter.uploadedBy = { $ne: req.user._id };
  const data = await findResources(req.query, filter, false);
  sendSuccess(res, 200, 'Pending resources retrieved successfully', data);
});

// PATCH /api/resources/:id/approve (teacher or admin)
const approveResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id);
  if (!resource) throw new AppError('Resource not found', 404);
  assertCanReview(req.user, resource);
  if (resource.status === 'Approved') throw new AppError('Resource is already approved', 409);

  resource.status = 'Approved';
  resource.rejectionReason = undefined;
  await resource.save();
  await resource.populate(populateOptions(isAdmin(req.user)));
  sendSuccess(res, 200, 'Resource approved successfully', { resource });
});

// PATCH /api/resources/:id/reject (teacher or admin)
const rejectResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id);
  if (!resource) throw new AppError('Resource not found', 404);
  assertCanReview(req.user, resource);
  if (resource.status === 'Rejected') throw new AppError('Resource is already rejected', 409);

  const { reason } = req.body;
  if (reason !== undefined && (!isString(reason) || reason.length > 500)) {
    throw new AppError('Reason must be text of at most 500 characters', 400);
  }

  resource.status = 'Rejected';
  resource.rejectionReason = reason && reason.trim() ? reason.trim() : undefined;
  await resource.save();
  await resource.populate(populateOptions(isAdmin(req.user)));
  sendSuccess(res, 200, 'Resource rejected successfully', { resource });
});

// GET /api/resources/:id
const getResourceById = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id).populate(populateOptions(isAdmin(req.user)));
  if (!resource || !canView(req.user, resource)) throw new AppError('Resource not found', 404);
  sendSuccess(res, 200, 'Resource retrieved successfully', { resource });
});

// PUT/PATCH /api/resources/:id  (owner or admin; partial updates allowed)
const updateResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id);
  if (!resource) throw new AppError('Resource not found', 404);
  assertCanModify(req.user, resource);

  const { errors, values } = validateResourceInput(req.body, true);
  if (errors.length) throw new AppError('Validation failed', 400, errors);
  if (Object.keys(values).length === 0) {
    throw new AppError('No valid fields to update. Allowed: title, description, subject, semester, category, tags', 400);
  }
  await assertSubjectAndCategoryExist(values, req.user, resource);

  Object.assign(resource, values);

  // An edit by a non-admin sends the resource back for review
  if (!isAdmin(req.user) && resource.status !== 'Pending') {
    resource.status = 'Pending';
    resource.rejectionReason = undefined;
  }

  await resource.save();
  await resource.populate(populateOptions(isAdmin(req.user)));
  sendSuccess(res, 200, 'Resource updated successfully', { resource });
});

// DELETE /api/resources/:id  (owner or admin)
const deleteResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id);
  if (!resource) throw new AppError('Resource not found', 404);
  assertCanModify(req.user, resource);

  await removeResource(resource);
  sendSuccess(res, 200, 'Resource deleted successfully');
});

// GET /api/resources/:id/download  (approved; teachers may inspect pending, admins may access any status)
const downloadResource = asyncHandler(async (req, res, next) => {
  const resource = await Resource.findById(req.params.id).populate('subject', 'semester');
  if (!resource || !canDownload(req.user, resource)) throw new AppError('Resource not found', 404);

  const fullPath = resolveUploadPath(resource.storedFileName); // blocks path traversal
  if (!(await fileExists(fullPath))) throw new AppError('File not found on the server', 404);

  res.download(fullPath, resource.originalFileName, (err) => {
    if (err && !res.headersSent) next(err);
  });
});

module.exports = {
  uploadResource,
  getResources,
  getMyResources,
  getPendingResources,
  approveResource,
  rejectResource,
  getResourceById,
  updateResource,
  deleteResource,
  downloadResource,
  removeResource,
};
