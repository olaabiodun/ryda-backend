import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { configureTripSockets } from './sockets/tripSocket';

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Attach io to app for use in controllers
app.set('io', io);

// Setup sockets
configureTripSockets(io);

export default server;
