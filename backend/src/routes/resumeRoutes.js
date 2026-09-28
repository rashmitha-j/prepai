const router = require('express').Router();
const c = require('../controllers/resumeController');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const { singlePdf } = require('../middleware/upload');
const validate = require('../middleware/validate');
const v = require('../validators');

router.use(requireAuth);
router.get('/', c.list);
router.post('/', aiLimiter, singlePdf('resume'), c.upload);
router.get('/:id', validate({ params: v.idParam }), c.get);
router.post('/:id/reanalyze', aiLimiter, validate({ params: v.idParam }), c.reanalyze);
router.delete('/:id', validate({ params: v.idParam }), c.remove);

module.exports = router;
