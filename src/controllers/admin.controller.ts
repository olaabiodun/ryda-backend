import { Request, Response } from 'express';
import prisma from '../config/prisma';

class AdminController {
  // ── Dashboard Stats ──
  async getStats(req: Request, res: Response) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        totalUsers,
        totalDrivers,
        totalTrips,
        activeTrips,
        totalRevenue,
        tripsToday
      ] = await Promise.all([
        prisma.user.count({ where: { role: 'PASSENGER' } }),
        prisma.user.count({ where: { role: 'DRIVER' } }),
        prisma.trip.count(),
        prisma.trip.count({ where: { status: { in: ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'] } } }),
        prisma.transaction.aggregate({
          where: { type: 'TRIP_PAYMENT' },
          _sum: { amount: true }
        }),
        prisma.trip.count({ where: { createdAt: { gte: today } } })
      ]);

      res.json({
        totalUsers,
        totalDrivers,
        totalTrips,
        activeTrips,
        totalRevenue: totalRevenue._sum.amount || 0,
        tripsToday
      });
    } catch (error) {
      console.error('Admin Stats Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── User Management ──
  async getUsers(req: Request, res: Response) {
    try {
      const { role, search } = req.query;
      const where: any = {};
      
      if (role) where.role = role;
      if (search) {
        where.OR = [
          { first_name: { contains: String(search), mode: 'insensitive' } },
          { last_name: { contains: String(search), mode: 'insensitive' } },
          { email: { contains: String(search), mode: 'insensitive' } },
          { phone: { contains: String(search), mode: 'insensitive' } }
        ];
      }

      const users = await prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { tripsAsPassenger: true, tripsAsDriver: true }
          }
        }
      });

      res.json(users);
    } catch (error) {
      console.error('Admin Users Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = req.body;
      
      const user = await prisma.user.update({
        where: { id },
        data
      });

      res.json(user);
    } catch (error) {
      console.error('Admin Update User Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Trip Management ──
  async getTrips(req: Request, res: Response) {
    try {
      const { status } = req.query;
      const where: any = {};
      if (status) where.status = status;

      const trips = await prisma.trip.findMany({
        where,
        include: {
          passenger: { select: { first_name: true, last_name: true, phone: true } },
          driver: { select: { first_name: true, last_name: true, phone: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(trips);
    } catch (error) {
      console.error('Admin Trips Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Financial Overview ──
  async getTransactions(req: Request, res: Response) {
    try {
      const transactions = await prisma.transaction.findMany({
        include: {
          user: { select: { first_name: true, last_name: true, email: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(transactions);
    } catch (error) {
      console.error('Admin Transactions Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new AdminController();
