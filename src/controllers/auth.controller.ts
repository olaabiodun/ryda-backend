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

  if (['apple-test@ryda.ng', 'google-test@ryda.ng'].includes(email.toLowerCase())) {
    return res.json({ message: 'Verification code sent to email' });
  }

  // Email OTP Storage  
  await prisma.emailOTP.upsert({  
    where: { email },  
    update: { code, expiresAt },  
    create: { email, code, expiresAt }  
  });  

  console.log(`\n---------------------------------`);  
  console.log(`🔑 Email OTP for ${email}: ${code}`);  
  console.log(`---------------------------------\n`);  

  // ✅ FIX: Send OTP via email (was missing here, only existed in requestEmailChangeOtp)  
  if (process.env.RESEND_API_KEY) {  
    try {  
      console.log(`📡 Attempting to send OTP email to ${email}...`);  
      const { data, error } = await resend.emails.send({  
        from: 'Ryda <noreply@biznova.ng>', // ✅ FIX: must be a valid email address, not just a domain  
        to: [email],  
        subject: 'Your Ryda verification code',  
        html: `<p>Your verification code is: <strong>${code}</strong>. It is valid for 10 minutes.</p>`  
      });  
      if (error) console.error(`❌ Resend SDK Error (OTP):`, error);  
      else console.log(`✅ Resend SDK Success (OTP):`, data);  
    } catch (err) {  
      console.error(`❌ Unexpected Resend SDK Exception (OTP):`, err);  
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

  const isTestAccount = ['apple-test@ryda.ng', 'google-test@ryda.ng'].includes(email);
  if (isTestAccount) {
    if (otp !== '1234') {
      return res.status(401).json({ message: 'Invalid or expired verification code' });
    }
  } else {
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
      ryda_points: user.ryda_points,
      nin: (user as any).nin,
      ninFront: (user as any).ninFront,
      ninBack: (user as any).ninBack,
      homeAddress: (user as any).homeAddress,
      isVerified: (user as any).isVerified,
      isVehicleVerified: (user as any).isVehicleVerified,
      vehicles: user.vehicles,
      avatar: user.avatar
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
      ryda_points: user.ryda_points,
      nin: (user as any).nin,
      ninFront: (user as any).ninFront,
      ninBack: (user as any).ninBack,
      homeAddress: (user as any).homeAddress,
      isVerified: (user as any).isVerified,
      isVehicleVerified: (user as any).isVehicleVerified,
      vehicles: user.vehicles,
      avatar: user.avatar
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
select: { id: true, first_name: true, middle_name: true, last_name: true, email: true, phone: true, role: true, rating: true, walletBalance: true, avatar: true, tier: true, rides: true, ryda_points: true, vehicles: true, isOnline: true, isPinRequired: true, nin: true, ninFront: true, ninBack: true, homeAddress: true, isVerified: true, isVehicleVerified: true } as any
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
      ryda_points: user.ryda_points,
      nin: (user as any).nin,
      ninFront: (user as any).ninFront,
      ninBack: (user as any).ninBack,
      homeAddress: (user as any).homeAddress,
      isVerified: (user as any).isVerified,
      isVehicleVerified: (user as any).isVehicleVerified,
      vehicles: user.vehicles,
      avatar: user.avatar
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
      console.log(`📡 Attempting email change OTP to ${email}...`);  
      const { data, error } = await resend.emails.send({  
        from: 'Ryda <noreply@biznova.ng>', // ✅ FIX: corrected from invalid 'Ryda <biznova.ng>'  
        to: [email],  
        subject: 'Email Change Verification',  
        html: `<div style="margin:0;padding:0;background:#f6fef9;font-family:Arial,sans-serif;">
  <div style="max-width:480px;margin:30px auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6f4ea;box-shadow:0 10px 25px rgba(0,0,0,0.05);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#16a34a,#22c55e);padding:20px;text-align:center;color:#fff;">
      <h2 style="margin:0;font-size:20px;">Ryda</h2>
      <p style="margin:5px 0 0;font-size:13px;opacity:0.9;">Secure Verification</p>
    </div>

    <!-- Body -->
    <div style="padding:30px 25px;text-align:center;">
      <p style="font-size:15px;color:#333;margin-bottom:10px;">
        Use the code below to continue
      </p>

      <div style="
        font-size:34px;
        font-weight:700;
        letter-spacing:8px;
        color:#16a34a;
        margin:20px 0;
      ">
        ${code}
      </div>

      <p style="font-size:13px;color:#666;margin-top:10px;">
        This code expires in <b>10 minutes</b>.
      </p>

      <div style="margin-top:25px;font-size:12px;color:#aaa;">
        Didn’t request this? You can safely ignore this email.
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f0fdf4;padding:12px;text-align:center;font-size:11px;color:#888;">
      © ${new Date().getFullYear()} Ryda. All rights reserved.
    </div>

  </div>
</div>
`
      });  
      if (error) console.error(`❌ Resend SDK Error (Email Change):`, error);  
      else console.log(`✅ Resend SDK Success (Email Change):`, data);  
    } catch (error) {  
      console.error(`❌ Unexpected Resend SDK Exception (Email Change):`, error);  
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
  const { first_name, last_name, email, isOnline, isPinRequired, avatar, lastLocationLat, lastLocationLng, phone, emailCode, nin, ninFront, ninBack, homeAddress } = req.body;
  
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
  if (isPinRequired !== undefined) updates.isPinRequired = isPinRequired;  
  if (lastLocationLat !== undefined) updates.lastLocationLat = lastLocationLat;  
  if (lastLocationLng !== undefined) updates.lastLocationLng = lastLocationLng;  
  
  // Verification Fields
  if (nin) updates.nin = nin;
  if (ninFront) updates.ninFront = ninFront;
  if (ninBack) updates.ninBack = ninBack;
  if (homeAddress) updates.homeAddress = homeAddress;

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
