import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';

const adminMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // @ts-ignore
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden: Admin access only' });
    }

    next();
  } catch (error) {
    console.error('Admin Middleware Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export default adminMiddleware;
