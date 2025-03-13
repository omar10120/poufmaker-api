import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { fullName, email, phoneNumber, password } = await request.json();

    // Validate required fields
    if (!fullName || !email || !password) {
      return NextResponse.json(
        { error: 'Full name, email, and password are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.users.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    // Hash password
    const { hash: passwordHash, salt: passwordSalt } = await hashPassword(password);

    // Create user
    const user = await prisma.users.create({
      data: {
        fullName,
        email,
        phoneNumber,
        passwordHash,
        passwordSalt,
        confirmationToken: crypto.randomUUID(),
        role: 'client'
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        emailConfirmed: true,
        createdAt: true
      }
    });

    return NextResponse.json(
      { message: 'User registered successfully', user },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Failed to register user' },
      { status: 500 }
    );
  }
}
