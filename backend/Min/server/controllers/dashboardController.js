const User = require('../models/User');
const Resource = require('../models/Resource');
const Subject = require('../models/Subject');
const Category = require('../models/Category');
const Bookmark = require('../models/Bookmark');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { populateOptions } = require('../utils/resourceQuery');
const { getStudentSubjectIds } = require('../utils/semesterSubjects');

// GET /api/dashboard  (any logged-in user)
const getUserDashboard = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const subjectIds = await getStudentSubjectIds(req.user);
  const approvedFilter = { status: 'Approved' };
  const myResourceFilter = { uploadedBy: userId };
  if (subjectIds) {
    approvedFilter.subject = { $in: subjectIds };
    myResourceFilter.subject = { $in: subjectIds };
    if (Number.isInteger(req.user.semester)) {
      approvedFilter.semester = req.user.semester;
      myResourceFilter.semester = req.user.semester;
    }
  }
  const bookmarkFilter = subjectIds
    ? [
      { $match: { user: userId } },
      { $lookup: { from: 'resources', localField: 'resource', foreignField: '_id', as: 'resource' } },
      { $unwind: '$resource' },
      {
        $match: {
          'resource.status': 'Approved',
          'resource.subject': { $in: subjectIds },
          ...(Number.isInteger(req.user.semester) ? { 'resource.semester': req.user.semester } : {}),
        },
      },
      { $count: 'count' },
    ]
    : null;

  const [
    totalApproved,
    recentResources,
    myRecentResources,
    myStatusCounts,
    bookmarkCount,
    recentBookmarks,
    subjects,
    categories,
    byCategory,
    byFileType,
  ] = await Promise.all([
    Resource.countDocuments(approvedFilter),
    Resource.find(approvedFilter).sort({ createdAt: -1 }).limit(5).populate(populateOptions(false)),
    Resource.find(myResourceFilter).sort({ createdAt: -1 }).limit(5).populate(populateOptions(false)),
    Resource.aggregate([{ $match: myResourceFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    bookmarkFilter ? Bookmark.aggregate(bookmarkFilter) : Bookmark.countDocuments({ user: userId }),
    Bookmark.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate({
        path: 'resource',
        match: { ...approvedFilter },
        populate: populateOptions(false),
      }),
    Subject.find(subjectIds ? { _id: { $in: subjectIds } } : {}).sort({ semester: 1, subjectName: 1 }),
    Category.find().sort({ categoryName: 1 }),
    Resource.aggregate([
      { $match: approvedFilter },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
      { $unwind: '$category' },
      { $project: { _id: 0, categoryId: '$_id', categoryName: '$category.categoryName', count: 1 } },
      { $sort: { count: -1 } },
    ]),
    Resource.aggregate([
      { $match: approvedFilter },
      { $group: { _id: '$fileType', count: { $sum: 1 } } },
      { $project: { _id: 0, fileType: '$_id', count: 1 } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const mine = { total: 0, Pending: 0, Approved: 0, Rejected: 0 };
  myStatusCounts.forEach((s) => {
    mine[s._id] = s.count;
    mine.total += s.count;
  });

  sendSuccess(res, 200, 'Dashboard data retrieved successfully', {
    totalApprovedResources: totalApproved,
    recentResources,
    myUploads: { counts: mine, recent: myRecentResources },
    bookmarks: {
      count: Array.isArray(bookmarkCount) ? (bookmarkCount[0]?.count || 0) : bookmarkCount,
      recent: recentBookmarks.filter((b) => b.resource),
    },
    subjects,
    categories,
    statistics: { resourcesByCategory: byCategory, resourcesByFileType: byFileType },
  });
});

// GET /api/dashboard/admin  (admin only; also at /api/admin/dashboard)
const getAdminDashboard = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    totalStudents,
    totalTeachers,
    totalAdmins,
    inactiveUsers,
    totalResources,
    approvedResources,
    pendingResources,
    rejectedResources,
    totalSubjects,
    totalCategories,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'Student' }),
    User.countDocuments({ role: 'Teacher' }),
    User.countDocuments({ role: 'Admin' }),
    User.countDocuments({ accountStatus: 'Inactive' }),
    Resource.countDocuments(),
    Resource.countDocuments({ status: 'Approved' }),
    Resource.countDocuments({ status: 'Pending' }),
    Resource.countDocuments({ status: 'Rejected' }),
    Subject.countDocuments(),
    Category.countDocuments(),
  ]);

  sendSuccess(res, 200, 'Admin dashboard statistics retrieved successfully', {
    users: { total: totalUsers, students: totalStudents, teachers: totalTeachers, admins: totalAdmins, inactive: inactiveUsers },
    resources: { total: totalResources, approved: approvedResources, pending: pendingResources, rejected: rejectedResources },
    totalSubjects,
    totalCategories,
  });
});

module.exports = { getUserDashboard, getAdminDashboard };
