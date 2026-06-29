import { Router } from 'express';
import partnerMiddleware from '../middlewares/partner.middleware';
import partnerController from '../controllers/partner.controller';

const router = Router();

// Apply partner verification middleware to all routes
router.use(partnerMiddleware);

router.get('/stats', partnerController.getStats);
router.get('/drivers', partnerController.getDrivers);
router.get('/passengers', partnerController.getPassengers);
router.post('/drivers/add', partnerController.addDriver);
router.delete('/drivers/:driverId', partnerController.removeDriver);
router.get('/trips', partnerController.getTrips);
router.get('/transactions', partnerController.getTransactions);
router.patch('/settings', partnerController.updateSettings);
router.patch('/code', partnerController.updateCode);
router.post('/notifications/send', partnerController.sendNotification);

export default router;
