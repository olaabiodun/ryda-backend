import { Request, Response } from 'express';
import prisma from '../config/prisma';

class NotificationController {
  async getAll(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const notifications = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
      
      // Seed if empty (first time)
      if (notifications.length === 0) {
        const defaultNotifs = [
          { userId, title: 'Welcome to Ryda! 🚀', message: 'Enjoy your first ride with a 20% discount.', type: 'PROMO' },
          { userId, title: 'Security Tip 🛡️', message: 'Never share your OTP with anyone.', type: 'INFO' },
        ];
        await prisma.notification.createMany({ data: defaultNotifs });
        const newNotifs = await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }});
        return res.json(newNotifs);
      }

      res.json(notifications);
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async markAsRead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updated = await prisma.notification.update({
        where: { id },
        data: { isRead: true }
      });
      res.json(updated);
    } catch (error) {
      console.error('Mark as read error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async markAllAsRead(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true }
      });
      res.json({ success: true });
    } catch (error) {
      console.error('Mark all ready error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new NotificationController();
