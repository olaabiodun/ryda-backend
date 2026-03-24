import { Server, Socket } from 'socket.io';
import redis from '../config/redis';
import prisma from '../config/prisma';

export const configureTripSockets = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log('User connected: ', socket.id);

    // Join room based on user role
    socket.on('join', (data: { userId: string; role: string }) => {
      socket.join(data.userId); // Specific room for each user
      if (data.role === 'DRIVER') {
        socket.join('drivers');
      }
      console.log(`User ${data.userId} joined as ${data.role}`);
    });

    // Handle driver location updates
    socket.on('update_location', async (data: { driverId: string; lat: number; lng: number }) => {
      const { driverId, lat, lng } = data;
      
      // Update Redis for fast nearby lookup
      await redis.hset('driver_locations', driverId, JSON.stringify({ lat, lng, lastUpdate: Date.now() }));
      
      // Update Prisma for persistence
      await prisma.user.update({
        where: { id: driverId },
        data: { lastLocationLat: lat, lastLocationLng: lng, isOnline: true }
      });

      // console.log(`Driver ${driverId} location updated: ${lat}, ${lng}`);
    });

    // Handle new trip request (from passenger)
    socket.on('request_trip', async (data: { tripId: string; origin: any; destination: any; passengerId: string }) => {
      // Find nearby drivers (simplified logic: broadcast to all online drivers for now)
      // In production, use Redis GEO queries
      console.log(`New trip requested: ${data.tripId}`);
      try {
        const trip = await prisma.trip.findUnique({
          where: { id: data.tripId },
          include: { passenger: true }
        });
        if (trip) {
          io.to('drivers').emit('new_trip_request', trip);
        }
      } catch (error) {
        console.error('Error fetching trip for broadcast', error);
      }
    });

    // Handle driver accepting trip
    socket.on('accept_trip', async (data: { tripId: string; driverId: string }) => {
      const { tripId, driverId } = data;
      
      try {
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        const trip = await prisma.trip.update({
          where: { id: tripId },
          data: { driverId, status: 'ACCEPTED', pin },
          include: { passenger: true, driver: true }
        });

        // Notify passenger
        io.to(trip.passengerId).emit('trip_accepted', trip);
        console.log(`Trip ${tripId} accepted by driver ${driverId}`);
      } catch (error) {
        console.error('Accept trip error', error);
      }
    });

    // Handle trip status updates (e.g. Arrived, Started, Completed)
    socket.on('update_trip_status', async (data: { tripId: string; status: any }) => {
        const { tripId, status } = data;
        const trip = await prisma.trip.findUnique({ where: { id: tripId } });
        if (trip) {
            await prisma.trip.update({ where: { id: tripId }, data: { status } });
            io.to(trip.passengerId).emit('status_updated', { tripId, status });
        }
    });

    // ── Chat Messages ──
    socket.on('send_message', async (data: { senderId: string; receiverId: string; content: string; tripId?: string }) => {
      const { senderId, receiverId, content, tripId } = data;
      
      try {
        const newMessage = await prisma.chatMessage.create({
          data: { senderId, receiverId, content, tripId }
        });

        // Notify recipient in their personal room
        io.to(receiverId).emit('receive_message', newMessage);
      } catch (error) {
        console.error('Chat error:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected: ', socket.id);
    });
  });
};
