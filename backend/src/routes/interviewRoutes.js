const router = require('express').Router();
const c = require('../controllers/interviewController');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const v = require('../validators');

const id = validate({ params: v.idParam });

router.use(requireAuth);
router.get('/', validate({ query: v.interviews.list }), c.list);
router.post('/', aiLimiter, validate({ body: v.interviews.create }), c.create);
router.get('/:id', id, c.get);
router.post('/:id/answer', aiLimiter, validate({ params: v.idParam, body: v.interviews.answer }), c.answer);
router.post('/:id/next', aiLimiter, id, c.next);
router.post('/:id/complete', aiLimiter, id, c.complete);
router.post('/:id/abandon', id, c.abandon);
router.get('/:id/report', id, c.report);
router.delete('/:id', id, c.remove);

module.exports = router;
