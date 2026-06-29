import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

interface DecodedToken {
  id: string;
  role: string;
}

const partnerMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    
    if (decoded.role !== 'PARTNER') {
      return res.status(403).json({ message: 'Forbidden: Partner access only' });
    }

    const partner = await prisma.partner.findUnique({
      where: { id: decoded.id }
    });

    if (!partner) {
      return res.status(401).json({ message: 'Partner account not found' });
    }

    if (!partner.isApproved) {
      return res.status(403).json({ 
        message: 'Awaiting Admin Approval', 
        pendingApproval: true 
      });
    }

    // @ts-ignore
    req.user = { id: partner.id, role: 'PARTNER', partner };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export default partnerMiddleware;
