'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle, Loader2, Mail } from 'lucide-react';

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4">
          <div className="w-full max-w-md">
            <Card className="border-0 shadow-xl">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold">Verifying Email</CardTitle>
                <CardDescription>Please wait while we verify your email address</CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-300">This may take a few moments...</p>
              </CardContent>
            </Card>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [error, setError] = useState<string | null>(null);

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const verifyEmail = useCallback(async (verificationToken: string, userEmail: string) => {
    try {
      setIsVerifying(true);
      setError(null);

      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: verificationToken,
          email: userEmail,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setVerificationStatus('error');
        setError(result.message || 'Email verification failed');
        toast.error('Verification failed', {
          description: result.message || 'Something went wrong',
        });
      } else {
        setVerificationStatus('success');
        toast.success('Email verified successfully', {
          description: 'You can now sign in to your account',
        });
        setTimeout(() => {
          router.push('/auth/login');
        }, 3000);
      }
    } catch {
      setVerificationStatus('error');
      setError('An unexpected error occurred. Please try again.');
      toast.error('Verification failed', {
        description: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsVerifying(false);
    }
  }, [router]);

  useEffect(() => {
    if (token && email) {
      void verifyEmail(token, email);
    }
  }, [email, token, verifyEmail]);

  const resendVerificationEmail = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.message || 'Failed to resend verification email');
        toast.error('Failed to resend', {
          description: result.message || 'Something went wrong',
        });
      } else {
        toast.success('Verification email sent', {
          description: 'Please check your email for the verification link',
        });
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      toast.error('Failed to resend', {
        description: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4">
        <div className="w-full max-w-md">
          <Card className="border-0 shadow-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Verifying Email</CardTitle>
              <CardDescription>
                Please wait while we verify your email address
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-300">
                This may take a few moments...
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Email Verification
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            {verificationStatus === 'success'
              ? 'Your email has been verified successfully'
              : verificationStatus === 'error'
              ? 'Email verification failed'
              : 'Check your email for verification instructions'}
          </p>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              {verificationStatus === 'success'
                ? 'Verification Complete'
                : verificationStatus === 'error'
                ? 'Verification Failed'
                : 'Verify Your Email'}
            </CardTitle>
            <CardDescription>
              {verificationStatus === 'success'
                ? 'You can now access your account'
                : verificationStatus === 'error'
                ? 'We encountered an issue verifying your email'
                : 'We\'ve sent a verification link to your email address'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            {verificationStatus === 'success' && (
              <div className="space-y-4">
                <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
                <p className="text-gray-600 dark:text-gray-300">
                  Your email address has been successfully verified. You will be redirected to the login page shortly.
                </p>
              </div>
            )}

            {verificationStatus === 'error' && (
              <div className="space-y-4">
                <AlertCircle className="h-16 w-16 text-red-600 mx-auto" />
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <p className="text-gray-600 dark:text-gray-300">
                  Please check the verification link or try requesting a new one.
                </p>
              </div>
            )}

            {verificationStatus === 'pending' && (
              <div className="space-y-4">
                <Mail className="h-16 w-16 text-blue-600 mx-auto" />
                <p className="text-gray-600 dark:text-gray-300">
                  Please check your email ({email}) and click the verification link to activate your account.
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  The verification link will expire in 24 hours.
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            {verificationStatus === 'success' && (
              <Button
                onClick={() => router.push('/auth/login')}
                className="w-full"
              >
                Go to Login
              </Button>
            )}

            {verificationStatus === 'error' && (
              <div className="space-y-3 w-full">
                <Button
                  onClick={resendVerificationEmail}
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resending...
                    </>
                  ) : (
                    'Resend Verification Email'
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/auth/register')}
                  className="w-full"
                >
                  Back to Registration
                </Button>
              </div>
            )}

            {verificationStatus === 'pending' && (
              <div className="space-y-3 w-full">
                <Button
                  onClick={resendVerificationEmail}
                  variant="outline"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resending...
                    </>
                  ) : (
                    'Resend Email'
                  )}
                </Button>
                <Link href="/auth/login" className="w-full">
                  <Button variant="ghost" className="w-full">
                    Back to Login
                  </Button>
                </Link>
              </div>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
