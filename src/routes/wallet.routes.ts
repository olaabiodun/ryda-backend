import { Router } from 'express';
import walletController from '../controllers/wallet.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = Router();

router.get('/transactions', authMiddleware, walletController.getTransactions);
router.post('/add', authMiddleware, walletController.addBalance);
router.post('/transfer', authMiddleware, walletController.transfer);
router.post('/withdraw', authMiddleware, walletController.withdraw);

export default router;
