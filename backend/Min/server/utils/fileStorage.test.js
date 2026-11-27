const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createFileStorage } = require('./fileStorage');

test('local storage writes, reads, and deletes files', async (t) => {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studyspace-storage-'));
  t.after(() => fs.rm(uploadDir, { recursive: true, force: true }));
  const storage = createFileStorage({ uploadDir });

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
  await assert.rejects(
    storage.storeStoredFile('../outside.pdf', Buffer.from('x')),
    (error) => error.statusCode === 400
  );
});
