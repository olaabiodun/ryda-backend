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

  async updateProfile(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { first_name, last_name, email, phone, avatar } = req.body;

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(first_name && { first_name }),
          ...(last_name && { last_name }),
          ...(email && { email }),
          ...(phone && { phone }),
          ...(avatar && { avatar }),
        }
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
            push: newVehicle
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
}

export default new UserController();
