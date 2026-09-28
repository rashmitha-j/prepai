const router = require('express').Router();
const c = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const v = require('../validators');

router.use(requireAuth);
router.get('/me', c.getMe);
router.patch('/me', validate({ body: v.users.update }), c.updateMe);
router.delete('/me', authLimiter, validate({ body: v.users.remove }), c.deleteMe);

module.exports = router;
