import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getRideSettings = async (req: Request, res: Response) => {
  try {
    const settings = await prisma.rideSettings.findMany();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ride settings' });
  }
};

export const updateRideSetting = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { label, baseFare, perKm, perMin, minFare, peakMultiplier } = req.body;
  try {
    const updated = await prisma.rideSettings.update({
      where: { id },
      data: { label, baseFare, perKm, perMin, minFare, peakMultiplier },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update ride setting' });
  }
};

export const initializeSettings = async (req: Request, res: Response) => {
  const initialData = [
    { type: 'lite', label: 'Eco Lite', baseFare: 600, perKm: 85, perMin: 18, minFare: 700, peakMultiplier: 1.20 },
    { type: 'eco', label: 'Fast', baseFare: 900, perKm: 110, perMin: 22, minFare: 1000, peakMultiplier: 1.25 },
    { type: 'pool', label: 'Pool', baseFare: 700, perKm: 90, perMin: 18, minFare: 800, peakMultiplier: 1.15 },
    { type: 'premium', label: 'Premium', baseFare: 2000, perKm: 200, perMin: 45, minFare: 2500, peakMultiplier: 1.30 },
    { type: 'xl', label: 'Ryda XL', baseFare: 2800, perKm: 260, perMin: 55, minFare: 3200, peakMultiplier: 1.25 },
    { type: 'business', label: 'Business', baseFare: 4000, perKm: 380, perMin: 80, minFare: 4500, peakMultiplier: 1.35 },
  ];

  try {
    for (const data of initialData) {
      await prisma.rideSettings.upsert({
        where: { type: data.type },
        update: {},
        create: data,
      });
    }
    const settings = await prisma.rideSettings.findMany();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to initialize settings' });
  }
};
