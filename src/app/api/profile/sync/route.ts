import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const userClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const bodyUnknown: unknown = await req.json().catch(() => null)
    const body: Record<string, unknown> =
      bodyUnknown && typeof bodyUnknown === 'object' ? (bodyUnknown as Record<string, unknown>) : {}

    const metadata: Record<string, unknown> =
      userData.user.user_metadata && typeof userData.user.user_metadata === 'object'
        ? (userData.user.user_metadata as Record<string, unknown>)
        : {}

    const bodyEmail = typeof body.email === 'string' ? body.email : ''
    const bodyFullName = typeof body.full_name === 'string' ? body.full_name : ''
    const bodyRole = typeof body.role === 'string' ? body.role : ''

    const metaName = typeof metadata.name === 'string' ? metadata.name : ''
    const metaRole = typeof metadata.role === 'string' ? metadata.role : ''

    const email = userData.user.email || bodyEmail
    const full_name = bodyFullName || metaName
    const role = bodyRole || metaRole || 'user'

    const { error: upsertErr } = await userClient
      .from('profiles')
      .upsert({ id: userData.user.id, email, full_name, role }, { onConflict: 'id' })

    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
