const User = require('../models/User');
const Resource = require('../models/Resource');
const Bookmark = require('../models/Bookmark');
const Progress = require('../models/Progress');
const Test = require('../models/Test');
const TestAttempt = require('../models/TestAttempt');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { isString, escapeRegex, parsePagination, buildPagination } = require('../utils/validators');
const { populateOptions, parseStatus, findResources } = require('../utils/resourceQuery');
const {
  removeResource,
  getPendingResources,
  approveResource,
  rejectResource,
} = require('./resourceController');
const { applyProfileUpdates } = require('./userController');
const { deleteStoredFile } = require('../utils/fileHelpers');

const assertNotSelf = (req, action) => {
  if (String(req.params.id) === String(req.user._id)) {
    throw new AppError(`You cannot ${action} your own account`, 400);
  }
};

const findUserOr404 = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found', 404);
  return user;
};

/* ----------------------------- Users ----------------------------- */

// GET /api/admin/users?role=&accountStatus=&search=&page=&limit=
const getAllUsers = asyncHandler(async (req, res) => {
  const filter = {};
  const { role, accountStatus, search } = req.query;

  if (role !== undefined && role !== '') {
    const match = isString(role) && User.ROLES.find((r) => r.toLowerCase() === role.toLowerCase());
    if (!match) throw new AppError(`Invalid role. Use one of: ${User.ROLES.join(', ')}`, 400);
    filter.role = match;
  }
  if (accountStatus !== undefined && accountStatus !== '') {
    const match = isString(accountStatus) && User.ACCOUNT_STATUSES.find((s) => s.toLowerCase() === accountStatus.toLowerCase());
    if (!match) throw new AppError(`Invalid accountStatus. Use one of: ${User.ACCOUNT_STATUSES.join(', ')}`, 400);
    filter.accountStatus = match;
  }
  if (isString(search) && search.trim()) {
    const regex = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ name: regex }, { email: regex }];
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  sendSuccess(res, 200, 'Users retrieved successfully', { users, pagination: buildPagination(total, page, limit) });
});

// GET /api/admin/users/:id  (includes upload statistics)
const getUserById = asyncHandler(async (req, res) => {
  const user = await findUserOr404(req.params.id);
  const [totalUploads, approved, pending, rejected, bookmarks] = await Promise.all([
    Resource.countDocuments({ uploadedBy: user._id }),
    Resource.countDocuments({ uploadedBy: user._id, status: 'Approved' }),
    Resource.countDocuments({ uploadedBy: user._id, status: 'Pending' }),
    Resource.countDocuments({ uploadedBy: user._id, status: 'Rejected' }),
    Bookmark.countDocuments({ user: user._id }),
  ]);
  sendSuccess(res, 200, 'User retrieved successfully', {
    user,
    stats: { totalUploads, approved, pending, rejected, bookmarks },
  });
});

// PUT /api/admin/users/:id  (name, email, bio, profileImage)
const updateUser = asyncHandler(async (req, res) => {
  const user = await findUserOr404(req.params.id);
  await applyProfileUpdates(user, req.body);
  await user.save();
  sendSuccess(res, 200, 'User updated successfully', { user });
});

// PATCH /api/admin/users/:id/role  { role: "Student" | "Teacher" }
// Promoting to Admin is intentionally not possible through the API (use the seed script).
const changeUserRole = asyncHandler(async (req, res) => {
  assertNotSelf(req, 'change the role of');
  const { role, semester } = req.body;
  const match = isString(role) && ['Student', 'Teacher'].find((r) => r.toLowerCase() === role.toLowerCase());
  if (!match) throw new AppError('Role must be Student or Teacher. Admin accounts are created with the seed script only.', 400);

  const user = await findUserOr404(req.params.id);
  if (user.role === 'Admin') throw new AppError('The role of an Admin account cannot be changed', 403);

  if (match === 'Student') {
    const assignedSemester = semester === undefined
      ? user.semester
      : (typeof semester === 'string' && semester.trim() ? Number(semester) : semester);
    if (!Number.isInteger(assignedSemester) || assignedSemester < 1 || assignedSemester > 8) {
      throw new AppError('A semester from 1 to 8 is required when assigning the Student role', 400);
    }
    user.semester = assignedSemester;
  } else {
    user.semester = undefined;
  }
  user.role = match;
  await user.save();
  sendSuccess(res, 200, `User role changed to ${match}`, { user });
});

// PATCH /api/admin/users/:id/status  { accountStatus: "Active" | "Inactive" }
const updateUserStatus = asyncHandler(async (req, res) => {
  assertNotSelf(req, 'deactivate or change the status of');
  const { accountStatus } = req.body;
  const match = isString(accountStatus) && User.ACCOUNT_STATUSES.find((s) => s.toLowerCase() === accountStatus.toLowerCase());
  if (!match) throw new AppError(`accountStatus must be one of: ${User.ACCOUNT_STATUSES.join(', ')}`, 400);

  const user = await findUserOr404(req.params.id);
  user.accountStatus = match;
  await user.save();
  sendSuccess(res, 200, `User account ${match === 'Active' ? 'activated' : 'deactivated'} successfully`, { user });
});

// DELETE /api/admin/users/:id  (also removes the user's resources, files and bookmarks)
const deleteUser = asyncHandler(async (req, res) => {
  assertNotSelf(req, 'delete');
  const user = await findUserOr404(req.params.id);
  if (user.role === 'Admin') throw new AppError('Admin accounts cannot be deleted through the API', 403);

  const resources = await Resource.find({ uploadedBy: user._id });
  const resourceIds = resources.map((r) => r._id);
  const tests = await Test.find({ createdBy: user._id }).select('_id');
  const testIds = tests.map((test) => test._id);

  await Promise.all([
    Bookmark.deleteMany({ $or: [{ user: user._id }, { resource: { $in: resourceIds } }] }),
    Resource.deleteMany({ uploadedBy: user._id }),
    Progress.deleteMany({ user: user._id }),
    Test.deleteMany({ createdBy: user._id }),
    TestAttempt.deleteMany({ $or: [{ student: user._id }, { test: { $in: testIds } }] }),
  ]);
  await Promise.all(resources.map((r) => deleteStoredFile(r.storedFileName)));
  await user.deleteOne();

  sendSuccess(res, 200, 'User and related data deleted successfully');
});

/* --------------------------- Resources --------------------------- */

// GET /api/admin/resources?status=Pending|Approved|Rejected|all&search=&subject=&...
const getAllResources = asyncHandler(async (req, res) => {
  const base = {};
  const status = parseStatus(req.query.status);
  if (status) base.status = status;
  const data = await findResources(req.query, base, true);
  sendSuccess(res, 200, 'Resources retrieved successfully', data);
});

// GET /api/admin/resources/:id  (any status)
const getResourceById = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id).populate(populateOptions(true));
  if (!resource) throw new AppError('Resource not found', 404);
  sendSuccess(res, 200, 'Resource retrieved successfully', { resource });
});

// DELETE /api/admin/resources/:id
const deleteResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id);
  if (!resource) throw new AppError('Resource not found', 404);
  await removeResource(resource);
  sendSuccess(res, 200, 'Resource deleted successfully');
});

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  changeUserRole,
  updateUserStatus,
  deleteUser,
  getAllResources,
  getPendingResources,
  getResourceById,
  approveResource,
  rejectResource,
  deleteResource,
};
