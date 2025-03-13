import { prisma } from '@/lib/prisma';
import { verifyPassword, signToken } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const userAgent = request.headers.get('user-agent');

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user
    const user = await prisma.users.findUnique({
      where: { email }
    });

    if (!user) {
      await logLoginAttempt(null, ipAddress, userAgent, false, 'User not found');
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!isValidPassword) {
      await logLoginAttempt(user.id, ipAddress, userAgent, false, 'Invalid password');
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Check if email is confirmed
    if (!user.emailConfirmed) {
      return NextResponse.json(
        { error: 'Please confirm your email address' },
        { status: 403 }
      );
    }

    // Generate JWT token
    const token = await signToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Create session
    const session = await prisma.userSessions.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        ipAddress: ipAddress?.toString(),
        userAgent: userAgent?.toString()
      }
    });

    // Log successful login
    await logLoginAttempt(user.id, ipAddress, userAgent, true);

    // Update last login date
    await prisma.users.update({
      where: { id: user.id },
      data: { lastLoginDate: new Date() }
    });

    return NextResponse.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Failed to process login' },
      { status: 500 }
    );
  }
}

async function logLoginAttempt(
  userId: string | null,
  ipAddress: string | null,
  userAgent: string | null,
  successful: boolean,
  failureReason?: string
) {
  try {
    // Only create login history if we have a userId
    if (userId) {
      await prisma.userLoginHistory.create({
        data: {
          userId,
          ipAddress: ipAddress?.toString(),
          userAgent: userAgent?.toString(),
          successful,
          failureReason
        }
      });
    }
  } catch (error) {
    console.error('Failed to log login attempt:', error);
  }
}
