import express, { Express } from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import tripRoutes from './routes/trip.routes';
import userRoutes from './routes/user.routes';
import chatRoutes from './routes/chat.routes';
import rewardsRoutes from './routes/rewards.routes';
import notificationRoutes from './routes/notification.routes';
import walletRoutes from './routes/wallet.routes';
import adminRoutes from './routes/admin.routes';
import settingsRoutes from './routes/settings';
import promoRoutes from './routes/promo.routes';


const app: Express = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/user', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/promo', promoRoutes);


app.get('/', (req, res) => {
  res.send('Ryda Backend is running 🚀');
});

export default app;
