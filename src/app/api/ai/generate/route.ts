import { NextResponse } from 'next/server'
import { env, requireKeys } from '@/lib/env'

function stripCodeFences(text: string) {
  const t = String(text || '').trim()
  if (!t) return ''
  return t.replace(/^```[a-z0-9_-]*\s*/i, '').replace(/```$/i, '').trim()
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function normalizeClientTarget(v: unknown) {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  if (s === 'aurigene' || s === 'onesource' || s === 'other') return s
  return 'other'
}

export async function POST(req: Request) {
  try {
    try {
      requireKeys(['openRouterApiKey'])
    } catch {
      return NextResponse.json({ error: 'missing_openrouter_key' }, { status: 500 })
    }
    const bodyUnknown: unknown = await req.json().catch(() => null)
    const body = isRecord(bodyUnknown) ? bodyUnknown : {}
    const prompt = typeof body.prompt === 'string' ? body.prompt : ''
    const kind = typeof body.kind === 'string' ? body.kind.trim() : ''

    if (kind === 'title_suggestion') {
      const primaryKeyword = typeof body.primaryKeyword === 'string' ? body.primaryKeyword.trim() : ''
      const secondaryKeyword = typeof body.secondaryKeyword === 'string' ? body.secondaryKeyword.trim() : ''
      const blogContext = typeof body.blogContext === 'string' ? body.blogContext.trim() : ''
      const clientTarget = normalizeClientTarget(body.clientTarget)
      if (!primaryKeyword) return NextResponse.json({ error: 'primaryKeyword required' }, { status: 400 })

      const audienceHint =
        clientTarget === 'aurigene'
          ? 'Audience: pharma services / CDMO prospects (Aurigene-style).'
          : clientTarget === 'onesource'
            ? 'Audience: CDMO prospects (OneSource-style).'
            : 'Audience: pharma/biotech professionals.'
      const contextLine = blogContext ? `Blog Context/Idea: ${blogContext}` : ''
      const user = `Primary keyword: ${primaryKeyword}\nSecondary keyword: ${secondaryKeyword || 'None'}\n${contextLine}\n${audienceHint}`
      const system =
        'You write SEO/AEO/GEO friendly blog titles for pharma/biotech.\n\nReturn ONLY valid JSON (no markdown, no code fences) with this exact shape:\n{ "titles": string[] }\n\nRules:\n- Provide 5 distinct titles\n- Keep each title <= 70 characters\n- Include primary keyword in every title\n- Include secondary keyword when it fits naturally (not forced)\n- If Blog Context is provided, ensure titles reflect that specific idea.\n- Make titles clear, specific, and non-promotional'

      const r = await fetch(`${env.openRouterBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.openRouterApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env.textModel || env.textModelFallback || 'openrouter/auto',
          temperature: 0.3,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
      if (!r.ok) return NextResponse.json({ error: 'generation_failed' }, { status: 500 })
      const data = await r.json().catch(() => null)
      const raw = String(data?.choices?.[0]?.message?.content || '').trim()
      const cleaned = stripCodeFences(raw)
      let titles: string[] = []
      try {
        const parsed = JSON.parse(cleaned) as unknown
        if (isRecord(parsed) && Array.isArray(parsed.titles)) {
          titles = (parsed.titles as unknown[]).map((t) => String(t || '').trim()).filter(Boolean)
        }
      } catch {}
      if (titles.length === 0) {
        titles = cleaned
          .split('\n')
          .map((l) => l.replace(/^\s*[-*\d.]+\s*/, '').trim())
          .filter(Boolean)
          .slice(0, 5)
      }
      const title = titles[0] || ''
      return NextResponse.json({ title, titles })
    }

    if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

    const r = await fetch(`${env.openRouterBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.textModel || env.textModelFallback || 'openrouter/auto',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!r.ok) return NextResponse.json({ error: 'generation_failed' }, { status: 500 })
    const data = await r.json()
    const content = data.choices?.[0]?.message?.content || ''
    return NextResponse.json({ content })
  } catch (e: unknown) {
    const details = e instanceof Error ? e.message : 'unknown_error'
    return NextResponse.json({ error: 'server_error', details }, { status: 500 })
  }
}
