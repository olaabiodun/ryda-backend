import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import adminMiddleware from '../middlewares/admin.middleware';
import adminController from '../controllers/admin.controller';
import { getRideSettings, updateRideSetting, initializeSettings } from '../controllers/settings.controller';

const router = Router();

// Apply auth first, then admin middleware to all routes
router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/stats', adminController.getStats);
router.get('/users', adminController.getUsers);
router.patch('/users/:id', adminController.updateUser);
router.get('/trips', adminController.getTrips);
router.patch('/trips/:id', adminController.updateTrip);
router.get('/transactions', adminController.getTransactions);
router.get('/rewards', adminController.getRewards);
router.get('/points-history', adminController.getPointsHistory);
router.get('/notifications', adminController.getNotifications);
router.get('/chat-conversations', adminController.getChatConversations);
router.get('/settings', getRideSettings);
router.put('/settings/:id', updateRideSetting);
router.post('/settings/initialize', initializeSettings);

export default router;
