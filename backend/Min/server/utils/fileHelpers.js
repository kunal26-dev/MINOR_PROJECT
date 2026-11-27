const path = require('path');
const crypto = require('crypto');
const fileStorage = require('./fileStorage');

// Allowed extension -> accepted MIME types
const ALLOWED_FILE_TYPES = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  txt: ['text/plain'],
  csv: ['text/csv', 'application/csv', 'application/vnd.ms-excel'],
  zip: ['application/zip', 'application/x-zip-compressed'],
};

const getExtension = (fileName = '') => path.extname(fileName).replace('.', '').toLowerCase();

// Unique, unguessable stored name; the user-supplied name is never used on disk
const generateStoredName = (originalName) => {
  const ext = getExtension(originalName);
  const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  return ext ? `${unique}.${ext}` : unique;
};

module.exports = {
  ALLOWED_FILE_TYPES,
  getExtension,
  generateStoredName,
  ...fileStorage,
};
