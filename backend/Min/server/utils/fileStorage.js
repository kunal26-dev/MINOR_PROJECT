const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
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

const isMissingObject = (error) =>
  error.name === 'NoSuchKey' ||
  error.name === 'NotFound' ||
  error.$metadata?.httpStatusCode === 404;

const createR2Client = (env) => {
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Cloudflare R2 storage is missing configuration: ${missing.join(', ')}`);
  }

  return {
    client: new S3Client({
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: 'auto',
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    }),
    bucket: env.R2_BUCKET_NAME,
  };
};

const createFileStorage = ({
  driver = process.env.FILE_STORAGE_DRIVER || 'local',
  uploadDir = UPLOAD_DIR,
  client,
  bucket,
  env = process.env,
} = {}) => {
  if (!['local', 'r2'].includes(driver)) {
    throw new Error('FILE_STORAGE_DRIVER must be either "local" or "r2"');
  }

  let r2Client = client;
  let r2Bucket = bucket;
  if (driver === 'r2' && (!r2Client || !r2Bucket)) {
    const config = createR2Client(env);
    r2Client ||= config.client;
    r2Bucket ||= config.bucket;
  }

  const localPath = (storedFileName) => {
    validateStoredFileName(storedFileName);
    const fullPath = path.resolve(uploadDir, storedFileName);
    if (!fullPath.startsWith(path.resolve(uploadDir) + path.sep)) {
      throw new AppError('Invalid file path', 400);
    }
    return fullPath;
  };

  const ensureUploadDir = () => {
    if (driver === 'local') fs.mkdirSync(uploadDir, { recursive: true });
  };

  const storeStoredFile = async (storedFileName, body, contentType) => {
    validateStoredFileName(storedFileName);
    if (driver === 'local') {
      ensureUploadDir();
      await fs.promises.writeFile(localPath(storedFileName), body);
      return;
    }

    await r2Client.send(new PutObjectCommand({
      Bucket: r2Bucket,
      Key: storedFileName,
      Body: body,
      ContentType: contentType,
    }));
  };

  const openStoredFile = async (storedFileName) => {
    validateStoredFileName(storedFileName);
    if (driver === 'local') {
      const fullPath = localPath(storedFileName);
      try {
        await fs.promises.access(fullPath, fs.constants.R_OK);
      } catch (error) {
        if (error.code === 'ENOENT') throw new AppError('File not found on the server', 404);
        throw error;
      }
      return fs.createReadStream(fullPath);
    }

    try {
      const result = await r2Client.send(new GetObjectCommand({
        Bucket: r2Bucket,
        Key: storedFileName,
      }));
      if (!result.Body) throw new AppError('File not found on the server', 404);
      return result.Body;
    } catch (error) {
      if (isMissingObject(error)) throw new AppError('File not found on the server', 404);
      throw error;
    }
  };

  const deleteStoredFile = async (storedFileName) => {
    validateStoredFileName(storedFileName);
    try {
      if (driver === 'local') {
        await fs.promises.unlink(localPath(storedFileName));
      } else {
        await r2Client.send(new DeleteObjectCommand({
          Bucket: r2Bucket,
          Key: storedFileName,
        }));
      }
    } catch (error) {
      if (error.code === 'ENOENT' || (driver === 'r2' && isMissingObject(error))) return;
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
    driver,
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
