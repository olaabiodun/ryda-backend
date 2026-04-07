import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const validatePromo = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ status: 'error', message: 'Promo code is required' });
    }

    const promo = await (prisma as any).promoCode.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!promo) {
      return res.status(404).json({ status: 'error', message: 'Invalid promo code' });
    }

    if (!promo.isActive) {
      return res.status(400).json({ status: 'error', message: 'Promo code is no longer active' });
    }

    if (promo.expiryDate && new Date(promo.expiryDate) < new Date()) {
      return res.status(400).json({ status: 'error', message: 'Promo code has expired' });
    }

    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      return res.status(400).json({ status: 'error', message: 'Promo code use limit reached' });
    }

    return res.status(200).json({
      status: 'success',
      data: {
        code: promo.code,
        discount: promo.discount,
      },
    });
  } catch (error) {
    console.error('Error validating promo:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

export const createPromo = async (req: Request, res: Response) => {
  try {
    const { code, discount, maxUses, expiryDate } = req.body;

    if (!code || discount === undefined) {
      return res.status(400).json({ status: 'error', message: 'Code and discount are required' });
    }

    const existing = await (prisma as any).promoCode.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (existing) {
      return res.status(400).json({ status: 'error', message: 'Promo code already exists' });
    }

    const promo = await (prisma as any).promoCode.create({
      data: {
        code: code.toUpperCase(),
        discount: parseFloat(discount),
        maxUses: maxUses ? parseInt(maxUses) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });

    return res.status(201).json({ status: 'success', data: promo });
  } catch (error) {
    console.error('Error creating promo:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

export const getAllPromos = async (req: Request, res: Response) => {
  try {
    const promos = await (prisma as any).promoCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ status: 'success', data: promos });
  } catch (error) {
    console.error('Error getting promos:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

export const deletePromo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await (prisma as any).promoCode.delete({
      where: { id },
    });
    return res.status(200).json({ status: 'success', message: 'Promo code deleted' });
  } catch (error) {
    console.error('Error deleting promo:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

export const updatePromo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive, discount, maxUses, expiryDate } = req.body;

    const promo = await (prisma as any).promoCode.update({
      where: { id },
      data: {
        isActive,
        discount: discount !== undefined ? parseFloat(discount) : undefined,
        maxUses: maxUses !== undefined ? (maxUses ? parseInt(maxUses) : null) : undefined,
        expiryDate: expiryDate !== undefined ? (expiryDate ? new Date(expiryDate) : null) : undefined,
      },
    });

    return res.status(200).json({ status: 'success', data: promo });
  } catch (error) {
    console.error('Error updating promo:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};
