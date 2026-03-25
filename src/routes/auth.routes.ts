import { Router } from 'express';
import authController from '../controllers/auth.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = Router();

router.post('/request-otp', authController.requestOtp);
router.post('/request-email-otp', authController.requestEmailOtp);
router.post('/register', authController.register);
router.post('/login', authController.verifyOtp);
router.post('/topup', authMiddleware, authController.topUp);
router.post('/send', authMiddleware, authController.sendMoney);
router.post('/withdraw', authMiddleware, authController.withdraw);
router.get('/profile', authMiddleware, authController.getProfile);
router.get('/transactions', authMiddleware, authController.getTransactions);
router.post('/google', authController.googleAuth);
router.post('/update-phone', authMiddleware, authController.updatePhone);
router.patch('/profile', authMiddleware, authController.updateProfile);

export default router;
