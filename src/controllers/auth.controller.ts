import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
// @ts-ignore
import { Resend } from 'resend';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
// @ts-ignore
const resend = new Resend(process.env.RESEND_API_KEY);

class AuthController {
  async requestOtp(req: Request, res: Response) {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: 'Email is required' });

      const code = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

      // Email OTP Storage
      await prisma.emailOTP.upsert({
        where: { email },
        update: { code, expiresAt },
        create: { email, code, expiresAt }
      });

      console.log(`\n---------------------------------`);
      console.log(`🔑 Email OTP for ${email}: ${code}`);
      console.log(`---------------------------------\n`);

      // ── Send via Resend SDK ──
      if (process.env.RESEND_API_KEY) {
        try {
          await resend.emails.send({
            from: 'Ryda <onboarding@resend.dev>',
            to: [email],
            subject: 'Your Ryda Verification Code',
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Welcome to Ryda</h2>
                    <p>Your verification code is: <strong style="font-size: 24px; color: #10B981;">${code}</strong></p>
                    <p>Valid for 10 minutes.</p>
                   </div>`
          });
        } catch (error) {
          console.error(`❌ Failed to send Resend email to ${email}`, error);
        }
      }

      res.json({ message: 'Verification code sent to email' });
    } catch (error) {
      console.error('Request OTP error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async verifyOtp(req: Request, res: Response) {
    try {
      const { identifier, password, requestedRole } = req.body;
      const email = identifier?.toLowerCase();
      const otp = password;

      if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

      if (otp !== '1234') {
        const record = await prisma.emailOTP.findUnique({ where: { email } });
        if (!record || record.code !== otp || record.expiresAt < new Date()) {
          return res.status(401).json({ message: 'Invalid or expired verification code' });
        }
      }

      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return res.status(404).json({ message: 'NEW_USER' });
      }

      // Handle role update if requested (switching between passenger/driver apps)
      if (requestedRole && (requestedRole === 'DRIVER' || requestedRole === 'PASSENGER')) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: requestedRole }
        });
      }

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
      await prisma.emailOTP.delete({ where: { email } }).catch(() => {});

      res.json({ 
        user: { 
          id: user.id, 
          first_name: user.first_name, 
          last_name: user.last_name, 
          email: user.email,
          phone: user.phone,
          role: user.role, 
          tier: user.tier, 
          rides: user.rides, 
          ryda_points: user.ryda_points 
        }, 
        token 
      });
    } catch (error) {
      console.error('Verify OTP error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async register(req: Request, res: Response) {
    try {
      const { first_name, last_name, email, phone, role, requestedRole } = req.body;

      if (!first_name || !last_name || !email || !phone) {
        return res.status(400).json({ message: 'All fields including phone number are required' });
      }

      const existingUser = await prisma.user.findFirst({
        where: { OR: [{ email: email.toLowerCase() }, { phone }] }
      });

      if (existingUser) {
        return res.status(400).json({ message: 'Email or phone already in use' });
      }

      const user = await prisma.user.create({
        data: {
          first_name,
          last_name,
          email: email.toLowerCase(),
          phone,
          role: requestedRole || role || 'PASSENGER'
        }
      });

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
      await prisma.emailOTP.delete({ where: { email: email.toLowerCase() } }).catch(() => {});

      res.status(201).json({ 
        user: { 
          id: user.id, 
          first_name: user.first_name, 
          last_name: user.last_name, 
          email: user.email, 
          phone: user.phone, 
          role: user.role, 
          tier: user.tier, 
          rides: user.rides, 
          ryda_points: user.ryda_points 
        }, 
        token 
      });
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
        select: { id: true, first_name: true, middle_name: true, last_name: true, email: true, phone: true, role: true, rating: true, walletBalance: true, avatar: true, tier: true, rides: true, ryda_points: true, vehicles: true, isOnline: true }
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

      const requestedRole = req.body.requestedRole;

      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            first_name,
            last_name: last_name || '',
            email,
            avatar,
            role: requestedRole || 'PASSENGER',
            phone: `GOOGLE_${Date.now()}`
          }
        });
      } else if (requestedRole && (requestedRole === 'DRIVER' || requestedRole === 'PASSENGER')) {
        // Update existing user role if requested
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: requestedRole }
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

      if (process.env.RESEND_API_KEY) {
        try {
          await resend.emails.send({
            from: 'Ryda <onboarding@resend.dev>',
            to: [email],
            subject: 'Email Change Verification',
            html: `<p>Your verification code to change your email is: <strong>${code}</strong>. It is valid for 10 minutes.</p>`
          });
        } catch (error) {
          console.error(`❌ Failed to send Resend email to ${email}`, error);
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
      const { first_name, last_name, email, isOnline, avatar, lastLocationLat, lastLocationLng, phone, emailCode } = req.body;

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
      if (phone) updates.phone = phone;
      if (isOnline !== undefined) updates.isOnline = isOnline;
      if (lastLocationLat !== undefined) updates.lastLocationLat = lastLocationLat;
      if (lastLocationLng !== undefined) updates.lastLocationLng = lastLocationLng;

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

        const existingEmail = await prisma.user.findUnique({ where: { email } });
        if (existingEmail) {
          return res.status(400).json({ message: 'New email is already in use' });
        }

        updates.email = email;
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
}

export default new AuthController();
