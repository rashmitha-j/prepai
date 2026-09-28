const router = require('express').Router();
const c = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const v = require('../validators');

router.post('/register', authLimiter, validate({ body: v.auth.register }), c.register);
router.post('/login', authLimiter, validate({ body: v.auth.login }), c.login);
router.get('/me', requireAuth, c.me);
router.post('/change-password', requireAuth, authLimiter, validate({ body: v.auth.changePassword }), c.changePassword);

module.exports = router;
