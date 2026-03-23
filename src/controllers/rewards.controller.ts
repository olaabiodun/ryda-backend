import { Request, Response } from 'express';
import prisma from '../config/prisma';

class RewardsController {
  async getRewards(req: Request, res: Response) {
    try {
      const rewards = await prisma.redeemableReward.findMany({
        where: { active: true }
      });
      
      // Seed if empty (for first time use)
      if (rewards.length === 0) {
        const defaultRewards = [
          { title: '50% XL Discount',   desc: 'Valid for your next XL ride',  points: 800,  icon: 'ticket-percent-outline' },
          { title: 'Free Eco Upgrade',   desc: 'Ride Fast at Eco price',       points: 450,  icon: 'leaf-circle-outline' },
          { title: 'Starbucks ₦1k Off', desc: 'Partner redeemable code',      points: 1200, icon: 'coffee-outline' },
          { title: 'Priority Pickup',    desc: 'Skip the matching queue',      points: 600,  icon: 'lightning-bolt-outline' },
        ];
        
        await prisma.redeemableReward.createMany({ data: defaultRewards });
        const newRewards = await prisma.redeemableReward.findMany({ where: { active: true }});
        return res.json(newRewards);
      }
      
      res.json(rewards);
    } catch (error) {
      console.error('Get rewards error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getHistory(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const history = await prisma.pointsHistory.findMany({
        where: { userId },
        orderBy: { date: 'desc' }
      });
      
      // Mock history if empty (to match your current look)
      if (history.length === 0) {
        const defaultHistory = [
          { label: 'Eco Ride Bonus',    points: '+42',  userId },
          { label: 'Referral Success',  points: '+250', userId },
          { label: 'Long Trip Bonus',   points: '+18',  userId },
        ];
        await prisma.pointsHistory.createMany({ data: defaultHistory });
        const newHistory = await prisma.pointsHistory.findMany({ where: { userId }, orderBy: { date: 'desc' }});
        return res.json(newHistory);
      }
      
      res.json(history);
    } catch (error) {
      console.error('Get point history error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async redeem(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { rewardId } = req.body;
      
      const reward = await prisma.redeemableReward.findUnique({ where: { id: rewardId }});
      if (!reward) return res.status(404).json({ message: 'Reward not found' });
      
      const user = await prisma.user.findUnique({ where: { id: userId }});
      if (!user || user.ryda_points < reward.points) {
        return res.status(400).json({ message: 'Insufficient points' });
      }
      
      // Transactions
      const [updatedUser] = await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { ryda_points: { decrement: reward.points } }
        }),
        prisma.pointsHistory.create({
          data: {
            userId,
            label: `Redeemed ${reward.title}`,
            points: `-${reward.points}`
          }
        })
      ]);
      
      res.json(updatedUser);
    } catch (error) {
      console.error('Redeem point error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new RewardsController();
