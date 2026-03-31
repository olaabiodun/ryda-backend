import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 10)

  // Upsert Super Admin (will create if missing, or skip if exists)
  const admin = await prisma.user.upsert({
    where: { email: 'olaabiodun149@gmail.com' },
    update: { role: 'ADMIN' },
    create: {
      first_name: 'Ryda',
      last_name: 'Admin',
      email: 'olaabiodun149@gmail.com',
      phone: '08101491460', // Use a unique phone for your environment
      password: hashedPassword,
      role: 'ADMIN',
    },
  })

  console.log(`✅ Admin user ensured: ${admin.email}`);

  // Create sub-users (Passengers)
  const passenger1 = await prisma.user.upsert({
    where: { phone: '08000000001' },
    update: {},
    create: {
      first_name: 'Abiodun',
      last_name: 'Ola',
      email: 'abiodun@example.com',
      phone: '08000000001',
      password: hashedPassword,
      role: 'PASSENGER',
      walletBalance: 15000,
      tier: 'Gold',
      rides: 47,
      ryda_points: 1250
    },
  })

  // Create sub-users (Drivers)
  const driver1 = await prisma.user.upsert({
    where: { phone: '08000000002' },
    update: {},
    create: {
      first_name: 'Arjun',
      middle_name: 'Kumar',
      last_name: 'K.',
      email: 'arjun@example.com',
      phone: '08000000002',
      password: hashedPassword,
      role: 'DRIVER',
      isOnline: true,
      lastLocationLat: 7.3775,
      lastLocationLng: 3.9470,
      rating: 4.8,
      tier: 'Diamond',
      rides: 1540,
      ryda_points: 8900
    },
  });

  // Create additional sub-users (Passengers)
  const passenger2 = await prisma.user.upsert({
    where: { phone: '08000000003' },
    update: {},
    create: {
      first_name: 'Sarah',
      last_name: 'Conner',
      email: 'sarah@example.com',
      phone: '08000000003',
      password: hashedPassword,
      role: 'PASSENGER',
      walletBalance: 5000,
    },
  })

  // Create additional sub-users (Drivers)
  const driver2 = await prisma.user.upsert({
    where: { phone: '08000000004' },
    update: {},
    create: {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '08000000004',
      password: hashedPassword,
      role: 'DRIVER',
      isOnline: true,
      lastLocationLat: 7.37,
      lastLocationLng: 3.94,
    },
  });

  // Create Trips for Passenger
  const tripsData = [
    {
      passengerId: passenger1.id,
      driverId: driver1.id,
      originAddress: '500 Solar Ave, Bright Park',
      originLat: 7.3775,
      originLng: 3.9470,
      destAddress: 'Sango Area, Ibadan',
      destLat: 7.4200,
      destLng: 3.9000,
      status: 'COMPLETED',
      fare: 4520,
      distance: 8.5,
      duration: 15,
      ratingByPassenger: 5,
      createdAt: new Date('2026-03-21T14:45:00Z'),
    },
    {
      passengerId: passenger1.id,
      driverId: driver2.id,
      originAddress: 'Verdant Mall',
      originLat: 7.3500,
      originLng: 3.9200,
      destAddress: 'University of Ibadan',
      destLat: 7.4450,
      destLng: 3.9050,
      status: 'COMPLETED',
      fare: 2100,
      distance: 12.0,
      duration: 25,
      ratingByPassenger: 4,
      createdAt: new Date('2026-03-20T11:20:00Z'),
    },
    {
      passengerId: passenger1.id,
      driverId: driver1.id,
      originAddress: 'Bio District',
      originLat: 7.3800,
      originLng: 3.9500,
      destAddress: 'Ring Road, Ibadan',
      destLat: 7.3500,
      destLng: 3.8800,
      status: 'COMPLETED',
      fare: 5800,
      distance: 15.2,
      duration: 35,
      ratingByPassenger: 5,
      createdAt: new Date('2026-03-18T20:30:00Z'),
    },
    {
      passengerId: passenger1.id,
      driverId: driver2.id,
      originAddress: 'Railway Station',
      originLat: 7.3900,
      originLng: 3.9100,
      destAddress: 'Agbowo, Ibadan',
      destLat: 7.4350,
      destLng: 3.9150,
      status: 'COMPLETED',
      fare: 1500,
      distance: 6.8,
      duration: 20,
      ratingByPassenger: 4,
      createdAt: new Date('2026-03-15T17:15:00Z'),
    },
    {
      passengerId: passenger1.id,
      driverId: driver1.id,
      originAddress: 'Bodija Market',
      originLat: 7.4100,
      originLng: 3.9100,
      destAddress: 'Challenge, Ibadan',
      destLat: 7.3400,
      destLng: 3.8900,
      status: 'COMPLETED',
      fare: 3200,
      distance: 9.3,
      duration: 22,
      ratingByPassenger: 5,
      createdAt: new Date('2026-02-28T10:00:00Z'),
    },
  ];

  await prisma.trip.createMany({
    data: tripsData
  });

  console.log({ 
    passengers: [passenger1.first_name, passenger2.first_name], 
    drivers: [driver1.first_name, driver2.first_name], 
    tripsCount: tripsData.length 
  });
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
