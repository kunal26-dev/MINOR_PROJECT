// Usage: npm run seed
// Safe to run repeatedly: known legacy subjects are updated in place, preserving their IDs.
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Category = require('../models/Category');
const Subject = require('../models/Subject');
const Resource = require('../models/Resource');
const { ensureUploadDir, resolveUploadPath } = require('../utils/fileHelpers');

const DEFAULT_CATEGORIES = [
  { categoryName: 'Notes', description: 'Lecture notes and handwritten notes' },
  { categoryName: 'Assignments', description: 'Assignments and homework' },
  { categoryName: 'Question Banks', description: 'Collections of practice questions' },
  { categoryName: 'Previous Year Papers', description: 'Previous year question papers' },
  { categoryName: 'Presentations', description: 'Slides and presentations' },
  { categoryName: 'Lab Manuals', description: 'Laboratory manuals and records' },
  { categoryName: 'Study Materials', description: 'Reference and general study material' },
  { categoryName: 'Other', description: 'Anything that does not fit another category' },
];

const SEMESTER_SUBJECTS = [
  [
    ['Algorithm Thinking & Problem Solving using C', 'Problem-solving methods, algorithms and C programming'],
    ['Python Programming', 'Python syntax, programming fundamentals and applications'],
    ['Elements of Electronics and Communications', 'Electronic components, circuits and communication fundamentals'],
    ['Environmental Studies', 'Environmental systems, sustainability and conservation'],
    ['Calculus and Linear Algebra', 'Differential and integral calculus, matrices and vector spaces'],
    ['Engineering Physics', 'Mechanics, optics, materials and modern physics'],
    ['Algorithm Thinking & Problem Solving using C Lab', 'Practical algorithm design and C programming exercises'],
    ['Python Programming Lab', 'Practical programming exercises using Python'],
    ['Elements of Electronics and Communications Lab', 'Hands-on electronics and communications experiments'],
    ['Engineering Physics Lab', 'Experiments in engineering physics'],
  ],
  [
    ['Engineering Chemistry', 'Chemical principles and materials used in engineering'],
    ['Data Structures', 'Arrays, linked lists, trees, graphs and algorithmic data organization'],
    ['Elements of Electrical Engineering', 'Electrical circuits, machines and power fundamentals'],
    ['Elements of Mechanical Engineering', 'Engineering materials, manufacturing and machine fundamentals'],
    ['English Communication', 'Written, spoken and professional communication skills'],
    ['Differential Equations & Numerical Methods', 'Differential equations and computational numerical techniques'],
    ['Engineering Chemistry Lab', 'Practical chemistry experiments for engineers'],
    ['Data Structures Lab', 'Implementation and analysis of common data structures'],
    ['Elements of Electrical Engineering Lab', 'Practical electrical circuit and machine experiments'],
    ['Elements of Mechanical Engineering Lab', 'Hands-on mechanical engineering experiments'],
  ],
  [
    ['Ability Enhancement Course-1', 'Foundational interdisciplinary ability-enhancement course'],
    ['Object Oriented Programming', 'Object-oriented design, classes, inheritance and polymorphism'],
    ['Digital Electronics', 'Boolean algebra, logic gates and sequential circuits'],
    ['Design and Analysis of Algorithm', 'Algorithm design strategies and complexity analysis'],
    ['Operating System', 'Processes, memory management, concurrency and file systems'],
    ['Web Technologies', 'Web fundamentals, client-side programming and modern standards'],
    ['Object Oriented Programming Lab', 'Practical object-oriented programming exercises'],
    ['Digital Electronics Lab', 'Design and implementation of digital circuits'],
    ['Operating System with Linux Lab', 'Linux commands, shell tools and operating system exercises'],
    ['Web Technologies Lab', 'Practical web application development exercises'],
  ],
  [
    ['Ability Enhancement Course-2', 'Applied interdisciplinary ability-enhancement course'],
    ['Theory of Automata and Formal Language', 'Automata, grammars, formal languages and computability'],
    ['Data Communications and Computer Networks', 'Data transmission, network architectures and protocols'],
    ['Database Management Systems', 'Relational databases, SQL, normalization and transactions'],
    ['Server Side Web Programming', 'Server-side application development and web APIs'],
    ['Data Communications and Computer Networks Lab', 'Network configuration and communication experiments'],
    ['Database Management Systems Lab', 'Database design, SQL and transaction exercises'],
    ['Server Side Web Programming Lab', 'Practical server-side programming and API development'],
    ['Universal Human Values', 'Ethics, human values and responsible professional practice'],
  ],
  [
    ['Software Engineering', 'Software lifecycle, requirements, architecture and quality practices'],
    ['Web Services and API Development', 'Web services, REST APIs and integration patterns'],
    ['Object Oriented Analysis and Design', 'Object-oriented requirements, modeling and design'],
    ['Cryptography and Network Security', 'Cryptographic principles, secure systems and network defense'],
    ['Microprocessor', 'Microprocessor architecture, instruction sets and interfacing'],
    ['Technical Training for Placements-1 (DSA)', 'Placement-focused data structures and algorithms practice'],
    ['Technical Training for Placements-1 (C Programming)', 'Placement-focused C programming practice'],
    ['Software Engineering Lab', 'Practical requirements, design, testing and project exercises'],
    ['Web Services and API Development Lab', 'Build and test web services and APIs'],
    ['Object Oriented Analysis and Design Lab', 'Practical object-oriented analysis and design exercises'],
    ['Cryptography and Network Security Lab', 'Practical cryptography and network security exercises'],
  ],
  [
    ['Machine Learning', 'Supervised and unsupervised learning, model evaluation and applications'],
    ['Compiler Design', 'Lexical analysis, parsing, semantic analysis and code generation'],
    ['Cloud Computing', 'Cloud platforms, virtualization and scalable service architectures'],
    ['Software Testing and Quality Assurance', 'Test design, automation and software quality methods'],
    ['Mobile Application Development', 'Mobile application architecture and development practices'],
    ['Machine Learning Lab', 'Implementation and evaluation of machine learning models'],
    ['Cloud Computing Lab', 'Practical cloud deployment and infrastructure exercises'],
  ],
  [
    ['Artificial Intelligence', 'Search, knowledge representation and intelligent systems'],
    ['Big Data Analytics', 'Distributed data processing, analytics and visualization'],
    ['Internet of Things', 'Connected devices, embedded platforms and IoT communication'],
    ['Distributed Systems', 'Distributed architectures, coordination and fault tolerance'],
    ['Project Phase I', 'Project planning, requirements and initial implementation'],
    ['Artificial Intelligence Lab', 'Practical intelligent search and AI programming exercises'],
    ['Internet of Things Lab', 'Hands-on sensor, device and IoT platform exercises'],
  ],
  [
    ['Data Science', 'Data preparation, statistical learning and applied analytics'],
    ['Advanced Cybersecurity', 'Security assessment, incident response and secure architecture'],
    ['DevOps and Site Reliability Engineering', 'CI/CD, infrastructure automation and service reliability'],
    ['Entrepreneurship and Innovation', 'Product development, innovation and venture fundamentals'],
    ['Capstone Project', 'Final-year design, implementation and presentation project'],
    ['Industrial Training', 'Supervised industry experience and professional practice'],
  ],
];

const LEGACY_SUBJECT_NAMES = {
  'Data Structures': ['Data Structures'],
  'Database Management Systems': ['Database Management Systems'],
  'Operating System': ['Operating Systems'],
  'Data Communications and Computer Networks': ['Computer Networks'],
  'Web Technologies': ['Web Development'],
  'Software Engineering': ['Software Engineering'],
  'Calculus and Linear Algebra': ['Engineering Mathematics'],
  'Engineering Physics': ['Engineering Physics'],
};

const SAMPLE_SUBJECTS = SEMESTER_SUBJECTS.flatMap((subjects, semesterIndex) =>
  subjects.map(([subjectName, description], subjectIndex) => ({
    subjectName,
    subjectCode: `S${semesterIndex + 1}-${String(subjectIndex + 1).padStart(2, '0')}`,
    semester: semesterIndex + 1,
    description,
  }))
);

const DEMO_SUBJECTS = [5, 6, 7, 8].flatMap((semester, semesterIndex) =>
  SAMPLE_SUBJECTS.filter((subject) => subject.semester === semester)
    .slice(0, semesterIndex === 3 ? 3 : 4)
);

const escapePdfText = (text) =>
  String(text)
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/([\\()])/g, '\\$1');

const wrapPdfText = (text, maxLength = 72) => {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxLength) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const createDemoPdf = (subject, index) => {
  const lines = [
    `Demo Sample Resource ${String(index).padStart(2, '0')}`,
    `Subject: ${subject.subjectName}`,
    `Semester: ${subject.semester}`,
    '',
    'Study notes preview for interface testing.',
    ...wrapPdfText(subject.description),
    '',
    'This synthetic PDF was generated for Smart Notes Finder demo data.',
  ];
  const stream = [
    'BT',
    '/F1 14 Tf',
    '50 750 Td',
    ...lines.flatMap((line, lineIndex) => [
      ...(lineIndex ? ['0 -24 Td'] : []),
      `(${escapePdfText(line)}) Tj`,
    ]),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
};

const seedAdmin = async () => {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn('! ADMIN_EMAIL / ADMIN_PASSWORD not set in .env: skipping admin creation');
    return;
  }
  if (ADMIN_PASSWORD.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  }
  const email = ADMIN_EMAIL.trim().toLowerCase();
  if (await User.exists({ email })) {
    console.log(`- Admin/user with email ${email} already exists: skipped`);
    return;
  }
  // The password is hashed by the User model's pre-save hook
  await User.create({
    name: ADMIN_NAME || 'System Admin',
    email,
    password: ADMIN_PASSWORD,
    role: 'Admin',
    accountStatus: 'Active',
  });
  console.log(`+ Admin account created: ${email}`);
};

const seedCategories = async () => {
  for (const cat of DEFAULT_CATEGORIES) {
    const result = await Category.updateOne(
      { categoryName: cat.categoryName },
      { $setOnInsert: cat },
      { upsert: true }
    );
    console.log(`${result.upsertedCount ? '+ Created' : '- Exists '} category: ${cat.categoryName}`);
  }
};

const seedSubjects = async () => {
  for (const sub of SAMPLE_SUBJECTS) {
    const legacyNames = LEGACY_SUBJECT_NAMES[sub.subjectName] || [];
    const subject = await Subject.findOne({
      $or: [
        { subjectCode: sub.subjectCode },
        { subjectName: sub.subjectName },
        ...legacyNames.map((subjectName) => ({ subjectName })),
      ],
    });
    if (subject) {
      subject.subjectName = sub.subjectName;
      subject.subjectCode = sub.subjectCode;
      subject.semester = sub.semester;
      subject.description = sub.description;
      await subject.save();
      await Resource.updateMany(
        { subject: subject._id, semester: { $ne: sub.semester } },
        { $set: { semester: sub.semester } }
      );
      console.log(`~ Updated subject in place: ${sub.subjectCode} ${sub.subjectName}`);
    } else {
      const created = await Subject.create(sub);
      await Resource.updateMany(
        { subject: created._id, semester: { $ne: sub.semester } },
        { $set: { semester: sub.semester } }
      );
      console.log(`+ Created subject: ${sub.subjectCode} ${sub.subjectName}`);
    }
  }
};

const seedDemoResources = async () => {
  const uploader = await User.findOne({ role: 'Admin', accountStatus: 'Active' }).sort({ createdAt: 1 });
  if (!uploader) {
    console.warn('! Demo resources not seeded: no active admin account exists');
    return;
  }

  const category = await Category.findOne({ categoryName: 'Study Materials' });
  if (!category) throw new Error('Demo resources require the Study Materials category');
  ensureUploadDir();

  for (const [index, subject] of DEMO_SUBJECTS.entries()) {
    const sequence = String(index + 1).padStart(2, '0');
    const marker = `demo-seed-${sequence}`;
    const storedFileName = `${marker}-${subject.subjectCode.toLowerCase()}.pdf`;
    const originalFileName = `Demo_${sequence}_${subject.subjectCode}.pdf`;
    const subjectRecord = await Subject.findOne({ subjectCode: subject.subjectCode });
    if (!subjectRecord) throw new Error(`Demo subject is missing: ${subject.subjectCode}`);
    const pdf = createDemoPdf(subject, index + 1);
    await fs.promises.writeFile(resolveUploadPath(storedFileName), pdf);

    const values = {
      title: `Demo: ${subject.subjectName} sample notes`,
      description: `Synthetic sample PDF for ${subject.subjectName}, semester ${subject.semester}.`,
      subject: subjectRecord._id,
      semester: subject.semester,
      category: category._id,
      tags: ['demo', 'sample', marker],
      originalFileName,
      storedFileName,
      filePath: `uploads/${storedFileName}`,
      fileType: 'pdf',
      fileSize: pdf.length,
      uploadedBy: uploader._id,
      status: 'Approved',
    };

    const resource = await Resource.findOne({ tags: marker });
    if (resource) {
      Object.assign(resource, values);
      await resource.save();
    } else {
      await Resource.create(values);
    }
    console.log(`~ Seeded demo PDF: ${subject.subjectCode} ${subject.subjectName}`);
  }
};

const seedDatabase = async () => {
  await seedAdmin();
  await seedCategories();
  await seedSubjects();
  await seedDemoResources();
};

if (require.main === module) {
  (async () => {
  try {
    await connectDB();
    await seedDatabase();
    console.log('Seeding finished.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(`Seeding failed: ${err.message}`);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
  })();
}

module.exports = { seedDatabase, createDemoPdf, DEMO_SUBJECTS };
