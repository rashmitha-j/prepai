const router = require('express').Router();
const c = require('../controllers/codingController');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter, codeLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const v = require('../validators');

router.use(requireAuth);
router.get('/problems', c.listProblems);
router.get('/problems/:slug', validate({ params: v.coding.slugParam }), c.getProblem);
router.post('/problems/:slug/submit', codeLimiter, validate({ params: v.coding.slugParam, body: v.coding.submit }), c.submit);
router.get('/problems/:slug/submissions', validate({ params: v.coding.slugParam }), c.listSubmissions);
router.get('/submissions/:id', validate({ params: v.idParam }), c.getSubmission);
router.post('/submissions/:id/explain', aiLimiter, validate({ params: v.idParam }), c.explain);

module.exports = router;
