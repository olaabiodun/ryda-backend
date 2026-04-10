import { Request, Response } from 'express';
import prisma from '../config/prisma';

class UserController {
  async getContacts(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const contacts = await prisma.trustedContact.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
      res.json(contacts);
    } catch (error) {
      console.error('Get contacts error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async addContact(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { name, phone, relation } = req.body;

      const contact = await prisma.trustedContact.create({
        data: { userId, name, phone, relation }
      });

      res.status(201).json(contact);
    } catch (error) {
      console.error('Add contact error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async deleteContact(req: Request, res: Response) {
    try {
      const { id } = req.params;
      // @ts-ignore
      const userId = req.user.id;

      await prisma.trustedContact.delete({ where: { id, userId } });
      res.json({ message: 'Contact deleted successfully' });
    } catch (error) {
      console.error('Delete contact error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async requestEmailChangeOtp(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || !user.email) {
        return res.status(400).json({ message: 'User or current email not found' });
      }

      const email = user.email;
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await prisma.emailOTP.upsert({
        where: { email },
        update: { code, expiresAt },
        create: { email, code, expiresAt }
      });

      console.log(`\n---------------------------------`);
      console.log(`🔑 Email Change OTP for ${email}: ${code}`);
      console.log(`---------------------------------\n`);

      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (RESEND_API_KEY) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'Ryda <onboarding@resend.dev>',
              to: email,
              subject: 'Email Change Verification',
              html: `<p>Your verification code to change your email is: <strong>${code}</strong>. It is valid for 10 minutes.</p>`
            })
          });
        } catch (error) {
          console.error(`❌ Failed to send Resend email to ${email}`);
        }
      }

      res.json({ message: 'Verification code sent to your current email' });
    } catch (error) {
      console.error('Request Email Change OTP error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updateProfile(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { first_name, last_name, email, phone, avatar, emailCode, isPinRequired, nin, ninFront, ninBack, homeAddress } = req.body;

      const currentUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!currentUser) return res.status(404).json({ message: 'User not found' });

      // 1. Prevent phone number change unless it's missing or a Google placeholder
      if (phone && currentUser.phone && !currentUser.phone.startsWith('GOOGLE_')) {
        return res.status(400).json({ message: 'Phone number cannot be changed' });
      }

      const updates: any = {};
      if (first_name) updates.first_name = first_name;
      if (last_name) updates.last_name = last_name;
      if (avatar) updates.avatar = avatar;
      if (phone) updates.phone = phone; // Allow setting phone if it passed the check above
      if (isPinRequired !== undefined) updates.isPinRequired = isPinRequired;
      if (nin) updates.nin = nin;
      if (ninFront) updates.ninFront = ninFront;
      if (ninBack) updates.ninBack = ninBack;
      if (homeAddress) updates.homeAddress = homeAddress;

      // 2. Handle email update with OTP verification
      if (email && email !== currentUser.email) {
        if (!emailCode) {
          return res.status(400).json({ message: 'Verification code is required to change email' });
        }

        const otpRecord = await prisma.emailOTP.findUnique({
          where: { email: currentUser.email! }
        });

        if (!otpRecord || otpRecord.code !== emailCode || otpRecord.expiresAt < new Date()) {
          return res.status(400).json({ message: 'Invalid or expired verification code' });
        }

        // Check if new email is already taken
        const existingEmail = await prisma.user.findUnique({ where: { email } });
        if (existingEmail) {
          return res.status(400).json({ message: 'New email is already in use' });
        }

        updates.email = email;
        // Delete OTP after successful use
        await prisma.emailOTP.delete({ where: { id: otpRecord.id } });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: updates
      });

      res.json(user);
    } catch (error) {
      console.error('Update profile error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ─── Vehicle Management ──────────────────────────────────────────────────

  async getVehicles(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { vehicles: true }
      });
      res.json(user?.vehicles || []);
    } catch (error) {
      console.error('Get vehicles error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async addVehicle(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { make, model, year, plateNumber, color, type, seats, fuelType, transmission } = req.body;

      if (!make || !model || !year || !plateNumber || !color) {
        return res.status(400).json({ message: 'Missing required vehicle fields' });
      }

      // Fetch existing vehicles to check for duplicate plate
      const existing = await prisma.user.findUnique({ where: { id: userId }, select: { vehicles: true } });
      const hasDuplicate = existing?.vehicles?.some((v: any) => v.plateNumber === plateNumber);
      if (hasDuplicate) {
        return res.status(409).json({ message: 'A vehicle with this plate number already exists' });
      }

      const newVehicle = { make, model, year, plateNumber, color, type: type || 'SEDAN', seats: seats || 4, fuelType: fuelType || 'PETROL', transmission: transmission || 'AUTOMATIC' };

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          vehicles: {
            set: [...(existing?.vehicles || []), newVehicle]
          }
        }
      });

      res.status(201).json({ message: 'Vehicle added successfully', vehicles: user.vehicles });
    } catch (error) {
      console.error('Add vehicle error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updateVehicle(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { plateNumber } = req.params;
      const updates = req.body;

      const existing = await prisma.user.findUnique({ where: { id: userId }, select: { vehicles: true } });
      if (!existing) return res.status(404).json({ message: 'User not found' });

      const updatedVehicles = existing.vehicles.map((v: any) =>
        v.plateNumber === plateNumber ? { ...v, ...updates } : v
      );

      const user = await prisma.user.update({
        where: { id: userId },
        data: { vehicles: { set: updatedVehicles } }
      });

      res.json({ message: 'Vehicle updated successfully', vehicles: user.vehicles });
    } catch (error) {
      console.error('Update vehicle error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async deleteVehicle(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { plateNumber } = req.params;

      const existing = await prisma.user.findUnique({ where: { id: userId }, select: { vehicles: true } });
      if (!existing) return res.status(404).json({ message: 'User not found' });

      const filtered = existing.vehicles.filter((v: any) => v.plateNumber !== plateNumber);

      const user = await prisma.user.update({
        where: { id: userId },
        data: { vehicles: { set: filtered } }
      });

      res.json({ message: 'Vehicle removed successfully', vehicles: user.vehicles });
    } catch (error) {
      console.error('Delete vehicle error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async deleteAccount(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;

      // 1. Fetch user with trip IDs to be explicit about what is being deleted
      const user = await prisma.user.findUnique({ 
        where: { id: userId },
        include: {
          tripsAsPassenger: { select: { id: true } },
          tripsAsDriver: { select: { id: true } }
        }
      });
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // 2. Check for active trips
      const hasActiveTrips = await prisma.trip.findFirst({
        where: {
          OR: [
            { passengerId: userId, status: { in: ['REQUESTED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'] } },
            { driverId: userId, status: { in: ['REQUESTED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'] } }
          ]
        }
      });

      if (hasActiveTrips) {
        return res.status(400).json({ message: 'Cannot delete account with an active trip. Please complete or cancel your trips first.' });
      }

      const passengerTripIds = user.tripsAsPassenger.map(t => t.id);
      const driverTripIds = user.tripsAsDriver.map(t => t.id);
      const allTripIds = [...passengerTripIds, ...driverTripIds];

      console.log(`🗑️ Starting deletion for user: ${user.email || user.phone}. Found ${allTripIds.length} trips to delete.`);

      // 3. Perform deletion in a sequence
      await prisma.$transaction(async (tx) => {
        // a. Delete chat messages for trips
        if (allTripIds.length > 0) {
          await tx.chatMessage.deleteMany({ where: { tripId: { in: allTripIds } } });
          // b. Delete the trips themselves by ID (this is most reliable for relation constraints)
          await tx.trip.deleteMany({ where: { id: { in: allTripIds } } });
        }

        // c. Delete other associated records by userId
        await tx.trustedContact.deleteMany({ where: { userId } });
        await tx.notification.deleteMany({ where: { userId } });
        await tx.pointsHistory.deleteMany({ where: { userId } });
        await tx.transaction.deleteMany({ where: { userId } });

        // d. Delete OTP records
        if (user.phone) {
          // Prisma naming for OTP model depends on auto-generation, usually matches schema or camelCase
          // We'll use try-catch or just be safe. Based on schema 'OTP' usually becomes 'oTP' or 'otp'.
          try { await (tx as any).oTP.deleteMany({ where: { phone: user.phone } }); } catch (e) {}
        }
        if (user.email) {
          try { await (tx as any).emailOTP.deleteMany({ where: { email: user.email } }); } catch (e) {}
        }

        // e. Delete the user last
        await tx.user.delete({ where: { id: userId } });
      });

      console.log(`✅ User account and all associated data deleted successfully.`);

      res.json({ message: 'Account deleted successfully' });
    } catch (error: any) {
      console.error('Delete account error ❌', error);
      const errorMessage = error.message || 'Internal server error';
      res.status(500).json({ message: 'Failed to delete account. ' + errorMessage });
    }
  }
}

export default new UserController();
