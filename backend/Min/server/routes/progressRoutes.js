const express = require('express');
const {
  getProgress,
  createProgress,
  updateProgress,
  deleteProgress,
} = require('../controllers/progressController');
const { protect } = require('../middleware/authMiddleware');
const { validateObjectIdParam } = require('../middleware/validateObjectId');

const router = express.Router();
router.param('id', validateObjectIdParam);
router.use(protect);

router.route('/')
  .get(getProgress)
  .post(createProgress);
router.route('/:id')
  .patch(updateProgress)
  .delete(deleteProgress);

module.exports = router;
