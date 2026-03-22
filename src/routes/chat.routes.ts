import { Router } from 'express';
import { getMessages, saveMessage } from '../controllers/chat.controller';

const router = Router();

router.get('/history', getMessages);
router.post('/save', saveMessage);

export default router;
