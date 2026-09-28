const router = require('express').Router();
const c = require('../controllers/jobController');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const v = require('../validators');

router.use(requireAuth);
router.get('/', c.list);
router.post('/', aiLimiter, validate({ body: v.jobs.create }), c.create);
router.get('/:id', validate({ params: v.idParam }), c.get);
router.post('/:id/reanalyze', aiLimiter, validate({ params: v.idParam }), c.reanalyze);
router.delete('/:id', validate({ params: v.idParam }), c.remove);
router.get('/:id/matches', validate({ params: v.idParam }), c.listMatches);
router.post('/:id/match', aiLimiter, validate({ params: v.idParam, body: v.jobs.match }), c.match);

module.exports = router;
