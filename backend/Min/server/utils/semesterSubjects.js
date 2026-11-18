const Subject = require('../models/Subject');

const getStudentSubjectIds = async (user) => {
  if (user.role !== 'Student') return null;
  if (!Number.isInteger(user.semester) || user.semester < 1 || user.semester > 8) return [];
  return Subject.find({ semester: user.semester }).distinct('_id');
};

module.exports = { getStudentSubjectIds };
