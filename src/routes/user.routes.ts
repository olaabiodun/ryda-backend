import { Router } from 'express';
import userController from '../controllers/user.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = Router();

// Profile
router.put('/update-profile', authMiddleware, userController.updateProfile);

// Trusted Contacts
router.get('/contacts', authMiddleware, userController.getContacts);
router.post('/contacts', authMiddleware, userController.addContact);
router.delete('/contacts/:id', authMiddleware, userController.deleteContact);

// Vehicles
router.get('/vehicles', authMiddleware, userController.getVehicles);
router.post('/vehicles', authMiddleware, userController.addVehicle);
router.put('/vehicles/:plateNumber', authMiddleware, userController.updateVehicle);
router.delete('/vehicles/:plateNumber', authMiddleware, userController.deleteVehicle);

export default router;
