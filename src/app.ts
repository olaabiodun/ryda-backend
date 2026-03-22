import express, { Express } from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import tripRoutes from './routes/trip.routes';
import userRoutes from './routes/user.routes';
import chatRoutes from './routes/chat.routes';

const app: Express = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/user', userRoutes);
app.use('/api/chat', chatRoutes);

app.get('/', (req, res) => {
  res.send('Ryda Backend is running 🚀');
});

export default app;
