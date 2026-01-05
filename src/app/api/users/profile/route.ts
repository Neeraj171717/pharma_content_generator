import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { BCRYPT_ROUNDS } from '@/utils/constants';

const updateProfileSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    organization: z.string().max(255).optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8).optional(),
  })
  .superRefine((val, ctx) => {
    const hasCurrent = !!val.currentPassword;
    const hasNew = !!val.newPassword;
    if (hasCurrent !== hasNew) {
      ctx.addIssue({ code: 'custom', message: 'Both currentPassword and newPassword are required to change password' });
    }
  });

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    const sessionUser = session?.user as
      | {
          id?: string
        }
      | undefined;
    
    if (!sessionUser?.id) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = sessionUser.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organization: true,
        emailVerified: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    const sessionUser = session?.user as
      | {
          id?: string
        }
      | undefined;
    
    if (!sessionUser?.id) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = sessionUser.id;

    const body = await request.json();

    // Validate input data
    const validationResult = updateProfileSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { message: 'Invalid input data', errors: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { name, organization, currentPassword, newPassword } = validationResult.data;

    // If changing password, verify current password
    if (currentPassword && newPassword) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true },
      });

      if (!user || !user.password) {
        return NextResponse.json(
          { message: 'User not found' },
          { status: 404 }
        );
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return NextResponse.json(
          { message: 'Current password is incorrect' },
          { status: 400 }
        );
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

      // Update user with new password
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          name,
          organization,
          password: hashedNewPassword,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          organization: true,
          emailVerified: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
        },
      });

      // Log password change activity
      await prisma.activity.create({
        data: {
          userId,
          type: 'PASSWORD_CHANGED',
          description: 'Password updated successfully',
        },
      });

      return NextResponse.json(updatedUser);
    } else {
      // Update user without password change
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          name,
          organization,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          organization: true,
          emailVerified: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
        },
      });

      // Log profile update activity
      await prisma.activity.create({
        data: {
          userId,
          type: 'PROFILE_UPDATED',
          description: 'Profile updated successfully',
          metadata: {
            fieldsUpdated: ['name', ...(organization ? ['organization'] : [])],
          },
        },
      });

      return NextResponse.json(updatedUser);
    }
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
