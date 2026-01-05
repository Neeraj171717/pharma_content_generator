'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabaseClient } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import { ArrowLeft, Edit, Download, Share2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

type ContentStatus = 'draft' | 'review' | 'published'

type ContentItem = {
  id: string
  title: string
  content: string
  status: ContentStatus
  trustScore: number
  createdAt: string
  updatedAt: string
  author: { name: string }
}

export default function ContentDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { user, isLoading: authLoading } = useAuth()
  const [item, setItem] = useState<ContentItem | null>(null)
  const [loading, setLoading] = useState(true)
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

  const updateStatus = async (status: ContentStatus) => {
    if (!item) return
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ id: item.id, status }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = typeof err?.message === 'string' ? err.message : 'Failed to update status'
        toast.error(msg)
        return
      }
      setItem((prev) => (prev ? { ...prev, status } : prev))
      toast.success('Status updated')
    } catch {
      toast.error('Failed to update status')
    }
  }

  const downloadAsDoc = () => {
    if (!item) return
    const safeTitle = (item.title || 'content').replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '_') || 'content'
    const escaped = String(item.content || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r?\n/g, '<br/>')
    const html = `<!doctype html><html><head><meta charset="utf-8"/></head><body><h1>${safeTitle}</h1><div>${escaped}</div></body></html>`
    const blob = new Blob([html], { type: 'application/msword;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeTitle}.doc`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const share = async () => {
    if (!item) return
    try {
      const url = `${window.location.origin}/content/${item.id}`
      const nav = typeof window !== 'undefined' ? window.navigator : undefined
      const navWithShare = nav as (Navigator & {
        share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>
      }) | undefined
      if (navWithShare?.share) {
        await navWithShare.share({
          title: item.title,
          text: item.title,
          url,
        })
        return
      }
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(url)
        toast.success('Link copied')
        return
      }
      toast.error('Sharing is not supported in this browser')
    } catch {
      toast.error('Failed to share')
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

  const statusBadge =
    item.status === 'published'
      ? <Badge className="bg-green-100 text-green-800">Published</Badge>
      : item.status === 'review'
        ? <Badge className="bg-yellow-100 text-yellow-800">In Review</Badge>
        : <Badge variant="secondary">Draft</Badge>

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="outline" onClick={() => router.push('/content')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push(`/content/${item.id}/edit`)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="outline" onClick={downloadAsDoc}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" onClick={share}>
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>
                Updated {new Date(item.updatedAt).toLocaleDateString()} by {item.author.name}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {statusBadge}
              <select
                className="px-2 py-1 border rounded-md bg-background text-sm"
                value={item.status}
                onChange={(e) => updateStatus(e.target.value as ContentStatus)}
              >
                <option value="draft">Draft</option>
                <option value="review">In Review</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose max-w-none whitespace-pre-wrap">{item.content}</div>
        </CardContent>
      </Card>
    </div>
  )
}
