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
        data: {
          userId,
          name,
          phone,
          relation
        }
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

      await prisma.trustedContact.delete({
        where: { id, userId }
      });

      res.json({ message: 'Contact deleted successfully' });
    } catch (error) {
      console.error('Delete contact error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new UserController();
