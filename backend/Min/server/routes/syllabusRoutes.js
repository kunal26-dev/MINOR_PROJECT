const express = require('express');
const {
  getSyllabi,
  createSyllabus,
  updateSyllabus,
  updateSyllabusProgress,
} = require('../controllers/syllabusController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validateObjectIdParam } = require('../middleware/validateObjectId');

const router = express.Router();
router.param('id', validateObjectIdParam);
router.use(protect);

router.route('/')
  .get(getSyllabi)
  .post(authorize('Teacher'), createSyllabus);
router.put('/:id', authorize('Teacher'), updateSyllabus);
router.put('/:id/progress', authorize('Student'), updateSyllabusProgress);

module.exports = router;
