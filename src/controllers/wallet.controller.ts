import { Request, Response } from 'express';
import prisma from '../config/prisma';

class WalletController {
  async addBalance(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { amount } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Invalid amount' });
      }

      const updatedUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: userId },
          data: { walletBalance: { increment: amount } }
        });

        await tx.transaction.create({
          data: {
            userId,
            type: 'CREDIT',
            amount,
            label: 'Added to Wallet',
          }
        });

        await tx.notification.create({
          data: {
            userId,
            title: 'Wallet Updated 💰',
            message: `₦${amount.toLocaleString()} has been added to your wallet.`,
            type: 'WALLET'
          }
        });

        return user;
      });

      res.json(updatedUser);
    } catch (error) {
      console.error('Add balance error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async transfer(req: Request, res: Response) {
    try {
      // @ts-ignore
      const senderId = req.user.id;
      const { recipientEmail, amount } = req.body;

      if (!recipientEmail || !amount || amount <= 0) {
        return res.status(400).json({ message: 'Invalid data' });
      }

      const recipient = await prisma.user.findUnique({
        where: { email: recipientEmail.toLowerCase() }
      });

      if (!recipient) {
        return res.status(404).json({ message: 'Recipient not found' });
      }

      if (recipient.id === senderId) {
        return res.status(400).json({ message: 'Cannot transfer to yourself' });
      }

      const sender = await prisma.user.findUnique({ where: { id: senderId } });
      if (!sender || sender.walletBalance < amount) {
        return res.status(400).json({ message: 'Insufficient balance' });
      }

      const [updatedSender] = await prisma.$transaction([
        // Update sender
        prisma.user.update({
          where: { id: senderId },
          data: { walletBalance: { decrement: amount } }
        }),
        // Update recipient
        prisma.user.update({
          where: { id: recipient.id },
          data: { walletBalance: { increment: amount } }
        }),
        // Create sender transaction
        prisma.transaction.create({
          data: {
            userId: senderId,
            type: 'DEBIT',
            amount,
            label: `Sent to ${recipient.email}`
          }
        }),
        // Create recipient transaction
        prisma.transaction.create({
          data: {
            userId: recipient.id,
            type: 'CREDIT',
            amount,
            label: `Received from ${sender.email}`
          }
        }),
        // Notify sender
        prisma.notification.create({
          data: {
            userId: senderId,
            title: 'Transfer Sent 💸',
            message: `You sent ₦${amount.toLocaleString()} to ${recipient.email}.`,
            type: 'WALLET'
          }
        }),
        // Notify recipient
        prisma.notification.create({
          data: {
            userId: recipient.id,
            title: 'Funds Received! ✨',
            message: `You received ₦${amount.toLocaleString()} from ${sender.email}.`,
            type: 'WALLET'
          }
        })
      ]);

      res.json(updatedSender);
    } catch (error) {
      console.error('Transfer error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getTransactions(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const transactions = await prisma.transaction.findMany({
        where: { userId },
        orderBy: { date: 'desc' }
      });
      res.json(transactions);
    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async withdraw(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { amount, bankName, accountNumber } = req.body;

      if (!amount || amount <= 0 || !bankName || !accountNumber) {
        return res.status(400).json({ message: 'Invalid withdrawal data' });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.walletBalance < amount) {
        return res.status(400).json({ message: 'Insufficient balance to withdraw' });
      }

      const updatedUser = await prisma.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id: userId },
          data: { walletBalance: { decrement: amount } }
        });

        await tx.transaction.create({
          data: {
            userId,
            type: 'WITHDRAW',
            amount,
            label: `Pending Withdrawal to ${bankName} (${accountNumber})`
          }
        });

        await tx.notification.create({
          data: {
            userId,
            title: 'Withdrawal Processing 🏦',
            message: `Your request to withdraw ₦${amount.toLocaleString()} is being processed.`,
            type: 'WALLET'
          }
        });

        return u;
      });

      res.json(updatedUser);
    } catch (error) {
      console.error('Withdrawal error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new WalletController();
