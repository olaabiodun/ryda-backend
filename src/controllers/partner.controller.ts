import { Request, Response } from 'express';
import prisma from '../config/prisma';

class PartnerController {
  // ── Dashboard Stats ──
  async getStats(req: Request, res: Response) {
    try {
      // @ts-ignore
      const partner = req.user.partner;
      const partnerId = partner.id;

      // 1. Get all members (drivers + passengers) under this partner
      const allMembers = await prisma.user.findMany({
        where: { partnerId },
        select: { id: true, isOnline: true, role: true }
      });

      const totalMembers = allMembers.length;
      const totalDrivers = allMembers.filter(m => m.role === 'DRIVER').length;
      const totalPassengers = allMembers.filter(m => m.role === 'PASSENGER').length;
      const activeDrivers = allMembers.filter(m => m.role === 'DRIVER' && m.isOnline).length;
      const driverIds = allMembers.filter(m => m.role === 'DRIVER').map(m => m.id);

      // 2. Fetch completed trips for commission calculation
      const trips = await prisma.trip.findMany({
        where: {
          driverId: { in: driverIds },
          status: 'COMPLETED'
        },
        select: { fare: true }
      });

      // Calculate total earnings (partner commission)
      let totalEarnings = 0;
      let totalPlatformFee = 0;
      trips.forEach(trip => {
        let commission = 0;
        if (partner.feeType === 'percentage') {
          commission = trip.fare * partner.feeValue;
        } else {
          commission = Math.min(trip.fare, partner.feeValue);
        }
        totalEarnings += commission;

        // Calculate platform fee (what Ryda charges the partner)
        if (partner.platformFeeType === 'percentage') {
          totalPlatformFee += commission * partner.platformFeeValue;
        } else {
          totalPlatformFee += Math.min(commission, partner.platformFeeValue);
        }
      });

      const netEarnings = totalEarnings - totalPlatformFee;

      res.json({
        totalMembers,
        totalDrivers,
        totalPassengers,
        activeDrivers,
        totalTrips: trips.length,
        totalEarnings: Number(totalEarnings.toFixed(2)),
        totalPlatformFee: Number(totalPlatformFee.toFixed(2)),
        netEarnings: Number(netEarnings.toFixed(2)),
        feeType: partner.feeType,
        feeValue: partner.feeValue,
        platformFeeType: partner.platformFeeType,
        platformFeeValue: partner.platformFeeValue,
        partnerCode: partner.partnerCode
      });
    } catch (error) {
      console.error('Partner Stats Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Drivers List ──
  async getDrivers(req: Request, res: Response) {
    try {
      // @ts-ignore
      const partnerId = req.user.id;

      const drivers = await prisma.user.findMany({
        where: { partnerId, role: 'DRIVER' },
        include: {
          tripsAsDriver: {
            where: { status: 'COMPLETED' },
            select: { fare: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Format drivers and compute their stats
      const formattedDrivers = drivers.map(driver => {
        const completedTrips = driver.tripsAsDriver;
        const totalEarnings = completedTrips.reduce((sum, trip) => sum + trip.fare, 0);

        return {
          id: driver.id,
          first_name: driver.first_name,
          last_name: driver.last_name,
          email: driver.email,
          phone: driver.phone,
          rating: driver.rating,
          isOnline: driver.isOnline,
          isVerified: driver.isVerified,
          isVehicleVerified: driver.isVehicleVerified,
          walletBalance: driver.walletBalance,
          createdAt: driver.createdAt,
          vehicles: driver.vehicles,
          totalRides: completedTrips.length,
          totalEarnings: Number(totalEarnings.toFixed(2))
        };
      });

      res.json(formattedDrivers);
    } catch (error) {
      console.error('Partner Drivers Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Trip History ──
  async getTrips(req: Request, res: Response) {
    try {
      // @ts-ignore
      const partner = req.user.partner;
      const partnerId = partner.id;

      const trips = await prisma.trip.findMany({
        where: {
          driver: { partnerId }
        },
        include: {
          driver: {
            select: { first_name: true, last_name: true, phone: true }
          },
          passenger: {
            select: { first_name: true, last_name: true, phone: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const formattedTrips = trips.map(trip => {
        let commission = 0;
        if (trip.status === 'COMPLETED') {
          if (partner.feeType === 'percentage') {
            commission = trip.fare * partner.feeValue;
          } else {
            commission = Math.min(trip.fare, partner.feeValue);
          }
        }

        return {
          id: trip.id,
          driverName: trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name}` : 'Unknown Driver',
          passengerName: `${trip.passenger.first_name} ${trip.passenger.last_name}`,
          originAddress: trip.originAddress,
          destAddress: trip.destAddress,
          fare: trip.fare,
          status: trip.status,
          paymentMethod: trip.paymentMethod,
          createdAt: trip.createdAt,
          commission: Number(commission.toFixed(2))
        };
      });

      res.json(formattedTrips);
    } catch (error) {
      console.error('Partner Trips Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Passengers ──
  async getPassengers(req: Request, res: Response) {
    try {
      // @ts-ignore
      const partner = req.user.partner;
      const partnerId = partner.id;

      const driverIds = (await prisma.user.findMany({
        where: { partnerId, role: 'DRIVER' },
        select: { id: true }
      })).map(d => d.id);

      const trips = await prisma.trip.findMany({
        where: { driverId: { in: driverIds } },
        select: {
          fare: true,
          status: true,
          createdAt: true,
          passenger: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              phone: true,
              rating: true,
              createdAt: true
            }
          }
        }
      });

      // Aggregate per unique passenger
      const passengerMap = new Map<string, any>();
      for (const trip of trips) {
        const p = trip.passenger;
        if (!p) continue;
        if (!passengerMap.has(p.id)) {
          passengerMap.set(p.id, {
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            email: p.email,
            phone: p.phone,
            rating: p.rating,
            createdAt: p.createdAt,
            totalTrips: 0,
            completedTrips: 0,
            totalSpent: 0
          });
        }
        const entry = passengerMap.get(p.id);
        entry.totalTrips += 1;
        if (trip.status === 'COMPLETED') {
          entry.completedTrips += 1;
          entry.totalSpent += trip.fare;
        }
      }

      res.json(Array.from(passengerMap.values()));
    } catch (error) {
      console.error('Partner Passengers Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Remove Driver from Fleet ──
  async removeDriver(req: Request, res: Response) {
    try {
      // @ts-ignore
      const partnerId = req.user.id;
      const { driverId } = req.params;

      const driver = await prisma.user.findFirst({
        where: { id: driverId, partnerId, role: 'DRIVER' }
      });

      if (!driver) {
        return res.status(404).json({ message: 'Driver not found in your fleet' });
      }

      await prisma.user.update({
        where: { id: driverId },
        data: { partnerId: null }
      });

      res.json({ message: 'Driver removed from your fleet' });
    } catch (error) {
      console.error('Partner Remove Driver Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Add Driver by Email ──
  async addDriver(req: Request, res: Response) {
    try {
      // @ts-ignore
      const partnerId = req.user.id;
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Driver email is required' });
      }

      const driver = await prisma.user.findFirst({
        where: { email: email.toLowerCase(), role: 'DRIVER' }
      });

      if (!driver) {
        return res.status(404).json({ message: 'No driver account found with that email' });
      }

      if (driver.partnerId) {
        return res.status(409).json({ message: 'This driver is already assigned to a partner' });
      }

      await prisma.user.update({
        where: { id: driver.id },
        data: { partnerId }
      });

      res.json({ message: 'Driver added to your fleet successfully' });
    } catch (error) {
      console.error('Partner Add Driver Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Update Partner Code ──
  async updateCode(req: Request, res: Response) {
    try {
      // @ts-ignore
      const partnerId = req.user.id;
      const { partnerCode } = req.body;

      if (!partnerCode || typeof partnerCode !== 'string') {
        return res.status(400).json({ message: 'Partner code is required' });
      }

      if (partnerCode.length !== 8) {
        return res.status(400).json({ message: 'Partner code must be exactly 8 characters' });
      }

      const existing = await prisma.partner.findFirst({
        where: { partnerCode, NOT: { id: partnerId } }
      });

      if (existing) {
        return res.status(409).json({ message: 'That partner code is already taken. Please choose another.' });
      }

      const updated = await prisma.partner.update({
        where: { id: partnerId },
        data: { partnerCode }
      });

      res.json({ message: 'Partner code updated successfully', partnerCode: updated.partnerCode });
    } catch (error) {
      console.error('Partner Update Code Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Send Push Notification to Fleet ──
  async sendNotification(req: Request, res: Response) {
    try {
      // @ts-ignore
      const partnerId = req.user.partner.id;
      const { title, body, target, screen } = req.body;

      if (!title || !body) {
        return res.status(400).json({ message: 'Title and body are required' });
      }

      const driverIds = (await prisma.user.findMany({
        where: { partnerId, role: 'DRIVER' },
        select: { id: true }
      })).map(d => d.id);

      if (driverIds.length === 0) {
        return res.status(404).json({ message: 'No drivers in your fleet' });
      }

      // target: 'DRIVERS' | 'PASSENGERS' | 'ALL'
      let users: { id: string; pushToken: string | null }[] = [];

      if (target === 'PASSENGERS') {
        // Get unique passenger IDs from trips by fleet drivers
        const trips = await prisma.trip.findMany({
          where: { driverId: { in: driverIds } },
          select: { passengerId: true },
          distinct: ['passengerId']
        });
        const passengerIds = trips.map(t => t.passengerId);
        users = await prisma.user.findMany({
          where: { id: { in: passengerIds }, pushToken: { not: null } },
          select: { id: true, pushToken: true }
        });
      } else if (target === 'DRIVERS') {
        users = await prisma.user.findMany({
          where: { id: { in: driverIds }, pushToken: { not: null } },
          select: { id: true, pushToken: true }
        });
      } else {
        // ALL — drivers + passengers
        const trips = await prisma.trip.findMany({
          where: { driverId: { in: driverIds } },
          select: { passengerId: true },
          distinct: ['passengerId']
        });
        const passengerIds = trips.map(t => t.passengerId);
        const allIds = [...new Set([...driverIds, ...passengerIds])];
        users = await prisma.user.findMany({
          where: { id: { in: allIds }, pushToken: { not: null } },
          select: { id: true, pushToken: true }
        });
      }

      const tokens = users.map(u => u.pushToken).filter(Boolean) as string[];

      if (tokens.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < tokens.length; i += 100) chunks.push(tokens.slice(i, i + 100));
        await Promise.allSettled(
          chunks.map(chunk =>
            fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify(chunk.map(token => ({
                to: token, title, body,
                data: screen ? { screen } : {},
                sound: 'default', priority: 'high',
              })))
            })
          )
        );
      }

      // Save as in-app notifications
      await prisma.notification.createMany({
        data: users.map(u => ({ userId: u.id, title, message: body, type: 'INFO' }))
      });

      res.json({ message: `Notification sent to ${users.length} user(s)` });
    } catch (error) {
      console.error('Partner Send Notification Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Transactions ──
  async getTransactions(req: Request, res: Response) {
    try {
      // @ts-ignore
      const partnerId = req.user.partner.id;

      const driverIds = (await prisma.user.findMany({
        where: { partnerId, role: 'DRIVER' },
        select: { id: true }
      })).map(d => d.id);

      const transactions = await prisma.transaction.findMany({
        where: { userId: { in: driverIds } },
        include: {
          user: { select: { first_name: true, last_name: true, email: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(transactions);
    } catch (error) {
      console.error('Partner Transactions Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ── Update Fee Settings ──
  async updateSettings(req: Request, res: Response) {
    try {
      // @ts-ignore
      const partnerId = req.user.id;
      const { feeType, feeValue } = req.body;

      if (!feeType || !['percentage', 'flat'].includes(feeType)) {
        return res.status(400).json({ message: 'Invalid fee type. Must be percentage or flat.' });
      }

      if (feeValue === undefined || typeof feeValue !== 'number' || feeValue < 0) {
        return res.status(400).json({ message: 'Invalid fee value. Must be a positive number.' });
      }

      // Percentage fee must be between 0 and 1 (e.g. 0.15 for 15%)
      if (feeType === 'percentage' && feeValue > 1) {
        return res.status(400).json({ message: 'Percentage fee rate must be between 0.0 and 1.0 (e.g. 0.15 for 15%)' });
      }

      const updatedPartner = await prisma.partner.update({
        where: { id: partnerId },
        data: { feeType, feeValue }
      });

      res.json({
        message: 'Settings updated successfully',
        partner: {
          id: updatedPartner.id,
          name: updatedPartner.name,
          email: updatedPartner.email,
          partnerCode: updatedPartner.partnerCode,
          feeType: updatedPartner.feeType,
          feeValue: updatedPartner.feeValue,
          platformFeeType: updatedPartner.platformFeeType,
          platformFeeValue: updatedPartner.platformFeeValue
        }
      });
    } catch (error) {
      console.error('Partner Update Settings Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new PartnerController();
