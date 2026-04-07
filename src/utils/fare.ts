import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_TARIFFS: any = {
  lite:     { baseFare: 600,  perKm: 85,  perMin: 18, minFare: 700,  peakMultiplier: 1.20 },
  eco:      { baseFare: 900,  perKm: 110, perMin: 22, minFare: 1000, peakMultiplier: 1.25 },
  pool:     { baseFare: 700,  perKm: 90,  perMin: 18, minFare: 800,  peakMultiplier: 1.15 },
  premium:  { baseFare: 2000, perKm: 200, perMin: 45, minFare: 2500, peakMultiplier: 1.30 },
  xl:       { baseFare: 2800, perKm: 260, perMin: 55, minFare: 3200, peakMultiplier: 1.25 },
  business: { baseFare: 4000, perKm: 380, perMin: 80, minFare: 4500, peakMultiplier: 1.35 },
};

export const calculateFare = async (params: { rideType: string; distanceKm: number; durationMins?: number }): Promise<number> => {
  const duration = params.durationMins || (params.distanceKm * 2); // Roughly 2 mins per km if missing
  const hour = new Date().getHours();
  const isPeak = (hour >= 7 && hour < 9) || (hour >= 16 && hour < 20);

  try {
    const settings = await prisma.rideSettings.findUnique({
      where: { type: params.rideType }
    });

    if (settings) {
      const surge = isPeak ? settings.peakMultiplier : 1.0;
      const raw = (settings.baseFare + (params.distanceKm * settings.perKm) + (duration * settings.perMin)) * surge;
      return Math.max(settings.minFare, Math.floor(raw));
    }
  } catch (error) {
    console.warn('DB settings fetch failed, using fallbacks.');
  }

  const tariff = DEFAULT_TARIFFS[params.rideType] || DEFAULT_TARIFFS.eco;
  const surge = isPeak ? tariff.peakMultiplier : 1.0;
  const raw = (tariff.baseFare + (params.distanceKm * tariff.perKm) + (duration * tariff.perMin)) * surge;
  return Math.max(tariff.minFare, Math.floor(raw));
};
