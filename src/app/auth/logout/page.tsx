'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'

export default function LogoutPage() {
  const router = useRouter()
  useEffect(() => {
    ;(async () => {
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1200))
      type SignOutOptions = NonNullable<Parameters<typeof supabaseClient.auth.signOut>[0]>
      const signout = supabaseClient.auth.signOut({ scope: 'global' } satisfies SignOutOptions).then(() => {})
      await Promise.race([timeout, signout])
      if (typeof window !== 'undefined') {
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith('sb-'))
            .forEach((k) => localStorage.removeItem(k))
        } catch {}
      }
      try {
        router.replace('/auth/login')
      } catch {
        if (typeof window !== 'undefined') window.location.href = '/auth/login'
      }
    })()
  }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )
}
