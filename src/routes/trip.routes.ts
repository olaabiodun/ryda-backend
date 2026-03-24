import { Router } from 'express';
import tripController from '../controllers/trip.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = Router();

router.post('/', authMiddleware, tripController.createTrip);
router.get('/active', authMiddleware, tripController.getActiveTrip);
router.get('/', authMiddleware, tripController.getTrips);
router.get('/available', authMiddleware, tripController.getAvailableTrips);
router.get('/:id', authMiddleware, tripController.getTripDetails);
router.patch('/:id/status', authMiddleware, tripController.updateTripStatus);
router.patch('/:id/confirm-arrival', authMiddleware, tripController.confirmArrival);
router.patch('/:id/rate', authMiddleware, tripController.rateTrip);

export default router;
