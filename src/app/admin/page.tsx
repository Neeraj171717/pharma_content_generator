'use client'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabaseClient } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

type AdminUser = { id: string; email: string | null; role: 'user'|'manager'|'admin'; emailConfirmed: boolean }

export default function AdminPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const parseRole = (value: unknown): AdminUser['role'] => {
    if (value === 'admin' || value === 'manager' || value === 'user') return value
    return 'user'
  }

  const [role, setRole] = useState<AdminUser['role']>(() => parseRole(user?.role))
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const canAccessAdmin = (user?.role === 'admin')

  useEffect(() => {
    if (canAccessAdmin) fetchUsers()
  }, [canAccessAdmin])

  useEffect(() => {
    if (user) setRole(parseRole(user.role))
  }, [user])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    router.push('/auth/login')
    return null
  }

  const updateOwnRole = async () => {
    try {
      const { error } = await supabaseClient.auth.updateUser({ data: { role } })
      if (error) {
        toast.error('Failed to update role', { description: error.message })
      } else {
        toast.success('Role updated')
      }
    } catch {
      toast.error('Failed to update role')
    }
  }

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true)
      const { data: session } = await supabaseClient.auth.getSession()
      const token = session?.session?.access_token
      const res = await fetch(`/api/admin/users?page=1&limit=50`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('Failed to load users')
      const json = await res.json()
      setUsers(json.users)
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoadingUsers(false)
    }
  }

  const changeUserRole = async (userId: string, newRole: AdminUser['role']) => {
    try {
      const { data: session } = await supabaseClient.auth.getSession()
      const token = session?.session?.access_token
      const res = await fetch(`/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId, newRole }),
      })
      if (!res.ok) throw new Error('Failed to update role')
      const updated = await res.json()
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: updated.role } : u)))
      toast.success('Updated role')
    } catch {
      toast.error('Failed to update role')
    }
  }

  

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Admin Panel</CardTitle>
          <CardDescription>Manage roles and access</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!canAccessAdmin && (
            <div className="text-sm text-red-600">You need admin role to manage other users.</div>
          )}
            <div className="space-y-2">
            <div className="text-sm font-medium">Your current role: {user.role}</div>
            <Select value={role} onValueChange={(v) => setRole(parseRole(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={updateOwnRole}>Update My Role</Button>
          </div>
          {canAccessAdmin && (
            <div className="space-y-4">
              <div className="text-sm font-medium">Active Users</div>
              {loadingUsers ? (
                <div className="text-sm text-muted-foreground">Loading users...</div>
              ) : (
                <div className="space-y-2">
                  {users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between border rounded-md p-3">
                      <div className="text-sm">
                        <div className="font-medium">{u.email || u.id}</div>
                        <div className="text-muted-foreground">Confirmed: {u.emailConfirmed ? 'Yes' : 'No'}</div>
                      </div>
                      <Select value={u.role} onValueChange={(v) => changeUserRole(u.id, parseRole(v))}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            Full user management requires a secure server-side service key; once provided, we will enable listing users and changing roles for any account.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
