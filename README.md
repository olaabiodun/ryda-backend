# Ryda Backend 🚀

Advanced Node.js backend for Ryda ride-sharing app. Built with focus on real-time performance, scalability, and security.

## Tech Stack 🛠️

- **Node.js & Express**: Core API framework.
- **TypeScript**: Typed logic for better maintainability.
- **PostgreSQL**: Relational database for persistent storage (Users, Trips).
- **Prisma**: Type-safe ORM for database interaction.
- **Redis**: High-speed caching and real-time driver location tracking.
- **Socket.io**: Real-time bidirectional communication for trip matching and status updates.
- **JWT**: Secure JSON Web Token authentication.
- **Bcrypt**: Industrial-grade password hashing.

## Key Features ✨

- **User & Driver Management**: Seamless registration and role-based authentication.
- **Real-time Trip Matching**: Passengers place requests, and nearby drivers receive them instantly.
- **Live Tracking**: Synchronized location updates between drivers and passengers.
- **Trip Lifecycle**: Real-time status updates (Requested -> Accepted -> Arrived -> Started -> Completed).
- **Driver Earnings**: Persistent trip history for earnings tracking.
- **Wallet System**: Ready-to-use architecture for digital wallets and payments.

## Installation & Setup ⚙️

1. **Clone the project & install dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Environment Configuration**:
   Create a `.env` file in the root with your credentials:
   ```env
   PORT=3000
   DATABASE_URL="postgresql://user:password@localhost:5432/ryda_db"
   REDIS_URL="redis://localhost:6379"
   JWT_SECRET="your_secret_key"
   ```

3. **Database Migration**:
   ```bash
   npx prisma migrate dev
   ```

4. **Run the Server**:
   ```bash
   # For development (with hot reload)
   npm run dev

   # For production
   npm run build
   npm start
   ```

## API Documentation 📚

### Auth Routes (`/api/auth`)
- `POST /register`: Create a new user (Passenger or Driver).
- `POST /login`: Authenticate and receive a JWT.
- `GET /profile`: Get the current authenticated user's profile.

### Trip Routes (`/api/trips`)
- `POST /`: Create a new trip request (Passenger).
- `GET /`: Get my trip history.
- `GET /:id`: Get specific trip details.
- `PATCH /:id/status`: Update trip status (Accept, Start, End).

## Real-time Events (Sockets) ⚡

- `join`: Join roles (`DRIVER` room or user-specific room).
- `update_location`: Driver sends current coordinates.
- `new_trip_request`: Server broadcasts request to nearby drivers.
- `trip_accepted`: Passenger is notified when a driver takes the trip.
- `status_updated`: Real-time updates on trip progression.
