import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { calculateFare, RIDE_TYPES } from '../utils/fare';

class TripController {
  async createTrip(req: Request, res: Response) {
    try {
        // @ts-ignore
      const passengerId = req.user.id;
      const { origin, destination, rideType, distance = 4, paymentMethod = 'wallet' } = req.body;

      // Verify passenger balance before creating request
      const passenger = await prisma.user.findUnique({ where: { id: passengerId } });
      const calculatedFare = calculateFare({
          rideType: (rideType as any) || 'eco',
          distanceKm: distance // frontend should now pass km
      });

      // Temporary Bypass for user sanity - always let the trip proceed for now
      // if (passenger && passenger.walletBalance < calculatedFare) {
      //    return res.status(400).json({ message: 'Insufficient wallet balance' });
      // }

      const trip = await prisma.trip.create({
        data: {
          passengerId,
          originAddress: origin.address,
          originLat: origin.lat,
          originLng: origin.lng,
          destAddress: destination.address,
          destLat: destination.lat,
          destLng: destination.lng,
          fare: calculatedFare,
          distance: distance,
          status: 'REQUESTED',
          paymentMethod
        }
      });

      res.status(201).json(trip);
    } catch (error) {
      console.error('Create trip error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getTrips(req: Request, res: Response) {
    try {
        // @ts-ignore
      const userId = req.user.id;
      // @ts-ignore
      const userRole = req.user.role;

      const trips = await prisma.trip.findMany({
        where: userRole === 'DRIVER' ? { driverId: userId } : { passengerId: userId },
        include: { passenger: true, driver: true },
        orderBy: { createdAt: 'desc' }
      });

      res.json(trips);
    } catch (error) {
      console.error('Get trips error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getAvailableTrips(req: Request, res: Response) {
    try {
      const trips = await prisma.trip.findMany({
        where: { status: 'REQUESTED', driverId: null },
        include: { passenger: true },
        orderBy: { createdAt: 'desc' }
      });
      res.json(trips);
    } catch (error) {
      console.error('Get available trips error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getTripDetails(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const trip = await prisma.trip.findUnique({
        where: { id },
        include: { passenger: true, driver: true }
      });

      if (!trip) {
        return res.status(404).json({ message: 'Trip not found' });
      }

      res.json(trip);
    } catch (error) {
      console.error('Trip details error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updateTripStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, driverId } = req.body;
      
      console.log(`Update status request: ID=${id}, Status=${status}`);

      // Handle trip completion financial deduction
      if (status === 'COMPLETED') {
        const trip = await prisma.trip.findUnique({
           where: { id },
           include: { passenger: true, driver: true }
        });

        if (trip && trip.status !== 'COMPLETED') {
          const isCash = (trip as any).paymentMethod === 'cash';

          // Run updates sequentially instead of in a transaction to support MongoDB Atlas shared tier
          // 1. Passenger updates
          await prisma.user.update({
            where: { id: trip.passengerId },
            data: { 
              walletBalance: isCash ? undefined : { decrement: trip.fare },
              rides: { increment: 1 }
            }
          });
          // 2. Driver updates
          await prisma.user.update({
            where: { id: trip.driverId! },
            data: { 
              walletBalance: isCash ? undefined : { increment: trip.fare * 0.8 },
              rides: { increment: 1 }
            }
          });
          // 3. Finalize status
          await prisma.trip.update({
            where: { id },
            data: { status }
          });
          return res.json({ ...trip, status: 'COMPLETED' });
        }
      }

      const trip = await prisma.trip.update({
        where: { id },
        data: {
          status,
          driverId: driverId || undefined
        }
      });

      // Notify passenger of status change
      const io = req.app.get('io');
      if (io && trip.passengerId) {
        io.to(trip.passengerId).emit('status_updated', { tripId: trip.id, status });
      }

      res.json(trip);
    } catch (error) {
      console.error('Update trip status error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new TripController();
