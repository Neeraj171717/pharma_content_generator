'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { supabaseClient } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import { ArrowLeft, Eye, Save } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

type ContentStatus = 'draft' | 'review' | 'published'

type ContentItem = {
  id: string
  title: string
  content: string
  status: ContentStatus
}

export default function ContentEditPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { user, isLoading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [item, setItem] = useState<ContentItem | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<ContentStatus>('draft')

  const id = useMemo(() => String(params?.id || '').trim(), [params])

  const getAuthHeaders = useCallback(async () => {
    const { data: session } = await supabaseClient.auth.getSession()
    const token = session?.session?.access_token
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }, [])

  const fetchItem = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/content?id=${encodeURIComponent(id)}`, { headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = typeof err?.message === 'string' ? err.message : 'Failed to load content'
        toast.error(msg)
        setItem(null)
        return
      }
      const data = (await res.json().catch(() => null)) as ContentItem | null
      if (!data?.id) {
        toast.error('Content not found')
        setItem(null)
        return
      }
      setItem(data)
      setTitle(data.title || '')
      setContent(data.content || '')
      setStatus(data.status || 'draft')
    } catch {
      toast.error('Failed to load content')
      setItem(null)
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders, id])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login')
      return
    }
    if (!authLoading && user) void fetchItem()
  }, [authLoading, fetchItem, router, user])

  const save = async () => {
    if (!item) return
    const nextTitle = title.trim()
    if (!nextTitle) {
      toast.error('Title is required')
      return
    }
    if (!content.trim()) {
      toast.error('Content is required')
      return
    }
    try {
      setSaving(true)
      const headers = await getAuthHeaders()
      const res = await fetch('/api/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ id: item.id, title: nextTitle, content, status }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = typeof err?.message === 'string' ? err.message : 'Failed to save'
        toast.error(msg)
        return
      }
      toast.success('Saved')
      router.push(`/content/${item.id}`)
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) return null

  if (!item) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Content not found</CardTitle>
            <CardDescription>The requested content is missing or you do not have access.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.push('/content')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="outline" onClick={() => router.push(`/content/${item.id}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push(`/content/${item.id}`)}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit Content</CardTitle>
          <CardDescription>Update title, status, and body</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Title</div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Status</div>
            <select
              className="w-full px-3 py-2 border rounded-md bg-background"
              value={status}
              onChange={(e) => setStatus(e.target.value as ContentStatus)}
            >
              <option value="draft">Draft</option>
              <option value="review">In Review</option>
              <option value="published">Published</option>
            </select>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Content</div>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[360px]" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
