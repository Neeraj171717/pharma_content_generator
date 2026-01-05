'use client'

import { useState } from 'react'
import { supabaseClient } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Lock, Loader2 } from 'lucide-react'

const schema = z.object({
  password: z.string().min(8, 'Minimum 8 characters'),
  confirmPassword: z.string().min(8, 'Confirm your password'),
}).refine((d) => d.password === d.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match',
})

type FormData = z.infer<typeof schema>

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    try {
      setIsLoading(true)
      setError(null)
      const { error } = await supabaseClient.auth.updateUser({ password: data.password })
      if (error) {
        setError(error.message)
        toast.error('Update failed', { description: error.message })
      } else {
        toast.success('Password updated', { description: 'Please sign in with your new password' })
        router.push('/auth/login')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Set New Password</h1>
          <p className="text-gray-600 dark:text-gray-300">Enter your new password</p>
        </div>
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">Update Password</CardTitle>
            <CardDescription className="text-center">Use the link from your email</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input id="password" type="password" placeholder="Enter new password" className="pl-10" {...register('password')} />
                </div>
                {errors.password && <p className="text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input id="confirmPassword" type="password" placeholder="Confirm new password" className="pl-10" {...register('confirmPassword')} />
                </div>
                {errors.confirmPassword && <p className="text-sm text-red-600 dark:text-red-400">{errors.confirmPassword.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</>) : 'Update Password'}
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  )
}
