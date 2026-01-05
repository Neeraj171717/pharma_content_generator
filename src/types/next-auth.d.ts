import 'next-auth'
import 'next-auth/jwt'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role?: string
      organization?: string | null
      emailVerified?: boolean
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: string
    organization?: string | null
    emailVerified?: boolean
  }
}
