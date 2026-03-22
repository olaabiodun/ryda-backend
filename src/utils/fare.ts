export const RIDE_TYPES = {
  lite: {
    label: 'Eco Lite',
    base: 800,
    distRate: 100, // naira per km
    disc: 150,
  },
  eco: {
    label: 'Fast',
    base: 1200,
    distRate: 150,
    disc: 50,
  },
  pool: {
    label: 'Pool',
    base: 1000,
    distRate: 120,
    disc: 200,
  },
  premium: {
    label: 'Premium',
    base: 2500,
    distRate: 250,
    disc: 0,
  },
  xl: {
    label: 'Ryda XL',
    base: 3500,
    distRate: 350,
    disc: 0,
  },
  business: {
    label: 'Business',
    base: 4500,
    distRate: 500,
    disc: 0,
  }
};

export const calculateFare = (params: { rideType: keyof typeof RIDE_TYPES; distanceKm: number }): number => {
  const config = RIDE_TYPES[params.rideType] || RIDE_TYPES.eco; // Safety fallback
  const total = config.base + (params.distanceKm * config.distRate) - config.disc;
  return Math.max(0, Math.floor(total));
};
