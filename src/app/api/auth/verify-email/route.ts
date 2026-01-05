import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, email } = body;

    if (!token || !email) {
      return NextResponse.json(
        { message: 'Token and email are required' },
        { status: 400 }
      );
    }

    // Find user with matching token and email
    const user = await prisma.user.findFirst({
      where: {
        email,
        verificationToken: token,
        verificationExpires: {
          gt: new Date(), // Token should not be expired
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: 'Invalid or expired verification token' },
        { status: 400 }
      );
    }

    // Update user verification status
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
        verificationExpires: null,
        isActive: true,
      },
    });

    // Log user activity
    await prisma.activity.create({
      data: {
        userId: user.id,
        type: 'EMAIL_VERIFIED',
        description: 'Email address verified successfully',
        metadata: {
          email,
        },
      },
    });

    return NextResponse.json(
      { message: 'Email verified successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}