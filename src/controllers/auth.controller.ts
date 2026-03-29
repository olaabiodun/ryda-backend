import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
// @ts-ignore
import { Resend } from 'resend';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
// @ts-ignore
const resend = new Resend(process.env.RESEND_API_KEY);

class AuthController {

  // ============================
  // REQUEST OTP
  // ============================
  async requestOtp(req: Request, res: Response) {
    try {
      const email = req.body.email?.toLowerCase().trim();
      if (!email) return res.status(400).json({ message: 'Email is required' });

      // 🔒 Rate limit (1 request / 60 sec)
      const existing = await prisma.emailOTP.findUnique({ where: { email } });
      if (existing && existing.expiresAt > new Date(Date.now() - 60 * 1000)) {
        return res.status(429).json({ message: 'Please wait before requesting another code' });
      }

      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await prisma.emailOTP.upsert({
        where: { email },
        update: { code, expiresAt },
        create: { email, code, expiresAt }
      });

      console.log(`🔑 OTP for ${email}: ${code}`);

      if (!process.env.RESEND_API_KEY) {
        console.warn('⚠️ No RESEND API KEY - OTP not sent');
        return res.status(500).json({ message: 'Email service not configured' });
      }

      await resend.emails.send({
        from: 'Ryda <noreply@biznova.ng>',
        to: [email],
        subject: 'Your Ryda verification code',
        html: `
        <div style="font-family: Arial, sans-serif; background:#f6fef9; padding:20px;">
          <div style="max-width:500px;margin:auto;background:white;border-radius:12px;overflow:hidden;border:1px solid #e6f4ea;">
            
            <div style="background:linear-gradient(135deg,#16a34a,#22c55e);padding:20px;text-align:center;color:white;">
              <h2 style="margin:0;">Ryda</h2>
              <p style="margin:5px 0 0;font-size:14px;">Secure Verification</p>
            </div>

            <div style="padding:25px;text-align:center;">
              <p style="font-size:16px;color:#333;">Your verification code is</p>

              <div style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#16a34a;margin:15px 0;">
                ${code}
              </div>

              <p style="color:#666;font-size:14px;">
                This code will expire in 10 minutes.
              </p>

              <p style="color:#aaa;font-size:12px;margin-top:20px;">
                If you didn’t request this, ignore this email.
              </p>
            </div>

            <div style="background:#f0fdf4;padding:10px;text-align:center;font-size:12px;color:#888;">
              © ${new Date().getFullYear()} Ryda. All rights reserved.
            </div>

          </div>
        </div>
        `
      });

      res.json({ message: 'Verification code sent to email' });

    } catch (error) {
      console.error('Request OTP error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ============================
  // VERIFY OTP
  // ============================
  async verifyOtp(req: Request, res: Response) {
    try {
      const email = req.body.identifier?.toLowerCase().trim();
      const otp = req.body.password;

      if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required' });
      }

      const record = await prisma.emailOTP.findUnique({ where: { email } });

      if (!record || record.code !== otp || record.expiresAt < new Date()) {
        return res.status(401).json({ message: 'Invalid or expired verification code' });
      }

      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return res.status(404).json({ message: 'NEW_USER' });
      }

      if (req.body.requestedRole && ['DRIVER', 'PASSENGER'].includes(req.body.requestedRole)) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: req.body.requestedRole }
        });
      }

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });

      // ✅ clean delete
      await prisma.emailOTP.deleteMany({ where: { email } });

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

  // ============================
  // REGISTER
  // ============================
  async register(req: Request, res: Response) {
    try {
      const email = req.body.email?.toLowerCase().trim();
      const { first_name, last_name, phone, role, requestedRole } = req.body;

      if (!first_name || !last_name || !email || !phone) {
        return res.status(400).json({ message: 'All fields required' });
      }

      const existingUser = await prisma.user.findFirst({
        where: { OR: [{ email }, { phone }] }
      });

      if (existingUser) {
        return res.status(400).json({ message: 'Email or phone already in use' });
      }

      const user = await prisma.user.create({
        data: {
          first_name,
          last_name,
          email,
          phone,
          role: requestedRole || role || 'PASSENGER'
        }
      });

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });

      await prisma.emailOTP.deleteMany({ where: { email } });

      res.status(201).json({ user, token });

    } catch (error) {
      console.error('Register error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ============================
  // TOP UP
  // ============================
  async topUp(req: Request, res: Response) {
    try {
      const userId = req.user.id;
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Invalid amount' });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          walletBalance: { increment: amount },
          ryda_points: { increment: Math.floor(amount / 100) }
        }
      });

      res.json(user);

    } catch (error) {
      console.error('Top-up error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ============================
  // SEND MONEY (SAFE)
  // ============================
  async sendMoney(req: Request, res: Response) {
    try {
      const userId = req.user.id;
      const { amount, recipientPhone } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Invalid amount' });
      }

      const result = await prisma.$transaction(async (tx) => {
        const sender = await tx.user.findUnique({ where: { id: userId } });

        if (!sender || sender.walletBalance < amount) throw new Error('INSUFFICIENT');
        if (sender.phone === recipientPhone) throw new Error('SELF');

        const recipient = await tx.user.findUnique({ where: { phone: recipientPhone } });
        if (!recipient) throw new Error('NOT_FOUND');

        await tx.user.update({
          where: { id: userId },
          data: { walletBalance: { decrement: amount } }
        });

        await tx.user.update({
          where: { id: recipient.id },
          data: { walletBalance: { increment: amount } }
        });

        return tx.user.findUnique({ where: { id: userId } });
      });

      res.json(result);

    } catch (error: any) {
      if (error.message === 'INSUFFICIENT') return res.status(400).json({ message: 'Insufficient balance' });
      if (error.message === 'SELF') return res.status(400).json({ message: 'Cannot send to yourself' });
      if (error.message === 'NOT_FOUND') return res.status(404).json({ message: 'Recipient not found' });

      console.error('Send money error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // ============================
  // WITHDRAW
  // ============================
  async withdraw(req: Request, res: Response) {
    try {
      const userId = req.user.id;
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Invalid amount' });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.walletBalance < amount) {
        return res.status(400).json({ message: 'Insufficient balance' });
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { walletBalance: { decrement: amount } }
      });

      res.json(updatedUser);

    } catch (error) {
      console.error('Withdraw error ❌', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new AuthController();
