const express = require('express');
const {
  createAssignment,
  getAssignments,
  submitAssignment,
  getSubmissions,
  downloadAssignment,
  downloadSubmission,
} = require('../controllers/assignmentController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { uploadPdfSingle } = require('../middleware/uploadMiddleware');
const { validateObjectIdParam } = require('../middleware/validateObjectId');

const router = express.Router();
router.param('id', validateObjectIdParam);
router.param('submissionId', validateObjectIdParam);
router.use(protect);

router.route('/')
  .get(getAssignments)
  .post(authorize('Teacher'), uploadPdfSingle, createAssignment);
router.post('/:id/submissions', authorize('Student'), uploadPdfSingle, submitAssignment);
router.get('/:id/submissions', authorize('Teacher'), getSubmissions);
router.get('/:id/download', downloadAssignment);
router.get('/submissions/:submissionId/download', downloadSubmission);

module.exports = router;
