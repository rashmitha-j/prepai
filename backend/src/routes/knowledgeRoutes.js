const router = require('express').Router();
const c = require('../controllers/knowledgeController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const v = require('../validators');

router.use(requireAuth);
router.get('/', c.list);
router.get('/status', c.status);
router.post('/search', aiLimiter, validate({ body: v.knowledge.search }), c.search);
router.get('/:docId', validate({ params: v.knowledge.docParam }), c.get);
// Managing the shared knowledge base is restricted to admins.
router.post('/', requireRole('admin'), validate({ body: v.knowledge.create }), c.create);
router.post('/reindex', requireRole('admin'), c.reindex);
router.delete('/:docId', requireRole('admin'), validate({ params: v.knowledge.docParam }), c.remove);

module.exports = router;
