const Subject = require('../models/Subject');

const isSemesterAccessible = (user, semester) =>
  user.role !== 'Student' ||
  (Number.isInteger(user.semester) &&
    user.semester >= 1 &&
    user.semester <= 8 &&
    Number.isInteger(semester) &&
    semester >= 1 &&
    semester <= 8 &&
    semester <= user.semester);

const getStudentSubjectIds = async (user) => {
  if (user.role !== 'Student') return null;
  if (!Number.isInteger(user.semester) || user.semester < 1 || user.semester > 8) return [];
  return Subject.find({ semester: { $lte: user.semester } }).distinct('_id');
};

module.exports = { getStudentSubjectIds, isSemesterAccessible };
