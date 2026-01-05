'use client'
import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from 'sonner'

function stableSeedFromString(input: string) {
  const str = String(input || '')
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 1000000000
}

export default function CreateContentPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [primaryKeyword, setPrimaryKeyword] = useState('')
  const [secondaryKeyword, setSecondaryKeyword] = useState('')
  const [targetWordCount, setTargetWordCount] = useState(2000)
  const [internetFallbackUsed, setInternetFallbackUsed] = useState(false)
  const [contentSourceNotice, setContentSourceNotice] = useState('')
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [heroImageDownloadUrl, setHeroImageDownloadUrl] = useState('')
  const [generatingHero, setGeneratingHero] = useState(false)
  const [draftId, setDraftId] = useState('')
  const validContentTypes = [
    'long_article',
    'short_article',
    'web2_article',
    'pr',
    'webpage_revision',
    'meta_tags',
    'webpage_summary',
  ] as const
  type ContentType = (typeof validContentTypes)[number]
  const isContentType = (v: string): v is ContentType => (validContentTypes as readonly string[]).includes(v)
  const contentTypePresets: Record<
    ContentType,
    { label: string; defaultWords: number; recommendedMin: number; recommendedMax: number }
  > = {
    long_article: { label: 'Long Articles', defaultWords: 1800, recommendedMin: 1500, recommendedMax: 2000 },
    short_article: { label: 'Short Articles', defaultWords: 750, recommendedMin: 500, recommendedMax: 900 },
    web2_article: { label: 'Web 2.0 articles', defaultWords: 1000, recommendedMin: 800, recommendedMax: 1200 },
    pr: { label: 'PR', defaultWords: 700, recommendedMin: 500, recommendedMax: 900 },
    webpage_revision: {
      label: 'Webpage content revision with keywords',
      defaultWords: 900,
      recommendedMin: 600,
      recommendedMax: 1400,
    },
    meta_tags: { label: 'Meta tags for web pages', defaultWords: 120, recommendedMin: 60, recommendedMax: 200 },
    webpage_summary: { label: 'Summary of web pages', defaultWords: 250, recommendedMin: 150, recommendedMax: 350 },
  }
  const [contentType, setContentType] = useState<ContentType>('long_article')
  const validModes = ['news', 'general', 'private'] as const
  type Mode = (typeof validModes)[number]
  const isMode = (v: string): v is Mode => (validModes as readonly string[]).includes(v)
  const [mode, setMode] = useState<Mode>('general')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!user) {
    router.push('/auth/login')
    return null
  }

  const submit = async () => {
    try {
      setSaving(true)
      const { data: session } = await supabaseClient.auth.getSession()
      if (!session?.session) throw new Error('Not authenticated')
      const token = session.session.access_token
      if (!title.trim() || !body.trim()) {
        toast.error('Title and content are required')
        return
      }

      if (draftId) {
        const r = await fetch('/api/content', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: draftId, title, content: body, mode }),
        })
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          const msg = typeof err?.message === 'string' ? err.message : 'Failed to save'
          toast.error(msg)
          return
        }
        toast.success('Content saved')
      } else {
        const r = await fetch('/api/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title, content: body, mode }),
        })
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          const msg = typeof err?.message === 'string' ? err.message : 'Failed to save'
          toast.error(msg)
          return
        }
        const json = await r.json().catch(() => ({}))
        if (typeof json?.id === 'string') setDraftId(json.id)
        toast.success('Content saved')
      }
      router.push('/content')
    } finally {
      setSaving(false)
    }
  }

  const generate = async () => {
    try {
      setGenerating(true)
      setInternetFallbackUsed(false)
      setContentSourceNotice('')
      setHeroImageUrl('')
      setHeroImageDownloadUrl('')
      setDraftId('')

      const payload = {
        topic: title,
        keyword: primaryKeyword,
        primaryKeyword,
        secondaryKeyword,
        targetWordCount,
        mode,
        userId: user.id,
        contentType,
        inputBody: body,
      }

      const controller = new AbortController()
      const timeoutMs = targetWordCount >= 1500 ? 300000 : 240000
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      let r: Response
      try {
        r = await fetch('/api/rag/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

      if (!r.ok) {
        const errData = await r.json().catch(() => ({}))
        const details = typeof errData?.details === 'string' ? `: ${errData.details}` : ''
        throw new Error((errData?.error ? String(errData.error) : `Server error (${r.status})`) + details)
      }

      const data = await r.json()
      setDraftId(typeof data?.draft_id === 'string' ? data.draft_id : '')

      const trustScore = typeof data?.trust_score === 'number' ? data.trust_score : Number(data?.trust_score)
      const warnings = Array.isArray(data?.warnings) ? (data.warnings as unknown[]).map((w) => String(w)) : []
      const blocked = Boolean(data?.blocked) || (Number.isFinite(trustScore) && trustScore < 80)
      const fallbackUsed = Boolean(data?.internet_fallback_used)
      setInternetFallbackUsed(fallbackUsed)
      setContentSourceNotice(typeof data?.content_source_notice === 'string' ? data.content_source_notice : '')
      setHeroImageUrl(typeof data?.hero_image_url === 'string' ? data.hero_image_url : '')
      setHeroImageDownloadUrl(typeof data?.hero_image_download_url === 'string' ? data.hero_image_download_url : '')
      const humanized = Boolean(data?.humanized)

      if (blocked) {
        const reviewBody = data?.review_body ? String(data.review_body) : data?.body ? String(data.body) : ''
        setBody(reviewBody)
        toast.warning('This content requires manual review', {
          description: warnings[0] || `Trust score: ${trustScore || 0}%`,
        })
        return
      }

      if (data?.body) {
        setBody(String(data.body))
        toast.success('Content generated successfully')
        if (fallbackUsed) {
          toast.message('Internet sources were used', {
            description: 'No universe sources were found; the output includes a Content Source Notice.',
          })
        }
        if (humanized) {
          toast.message('Content humanized', { description: 'A humanization pass was applied.' })
        }
        if (warnings.length) toast.message('Warnings', { description: warnings[0] })
      } else {
        throw new Error('Generation failed: No content returned')
      }
    } catch (e: unknown) {
      const message =
        typeof e === 'object' && e !== null && 'name' in e && (e as { name?: unknown }).name === 'AbortError'
          ? 'Request timed out'
          : e instanceof Error
            ? e.message
            : 'Error'
      toast.error('Generation failed', { description: message })
    } finally {
      setGenerating(false)
    }
  }

  const generateHeroImage = async () => {
    try {
      setGeneratingHero(true)
      if (!title.trim() || !primaryKeyword.trim()) {
        toast.error('Hero image needs a title and primary keyword')
        return
      }
      const parts = [title.trim(), primaryKeyword.trim(), secondaryKeyword.trim()].filter(Boolean)
      const prompt = `${parts.join('. ')}. Professional medical/pharma hero illustration, clean, minimal, no text.`
      const seed = stableSeedFromString(prompt)
      setHeroImageUrl(
        `/api/ai/hero/download?prompt=${encodeURIComponent(prompt)}&width=1024&height=576&seed=${seed}&disposition=inline`
      )
      setHeroImageDownloadUrl(
        `/api/ai/hero/download?prompt=${encodeURIComponent(prompt)}&width=1024&height=576&seed=${seed}`
      )
      toast.success('Hero image generated')
    } catch (e: unknown) {
      toast.error('Hero image failed', { description: e instanceof Error ? e.message : 'Error' })
    } finally {
      setGeneratingHero(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Create Content</CardTitle>
          <CardDescription>Enter the title and keywords.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {internetFallbackUsed ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {contentSourceNotice || 'This content was generated from internet sources, not from the approved universe.'}
            </div>
          ) : null}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Hero image</div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={generateHeroImage} disabled={generatingHero || !title || !primaryKeyword}>
                  {generatingHero ? 'Generating image...' : 'Generate hero image'}
                </Button>
                <Button asChild variant="outline" disabled={!heroImageDownloadUrl}>
                  <a href={heroImageDownloadUrl || '#'}>Download</a>
                </Button>
              </div>
            </div>
            <div className="rounded-md border bg-background p-2">
              {heroImageUrl ? (
                <Image src={heroImageUrl} alt="Hero image" width={1024} height={576} className="h-auto w-full rounded-md" />
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Generate content (or click “Generate hero image”) to preview here.
                </div>
              )}
            </div>
          </div>
          <div>
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Input
              placeholder="Primary keyword"
              value={primaryKeyword}
              onChange={(e) => setPrimaryKeyword(e.target.value)}
            />
          </div>
          <div>
            <Input
              placeholder="Secondary keyword"
              value={secondaryKeyword}
              onChange={(e) => setSecondaryKeyword(e.target.value)}
            />
          </div>
          <div>
            <Textarea placeholder="Body" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Select
              value={contentType}
              onValueChange={(v) => {
                const next = isContentType(v) ? v : 'long_article'
                setContentType(next)
                const preset = contentTypePresets[next]
                setTargetWordCount(preset.defaultWords)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select content type" />
              </SelectTrigger>
              <SelectContent>
                {validContentTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {contentTypePresets[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={50}
              max={2000}
              step={10}
              value={targetWordCount}
              onChange={(e) => setTargetWordCount(Number(e.target.value) || 0)}
            />
            <div className="text-sm text-muted-foreground">
              Recommended: {contentTypePresets[contentType].recommendedMin}-{contentTypePresets[contentType].recommendedMax}{' '}
              words
            </div>
            <div className="h-2 w-full rounded bg-muted">
              <div
                className="h-2 rounded bg-primary transition-all"
                style={{
                  width: `${Math.max(0, Math.min(100, (body.trim().split(/\s+/).filter(Boolean).length / Math.max(1, targetWordCount)) * 100))}%`,
                }}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {body.trim().split(/\s+/).filter(Boolean).length} / {targetWordCount} words
            </div>
          </div>
          <div>
            <Select value={mode} onValueChange={(v) => setMode(isMode(v) ? v : 'general')}>
              <SelectTrigger>
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="news">News</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={generate} disabled={generating || !title || !primaryKeyword}>
              {generating ? 'Generating...' : 'Generate Content'}
            </Button>
            <Button onClick={submit} disabled={saving || !title || !body}>{saving ? 'Saving...' : 'Save'}</Button>
            <Button variant="outline" onClick={() => router.push('/content')}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
