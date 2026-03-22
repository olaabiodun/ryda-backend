import { Request, Response } from 'express';
import prisma from '../config/prisma';

export const getMessages = async (req: Request, res: Response) => {
  try {
    const { userId, otherId, tripId } = req.query;

    if (!userId || !otherId) {
      return res.status(400).json({ error: 'Missing userId or otherId' });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: String(userId), receiverId: String(otherId) },
          { senderId: String(otherId), receiverId: String(userId) },
        ],
        ...(tripId ? { tripId: String(tripId) } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const saveMessage = async (req: Request, res: Response) => {
  try {
    const { senderId, receiverId, content, tripId } = req.body;

    if (!senderId || !receiverId || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newMessage = await prisma.chatMessage.create({
      data: {
        senderId,
        receiverId,
        content,
        tripId: tripId || null,
      },
    });

    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
