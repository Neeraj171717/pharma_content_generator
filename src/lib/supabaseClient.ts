import { createClient } from '@supabase/supabase-js'
import { env } from './env'

export const supabaseClient = createClient(
  env.supabaseUrlPublic || env.supabaseUrl,
  env.supabaseAnonKeyPublic || env.supabaseAnonKey
)
