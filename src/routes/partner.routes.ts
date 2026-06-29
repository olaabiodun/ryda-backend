import { Router } from 'express';
import partnerMiddleware from '../middlewares/partner.middleware';
import partnerController from '../controllers/partner.controller';

const router = Router();

// Apply partner verification middleware to all routes
router.use(partnerMiddleware);

router.get('/stats', partnerController.getStats);
router.get('/drivers', partnerController.getDrivers);
router.get('/trips', partnerController.getTrips);
router.patch('/settings', partnerController.updateSettings);

export default router;
