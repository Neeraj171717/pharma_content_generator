import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { registerSchema } from '@/utils/validation';
import { generateVerificationToken, sendVerificationEmail } from '@/lib/email';
import { BCRYPT_ROUNDS } from '@/utils/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input data
    const validationResult = registerSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { message: 'Invalid input data', errors: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { name, email, password, role, organization } = validationResult.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Generate verification token
    const verificationToken = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        organization: organization || null,
        emailVerified: null,
        verificationToken,
        verificationExpires,
        isActive: false,
      },
    });

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Continue with user creation even if email fails
    }

    // Log user activity
    await prisma.activity.create({
      data: {
        userId: user.id,
        type: 'USER_REGISTERED',
        description: 'User registered successfully',
        metadata: {
          role,
          hasOrganization: !!organization,
        },
      },
    });

    return NextResponse.json(
      {
        message: 'Registration successful. Please check your email to verify your account.',
        userId: user.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
