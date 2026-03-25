import { Router } from 'express';
import { getMessages, saveMessage } from '../controllers/chat.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.get('/history', authMiddleware, getMessages);
router.post('/save', authMiddleware, saveMessage);

export default router;
