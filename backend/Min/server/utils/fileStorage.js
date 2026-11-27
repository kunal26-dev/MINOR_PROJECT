const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const AppError = require('./appError');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const STORED_FILE_PATTERN = /^[A-Za-z0-9._-]+$/;

const validateStoredFileName = (storedFileName) => {
  if (
    typeof storedFileName !== 'string' ||
    !storedFileName ||
    !STORED_FILE_PATTERN.test(storedFileName) ||
    storedFileName.includes('..') ||
    path.basename(storedFileName) !== storedFileName
  ) {
    throw new AppError('Invalid file reference', 400);
  }
};

const createFileStorage = ({ uploadDir = UPLOAD_DIR } = {}) => {
  const resolvedUploadDir = path.resolve(uploadDir);
  const localPath = (storedFileName) => {
    validateStoredFileName(storedFileName);
    const fullPath = path.resolve(resolvedUploadDir, storedFileName);
    if (!fullPath.startsWith(`${resolvedUploadDir}${path.sep}`)) {
      throw new AppError('Invalid file path', 400);
    }
    return fullPath;
  };

  const ensureUploadDir = () => fs.mkdirSync(resolvedUploadDir, { recursive: true });

  const storeStoredFile = async (storedFileName, body) => {
    const fullPath = localPath(storedFileName);
    ensureUploadDir();
    await fs.promises.writeFile(fullPath, body);
  };

  const openStoredFile = async (storedFileName) => {
    const fullPath = localPath(storedFileName);
    try {
      await fs.promises.access(fullPath, fs.constants.R_OK);
    } catch (error) {
      if (error.code === 'ENOENT') throw new AppError('File not found on the server', 404);
      throw error;
    }
    return fs.createReadStream(fullPath);
  };

  const deleteStoredFile = async (storedFileName) => {
    try {
      await fs.promises.unlink(localPath(storedFileName));
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  };

  const sendStoredFile = async (res, storedFileName, originalFileName) => {
    const stream = await openStoredFile(storedFileName);
    res.attachment(path.basename(originalFileName));
    try {
      await pipeline(stream, res);
    } catch (error) {
      if (res.headersSent) {
        res.destroy(error);
        return;
      }
      throw error;
    }
  };

  return {
    ensureUploadDir,
    storeStoredFile,
    openStoredFile,
    deleteStoredFile,
    sendStoredFile,
  };
};

const fileStorage = createFileStorage();

module.exports = {
  UPLOAD_DIR,
  ...fileStorage,
  createFileStorage,
};
