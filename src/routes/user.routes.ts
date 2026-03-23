import { Router } from 'express';
import userController from '../controllers/user.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = Router();

router.get('/contacts', authMiddleware, userController.getContacts);
router.post('/contacts', authMiddleware, userController.addContact);
router.delete('/contacts/:id', authMiddleware, userController.deleteContact);
router.put('/update-profile', authMiddleware, userController.updateProfile);

export default router;
