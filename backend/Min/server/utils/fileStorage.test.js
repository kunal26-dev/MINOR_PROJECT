const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const test = require('node:test');
const {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const { createFileStorage } = require('./fileStorage');

test('local storage writes, reads, and deletes files', async (t) => {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studyspace-storage-'));
  t.after(() => fs.rm(uploadDir, { recursive: true, force: true }));
  const storage = createFileStorage({ driver: 'local', uploadDir });

  await storage.storeStoredFile('sample.pdf', Buffer.from('sample PDF'), 'application/pdf');
  const stream = await storage.openStoredFile('sample.pdf');
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), 'sample PDF');

  await storage.deleteStoredFile('sample.pdf');
  await assert.rejects(
    storage.openStoredFile('sample.pdf'),
    (error) => error.statusCode === 404
  );
});

test('R2 storage sends private object commands with the configured bucket and key', async () => {
  const calls = [];
  const client = {
    async send(command) {
      calls.push(command);
      if (command instanceof GetObjectCommand) {
        return { Body: Readable.from([Buffer.from('sample PDF')]) };
      }
      return {};
    },
  };
  const storage = createFileStorage({ driver: 'r2', bucket: 'studyspace-files', client });

  await storage.storeStoredFile('sample.pdf', Buffer.from('sample PDF'), 'application/pdf');
  const stream = await storage.openStoredFile('sample.pdf');
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  await storage.deleteStoredFile('sample.pdf');

  assert.equal(calls.length, 3);
  assert.ok(calls[0] instanceof PutObjectCommand);
  assert.equal(calls[0].input.Bucket, 'studyspace-files');
  assert.equal(calls[0].input.Key, 'sample.pdf');
  assert.equal(calls[0].input.ContentType, 'application/pdf');
  assert.equal(Buffer.concat(chunks).toString(), 'sample PDF');
  assert.ok(calls[2] instanceof DeleteObjectCommand);
});

test('R2 missing objects return a 404 and unsafe storage keys are rejected', async () => {
  const client = {
    async send() {
      const error = new Error('missing');
      error.name = 'NoSuchKey';
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    },
  };
  const storage = createFileStorage({ driver: 'r2', bucket: 'studyspace-files', client });

  await assert.rejects(storage.openStoredFile('missing.pdf'), (error) => error.statusCode === 404);
  await assert.rejects(storage.storeStoredFile('../outside.pdf', Buffer.from('x')), (error) => error.statusCode === 400);
});

test('R2 storage requires every credential and bucket setting', () => {
  assert.throws(
    () => createFileStorage({ driver: 'r2', env: {} }),
    /R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME/
  );
});
