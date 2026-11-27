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

const getMaxAccessibleSemester = (user) =>
  user.role === 'Student' && Number.isInteger(user.semester) && user.semester >= 1 && user.semester <= 8
    ? user.semester
    : user.role === 'Student' ? 0 : 8;

const buildStudentSubjectFilter = (user) => {
  if (user.role !== 'Student') return {};
  const maxSemester = getMaxAccessibleSemester(user);
  return maxSemester ? { semester: { $lte: maxSemester } } : null;
};

const getStudentSubjectIds = async (user) => {
  if (user.role !== 'Student') return null;
  const filter = buildStudentSubjectFilter(user);
  if (!filter) return [];
  return Subject.find(filter).distinct('_id');
};

module.exports = {
  getStudentSubjectIds,
  isSemesterAccessible,
  getMaxAccessibleSemester,
  buildStudentSubjectFilter,
};
