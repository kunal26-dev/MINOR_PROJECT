const assert = require('node:assert/strict');
const test = require('node:test');
const { createDemoPdf, DEMO_SUBJECTS } = require('./seed');

test('demo PDFs cover the first five subjects in every semester', () => {
  assert.equal(DEMO_SUBJECTS.length, 40);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8].map((semester) =>
      DEMO_SUBJECTS.filter((subject) => subject.semester === semester).length
    ),
    [5, 5, 5, 5, 5, 5, 5, 5]
  );
  assert.equal(new Set(DEMO_SUBJECTS.map((subject) => subject.subjectCode)).size, 40);
});

test('demo PDFs have a valid header and cross-reference offset', () => {
  const pdf = createDemoPdf(
    { subjectName: 'Systems (Design) \\ Networks', semester: 5, description: 'Sample description' },
    1
  );
  const content = pdf.toString('ascii');
  const xrefOffset = Number(content.match(/startxref\n(\d+)\n%%EOF/)[1]);

  assert.ok(content.startsWith('%PDF-1.4\n'));
  assert.equal(content.indexOf('xref\n'), xrefOffset);
  assert.ok(content.includes('Systems \\(Design\\) \\\\ Networks'));
  assert.ok(content.includes('/Type /Catalog'));
});
