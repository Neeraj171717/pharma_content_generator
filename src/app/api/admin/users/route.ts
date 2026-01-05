import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabaseServer } from '@/lib/supabaseServer'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

    const { data: userData, error: userErr } = await supabaseServer.auth.getUser(token)
    if (userErr || !userData.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    const metadata =
      userData.user.user_metadata && typeof userData.user.user_metadata === 'object'
        ? (userData.user.user_metadata as Record<string, unknown>)
        : {}
    const role = typeof metadata.role === 'string' ? metadata.role : 'user'
    if (role !== 'admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const search = (searchParams.get('search') || '').toLowerCase()
    const status = searchParams.get('status') || 'all'

    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: limit })
    if (error) return NextResponse.json({ message: error.message }, { status: 500 })

    let users = (data?.users || []).map((u) => {
      const um = u.user_metadata && typeof u.user_metadata === 'object' ? (u.user_metadata as Record<string, unknown>) : {}
      const userRole = typeof um.role === 'string' ? um.role : 'user'
      return {
      id: u.id,
      email: u.email,
      role: userRole,
      emailConfirmed: !!u.email_confirmed_at,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      }
    })

    if (search) users = users.filter((u) => u.email?.toLowerCase().includes(search))
    if (status === 'active') users = users.filter((u) => u.emailConfirmed)
    if (status === 'inactive') users = users.filter((u) => !u.emailConfirmed)

    return NextResponse.json({
      users,
      pagination: { page, limit, total: users.length, totalPages: 1 },
    })
  } catch (error) {
    console.error('Admin users fetch error:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    const { data: userData } = await supabaseServer.auth.getUser(token)
    const metadata =
      userData?.user?.user_metadata && typeof userData.user.user_metadata === 'object'
        ? (userData.user.user_metadata as Record<string, unknown>)
        : {}
    const role = typeof metadata.role === 'string' ? metadata.role : 'user'
    if (role !== 'admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { userId, newRole } = body
    if (!userId || !newRole) return NextResponse.json({ message: 'userId and newRole required' }, { status: 400 })

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: { role: newRole } })
    if (error) return NextResponse.json({ message: error.message }, { status: 500 })
    const updatedMetadata =
      data.user?.user_metadata && typeof data.user.user_metadata === 'object'
        ? (data.user.user_metadata as Record<string, unknown>)
        : {}
    const updatedRole = typeof updatedMetadata.role === 'string' ? updatedMetadata.role : newRole
    return NextResponse.json({ id: data.user?.id, role: updatedRole })
  } catch (error) {
    console.error('Admin user role update error:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
