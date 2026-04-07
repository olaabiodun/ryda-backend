import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { calculateFare } from '../utils/fare';

class TripController {
  async createTrip(req: Request, res: Response) {
    try {
        // @ts-ignore
      const passengerId = req.user.id;
      const { origin, destination, rideType, distance = 4, paymentMethod = 'wallet' } = req.body;

      // Verify passenger balance before creating request
      const passenger = await prisma.user.findUnique({ where: { id: passengerId } });
      console.log(`[DEBUG] Passenger ${passengerId} isPinRequired: ${passenger?.isPinRequired}`);
      const calculatedFare = await calculateFare({
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
          paymentMethod,
          isPinRequired: passenger?.isPinRequired ?? true
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
      // @ts-ignore
      const driverId = req.user.id;
      const driver = await prisma.user.findUnique({ where: { id: driverId } });
      
      const debt = driver?.walletBalance || 0;
      const DEBT_BLOCK_LIMIT = -5000;
      const CASH_BLOCK_LIMIT = -2000;

      if (debt < DEBT_BLOCK_LIMIT) {
        return res.json([]); // Completely blocked until debt is settled
      }

      const trips = await prisma.trip.findMany({
        where: { 
          status: 'REQUESTED', 
          driverId: null,
          paymentMethod: debt < CASH_BLOCK_LIMIT ? 'wallet' : undefined
        },
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
  
  async getActiveTrip(req: Request, res: Response) {
    try {
        // @ts-ignore
      const userId = req.user.id;
        // @ts-ignore
      const userRole = req.user.role;
      
      const trip = await prisma.trip.findFirst({
        where: {
          OR: [
            { passengerId: userId },
            { driverId: userId }
          ],
          status: {
            in: ['REQUESTED', 'ACCEPTED', 'ARRIVED', 'STARTED']
          }
        },
        include: { passenger: true, driver: true },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json(trip || null);
    } catch (error) {
       console.error('Get active trip error ❌', error);
       res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updateTripStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, driverId, pin: providedPin } = req.body;
      
      console.log(`Update status request: ID=${id}, Status=${status}`);

      // Handle PIN verification for starting a ride
      if (status === 'STARTED') {
        const trip = await prisma.trip.findUnique({ where: { id } });
        if (trip && trip.status === 'ARRIVED') {
            // Note: If isPinRequired is false, we allow it. Otherwise check the PIN.
            if (trip.isPinRequired) {
              if (!providedPin || providedPin !== (trip as any).pin) {
                return res.status(400).json({ message: 'Invalid or missing ride PIN. Please ask the passenger for the correct code.' });
              }
            }
        }
      }

      // Handle trip completion financial deduction
      if (status === 'COMPLETED') {
        const { amountCollected } = req.body;
        const trip = await prisma.trip.findUnique({
           where: { id },
           include: { passenger: true, driver: true }
        });

        if (trip && trip.status !== 'COMPLETED') {
          const isCash = (trip as any).paymentMethod?.toLowerCase() === 'cash';
          const fare = trip.fare;
          const commissionRate = 0.2;
          const commission = fare * commissionRate;
          const driverId = trip.driverId!;

          if (isCash) {
            // Cash Trip Logic:
            // 1. Driver collected X. Platform takes Y commission digitally.
            // 2. If X > fare, difference is credited to passenger wallet.
            const extraToPassenger = amountCollected ? Math.max(0, amountCollected - fare) : 0;
            const driverDeduction = commission + extraToPassenger;

            // Update Passenger: Credit extra amount if any
            await prisma.user.update({
              where: { id: trip.passengerId },
              data: { 
                walletBalance: { increment: extraToPassenger },
                rides: { increment: 1 }
              }
            });

            // Update Driver: Deduct commission + extra (since they kept the physical cash)
            await prisma.user.update({
              where: { id: driverId },
              data: { 
                walletBalance: { decrement: driverDeduction },
                rides: { increment: 1 }
              }
            });

            // Create transactions
            await prisma.transaction.create({
              data: {
                userId: driverId,
                type: 'PLATFORM_FEE',
                amount: -commission,
                label: `Commission for Trip #${trip.id.substring(0, 8)}`
              }
            });

            if (extraToPassenger > 0) {
                await prisma.transaction.create({
                    data: {
                      userId: trip.passengerId,
                      type: 'OVERPAYMENT_CREDIT',
                      amount: extraToPassenger,
                      label: `Change from Trip #${trip.id.substring(0, 8)}`
                    }
                });
                await prisma.transaction.create({
                    data: {
                      userId: driverId,
                      type: 'CHANGE_DEDUCTION',
                      amount: -extraToPassenger,
                      label: `Change given to passenger for Trip #${trip.id.substring(0, 8)}`
                    }
                });
            }
          } else {
            // Wallet Trip Logic:
            // 1. Deduct full fare from passenger
            // 2. Credit fare - commission to driver
            await prisma.user.update({
              where: { id: trip.passengerId },
              data: { 
                walletBalance: { decrement: fare },
                rides: { increment: 1 }
              }
            });
            await prisma.user.update({
              where: { id: driverId },
              data: { 
                walletBalance: { increment: fare - commission },
                rides: { increment: 1 }
              }
            });

            // Record transaction
            await prisma.transaction.createMany({
                data: [
                    { userId: trip.passengerId, type: 'TRIP_PAYMENT', amount: -fare, label: `Trip #${trip.id.substring(0, 8)}` },
                    { userId: driverId, type: 'TRIP_EARNING', amount: fare - commission, label: `Earnings for Trip #${trip.id.substring(0, 8)}` }
                ]
            });
          }

          // Finalize status
          await prisma.trip.update({
            where: { id },
            data: { status }
          });
          return res.json({ ...trip, status: 'COMPLETED' });
        }
      }

      // Generate PIN ONLY if ride is being accepted for the first time AND pin is required
      const tripToUpdate = await prisma.trip.findUnique({ where: { id } });
      
      if (status === 'ACCEPTED' && driverId) {
        const driver = await prisma.user.findUnique({ where: { id: driverId as string } });
        const debt = driver?.walletBalance || 0;
        const isCash = (tripToUpdate as any)?.paymentMethod?.toLowerCase() === 'cash';
        
        if (debt < -5000) {
          return res.status(403).json({ message: 'Blocked: Please settle your platform debt to accept rides.' });
        }
        if (isCash && debt < -2000) {
          return res.status(403).json({ message: 'Blocked: Please settle your platform debt to accept more cash rides.' });
        }
      }

      console.log(`[DEBUG] Trip ${id} isPinRequired: ${tripToUpdate?.isPinRequired}`);
      const pin = (status === 'ACCEPTED' && tripToUpdate?.isPinRequired) 
        ? Math.floor(1000 + Math.random() * 9000).toString() 
        : undefined;

      const updateData: any = { status };
      if (driverId) updateData.driverId = driverId;
      if (pin) updateData.pin = pin;

      const trip = await prisma.trip.update({
        where: { id },
        data: updateData,
        include: { passenger: true, driver: true }
      });

      // Notify passenger and trip room of status change (include full trip data)
      const io = req.app.get('io');
      if (io && trip.passengerId) {
        io.to(trip.passengerId).emit('status_updated', trip);
        io.to(trip.id).emit('status_updated', trip);
      }

      res.json(trip);
    } catch (error) {
      console.error('Update trip status error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async confirmArrival(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const trip = await prisma.trip.update({
        where: { id },
        data: { isConfirmedByPassenger: true },
        include: { passenger: true, driver: true }
      });
      
      const io = req.app.get('io');
      if (io && trip.driverId) {
        io.to(trip.driverId).emit('arrival_confirmed', { tripId: trip.id });
        // Emit to the specific trip room to ensure all monitoring devices see the update
        io.to(trip.id).emit('status_updated', { tripId: trip.id, isConfirmedByPassenger: true });
      }

      res.json(trip);
    } catch (error) {
      console.error('Confirm arrival error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async rateTrip(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { rating, comment, role } = req.body;
      
      const updateData = role === 'DRIVER' ? { ratingByDriver: rating } : { ratingByPassenger: rating };
      
      const trip = await prisma.trip.update({
        where: { id },
        data: updateData,
        include: { passenger: true, driver: true }
      });

      // Update average rating for the target user
      const targetUserId = role === 'DRIVER' ? trip.passengerId : trip.driverId;
      if (targetUserId) {
        const allRatings = await prisma.trip.findMany({
          where: {
            OR: [
              { passengerId: targetUserId, ratingByDriver: { not: null } },
              { driverId: targetUserId, ratingByPassenger: { not: null } }
            ]
          },
          select: { ratingByDriver: true, ratingByPassenger: true, passengerId: true }
        });

        const sum = allRatings.reduce((acc, t) => {
          const r = t.passengerId === targetUserId ? t.ratingByDriver : t.ratingByPassenger;
          return acc + (r || 5);
        }, 0);
        const avg = sum / (allRatings.length || 1);

        await prisma.user.update({
          where: { id: targetUserId },
          data: { rating: parseFloat(avg.toFixed(1)) }
        });
      }

      res.json(trip);
    } catch (error) {
      console.error('Rate trip error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new TripController();
