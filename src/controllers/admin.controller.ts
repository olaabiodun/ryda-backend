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
          },
          partner: {
            select: { id: true, name: true, partnerCode: true }
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

  // ── Partner Management ──
  async getPartners(req: Request, res: Response) {
    try {
      const partners = await prisma.partner.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { drivers: true }
          }
        }
      });

      const formattedPartners = partners.map(p => ({
        id: p.id,
        name: p.name,
        email: p.email,
        partnerCode: p.partnerCode,
        isApproved: p.isApproved,
        feeType: p.feeType,
        feeValue: p.feeValue,
        createdAt: p.createdAt,
        driverCount: p._count.drivers
      }));

      res.json(formattedPartners);
    } catch (error) {
      console.error('Admin Get Partners Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getPartner(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const partner = await prisma.partner.findUnique({
        where: { id },
        include: {
          drivers: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              phone: true,
              rating: true,
              isOnline: true,
              isVerified: true,
              createdAt: true,
              tripsAsDriver: {
                where: { status: 'COMPLETED' },
                select: { fare: true }
              }
            },
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!partner) {
        return res.status(404).json({ message: 'Partner not found' });
      }

      let totalCommission = 0;
      const driversFormatted = partner.drivers.map(d => {
        const totalEarnings = d.tripsAsDriver.reduce((s, t) => s + t.fare, 0);
        d.tripsAsDriver.forEach(t => {
          if (partner.feeType === 'percentage') {
            totalCommission += t.fare * partner.feeValue;
          } else {
            totalCommission += Math.min(t.fare, partner.feeValue);
          }
        });
        return {
          id: d.id,
          first_name: d.first_name,
          last_name: d.last_name,
          email: d.email,
          phone: d.phone,
          rating: d.rating,
          isOnline: d.isOnline,
          isVerified: d.isVerified,
          createdAt: d.createdAt,
          totalRides: d.tripsAsDriver.length,
          totalEarnings: Number(totalEarnings.toFixed(2))
        };
      });

      res.json({
        id: partner.id,
        name: partner.name,
        email: partner.email,
        partnerCode: partner.partnerCode,
        isApproved: partner.isApproved,
        feeType: partner.feeType,
        feeValue: partner.feeValue,
        platformFeeType: partner.platformFeeType,
        platformFeeValue: partner.platformFeeValue,
        createdAt: partner.createdAt,
        totalCommission: Number(totalCommission.toFixed(2)),
        drivers: driversFormatted
      });
    } catch (error) {
      console.error('Admin Get Partner Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async createPartner(req: Request, res: Response) {
    try {
      const { name, email, password, feeType, feeValue, partnerCode } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email, and password are required' });
      }

      const existing = await prisma.partner.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) {
        return res.status(400).json({ message: 'Email already in use' });
      }

      let code = partnerCode;
      if (code) {
        const codeExist = await prisma.partner.findUnique({ where: { partnerCode: code } });
        if (codeExist) {
          return res.status(400).json({ message: 'Partner Code already in use' });
        }
      } else {
        let isCodeUnique = false;
        while (!isCodeUnique) {
          const rand = Math.floor(1000 + Math.random() * 9000).toString();
          code = `PART-${rand}`;
          const existingCode = await prisma.partner.findUnique({ where: { partnerCode: code } });
          if (!existingCode) isCodeUnique = true;
        }
      }

      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);

      const partner = await prisma.partner.create({
        data: {
          name,
          email: email.toLowerCase(),
          password: hashedPassword,
          partnerCode: code,
          isApproved: true,
          feeType: feeType || 'percentage',
          feeValue: feeValue !== undefined ? Number(feeValue) : 0.10
        }
      });

      res.status(201).json({
        id: partner.id,
        name: partner.name,
        email: partner.email,
        partnerCode: partner.partnerCode,
        isApproved: partner.isApproved,
        feeType: partner.feeType,
        feeValue: partner.feeValue,
        createdAt: partner.createdAt
      });
    } catch (error) {
      console.error('Admin Create Partner Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updatePartner(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, email, password, feeType, feeValue, partnerCode, isApproved, platformFeeType, platformFeeValue } = req.body;

      const updates: any = {};
      if (name) updates.name = name;
      if (email) updates.email = email.toLowerCase();
      if (feeType) updates.feeType = feeType;
      if (feeValue !== undefined) updates.feeValue = Number(feeValue);
      if (platformFeeType) updates.platformFeeType = platformFeeType;
      if (platformFeeValue !== undefined) updates.platformFeeValue = Number(platformFeeValue);
      if (partnerCode) updates.partnerCode = partnerCode;
      if (isApproved !== undefined) updates.isApproved = isApproved;

      if (password) {
        const bcrypt = require('bcryptjs');
        updates.password = await bcrypt.hash(password, 10);
      }

      const partner = await prisma.partner.update({
        where: { id },
        data: updates
      });

      res.json({
        id: partner.id,
        name: partner.name,
        email: partner.email,
        partnerCode: partner.partnerCode,
        isApproved: partner.isApproved,
        feeType: partner.feeType,
        feeValue: partner.feeValue,
        platformFeeType: partner.platformFeeType,
        platformFeeValue: partner.platformFeeValue
      });
    } catch (error) {
      console.error('Admin Update Partner Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async approvePartner(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const partner = await prisma.partner.update({
        where: { id },
        data: { isApproved: true }
      });

      res.json({
        message: 'Partner approved successfully',
        partner: {
          id: partner.id,
          name: partner.name,
          email: partner.email,
          partnerCode: partner.partnerCode,
          isApproved: partner.isApproved
        }
      });
    } catch (error) {
      console.error('Admin Approve Partner Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async resetPartnerPassword(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password || password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }

      const bcrypt = require('bcryptjs');
      const hashed = await bcrypt.hash(password, 10);

      await prisma.partner.update({
        where: { id },
        data: { password: hashed }
      });

      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      console.error('Admin Reset Partner Password Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updatePartnerPlatformFee(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { platformFeeType, platformFeeValue } = req.body;

      if (platformFeeType && !['percentage', 'flat'].includes(platformFeeType)) {
        return res.status(400).json({ message: 'Invalid platform fee type. Must be percentage or flat.' });
      }

      if (platformFeeValue !== undefined && (typeof platformFeeValue !== 'number' || platformFeeValue < 0)) {
        return res.status(400).json({ message: 'Invalid platform fee value. Must be a positive number.' });
      }

      if (platformFeeType === 'percentage' && platformFeeValue > 1) {
        return res.status(400).json({ message: 'Percentage platform fee must be between 0.0 and 1.0 (e.g. 0.02 for 2%)' });
      }

      const updates: any = {};
      if (platformFeeType) updates.platformFeeType = platformFeeType;
      if (platformFeeValue !== undefined) updates.platformFeeValue = platformFeeValue;

      const partner = await prisma.partner.update({
        where: { id },
        data: updates
      });

      res.json({
        message: 'Platform fee updated successfully',
        partner: {
          id: partner.id,
          name: partner.name,
          platformFeeType: partner.platformFeeType,
          platformFeeValue: partner.platformFeeValue
        }
      });
    } catch (error) {
      console.error('Admin Update Platform Fee Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async deletePartner(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await prisma.user.updateMany({
        where: { partnerId: id },
        data: { partnerId: null }
      });

      await prisma.partner.delete({
        where: { id }
      });

      res.json({ message: 'Partner deleted successfully' });
    } catch (error) {
      console.error('Admin Delete Partner Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Send Push Notification ──
  async sendNotification(req: Request, res: Response) {
    try {
      const { title, body, target, screen } = req.body;
      // target: 'ALL' | 'DRIVER' | 'PASSENGER'

      if (!title || !body) {
        return res.status(400).json({ message: 'Title and body are required' });
      }

      const where: any = { pushToken: { not: null } };
      if (target === 'DRIVER') where.role = 'DRIVER';
      else if (target === 'PASSENGER') where.role = 'PASSENGER';

      const users = await prisma.user.findMany({
        where,
        select: { id: true, pushToken: true }
      });

      const tokens = users.map(u => u.pushToken).filter(Boolean) as string[];

      if (tokens.length === 0) {
        return res.status(404).json({ message: 'No users with push tokens found' });
      }

      // Expo push API accepts up to 100 per request
      const chunks: string[][] = [];
      for (let i = 0; i < tokens.length; i += 100) {
        chunks.push(tokens.slice(i, i + 100));
      }

      const results = await Promise.allSettled(
        chunks.map(chunk =>
          fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
            body: JSON.stringify(
              chunk.map(token => ({
                to: token,
                title,
                body,
                data: screen ? { screen } : {},
                sound: 'default',
                priority: 'high',
              }))
            )
          }).then(r => r.json())
        )
      );

      // Also save as in-app notifications
      await prisma.notification.createMany({
        data: users.map(u => ({
          userId: u.id,
          title,
          message: body,
          type: 'INFO',
        }))
      });

      res.json({ message: `Notification sent to ${tokens.length} device(s)`, results });
    } catch (error) {
      console.error('Send Notification Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new AdminController();
