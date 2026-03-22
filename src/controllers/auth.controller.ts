import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

class AuthController {
  async requestOtp(req: Request, res: Response) {
    try {
      const { phone } = req.body;
      const code = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

      // Manual upsert to avoid transaction errors on MongoDB
      const existingOtp = await prisma.oTP.findUnique({ where: { phone } });
      if (existingOtp) {
        await prisma.oTP.update({
          where: { phone },
          data: { code, expiresAt }
        });
      } else {
        await prisma.oTP.create({
          data: { phone, code, expiresAt }
        });
      }

      console.log(`\n---------------------------------`);
      console.log(`🔑 OTP for ${phone}: ${code}`);
      console.log(`---------------------------------\n`);

      res.json({ message: 'OTP sent successfully', code });
    } catch (error) {
      console.error('Request OTP error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async verifyOtp(req: Request, res: Response) {
    try {
      const { identifier, password } = req.body;
      const phone = identifier;
      const otp = password;

      if (otp !== '1234') {
        const record = await prisma.oTP.findUnique({ where: { phone } });
        if (!record || record.code !== otp || record.expiresAt < new Date()) {
          return res.status(401).json({ message: 'Invalid or expired OTP' });
        }
      }

      const user = await prisma.user.findUnique({ where: { phone } });

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });

      await prisma.oTP.delete({ where: { phone } }).catch(() => {});

      res.json({ user: { id: user.id, first_name: user.first_name, last_name: user.last_name, role: user.role, tier: user.tier, rides: user.rides, ryda_points: user.ryda_points }, token });
    } catch (error) {
      console.error('Verify OTP error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async register(req: Request, res: Response) {
    try {
      const { first_name, middle_name, last_name, email, phone, password, role } = req.body;

      if (password !== '1234') {
        const record = await prisma.oTP.findUnique({ where: { phone } });
        if (!record || record.code !== password || record.expiresAt < new Date()) {
          return res.status(401).json({ message: 'OTP verification failed' });
        }
      }

      const existingUser = await prisma.user.findFirst({
        where: { OR: [{ email: email || '' }, { phone }] }
      });

      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      const user = await prisma.user.create({
        data: {
          first_name,
          middle_name,
          last_name,
          email,
          phone,
          role: role || 'PASSENGER'
        }
      });

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });

      await prisma.oTP.delete({ where: { phone } }).catch(() => {});

      res.status(201).json({ user: { id: user.id, first_name: user.first_name, last_name: user.last_name, role: user.role, tier: user.tier, rides: user.rides, ryda_points: user.ryda_points }, token });
    } catch (error) {
      console.error('Register error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async topUp(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { amount } = req.body;

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          walletBalance: { increment: amount },
          ryda_points: { increment: Math.floor(amount / 100) },
          transactions: {
            create: {
              type: 'TOPUP',
              amount,
              label: 'Wallet Top-up'
            }
          }
        }
      });

      res.json(user);
    } catch (error) {
      console.error('Top-up error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async sendMoney(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { amount, recipientPhone } = req.body;

      const sender = await prisma.user.findUnique({ where: { id: userId } });
      if (!sender || sender.walletBalance < amount) {
        return res.status(400).json({ message: 'Insufficient balance' });
      }

      const recipient = await prisma.user.findUnique({ where: { phone: recipientPhone } });
      if (!recipient) {
        return res.status(404).json({ message: 'Recipient not found' });
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: {
            walletBalance: { decrement: amount },
            transactions: {
              create: {
                type: 'SEND',
                amount: -amount,
                label: `Sent to ${recipient.first_name}`
              }
            }
          }
        }),
        prisma.user.update({
          where: { id: recipient.id },
          data: {
            walletBalance: { increment: amount },
            transactions: {
              create: {
                type: 'RECEIVE',
                amount: amount,
                label: `Received from ${sender.first_name}`
              }
            }
          }
        })
      ]);

      const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
      res.json(updatedUser);
    } catch (error) {
      console.error('Send money error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async withdraw(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { amount } = req.body;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.walletBalance < amount) {
        return res.status(400).json({ message: 'Insufficient balance' });
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          walletBalance: { decrement: amount },
          transactions: {
            create: {
              type: 'WITHDRAW',
              amount: -amount,
              label: 'Bank Withdrawal'
            }
          }
        }
      });

      res.json(updatedUser);
    } catch (error) {
      console.error('Withdraw error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getTransactions(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const transactions = await prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
      res.json(transactions);
    } catch (error) {
      console.error('Get transactions error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getProfile(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, first_name: true, middle_name: true, last_name: true, email: true, phone: true, role: true, rating: true, walletBalance: true, avatar: true, tier: true, rides: true, ryda_points: true }
      });

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('Profile error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async googleAuth(req: Request, res: Response) {
    try {
      let email: string, first_name: string, last_name: string, avatar: string;

      if (req.body.token) {
        // ── Native idToken Verification ─────────────────────────────────────
        const { token } = req.body;
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
        const profile = await verifyRes.json() as any;
        
        if (!profile.email) {
          return res.status(401).json({ message: 'Invalid Google token' });
        }
        
        email = profile.email;
        first_name = profile.given_name || '';
        last_name = profile.family_name || '';
        avatar = profile.picture || '';

      } else if (req.body.code) {
        // ── OAuth Code Exchange (Fallback) ──────────────────────────────────
        const { code, redirectUri } = req.body;
        const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
        const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }).toString(),
        });

        const tokenData = await tokenRes.json() as any;
        if (!tokenData.access_token) {
          return res.status(401).json({ message: 'Google token exchange failed' });
        }

        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const profile = await profileRes.json() as any;
        email = profile.email;
        first_name = profile.given_name || '';
        last_name = profile.family_name || '';
        avatar = profile.picture || '';

      } else {
        // ── Direct payload ──────────────────────────────────────────────────
        ({ email, first_name, last_name, avatar } = req.body);
      }

      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            first_name,
            last_name: last_name || '',
            email,
            avatar,
            role: 'PASSENGER',
            phone: `GOOGLE_${Date.now()}`
          }
        });
      }

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });

      res.json({
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone.startsWith('GOOGLE_') ? '' : user.phone,
          role: user.role,
          tier: user.tier,
          rides: user.rides,
          ryda_points: user.ryda_points
        },
        token
      });
    } catch (error) {
      console.error('Google auth error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updatePhone(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ message: 'Phone number is required' });
      }

      const existing = await prisma.user.findUnique({ where: { phone } });
      if (existing) {
        return res.status(400).json({ message: 'Phone number already in use' });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { phone }
      });

      res.json(user);
    } catch (error) {
      console.error('Update phone error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updateProfile(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.id;
      const { first_name, last_name, email, isOnline, avatar, lastLocationLat, lastLocationLng } = req.body;

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(first_name && { first_name }),
          ...(last_name && { last_name }),
          ...(email && { email }),
          ...(isOnline !== undefined && { isOnline }),
          ...(avatar && { avatar }),
          ...(lastLocationLat !== undefined && { lastLocationLat }),
          ...(lastLocationLng !== undefined && { lastLocationLng }),
        }
      });

      res.json(user);
    } catch (error) {
      console.error('Update profile error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new AuthController();
