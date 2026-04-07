import { Router } from 'express';
import { validatePromo } from '../controllers/promo.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = Router();

// Only authenticated passengers/drivers should be able to validate codes
router.use(authMiddleware);

router.post('/validate', validatePromo);

export default router;
