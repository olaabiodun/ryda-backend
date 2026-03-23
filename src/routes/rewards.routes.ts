import { Router } from 'express';
import rewardsController from '../controllers/rewards.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authMiddleware, rewardsController.getRewards);
router.get('/history', authMiddleware, rewardsController.getHistory);
router.post('/redeem', authMiddleware, rewardsController.redeem);

export default router;
