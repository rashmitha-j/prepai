const router = require('express').Router();
const system = require('../controllers/systemController');
const { requireAuth } = require('../middleware/auth');

router.get('/health', system.health);
router.use('/auth', require('./authRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/resumes', require('./resumeRoutes'));
router.use('/jobs', require('./jobRoutes'));
router.use('/interviews', require('./interviewRoutes'));
router.use('/coding', require('./codingRoutes'));
router.use('/knowledge', require('./knowledgeRoutes'));
router.get('/dashboard', requireAuth, system.dashboard);

module.exports = router;
