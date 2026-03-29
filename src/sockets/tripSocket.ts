import { Server } from "socket.io";
import { createServer } from "http";
import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const redis = new Redis();

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});


// ======================
// AUTH MIDDLEWARE
// ======================
io.use((socket, next) => {
  try {
    const userId = socket.handshake.auth.userId;
    const role = socket.handshake.auth.role;

    if (!userId || !role) {
      return next(new Error("Unauthorized"));
    }

    socket.data.userId = userId;
    socket.data.role = role;

    next();
  } catch (err) {
    next(new Error("Unauthorized"));
  }
});


// ======================
// CONNECTION
// ======================
io.on("connection", (socket) => {
  console.log("User connected:", socket.data.userId);


  // ======================
  // JOIN TRIP ROOM
  // ======================
  socket.on("join_trip", ({ tripId }) => {
    if (!tripId) return;

    socket.join(`trip:${tripId}`);
    socket.data.tripId = tripId;
  });


  // ======================
  // START TRIP
  // ======================
  socket.on("start_trip", async ({ tripId }) => {
    const driverId = socket.data.userId;

    if (!tripId || !driverId) return;

    try {
      const trip = await prisma.trip.update({
        where: { id: tripId },
        data: {
          status: "in_progress",
          startedAt: new Date()
        }
      });

      io.to(`trip:${tripId}`).emit("trip_started", {
        tripId,
        status: trip.status
      });
    } catch (err) {
      console.error("start_trip error:", err);
    }
  });


  // ======================
  // UPDATE LOCATION (FIXED)
  // ======================
  socket.on("update_location", async (data) => {
    const userId = socket.data.userId;
    const role = socket.data.role;

    const { lat, lng, speed, heading, tripId } = data;

    if (!userId || !tripId) return;
    if (role !== "driver") return;

    try {
      await redis.hset(
        "driver_locations",
        userId,
        JSON.stringify({
          lat,
          lng,
          speed,
          heading,
          updatedAt: Date.now()
        })
      );

      io.to(`trip:${tripId}`).emit("driver_location_update", {
        driverId: userId,
        lat,
        lng,
        speed,
        heading
      });
    } catch (err) {
      console.error("update_location error:", err);
    }
  });


  // ======================
  // END TRIP (FULL FIX)
  // ======================
  socket.on("end_trip", async ({ tripId }) => {
    const driverId = socket.data.userId;

    if (!tripId || !driverId) return;

    try {
      const trip = await prisma.trip.findUnique({
        where: { id: tripId }
      });

      if (!trip) return;

      if (trip.driverId !== driverId) {
        console.error("Unauthorized end_trip attempt");
        return;
      }

      const updated = await prisma.trip.update({
        where: { id: tripId },
        data: {
          status: "completed",
          endedAt: new Date()
        }
      });

      await redis.hdel("driver_locations", driverId);

      io.to(`trip:${tripId}`).emit("trip_ended", {
        tripId,
        status: updated.status,
        endedAt: updated.endedAt
      });

      socket.leave(`trip:${tripId}`);
    } catch (err) {
      console.error("end_trip error:", err);
    }
  });


  // ======================
  // DISCONNECT
  // ======================
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.data.userId);
  });
});


// ======================
// START SERVER
// ======================
httpServer.listen(3000, () => {
  console.log("Socket server running on port 3000");
});
