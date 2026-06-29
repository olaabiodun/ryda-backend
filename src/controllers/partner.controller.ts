import { Request, Response } from 'express';
import prisma from '../config/prisma';

class PartnerController {
  // ── Dashboard Stats ──
  async getStats(req: Request, res: Response) {
    try {
      // @ts-ignore
      const partner = req.user.partner;
      const partnerId = partner.id;

      // 1. Get total and online drivers
      const drivers = await prisma.user.findMany({
        where: { partnerId, role: 'DRIVER' },
        select: { id: true, isOnline: true }
      });

      const totalDrivers = drivers.length;
      const activeDrivers = drivers.filter(d => d.isOnline).length;
      const driverIds = drivers.map(d => d.id);

      // 2. Fetch completed trips for commission calculation
      const trips = await prisma.trip.findMany({
        where: {
          driverId: { in: driverIds },
          status: 'COMPLETED'
        },
        select: { fare: true }
      });

      // Calculate total earnings
      let totalEarnings = 0;
      trips.forEach(trip => {
        if (partner.feeType === 'percentage') {
          totalEarnings += trip.fare * partner.feeValue;
        } else {
          // Flat fee, limit to fare if fare is lower than flat fee
          totalEarnings += Math.min(trip.fare, partner.feeValue);
        }
      });

      res.json({
        totalDrivers,
        activeDrivers,
        totalTrips: trips.length,
        totalEarnings: Number(totalEarnings.toFixed(2)),
        feeType: partner.feeType,
        feeValue: partner.feeValue,
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
          feeValue: updatedPartner.feeValue
        }
      });
    } catch (error) {
      console.error('Partner Update Settings Error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new PartnerController();
