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
        totalRevenueAggregate,
        tripsToday,
        recentTrips,
        allUsers,
      ] = await Promise.all([
        prisma.user.count({ where: { role: 'PASSENGER' } }),
        prisma.user.count({ where: { role: 'DRIVER' } }),
        prisma.trip.count(),
        prisma.trip.count({ where: { status: { in: ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'] } } }),
        prisma.transaction.aggregate({
          where: { type: 'TRIP_PAYMENT' },
          _sum: { amount: true }
        }),
        prisma.trip.count({ where: { createdAt: { gte: today } } }),
        prisma.trip.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            passenger: { select: { first_name: true, last_name: true } },
            driver: { select: { first_name: true, last_name: true } }
          }
        }),
        prisma.user.findMany({
           select: { createdAt: true }
        })
      ]);

      const totalRevenue = totalRevenueAggregate._sum.amount || 0;

      // Real Historical Data Aggregation (Revenue)
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const currentYear = new Date().getFullYear();
      
      const transactions = await prisma.transaction.findMany({
        where: { 
          type: 'TRIP_PAYMENT',
          createdAt: { gte: new Date(currentYear, 0, 1) }
        },
        select: { amount: true, createdAt: true }
      });

      const revenueData = months.map((month, i) => {
        const monthRevenue = transactions
          .filter(t => t.createdAt.getMonth() === i)
          .reduce((sum, t) => sum + t.amount, 0);
        return { month, revenue: monthRevenue };
      });

      // Real Historical Data Aggregation (User Growth)
      const userGrowthData = months.map((month, i) => {
        const monthUsers = allUsers.filter(u => u.createdAt.getMonth() === i).length;
        // Cumulative growth calculation
        const cumulativeUsers = allUsers.filter(u => u.createdAt.getMonth() <= i).length;
        return { month, users: cumulativeUsers };
      });

      const dashboardStats = {
        totalUsers,
        userGrowth: "+12.5%", // These could be calculated dynamically too
        activeTrips,
        tripGrowth: "+8.2%",
        totalRevenue,
        revenueGrowth: "+15.3%",
        onlineDrivers: totalDrivers,
        driverGrowth: "+4.1%"
      };

      const mockTrips = recentTrips.map(trip => ({
        id: trip.id,
        passengerName: `${trip.passenger.first_name} ${trip.passenger.last_name}`,
        driverName: trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name}` : null,
        origin: trip.originAddress,
        destination: trip.destAddress,
        status: trip.status,
        fare: trip.fare
      }));

      res.json({
        dashboardStats,
        revenueData,
        userGrowthData,
        mockTrips
      });
    } catch (error) {
      console.error('Admin Stats Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Rewards & Loyalty ──
  async getRewards(req: Request, res: Response) {
    try {
      const rewards = await prisma.redeemableReward.findMany({
        orderBy: { points: 'asc' }
      });
      res.json(rewards);
    } catch (error) {
      console.error('Admin Rewards Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getPointsHistory(req: Request, res: Response) {
    try {
      const history = await prisma.pointsHistory.findMany({
        include: {
          user: { select: { first_name: true, last_name: true } }
        },
        orderBy: { date: 'desc' }
      });
      res.json(history);
    } catch (error) {
      console.error('Admin Points History Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Communication ──
  async getNotifications(req: Request, res: Response) {
    try {
      const notifications = await prisma.notification.findMany({
        include: {
          user: { select: { first_name: true, last_name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      res.json(notifications);
    } catch (error) {
      console.error('Admin Notifications Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getChatConversations(req: Request, res: Response) {
    try {
      const messages = await prisma.chatMessage.findMany({
        include: {
          trip: {
            include: {
              passenger: { select: { first_name: true, last_name: true } },
              driver: { select: { first_name: true, last_name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 500
      });

      // Group by tripId
      const conversationsMap: Record<string, any> = {};
      
      messages.forEach(msg => {
        if (!msg.tripId) return;
        if (!conversationsMap[msg.tripId]) {
          conversationsMap[msg.tripId] = {
            tripId: msg.tripId,
            passengerName: `${msg.trip?.passenger.first_name} ${msg.trip?.passenger.last_name}`,
            driverName: msg.trip?.driver ? `${msg.trip.driver.first_name} ${msg.trip.driver.last_name}` : 'Unassigned',
            lastMessage: msg.content,
            messageCount: 0,
            messages: []
          };
        }
        conversationsMap[msg.tripId].messages.push({
          id: msg.id,
          senderId: msg.senderId,
          senderName: msg.senderId === msg.trip?.passengerId 
            ? `${msg.trip.passenger.first_name} ${msg.trip.passenger.last_name}`
            : (msg.trip?.driver ? `${msg.trip.driver.first_name} ${msg.trip.driver.last_name}` : 'Unknown'),
          senderRole: msg.senderId === msg.trip?.passengerId ? 'PASSENGER' : 'DRIVER',
          message: msg.content,
          createdAt: msg.createdAt
        });
        conversationsMap[msg.tripId].messageCount++;
      });

      res.json(Object.values(conversationsMap));
    } catch (error) {
      console.error('Admin Chat Monitor Error:', error);
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

  async updateTrip(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = req.body;
      
      const trip = await prisma.trip.update({
        where: { id },
        data,
        include: {
          passenger: { select: { first_name: true, last_name: true, phone: true } },
          driver: { select: { first_name: true, last_name: true, phone: true } }
        }
      });

      res.json(trip);
    } catch (error) {
      console.error('Admin Update Trip Error:', error);
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
