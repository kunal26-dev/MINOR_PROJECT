const express = require('express');
const {
  createTest,
  getTests,
  getMyTestAttempts,
  submitAttempt,
  getTestMarks,
} = require('../controllers/testController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validateObjectIdParam } = require('../middleware/validateObjectId');

const router = express.Router();
router.param('id', validateObjectIdParam);
router.use(protect);

router.get('/my-attempts', authorize('Student'), getMyTestAttempts);
router.route('/')
  .get(getTests)
  .post(authorize('Teacher'), createTest);
router.post('/:id/attempts', authorize('Student'), submitAttempt);
router.get('/:id/marks', authorize('Teacher'), getTestMarks);

module.exports = router;
