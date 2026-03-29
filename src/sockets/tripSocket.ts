import { Server, Socket } from 'socket.io';
import redis from '../config/redis';
import prisma from '../config/prisma';

interface AuthSocket extends Socket {
  data: {
    userId?: string;
    role?: 'DRIVER' | 'PASSENGER';
  };
}

export const configureTripSockets = (io: Server) => {
  // Attach auth middleware FIRST
  io.use((socket: AuthSocket, next) => {
    const userId = socket.handshake.auth?.userId;
    const role = socket.handshake.auth?.role;

    if (!userId || !role) {
      return next(new Error('Unauthorized'));
    }

    socket.data.userId = userId;
    socket.data.role = role;

    next();
  });

  io.on('connection', (socket: AuthSocket) => {
    console.log('User connected:', socket.id, socket.data);

    const userId = socket.data.userId!;
    const role = socket.data.role!;

    // Auto join personal room
    socket.join(userId);

    if (role === 'DRIVER') {
      socket.join('drivers');
    }

    console.log(`User ${userId} joined as ${role}`);

    // ─────────────── LOCATION UPDATE ───────────────
    socket.on(
      'update_location',
      async (data: {
        lat: number;
        lng: number;
        speed?: number;
        heading?: number;
        tripId?: string;
      }) => {
        try {
          const driverId = socket.data.userId;

          if (!driverId) {
            console.error('Missing driverId from socket auth');
            return;
          }

          const { lat, lng, speed, heading, tripId } = data;

          // Redis fast store
          await redis.hset(
            'driver_locations',
            driverId,
            JSON.stringify({
              lat,
              lng,
              speed,
              heading,
              lastUpdate: Date.now(),
            })
          );

          // Prisma persistence
          await prisma.user.update({
            where: { id: driverId },
            data: {
              lastLocationLat: lat,
              lastLocationLng: lng,
              isOnline: true,
            },
          });

          // Broadcast to trip room
          if (tripId) {
            io.to(tripId).emit('driver_location_update', {
              driverId,
              lat,
              lng,
              speed,
              heading,
            });
          }
        } catch (error) {
          console.error('update_location error:', error);
        }
      }
    );

    // ─────────────── REQUEST TRIP ───────────────
    socket.on(
      'request_trip',
      async (data: {
        tripId: string;
        origin: any;
        destination: any;
        passengerId: string;
      }) => {
        try {
          const trip = await prisma.trip.findUnique({
            where: { id: data.tripId },
            include: { passenger: true },
          });

          if (trip) {
            io.to('drivers').emit('new_trip_request', trip);
          }
        } catch (error) {
          console.error('request_trip error:', error);
        }
      }
    );

    // ─────────────── ACCEPT TRIP ───────────────
    socket.on(
      'accept_trip',
      async (data: { tripId: string }) => {
        try {
          const driverId = socket.data.userId;

          if (!driverId) return;

          const pin = Math.floor(1000 + Math.random() * 9000).toString();

          const trip = await prisma.trip.update({
            where: { id: data.tripId },
            data: {
              driverId,
              status: 'ACCEPTED',
              pin,
            },
            include: { passenger: true, driver: true },
          });

          io.to(trip.id).emit('trip_accepted', trip);
          io.to(trip.passengerId).emit('trip_accepted', trip);

          console.log(`Trip ${trip.id} accepted by ${driverId}`);
        } catch (error) {
          console.error('accept_trip error:', error);
        }
      }
    );

    // ─────────────── UPDATE TRIP STATUS ───────────────
    socket.on(
      'update_trip_status',
      async (data: { tripId: string; status: string }) => {
        try {
          const trip = await prisma.trip.findUnique({
            where: { id: data.tripId },
          });

          if (!trip) return;

          const updatedTrip = await prisma.trip.update({
            where: { id: data.tripId },
            data: { status: data.status },
            include: { passenger: true, driver: true },
          });

          io.to(trip.id).emit('status_updated', updatedTrip);
          io.to(updatedTrip.passengerId).emit('status_updated', updatedTrip);
        } catch (error) {
          console.error('update_trip_status error:', error);
        }
      }
    );

    // ─────────────── CHAT ───────────────
    socket.on(
      'send_message',
      async (data: {
        receiverId: string;
        content: string;
        tripId?: string;
      }) => {
        try {
          const senderId = socket.data.userId;

          if (!senderId) return;

          const message = await prisma.chatMessage.create({
            data: {
              senderId,
              receiverId: data.receiverId,
              content: data.content,
              tripId: data.tripId,
            },
          });

          io.to(data.receiverId).emit('receive_message', message);
        } catch (error) {
          console.error('chat error:', error);
        }
      }
    );

    // ─────────────── DISCONNECT ───────────────
    socket.on('disconnect', async () => {
      try {
        const userId = socket.data.userId;

        if (!userId) return;

        await prisma.user.update({
          where: { id: userId },
          data: { isOnline: false },
        });

        console.log('User disconnected:', socket.id);
      } catch (error) {
        console.error('disconnect error:', error);
      }
    });
  });
};
