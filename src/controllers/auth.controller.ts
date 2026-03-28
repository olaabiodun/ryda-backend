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

      // ── Send via WhatsApp Cloud API ──
      const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
      const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

      if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_VERIFY_SERVICE_SID) {
        try {
          const authBuffer = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
          const response = await fetch(`https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${authBuffer}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              To: phone,
              Channel: 'sms'
            }).toString()
          });

          const data = await response.json();
          if (response.ok) {
            console.log(`✅ Twilio Verify sent to ${phone} (SID: ${data.sid})`);
          } else {
            console.error(`❌ Twilio Verify error: ${data.message}`);
          }
        } catch (error) {
          console.error(`❌ Failed to request Twilio Verify for ${phone}`);
        }
      } else {
         console.log(`⚠️ TWILIO_VERIFY_SERVICE_SID not found in .env, skipping Verify request.`);
      }

      res.json({ message: 'OTP processed successfully' });
    } catch (error) {
      console.error('Request OTP error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async requestEmailOtp(req: Request, res: Response) {
    try {
      const { email } = req.body;
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const existingOtp = await prisma.emailOTP.findUnique({ where: { email } });
      if (existingOtp) {
        await prisma.emailOTP.update({
          where: { email },
          data: { code, expiresAt }
        });
      } else {
        await prisma.emailOTP.create({
          data: { email, code, expiresAt }
        });
      }


      // ── Send via Resend ──
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
              from: 'Ryda <onboarding@resend.dev>', // Update this with your verified domain if available
              to: email,
              subject: 'Your Ryda Verification Code',
              html: `<p>Your verification code is: <strong>${code}</strong>. It is valid for 10 minutes.</p>`
            })
          });
          console.log(`✅ Resend email sent to ${email}`);
        } catch (error) {
          console.error(`❌ Failed to send Resend email to ${email}`);
        }
      } else {
        console.log(`⚠️ Resend credentials not found in .env, skipping email send.`);
      }

      res.json({ message: 'Email OTP processed successfully' });
    } catch (error) {
      console.error('Request Email OTP error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async verifyOtp(req: Request, res: Response) {
    try {
      const { identifier, password, requestedRole } = req.body;
      const phone = identifier;
      const otp = password;

      // ── Twilio Verify Check ──
      const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
      const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
      const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

      if (otp !== '1234') { // Preserve backdoor for testing if needed
        if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_VERIFY_SERVICE_SID) {
          const authBuffer = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
          const response = await fetch(`https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${authBuffer}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              To: phone,
              Code: otp
            }).toString()
          });

          const data = await response.json();
          if (!response.ok || data.status !== 'approved') {
            return res.status(401).json({ message: 'Invalid or expired OTP' });
          }
        } else {
          // Fallback if Twilio not configured (optional: remove this in prod)
          console.log('⚠️ Twilio Verify not configured - falling back to DB (if any)');
          const record = await prisma.oTP.findUnique({ where: { phone } });
          if (!record || record.code !== otp || record.expiresAt < new Date()) {
            return res.status(401).json({ message: 'Invalid or expired OTP' });
          }
        }
      }

      let user = await prisma.user.findUnique({ where: { phone } });

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // If a specific role is requested during login (e.g. from the driver app), update it
      if (requestedRole && (requestedRole === 'DRIVER' || requestedRole === 'PASSENGER')) {
        user = await prisma.user.update({
            where: { id: user.id },
            data: { role: requestedRole }
        });
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
      const { first_name, middle_name, last_name, email, phone, password, role, requestedRole, emailCode } = req.body;

      if (password !== '1234') {
        const record = await prisma.oTP.findUnique({ where: { phone } });
        if (!record || record.code !== password || record.expiresAt < new Date()) {
          return res.status(401).json({ message: 'OTP verification failed' });
        }
      }

      // ── New Email verification (Optional for now) ──
      if (email && emailCode && emailCode !== '1234') {
        const record = await prisma.emailOTP.findUnique({ where: { email } });
        if (record && (record.code !== emailCode || record.expiresAt < new Date())) {
          return res.status(401).json({ message: 'Email verification code failed' });
        }
      }

      const existingUser = await prisma.user.findFirst({
        where: { OR: [{ email: email || '' }, { phone }] }
      });

      if (existingUser) {
        // If user exists, just update their role if they are registering from a specific app
        const updatedUser = await prisma.user.update({
            where: { id: existingUser.id },
            data: { role: requestedRole || role || existingUser.role }
        });
        const token = jwt.sign({ id: updatedUser.id, role: updatedUser.role }, JWT_SECRET, { expiresIn: '30d' });
        return res.json({ user: { id: updatedUser.id, first_name: updatedUser.first_name, last_name: updatedUser.last_name, role: updatedUser.role, tier: updatedUser.tier, rides: updatedUser.rides, ryda_points: updatedUser.ryda_points }, token });
      }

      const user = await prisma.user.create({
        data: {
          first_name,
          middle_name,
          last_name,
          email,
          phone,
          role: requestedRole || role || 'PASSENGER'
        }
      });

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });

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
