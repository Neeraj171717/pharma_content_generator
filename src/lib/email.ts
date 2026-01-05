import crypto from 'crypto';

export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  // In a production environment, you would integrate with an email service
  // like SendGrid, AWS SES, or Nodemailer. For now, we'll log the verification link.
  
  const verificationUrl = `${process.env.NEXTAUTH_URL}/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
  
  console.log(`📧 Verification email for ${email}:`);
  console.log(`🔗 Verification URL: ${verificationUrl}`);
  
  // TODO: Implement actual email sending with your preferred email service
  // Example with Nodemailer:
  /*
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Verify your email address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to Pharma Content Generator!</h2>
        <p>Thank you for registering. Please click the link below to verify your email address:</p>
        <div style="margin: 20px 0;">
          <a href="${verificationUrl}" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
  */
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  
  console.log(`📧 Password reset email for ${email}:`);
  console.log(`🔗 Reset URL: ${resetUrl}`);
  
  // TODO: Implement actual email sending
  /*
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Reset your password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Password Reset Request</h2>
        <p>You requested to reset your password. Click the link below to reset it:</p>
        <div style="margin: 20px 0;">
          <a href="${resetUrl}" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
  */
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  console.log(`📧 Welcome email for ${name} (${email})`);
  
  // TODO: Implement actual email sending
  /*
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Welcome to Pharma Content Generator!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to Pharma Content Generator, ${name}!</h2>
        <p>Thank you for joining our platform. You're now ready to create high-quality, compliant pharmaceutical content.</p>
        <div style="margin: 20px 0;">
          <a href="${process.env.NEXTAUTH_URL}/dashboard" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Get Started
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          If you have any questions, feel free to contact our support team.
        </p>
      </div>
    `,
  });
  */
}