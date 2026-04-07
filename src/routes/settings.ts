import express from 'express';
import { getRideSettings, updateRideSetting, initializeSettings } from '../controllers/settings.controller';

const router = express.Router();

router.get('/', getRideSettings);
router.put('/:id', updateRideSetting);
router.post('/initialize', initializeSettings);

export default router;
