import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { env, requireKeys } from '@/lib/env'

type RagDoc = { title?: string | null; url?: string | null; content?: string | null; source?: string | null }
type Citation = { title: string; url: string; source: string }
type CollectDoc = { title?: string | null; url?: string | null; content?: string | null; source?: string | null }
type PrivateChunk = { content?: string | null; metadata?: unknown }

type ValidationAgentResult = { status: 'pass' | 'fail'; issues: string[]; confidence: number }
type ValidationSwarmResults = {
  citation: ValidationAgentResult
  recency: ValidationAgentResult
  fact_check: ValidationAgentResult
  tone: ValidationAgentResult
}

type OpenRouterUsageEvent = {
  purpose: string
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost_usd: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function timeoutSignal(ms: number): AbortSignal {
  const anyAbortSignal = AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }
  if (typeof anyAbortSignal?.timeout === 'function') return anyAbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function numberOrNull(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

function safeJsonParse(text: string): unknown | null {
  const t = String(text || '').trim()
  if (!t) return null
  try {
    return JSON.parse(t)
  } catch {}
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const slice = t.slice(start, end + 1)
    try {
      return JSON.parse(slice)
    } catch {}
  }
  return null
}

function normalizeAgentResult(raw: unknown, fallbackIssue: string): ValidationAgentResult {
  if (!isRecord(raw)) return { status: 'fail', issues: [fallbackIssue], confidence: 0 }
  const statusRaw = raw.status
  const status: 'pass' | 'fail' = statusRaw === 'pass' ? 'pass' : 'fail'
  const issuesRaw = raw.issues
  const issues =
    Array.isArray(issuesRaw) ? issuesRaw.map((i) => String(i)).filter((s) => s.trim()).slice(0, 25) : []
  const confidenceRaw = raw.confidence
  const confidence = clamp(typeof confidenceRaw === 'number' ? confidenceRaw : Number(confidenceRaw), 0, 1)
  return { status, issues, confidence: Number.isFinite(confidence) ? confidence : 0 }
}

async function callOpenRouterJson(opts: {
  model: string
  system: string
  user: string
  timeoutMs: number
  purpose?: string
  onUsage?: (event: OpenRouterUsageEvent) => void
}): Promise<{ ok: true; parsed: unknown; rawText: string; usage: OpenRouterUsageEvent | null } | { ok: false; reason: string }> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), opts.timeoutMs)
  try {
    const res = await fetch(`${env.openRouterBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.openRouterApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        temperature: 0,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
      }),
      signal: controller.signal,
    })
    clearTimeout(id)
    if (!res.ok) return { ok: false, reason: `openrouter_http_${res.status}` }
    const json = await res.json().catch(() => null)
    const rawText = String(json?.choices?.[0]?.message?.content || '').trim()
    const usageRaw = isRecord(json) ? (json.usage as unknown) : null
    const usageRec = isRecord(usageRaw) ? usageRaw : null
    const promptTokens = numberOrNull(usageRec?.prompt_tokens) ?? 0
    const completionTokens = numberOrNull(usageRec?.completion_tokens) ?? 0
    const totalTokens = numberOrNull(usageRec?.total_tokens) ?? promptTokens + completionTokens
    const costUsd =
      numberOrNull((usageRec as Record<string, unknown> | null)?.total_cost) ??
      numberOrNull((usageRec as Record<string, unknown> | null)?.cost) ??
      numberOrNull((usageRec as Record<string, unknown> | null)?.total_cost_usd) ??
      null
    const usageEvent: OpenRouterUsageEvent = {
      purpose: String(opts.purpose || 'json'),
      model: String(opts.model || ''),
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      cost_usd: costUsd,
    }
    opts.onUsage?.(usageEvent)
    const parsed = safeJsonParse(rawText)
    if (!parsed) return { ok: false, reason: 'invalid_json' }
    return { ok: true, parsed, rawText, usage: usageEvent }
  } catch (e: unknown) {
    clearTimeout(id)
    const reason =
      typeof e === 'object' && e !== null && 'name' in e && (e as { name?: unknown }).name === 'AbortError'
        ? 'timeout'
        : errorMessage(e)
    return { ok: false, reason }
  }
}

async function callOpenRouterText(opts: {
  model: string
  system: string
  user: string
  timeoutMs: number
  purpose: string
  onUsage?: (event: OpenRouterUsageEvent) => void
}): Promise<{ ok: true; text: string; usage: OpenRouterUsageEvent | null } | { ok: false; reason: string }> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), opts.timeoutMs)
  try {
    const res = await fetch(`${env.openRouterBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.openRouterApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
      }),
      signal: controller.signal,
    })
    clearTimeout(id)
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { ok: false, reason: errText || `openrouter_http_${res.status}` }
    }
    const json = await res.json().catch(() => null)
    const text = String(json?.choices?.[0]?.message?.content || '').trim()
    const usageRaw = isRecord(json) ? (json.usage as unknown) : null
    const usageRec = isRecord(usageRaw) ? usageRaw : null
    const promptTokens = numberOrNull(usageRec?.prompt_tokens) ?? 0
    const completionTokens = numberOrNull(usageRec?.completion_tokens) ?? 0
    const totalTokens = numberOrNull(usageRec?.total_tokens) ?? promptTokens + completionTokens
    const costUsd =
      numberOrNull((usageRec as Record<string, unknown> | null)?.total_cost) ??
      numberOrNull((usageRec as Record<string, unknown> | null)?.cost) ??
      numberOrNull((usageRec as Record<string, unknown> | null)?.total_cost_usd) ??
      null
    const usageEvent: OpenRouterUsageEvent = {
      purpose: String(opts.purpose || 'text'),
      model: String(opts.model || ''),
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      cost_usd: costUsd,
    }
    opts.onUsage?.(usageEvent)
    return { ok: true, text, usage: usageEvent }
  } catch (e: unknown) {
    clearTimeout(id)
    const reason =
      typeof e === 'object' && e !== null && 'name' in e && (e as { name?: unknown }).name === 'AbortError'
        ? 'timeout'
        : errorMessage(e)
    return { ok: false, reason }
  }
}

type Timed<T> = { ok: true; value: T } | { ok: false; reason: string }

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, reason: string): Promise<Timed<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<Timed<T>>((resolve) => {
    timeoutId = setTimeout(() => resolve({ ok: false, reason }), ms)
  })
  const result = await Promise.race([promise.then((value) => ({ ok: true as const, value })), timeout])
  if (timeoutId) clearTimeout(timeoutId)
  return result
}

function normalizeUrlString(input: string): string {
  const raw = String(input || '').trim()
  if (!raw) return ''
  let candidate = raw
  if (candidate.startsWith('//')) candidate = `https:${candidate}`
  if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
    if (candidate.startsWith('www.')) {
      candidate = `https://${candidate}`
    } else if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(candidate)) {
      candidate = `https://${candidate}`
    }
  }
  try {
    const u = new URL(candidate)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return u.toString()
  } catch {
    return ''
  }
}

function stableSeedFromString(input: string) {
  const str = String(input || '')
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 1000000000
}

async function checkUrlExists(url: string, timeoutMs: number): Promise<{ ok: boolean; url: string; status: number | null }> {
  const u = normalizeUrlString(url)
  if (!u) return { ok: false, url: '', status: null }
  try {
    const res = await fetch(u, {
      method: 'GET',
      headers: { ...INTERNET_FETCH_HEADERS, Range: 'bytes=0-2048' },
      redirect: 'follow',
      signal: timeoutSignal(timeoutMs),
    })
    const status = res.status
    const ok =
      (status >= 200 && status < 400) ||
      status === 401 ||
      status === 403 ||
      status === 405 ||
      status === 429
    return { ok, url: normalizeUrlString(res.url || u) || u, status }
  } catch {
    return { ok: false, url: u, status: null }
  }
}

async function verifyUrls(docs: RagDoc[]) {
  const normalized = docs.map((d) => {
    const raw = String(d.url || '').trim()
    if (!raw) return { ...d, url: '' }
    const url = normalizeUrlString(raw)
    return { ...d, url: url || '' }
  })

  const toCheck = normalized
    .map((d, idx) => ({ idx, url: String(d.url || '').trim() }))
    .filter((x) => x.url)
    .slice(0, 8)

  const checks = await Promise.all(toCheck.map((x) => checkUrlExists(x.url, 3000)))
  const okIndex = new Set<number>()
  for (let i = 0; i < toCheck.length; i++) {
    const row = toCheck[i]
    const chk = checks[i]
    if (!chk.ok) continue
    okIndex.add(row.idx)
    normalized[row.idx] = { ...normalized[row.idx], url: chk.url }
  }

  return normalized.filter((_, idx) => okIndex.has(idx)) as RagDoc[]
}

function escapeForIlike(input: string) {
  return String(input || '').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

async function fallbackPublicTextSearch(args: { query: string; topK: number }) {
  const q = String(args.query || '').trim()
  if (!q) return [] as RagDoc[]
  const qLike = `%${escapeForIlike(q)}%`
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('id,title,url,content,source,date_published')
    .or(`title.ilike.${qLike},content.ilike.${qLike}`)
    .order('date_published', { ascending: false })
    .limit(Math.max(1, Math.floor(args.topK || 5)))
  if (error) throw error
  return Array.isArray(data) ? (data as RagDoc[]) : ([] as RagDoc[])
}

async function fallbackPrivateTextSearch(args: { query: string; userId: string; topK: number }) {
  const q = String(args.query || '').trim()
  if (!q) return [] as Array<{ content?: string | null; metadata?: unknown }>
  const qLike = `%${escapeForIlike(q)}%`
  const { data, error } = await supabaseAdmin
    .from('user_vectors')
    .select('content,metadata')
    .eq('user_id', args.userId)
    .ilike('content', qLike)
    .limit(Math.max(1, Math.floor(args.topK || 5)))
  if (error) throw error
  return Array.isArray(data) ? (data as Array<{ content?: string | null; metadata?: unknown }>) : []
}

function scoreKeywordMatch(text: string, keyword: string) {
  const hay = String(text || '').toLowerCase()
  const tokens = String(keyword || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4)
  if (tokens.length === 0) return 0
  let score = 0
  for (const t of tokens) {
    if (hay.includes(t)) score += 1
  }
  return score
}

function stripTrailingSourcesSection(text: string) {
  const idx = text.search(/\n##\s*(Sources\s*\/\s*References|Sources|References)\s*[\r\n]/i)
  if (idx === -1) return text.trim()
  return text.slice(0, idx).trim()
}

function formatSourcesSection(citations: Citation[]) {
  if (!citations || citations.length === 0) return `\n\n## Sources / References\nNo sources were retrieved.\n`
  const refs = citations
    .map((c, i) => {
      const title = String(c.title || 'Source').trim() || 'Source'
      const url = String(c.url || '').trim()
      return url ? `[${i + 1}] ${title} - ${url}` : `[${i + 1}] ${title}`
    })
    .join('\n')
  return `\n\n## Sources / References\n${refs}\n`
}

function buildGenerationNotice(args: { contentSource: string; status: string }) {
  const source = String(args.contentSource || '').trim()
  const status = String(args.status || '').trim()
  return `## Generation Notice\nContent source: ${source}\nStatus: ${status}\n\n`
}

const INTERNET_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

function stripHtml(html: string) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleOfHtml(html: string) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? m[1].trim() : ''
}

function looksLikeAssetUrl(url: string) {
  const lower = url.toLowerCase()
  if (lower.includes('/favicon')) return true
  return /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|mjs|map|json|pdf|zip|rar|7z|gz|mp4|mp3|wav|woff2?|ttf|eot)(\?|#|$)/i.test(
    lower
  )
}

function extractDuckDuckGoResultUrls(html: string) {
  const out = new Set<string>()
  for (const m of String(html || '').matchAll(/href\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)) {
    const href = (m[1] || m[2] || '').trim()
    if (!href) continue
    try {
      const abs =
        href.startsWith('http://') || href.startsWith('https://')
          ? href
          : href.startsWith('//')
            ? `https:${href}`
            : href.startsWith('/')
              ? `https://duckduckgo.com${href}`
              : href
      if (!abs.includes('duckduckgo.com/l/')) continue
      const u = new URL(abs)
      const uddg = u.searchParams.get('uddg')
      if (!uddg) continue
      const decoded = decodeURIComponent(uddg)
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) out.add(decoded)
    } catch {}
  }
  return [...out]
}

function toHostSource(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Internet'
  }
}

async function fetchHtmlWithTimeout(url: string, ms: number) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { headers: INTERNET_FETCH_HEADERS, signal: controller.signal, redirect: 'follow' })
  } finally {
    clearTimeout(id)
  }
}

async function collectInternetDocs(args: { query: string; maxDocs: number; searchTimeoutMs: number; pageTimeoutMs: number }) {
  const q = String(args.query || '').trim()
  if (!q) return [] as Array<{ title: string; url: string; content: string; source: string }>
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`
  const sr = await fetchHtmlWithTimeout(searchUrl, args.searchTimeoutMs)
  const sh = await sr.text().catch(() => '')
  const resultUrls = extractDuckDuckGoResultUrls(sh)
    .map((u) => normalizeUrlString(u))
    .filter(Boolean)
    .filter((u) => !looksLikeAssetUrl(u))
    .slice(0, Math.max(args.maxDocs * 4, args.maxDocs))

  const docs: Array<{ title: string; url: string; content: string; source: string }> = []
  for (const u of resultUrls) {
    try {
      const pr = await fetchHtmlWithTimeout(u, args.pageTimeoutMs)
      const contentType = (pr.headers.get('content-type') || '').toLowerCase()
      if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) continue
      const html = await pr.text().catch(() => '')
      const text = stripHtml(html)
      const title = titleOfHtml(html) || u
      if (text.length < 300) continue
      docs.push({ title, url: u, content: text.slice(0, 12000), source: toHostSource(u) })
      if (docs.length >= args.maxDocs) break
    } catch {}
  }
  return docs
}

function isRetryableEdgeFunctionError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase()
  if (!msg) return false
  if (msg.includes('cohere_unavailable')) return false
  if (msg.includes('_timeout')) return true
  if (msg.includes('earlydrop')) return true
  if (msg.includes('shutdown')) return true
  if (msg.includes('edge function') && msg.includes('failed')) return true
  if (msg.includes('fetch failed')) return true
  if (msg.includes('econnreset')) return true
  if (msg.includes('etimedout')) return true
  if (msg.includes('socket')) return true
  if (msg.includes('504') || msg.includes('503')) return true
  return false
}

async function invokeEdgeFunctionWithRetry<T>(args: {
  fn: string
  body: Record<string, unknown>
  timeoutMs: number
  maxAttempts: number
}): Promise<{ data: T | null; error: unknown | null; attempts: number }> {
  const max = Math.max(1, Math.floor(args.maxAttempts))
  for (let attempt = 1; attempt <= max; attempt++) {
    const inv = await withTimeout(
      supabaseAdmin.functions.invoke(args.fn, { body: args.body }),
      args.timeoutMs,
      `${args.fn}_timeout`
    )

    if (!inv.ok) {
      const err = new Error(inv.reason)
      if (attempt < max && isRetryableEdgeFunctionError(err)) {
        await new Promise((r) => setTimeout(r, 250 * attempt))
        continue
      }
      return { data: null, error: err, attempts: attempt }
    }

    const val = inv.value as unknown as { data?: unknown; error?: unknown } | null
    const fnError = val?.error ?? null
    if (fnError) {
      if (attempt < max && isRetryableEdgeFunctionError(fnError)) {
        await new Promise((r) => setTimeout(r, 250 * attempt))
        continue
      }
      return { data: null, error: fnError, attempts: attempt }
    }

    return { data: (val?.data as T) ?? null, error: null, attempts: attempt }
  }

  return { data: null, error: new Error('unreachable'), attempts: max }
}

async function validation_swarm(args: {
  draft: string
  mode: string
  topic: string
  keyword: string
  citations: Citation[]
  ragChunks: Array<{ content: string; metadata: Record<string, unknown> }>
  todayISO: string
  recencyDays: number
  internetFallbackUsed: boolean
  onUsage?: (event: OpenRouterUsageEvent) => void
}): Promise<{
  results: ValidationSwarmResults
  trustScore: number
  warnings: string[]
  agentInserts: Array<{ agent_name: string; status: 'pass' | 'fail'; confidence: number; details: Record<string, unknown> }>
}> {
  const draft = args.draft.slice(0, 20000)
  const ragChunks = args.ragChunks.slice(0, 8).map((c) => ({
    content: String(c.content || '').slice(0, 1500),
    metadata: c.metadata || {},
  }))
  const citations = args.citations.slice(0, 10)

  const baseSystem = `You are a single-purpose validation agent.\n\nReturn ONLY valid JSON (no markdown, no code fences) with this exact shape:\n{ "status": "pass" | "fail", "issues": string[], "confidence": number }\n\nRules:\n- confidence is a number from 0 to 1\n- issues must be a list of short, specific strings\n- If you are uncertain or the evidence is missing, return status "fail".`

  const basePayload = {
    topic: args.topic,
    mode: args.mode,
    keyword: args.keyword,
    today: args.todayISO,
    recency_days: args.recencyDays,
    allowed_domains: env.allowedDomains,
    internet_fallback_used: args.internetFallbackUsed,
    citations,
    rag_chunks: ragChunks,
    draft,
  }

  const domainPolicy = args.internetFallbackUsed
    ? 'Do not fail due to URLs being outside allowed public domains.'
    : 'For public/news/general modes, fail if any cited URL is outside allowed public domains.'

  const citationCall = callOpenRouterJson({
    model: env.validationSwarmAgent1,
    timeoutMs: 7000,
    system: `${baseSystem}\n\nResponsibility: Citation Agent.\nFail if the draft uses citations that do not match the provided citations list, or makes significant claims without citations.\n${domainPolicy}\nFor private mode, sources may be internal SOP references without URLs; do not fail due to missing URLs.\nOnly evaluate citation correctness and coverage.`,
    user: JSON.stringify(basePayload),
    purpose: 'validation_citation',
    onUsage: args.onUsage,
  })

  const factCall = callOpenRouterJson({
    model: env.validationSwarmAgent3,
    timeoutMs: 9000,
    system: `${baseSystem}\n\nResponsibility: Fact-Check Agent.\nFail if the draft contains medical or factual claims not supported by the provided rag_chunks. Only use rag_chunks as evidence. List up to 10 unsupported claims in issues.`,
    user: JSON.stringify(basePayload),
    purpose: 'validation_fact_check',
    onUsage: args.onUsage,
  })

  const toneCall = callOpenRouterJson({
    model: env.validationSwarmAgent4,
    timeoutMs: 7000,
    system: `${baseSystem}\n\nResponsibility: Tone Agent.\nFail if the draft contains prohibited pharma marketing language (guarantees, cure claims, exaggerated efficacy/safety, off-label promotion, or overly salesy tone). List specific phrases or sentences in issues.`,
    user: JSON.stringify(basePayload),
    purpose: 'validation_tone',
    onUsage: args.onUsage,
  })

  const recencyCall =
    args.mode === 'news' || args.internetFallbackUsed
      ? callOpenRouterJson({
          model: env.validationSwarmAgent2 || env.validationSwarmAgent1,
          timeoutMs: 7000,
          system: `${baseSystem}\n\nResponsibility: Recency Agent.\nFail if more than 20% of citations appear older than ${args.recencyDays} days based on the rag_chunks/citations content. If recency cannot be determined from provided evidence, return fail.`,
          user: JSON.stringify(basePayload),
          purpose: 'validation_recency',
          onUsage: args.onUsage,
        })
      : null

  const [citationRes, recencyRes, factRes, toneRes] = await Promise.all([
    citationCall,
    recencyCall ?? Promise.resolve({ ok: true as const, parsed: { status: 'pass', issues: ['skipped_non_news_mode'], confidence: 1 }, rawText: '', usage: null }),
    factCall,
    toneCall,
  ])

  const citationParsed = citationRes.ok ? normalizeAgentResult(citationRes.parsed, 'citation_agent_failed') : { status: 'fail' as const, issues: [`citation_agent_${citationRes.reason}`], confidence: 0 }
  const recencyParsed =
    args.mode === 'news' || args.internetFallbackUsed
      ? recencyRes.ok
        ? normalizeAgentResult(recencyRes.parsed, 'recency_agent_failed')
        : { status: 'fail' as const, issues: [`recency_agent_${recencyRes.reason}`], confidence: 0 }
      : normalizeAgentResult((recencyRes as { ok: true; parsed: unknown }).parsed, 'recency_skipped')
  const factParsed = factRes.ok ? normalizeAgentResult(factRes.parsed, 'fact_check_agent_failed') : { status: 'fail' as const, issues: [`fact_check_agent_${factRes.reason}`], confidence: 0 }
  const toneParsed = toneRes.ok ? normalizeAgentResult(toneRes.parsed, 'tone_agent_failed') : { status: 'fail' as const, issues: [`tone_agent_${toneRes.reason}`], confidence: 0 }

  const penalties = {
    citation: citationParsed.status === 'fail' ? 25 : 0,
    recency: (args.mode === 'news' || args.internetFallbackUsed) && recencyParsed.status === 'fail' ? 20 : 0,
    fact_check: factParsed.status === 'fail' ? 40 : 0,
    tone: toneParsed.status === 'fail' ? 15 : 0,
  }
  const trustScore = clamp(100 - penalties.citation - penalties.recency - penalties.fact_check - penalties.tone, 0, 100)

  const warnings: string[] = []
  if (trustScore < env.trustThreshold) warnings.push('This content requires manual review.')

  const agentInserts: Array<{ agent_name: string; status: 'pass' | 'fail'; confidence: number; details: Record<string, unknown> }> = [
    {
      agent_name: 'citation',
      status: citationParsed.status,
      confidence: Number(citationParsed.confidence.toFixed(2)),
      details: { ...citationParsed, raw_text: citationRes.ok ? citationRes.rawText : '' },
    },
    {
      agent_name: 'recency',
      status: recencyParsed.status,
      confidence: Number(recencyParsed.confidence.toFixed(2)),
      details: { ...recencyParsed, raw_text: args.mode === 'news' && recencyRes.ok ? recencyRes.rawText : '' },
    },
    {
      agent_name: 'fact_check',
      status: factParsed.status,
      confidence: Number(factParsed.confidence.toFixed(2)),
      details: { ...factParsed, raw_text: factRes.ok ? factRes.rawText : '' },
    },
    {
      agent_name: 'tone',
      status: toneParsed.status,
      confidence: Number(toneParsed.confidence.toFixed(2)),
      details: { ...toneParsed, raw_text: toneRes.ok ? toneRes.rawText : '' },
    },
  ]

  return {
    results: {
      citation: citationParsed,
      recency: recencyParsed,
      fact_check: factParsed,
      tone: toneParsed,
    },
    trustScore,
    warnings,
    agentInserts,
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { topic, keyword: keywordRaw, primaryKeyword, secondaryKeyword, mode, userId, targetWordCount, contentType, inputBody, humanizeLevel } =
      body as Record<string, unknown>
    const topicText = typeof topic === 'string' ? topic.trim() : String(topic || '').trim()
    const userIdText = typeof userId === 'string' ? userId.trim() : String(userId || '').trim()
    const primary = String(keywordRaw || primaryKeyword || '').trim()
    const secondary = typeof secondaryKeyword === 'string' ? secondaryKeyword.trim() : ''
    const keyword = [primary, secondary].filter(Boolean).join(' ').trim()
    const targetWordsParsed = Number(targetWordCount)
    const targetWords =
      Number.isFinite(targetWordsParsed) && targetWordsParsed > 0 ? Math.floor(targetWordsParsed) : undefined
    const targetWordsCapped = typeof targetWords === 'number' ? clamp(targetWords, 50, 2000) : undefined
    const inputBodyText = typeof inputBody === 'string' ? inputBody.trim() : ''
    const validHumanizeLevels = ['off', 'standard', 'strong'] as const
    type HumanizeLevel = (typeof validHumanizeLevels)[number]
    const isHumanizeLevel = (v: string): v is HumanizeLevel => (validHumanizeLevels as readonly string[]).includes(v)
    const humanizeLevelText: HumanizeLevel =
      typeof humanizeLevel === 'string' && isHumanizeLevel(humanizeLevel) ? humanizeLevel : 'standard'
    const openRouterUsage: OpenRouterUsageEvent[] = []
    const onUsage = (event: OpenRouterUsageEvent) => {
      openRouterUsage.push(event)
    }

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
    const isContentType = (v: string): v is ContentType =>
      (validContentTypes as readonly string[]).includes(v)
    const contentTypeText: ContentType =
      typeof contentType === 'string' && isContentType(contentType) ? contentType : 'long_article'

    // Check Env
    if (!env.supabaseServiceRoleKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Only require keys needed at this stage
    requireKeys(['supabaseServiceRoleKey'])
    
    if (!topicText || !keyword || !userIdText) {
      return NextResponse.json({ error: 'topic, primaryKeyword, userId required' }, { status: 400 })
    }

    try {
      requireKeys(['openRouterApiKey'])
    } catch {
      return NextResponse.json({ error: 'missing_openrouter_key' }, { status: 500 })
    }

    const isNewsMode = mode === 'news'
    const isPrivateMode = mode === 'private'
    const isGeneralMode = mode === 'general'
    const startedAt = Date.now()
    const remainingMs = () => 85000 - (Date.now() - startedAt)

    try {
      requireKeys(['validationSwarmAgent1', 'validationSwarmAgent3', 'validationSwarmAgent4'])
      if (isNewsMode) requireKeys(['validationSwarmAgent2'])
    } catch (e: unknown) {
      return NextResponse.json({ error: 'missing_validation_swarm_agents', details: errorMessage(e) }, { status: 500 })
    }

    // 1. Trigger Collection (Ingest & Embed)
    try {
      void fetch(`${env.appBaseUrl}/api/rag/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, waitForCompletion: false }),
      }).then(async (res) => {
        if (res.ok) {
          const cJson = await res.json().catch(() => null)
          if (isRecord(cJson) && 'inserted' in cJson) {
          }
        }
      }).catch((err) => {
        if (err?.name === 'TimeoutError' || err?.code === 23) return
        console.warn('[RAG] Background collection skipped:', err)
      })
    } catch (err) {
      console.warn('[RAG] Collection kickoff error:', err)
    }

    // Invoke Supabase Edge Function for Retrieval (Centralized RAG Logic)
    let context = '';
    let citations: Citation[] = [];
    const warnings: string[] = []
    let retrievalError: string | null = null
    let internetFallbackUsed = false
    let retrievedDocs: RagDoc[] = []
    let ragChunksForValidation: Array<{ content: string; metadata: Record<string, unknown> }> = []
    const queryDocsTimeoutMs = isNewsMode ? 18000 : 12000
    const queryDocsMaxAttempts = 2
    
    try {
      if (isPrivateMode) {
        const priv = await invokeEdgeFunctionWithRetry<unknown[]>({
          fn: 'query-docs',
          body: { query: `${topicText} ${keyword}`, mode: 'private', user_id: userIdText, top_k: 5 },
          timeoutMs: queryDocsTimeoutMs,
          maxAttempts: queryDocsMaxAttempts,
        })
        const privData = priv.data
        const privError = priv.error

        if (privError) {
          retrievalError = errorMessage(privError)
          console.error('[RAG] Edge Function Error (query-docs private):', privError)
        } else if (Array.isArray(privData)) {
          const chunks = privData as PrivateChunk[]
          context = chunks.map((d) => d.content || '').join('\n\n')
          citations = chunks
            .map((d) => d.metadata)
            .filter(isRecord)
            .map((m) => ({
              title: typeof m.title === 'string' && m.title.trim() ? m.title : 'SOP',
              url: typeof m.url === 'string' ? m.url : '',
              source: 'SOP',
            }))
          ragChunksForValidation = chunks.map((d) => ({
            content: String(d.content || ''),
            metadata: isRecord(d.metadata) ? (d.metadata as Record<string, unknown>) : {},
          }))
        } else {
          console.warn('[RAG] Edge Function returned no data or invalid format (private):', privData)
        }

        if (!context) {
          try {
            const fallbackChunks = await fallbackPrivateTextSearch({
              query: `${topicText} ${keyword}`,
              userId: userIdText,
              topK: 5,
            })
            if (fallbackChunks.length > 0) {
              warnings.push('Used private text search fallback for retrieval.')
              context = fallbackChunks.map((d) => d.content || '').join('\n\n')
              citations = fallbackChunks
                .map((d) => d.metadata)
                .filter(isRecord)
                .map((m) => ({
                  title: typeof m.title === 'string' && m.title.trim() ? m.title : 'SOP',
                  url: typeof m.url === 'string' ? m.url : '',
                  source: 'SOP',
                }))
              ragChunksForValidation = fallbackChunks.map((d) => ({
                content: String(d.content || ''),
                metadata: isRecord(d.metadata) ? (d.metadata as Record<string, unknown>) : {},
              }))
            }
          } catch (err) {
            warnings.push(`Private text search fallback failed: ${errorMessage(err)}`)
          }
        }

        if (context && citations.length === 0) {
          citations = [{ title: 'SOP', url: '', source: 'SOP' }]
        }
      } else {
        const pub = await invokeEdgeFunctionWithRetry<unknown[]>({
          fn: 'query-docs',
          body: {
            query: `${topicText} ${keyword}`,
            mode: 'public',
            user_id: userIdText,
            top_k: 5,
          },
          timeoutMs: queryDocsTimeoutMs,
          maxAttempts: queryDocsMaxAttempts,
        })
        const retData = pub.data
        const retError = pub.error

        if (retError) {
          retrievalError = errorMessage(retError)
          const msg =
            isRecord(retError) && typeof (retError as Record<string, unknown>).message === 'string'
              ? String((retError as Record<string, unknown>).message)
              : String(retError)
          const ctxBody =
            isRecord(retError) && isRecord((retError as Record<string, unknown>).context)
              ? ((retError as Record<string, unknown>).context as Record<string, unknown>).body
              : undefined
          const ctxBodyText = typeof ctxBody === 'string' ? ctxBody : ctxBody ? JSON.stringify(ctxBody) : ''
          console.error('[RAG] Edge Function Error (query-docs):', retError)
          if (msg.includes('No recent data found') || ctxBodyText.includes('No recent data found')) {
            warnings.push('No recent data found in universe documents; falling back to internet or text search.')
          } else if (msg.toLowerCase().includes('earlydrop')) {
            warnings.push('Retrieval service dropped the request early; used internet or text search fallback.')
          }
        } else if (retData && Array.isArray(retData)) {
          const docs = retData as RagDoc[]
          retrievedDocs = docs
          const validDocs = await verifyUrls(docs)
          if (docs.length > 0 && validDocs.length === 0) warnings.push('All retrieved sources failed link validation and were discarded.')
          citations = validDocs
            .map((d) => ({
              title: d.title || 'Source',
              url: d.url || '',
              source: d.source || 'Unknown',
            }))
          context = validDocs.map((d) => `${d.title || ''}\n${d.content || ''}`).join('\n\n')
          ragChunksForValidation = validDocs.map((d) => ({
            content: String(d.content || ''),
            metadata: {
              title: d.title || 'Source',
              url: d.url || '',
              source: d.source || 'Unknown',
            },
          }))

          if (isGeneralMode) {
            const priv2 = await invokeEdgeFunctionWithRetry<unknown[]>({
              fn: 'query-docs',
              body: { query: `${topicText} ${keyword}`, mode: 'private', user_id: userIdText, top_k: 3 },
              timeoutMs: queryDocsTimeoutMs,
              maxAttempts: queryDocsMaxAttempts,
            })
            const privData2 = priv2.data
            const privError2 = priv2.error
            if (privError2) console.error('[RAG] Edge Function Error (query-docs private):', privError2)
            if (Array.isArray(privData2)) {
              const chunks2 = privData2 as PrivateChunk[]
              context += '\n\n' + chunks2.map((d) => d.content || '').join('\n\n')
              if (ragChunksForValidation.length === 0) {
                ragChunksForValidation = chunks2.map((d) => ({
                  content: String(d.content || ''),
                  metadata: isRecord(d.metadata) ? (d.metadata as Record<string, unknown>) : {},
                }))
              }
            }
          }
        } else {
          console.warn('[RAG] Edge Function returned no data or invalid format:', retData)
        }

        if (!context) {
          try {
            const fallbackDocs = await fallbackPublicTextSearch({ query: `${topicText} ${keyword}`, topK: 5 })
            if (fallbackDocs.length > 0) {
              warnings.push('Used universe text search fallback for retrieval.')
              retrievedDocs = fallbackDocs
              const docs2 = await verifyUrls(fallbackDocs)
              citations = docs2.map((d) => ({
                title: d.title || 'Source',
                url: d.url || '',
                source: d.source || 'Unknown',
              }))
              context = docs2.map((d) => `${d.title || ''}\n${d.content || ''}`).join('\n\n')
              ragChunksForValidation = docs2.map((d) => ({
                content: String(d.content || ''),
                metadata: {
                  title: d.title || 'Source',
                  url: d.url || '',
                  source: d.source || 'Unknown',
                },
              }))
            }
          } catch (err) {
            warnings.push(`Universe text search fallback failed: ${errorMessage(err)}`)
          }
        }
      }
    } catch (err) {
      retrievalError = errorMessage(err)
      console.error('[RAG] Retrieval Failed:', err);
    }

    if (!isPrivateMode && citations.length < 3) {
      try {
        const fr = await fetch(`${env.appBaseUrl}/api/rag/collect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword, returnDocuments: true, waitForCompletion: false }),
          signal: timeoutSignal(isNewsMode ? 20000 : 8000),
        })
        if (fr.ok) {
          const fJson = await fr.json().catch(() => null)
          const docsRaw = isRecord(fJson) ? fJson.documents : undefined
          const docs = Array.isArray(docsRaw) ? (docsRaw as CollectDoc[]) : []
          const edgeDocs = retrievedDocs.map((d) => ({
            title: d.title || 'Source',
            url: d.url || '',
            content: d.content || '',
            source: d.source || 'Unknown',
          }))
          const collectedDocs = docs.map((d) => ({
            title: d?.title || 'Source',
            url: d?.url || '',
            content: d?.content || '',
            source: d?.source || 'Unknown',
          }))
          const byUrl = new Map<string, { title: string; url: string; content: string; source: string }>()
          for (const d of [...edgeDocs, ...collectedDocs]) {
            const url = normalizeUrlString(String(d.url || ''))
            if (!url) continue
            if (!byUrl.has(url)) byUrl.set(url, { title: d.title, url, content: d.content, source: d.source })
          }
          const merged = [...byUrl.values()]
          if (merged.length > 0) {
            const scored = merged
              .map((d) => ({ d, score: scoreKeywordMatch(`${d.title} ${d.content}`, keyword) }))
              .sort((a, b) => b.score - a.score)
            const maxScore = scored[0]?.score || 0
            const ranked = (maxScore > 0 ? scored.filter((x) => x.score > 0) : scored).map((x) => x.d).slice(0, 5)
            const verified = await verifyUrls(ranked as unknown as RagDoc[])
            citations = verified.map((d) => ({ title: d.title || 'Source', url: d.url || '', source: d.source || 'Unknown' }))
            context = verified.map((d) => `${d.title || ''}\n${d.content || ''}`).join('\n\n')
            ragChunksForValidation = verified.map((d) => ({
              content: String(d.content || ''),
              metadata: {
                title: d.title || 'Source',
                url: d.url || '',
                source: d.source || 'Unknown',
              },
            }))
          }
        }
      } catch {}
    }

    if (!isPrivateMode && citations.length === 0) {
      try {
        const internetDocs = await collectInternetDocs({
          query: `${topicText} ${keyword}`,
          maxDocs: 5,
          searchTimeoutMs: 15000,
          pageTimeoutMs: 15000,
        })
        if (internetDocs.length > 0) {
          internetFallbackUsed = true
          warnings.push('No universe sources found; used internet sources as fallback.')
          citations = internetDocs.map((d) => ({
            title: d.title || 'Source',
            url: d.url,
            source: d.source || toHostSource(d.url),
          }))
          const internetContext = internetDocs.map((d) => `${d.title}\n${d.content}`).join('\n\n')
          context = context ? `${internetContext}\n\n${context}` : internetContext
          const internetChunks = internetDocs.map((d) => ({
            content: String(d.content || ''),
            metadata: { title: d.title, url: d.url, source: d.source || toHostSource(d.url) },
          }))
          ragChunksForValidation = [...internetChunks, ...ragChunksForValidation]
        }
      } catch (err) {
        warnings.push(`Internet fallback failed: ${errorMessage(err)}`)
      }
    }

    // Fallback if context is empty (optional, or just proceed)
    if (!context) {
    } else {
      context = context.slice(0, 8000)
    }

    if (citations.length === 0) {
      if (isPrivateMode) {
        return NextResponse.json(
          {
            error: 'no_sources',
            details: 'No valid sources found from retrieved RAG documents.',
            retrieval_error: retrievalError,
          },
          { status: 422 }
        )
      }
      internetFallbackUsed = true
      warnings.push('No sources could be retrieved; generated a draft without verifiable citations.')
    }

    const sourcesList = citations
      .map((c, idx) => {
        const title = String(c.title || 'Source').trim() || 'Source'
        const url = String(c.url || '').trim()
        return url ? `[${idx + 1}] ${title} - ${url}` : `[${idx + 1}] ${title}`
      })
      .join('\n') || 'No sources were retrieved.'
    const contentTypeInstruction =
      contentTypeText === 'pr'
        ? `Content type requirements:\n- Write as a press release.\n- Include: Headline, Subheadline, Dateline, Summary, Body, Boilerplate, Media Contact.\n- Maintain a compliant, non-promotional tone.\n- Use citations like [1] for factual statements.`
        : contentTypeText === 'meta_tags'
          ? `Content type requirements:\n- Output ONLY meta/SEO assets for a single page.\n- Include: Title Tag (<=60 chars), Meta Description (<=155 chars), URL Slug, H1, 6-10 SEO Keywords, 5 internal link anchor suggestions.\n- If sources are missing a detail, do not invent it.`
          : contentTypeText === 'webpage_summary'
            ? `Content type requirements:\n- Output a concise summary.\n- Include: TL;DR (3 bullets), Key Takeaways (5 bullets), and a short Direct Answer paragraph.\n- Use citations like [1] for factual statements.`
            : contentTypeText === 'webpage_revision'
              ? `Content type requirements:\n- Revise the provided Existing Content using the primary and secondary keywords naturally.\n- Preserve meaning; remove prohibited/overly promotional language.\n- Use citations like [1] for factual statements when sources are provided.`
              : contentTypeText === 'web2_article'
                ? `Content type requirements:\n- Write as a Web 2.0 style blog post: simple headings, conversational but professional tone.\n- Use citations like [1] for factual statements.`
                : contentTypeText === 'short_article'
                  ? `Content type requirements:\n- Write a short article with concise sections.\n- Use citations like [1] for factual statements.`
                  : `Content type requirements:\n- Write a long-form article with deeper explanations.\n- Use citations like [1] for factual statements.`
    const hasSources = citations.length > 0
    const systemPrompt = isNewsMode
      ? hasSources
        ? `You are a fact-checking pharma news writer.\n\nHard rules:\n- Use ONLY the provided Context.\n- Never invent citations, URLs, dates, trial outcomes, efficacy, safety, approvals, or company statements.\n- If a detail is missing, write \"Not stated in sources.\"\n- Every factual claim must include an inline citation like [1].\n- Output must be Markdown.\n\nSEO/AEO/GEO structure (use this exact order):\n# <SEO Title>\n## TL;DR\n- <3 bullets, each with citations>\n## Direct Answer\n2-3 sentences with citations.\n## Key Facts\n- <4-8 bullets with citations>\n## Background\n## What Happened\n## Why It Matters\n## FAQs\n### Q1: <question>\nA1: <answer with citations>\n### Q2: <question>\nA2: <answer with citations>\n### Q3: <question>\nA3: <answer with citations>\n\nDo not add a Sources section; citations will be provided separately.`
        : `You are a cautious pharma news writer.\n\nHard rules:\n- Sources could not be retrieved; do NOT include inline citations like [1].\n- Do not invent URLs, dates, trial outcomes, efficacy, safety, approvals, or company statements.\n- Avoid numbers, timelines, and claims that would require verification.\n- Prefer general, non-committal language and clearly mark uncertainty.\n- Output must be Markdown.\n\nSEO/AEO/GEO structure (use this exact order):\n# <SEO Title>\n## TL;DR\n- <3 bullets>\n## Direct Answer\n2-3 sentences.\n## Key Facts\n- <4-8 bullets>\n## Background\n## What Happened\n## Why It Matters\n## FAQs\n### Q1: <question>\nA1: <answer>\n### Q2: <question>\nA2: <answer>\n### Q3: <question>\nA3: <answer>\n\nDo not add a Sources section; it will be provided separately.`
      : isPrivateMode
        ? `You are a Regulatory Professional writing SOP-based guidance.\n\nHard rules:\n- Use ONLY the provided SOP Context.\n- Do not use external knowledge.\n- If a detail is missing, write \"Not stated in SOP.\"\n- Output must be Markdown.\n\nSEO/AEO/GEO structure (use this exact order):\n# <SEO Title>\n## Direct Answer\nA single paragraph of exactly 40 words.\n## Procedure Summary\n- <5-10 bullets>\n## Detailed Procedure\nUse clear regulatory headings.\n## Controls and Evidence\nInclude at least one Markdown table.\n## Frequently Asked Questions\nExactly 3 Q&A pairs derived only from the SOP.\n### Q1: <question>\nA1: <answer>\n### Q2: <question>\nA2: <answer>\n### Q3: <question>\nA3: <answer>\n\nDo not add a Sources section; citations will be provided separately.`
        : hasSources
          ? `You are an expert pharma content writer. Write compliant, factual content and avoid prohibited claims. You MUST end with a "## Sources / References" section listing the provided Sources as numbered references. Do not invent sources.`
          : `You are an expert pharma content writer. Write compliant, cautious content and avoid prohibited claims.\n\nHard rules:\n- Sources could not be retrieved; do NOT include inline citations like [1].\n- Do not invent URLs, studies, approvals, statistics, or clinical outcomes.\n- Avoid numeric claims and specific factual assertions that require citations.\n- Output must be Markdown.`
    const systemPromptGeneral = hasSources
      ? `You are an expert pharma content writer.\n\nHard rules:\n- Use ONLY the provided Context.\n- Avoid prohibited pharma marketing language (guarantees, cure claims, exaggerated efficacy/safety, off-label promotion).\n- If a detail is missing, write \"Not stated in sources.\"\n- Every factual claim must include an inline citation like [1].\n- Output must be Markdown.\n\nSEO/AEO/GEO structure (use this exact order):\n# <SEO Title>\n## TL;DR\n- <3-6 bullets with citations>\n## Direct Answer\n2-4 sentences with citations.\n## Overview\n## Key Points\n- <bullets with citations>\n## Detailed Explanation\nUse H2/H3 headings that naturally include the primary keyword.\n## FAQs\n### Q1: <question>\nA1: <answer with citations>\n### Q2: <question>\nA2: <answer with citations>\n### Q3: <question>\nA3: <answer with citations>\n\nDo not add a Sources section; citations will be provided separately.`
      : `You are an expert pharma content writer.\n\nHard rules:\n- Sources could not be retrieved; do NOT include inline citations like [1].\n- Avoid prohibited pharma marketing language (guarantees, cure claims, exaggerated efficacy/safety, off-label promotion).\n- Do not invent studies, approvals, statistics, or specific clinical outcomes.\n- Avoid numeric claims and verification-dependent facts.\n- Output must be Markdown.\n\nSEO/AEO/GEO structure (use this exact order):\n# <SEO Title>\n## TL;DR\n- <3-6 bullets>\n## Direct Answer\n2-4 sentences.\n## Overview\n## Key Points\n- <bullets>\n## Detailed Explanation\nUse H2/H3 headings that naturally include the primary keyword.\n## FAQs\n### Q1: <question>\nA1: <answer>\n### Q2: <question>\nA2: <answer>\n### Q3: <question>\nA3: <answer>\n\nDo not add a Sources section; it will be provided separately.`
    const contentSourceNotice = internetFallbackUsed
      ? citations.length > 0
        ? 'This content was generated from internet sources, not from the approved universe of public domains.'
        : 'Sources could not be retrieved; this draft was generated without verified sources and is not from the approved universe.'
      : ''
    const internetNoticeInstruction = internetFallbackUsed
      ? `\n\nInclude a section titled "## Content Source Notice" that clearly states:\n${contentSourceNotice}`
      : ''
    const systemPromptFinal =
      (isNewsMode ? systemPrompt : isPrivateMode ? systemPrompt : systemPromptGeneral) +
      internetNoticeInstruction +
      `\n\n${contentTypeInstruction}`
    const targetLengthText = targetWordsCapped ? `Target length: ~${targetWordsCapped} words (do not exceed ${targetWordsCapped}).` : ''
    const existingContentText = inputBodyText ? `\n\nExisting Content:\n${inputBodyText}\n` : ''
    const sourceLine = internetFallbackUsed ? 'Content source: Internet fallback (universe sources unavailable).' : ''
    const citationInstruction = citations.length > 0
      ? 'Write using the required structure. Use inline citations like [1] that correspond to the Sources list.'
      : 'Write using the required structure. Do not include inline citations like [1].'
    const userPrompt = isNewsMode
      ? `Topic: ${topicText}\nPrimary keyword: ${primary}\nSecondary keyword: ${secondary || 'None'}\nContent type: ${contentTypeText}\n${sourceLine}\n${targetLengthText}\nSources:\n${sourcesList}\n\nContext:\n${context}${existingContentText}\n\n${citationInstruction}`
      : isPrivateMode
        ? `Topic: ${topicText}\nPrimary keyword: ${primary}\nSecondary keyword: ${secondary || 'None'}\nContent type: ${contentTypeText}\n${targetLengthText}\nSources:\n${sourcesList}\n\nSOP Context (only source of truth):\n${context}${existingContentText}\n\nWrite using the required structure. Use inline citations like [1] that correspond to the Sources list.`
        : `Topic: ${topicText}\nPrimary keyword: ${primary}\nSecondary keyword: ${secondary || 'None'}\nContent type: ${contentTypeText}\n${sourceLine}\n${targetLengthText}\nMode: ${mode}\nSources:\n${sourcesList}\n\nContext:\n${context}${existingContentText}\n\n${citationInstruction}`
    
    const candidates = [env.textModel, env.textModelFallback || undefined, 'openrouter/auto']
      .filter(Boolean) as string[]
    const longForm = typeof targetWordsCapped === 'number' && targetWordsCapped >= 1500
    const defaultAttemptMs = longForm ? 40000 : isNewsMode ? 30000 : 35000
    const perAttemptMs = Number(process.env.GENERATION_ATTEMPT_TIMEOUT_MS || defaultAttemptMs)
    const defaultMaxAttempts = Math.min(2, candidates.length)
    const maxAttempts = Math.min(Number(process.env.GENERATION_MAX_ATTEMPTS || defaultMaxAttempts), candidates.length)
    let finalBody = ''
    let lastError = ''
    for (const model of candidates.slice(0, maxAttempts)) {
      try {
        const gen = await callOpenRouterText({
          model,
          system: systemPromptFinal,
          user: userPrompt,
          timeoutMs: perAttemptMs,
          purpose: 'generate',
          onUsage,
        })
        if (!gen.ok) {
          console.error('[RAG] OpenRouter API Error:', gen.reason)
          lastError = gen.reason
          continue
        }
        finalBody = gen.text
        if (finalBody) break
      } catch (e: unknown) {
        console.error('[RAG] Generation Exception:', e)
        lastError = errorMessage(e)
        continue
      }
    }
    if (!finalBody) {
      return NextResponse.json({ error: 'generation_failed', details: lastError || 'No model succeeded' }, { status: 500 })
    }
    finalBody = stripTrailingSourcesSection(finalBody) + formatSourcesSection(citations)
    if (internetFallbackUsed && !/##\s*Content Source Notice\b/i.test(finalBody)) {
      finalBody += `\n\n## Content Source Notice\n${contentSourceNotice}\n`
    }

    let humanized = false
    const shouldRewrite =
      Boolean(env.humanizeContentModel) &&
      humanizeLevelText !== 'off' &&
      contentTypeText !== 'meta_tags' &&
      remainingMs() > 20000
    if (shouldRewrite) {
      try {
        const hasSourcesForHumanize = citations.length > 0
        const rewriteSystemStandard = `You are an expert editor.\n\nRewrite the given Markdown to be clearer, more natural, and less repetitive while preserving:\n- The exact Markdown heading structure and section order\n- All factual meaning\n- Any inline citations like [1]\n- The entire "## Sources / References" list (same entries, same numbering)\n- The "## Content Source Notice" section if present\n\nHard rules:\n- Do not add new facts.\n- Do not add new sources or URLs.\n- Do not remove or renumber citations.\n- If the input contains no citations, do not add any citations.\n\nReturn ONLY the rewritten Markdown (no preamble).`
        const rewriteUser = `Topic: ${topicText}\nMode: ${String(mode || '')}\nHas sources: ${hasSourcesForHumanize ? 'yes' : 'no'}\n\nMarkdown to rewrite:\n${finalBody}`
        const rewrite1 = await callOpenRouterText({
          model: env.humanizeContentModel,
          system: rewriteSystemStandard,
          user: rewriteUser,
          timeoutMs: 20000,
          purpose: 'rewrite_standard',
          onUsage,
        })
        if (rewrite1.ok && rewrite1.text) {
          finalBody = stripTrailingSourcesSection(rewrite1.text) + formatSourcesSection(citations)
          if (internetFallbackUsed && !/##\s*Content Source Notice\b/i.test(finalBody)) {
            finalBody += `\n\n## Content Source Notice\n${contentSourceNotice}\n`
          }
          humanized = true
        }

        if (humanizeLevelText === 'strong' && remainingMs() > 20000) {
          const rewriteSystemStrong = `You are a senior editor.\n\nRewrite the given Markdown so it reads like careful, original writing: vary sentence structure, reduce template phrasing, and improve flow, while preserving:\n- The exact Markdown heading structure and section order\n- All factual meaning\n- Any inline citations like [1]\n- The entire "## Sources / References" list (same entries, same numbering)\n- The "## Content Source Notice" section if present\n\nHard rules:\n- Do not add new facts.\n- Do not add new sources or URLs.\n- Do not remove or renumber citations.\n- If the input contains no citations, do not add any citations.\n\nReturn ONLY the rewritten Markdown (no preamble).`
          const rewrite2 = await callOpenRouterText({
            model: env.humanizeContentModel,
            system: rewriteSystemStrong,
            user: `Markdown to rewrite:\n${finalBody}`,
            timeoutMs: 20000,
            purpose: 'rewrite_strong',
            onUsage,
          })
          if (rewrite2.ok && rewrite2.text) {
            finalBody = stripTrailingSourcesSection(rewrite2.text) + formatSourcesSection(citations)
            if (internetFallbackUsed && !/##\s*Content Source Notice\b/i.test(finalBody)) {
              finalBody += `\n\n## Content Source Notice\n${contentSourceNotice}\n`
            }
            humanized = true
          }
        }
      } catch {}
    }

    // Validation Swarm (mandatory guardrails before user sees the draft)
    const todayISO = new Date().toISOString().slice(0, 10)
    const swarm =
      remainingMs() > 15000
        ? await validation_swarm({
            draft: finalBody,
            mode: String(mode || ''),
            topic: topicText,
            keyword,
            citations,
            ragChunks: ragChunksForValidation.length > 0 ? ragChunksForValidation : [{ content: context, metadata: {} }],
            todayISO,
            recencyDays: env.recencyDays || 30,
            internetFallbackUsed,
            onUsage,
          })
        : {
            results: {
              citation: { status: 'fail' as const, issues: ['validation_skipped_time_budget'], confidence: 0 },
              recency: { status: 'fail' as const, issues: ['validation_skipped_time_budget'], confidence: 0 },
              fact_check: { status: 'fail' as const, issues: ['validation_skipped_time_budget'], confidence: 0 },
              tone: { status: 'fail' as const, issues: ['validation_skipped_time_budget'], confidence: 0 },
            },
            trustScore: 0,
            warnings: ['This content requires manual review.'],
            agentInserts: [],
          }

    const trustScore = swarm.trustScore
    const blocked = trustScore < env.trustThreshold
    const mergedWarnings = [...warnings, ...swarm.warnings]
    if (blocked && mergedWarnings.length === 0) mergedWarnings.push('This content requires manual review.')

    const requiresReview = blocked || swarm.agentInserts.some((a) => a.status === 'fail')
    const contentSourceLabel = isPrivateMode ? 'Private SOP context' : internetFallbackUsed ? 'Internet fallback' : 'Universe-based'
    const statusLabel = requiresReview ? 'Needs manual review' : 'Validated'
    finalBody = buildGenerationNotice({ contentSource: contentSourceLabel, status: statusLabel }) + finalBody.trim()
    const workflowStatus = requiresReview ? 'review' : 'draft'

    const heroPrompt = `${topicText}. ${primary}${secondary ? `. ${secondary}` : ''}. Professional medical/pharma hero illustration, clean, minimal, no text.`
    const heroSeed = stableSeedFromString(heroPrompt)
    const heroImageUrl = `/api/ai/hero/download?prompt=${encodeURIComponent(heroPrompt)}&width=1024&height=576&seed=${heroSeed}&disposition=inline`
    const heroImageDownloadUrl = `/api/ai/hero/download?prompt=${encodeURIComponent(heroPrompt)}&width=1024&height=576&seed=${heroSeed}`

    const baseOutput = {
      hero_image_url: heroImageUrl,
      hero_image_download_url: heroImageDownloadUrl,
      direct_answer: '',
      table: [],
      faqs: [],
      citations,
      validation_results: swarm.results,
      trust_score: trustScore,
      warnings: mergedWarnings,
      internet_fallback_used: internetFallbackUsed,
      content_source: isPrivateMode ? 'private' : internetFallbackUsed ? 'internet' : 'universe',
      content_source_notice: contentSourceNotice,
      humanized,
      status: workflowStatus,
    }

    const openRouterTotals = openRouterUsage.reduce(
      (acc, e) => ({
        prompt_tokens: acc.prompt_tokens + (Number(e.prompt_tokens) || 0),
        completion_tokens: acc.completion_tokens + (Number(e.completion_tokens) || 0),
        total_tokens: acc.total_tokens + (Number(e.total_tokens) || 0),
        known_cost_usd: acc.known_cost_usd + (typeof e.cost_usd === 'number' ? e.cost_usd : 0),
        has_any_cost: acc.has_any_cost || typeof e.cost_usd === 'number',
      }),
      { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, known_cost_usd: 0, has_any_cost: false }
    )
    const run_metrics = {
      rewrite_level: humanizeLevelText,
      openrouter: {
        prompt_tokens: openRouterTotals.prompt_tokens,
        completion_tokens: openRouterTotals.completion_tokens,
        total_tokens: openRouterTotals.total_tokens,
        total_cost_usd: openRouterTotals.has_any_cost ? openRouterTotals.known_cost_usd : null,
        calls: openRouterUsage,
      },
    }

    const outputForDb = { ...baseOutput, body: finalBody, blocked, run_metrics }
    const outputForClient = { ...baseOutput, body: blocked ? '' : finalBody, review_body: blocked ? finalBody : '', blocked }

    const insertDraftAttempt = supabaseAdmin
      .from('generated_content')
      .insert({
        user_id: userIdText,
        topic: topicText,
        mode,
        output_json: outputForDb,
        trust_score: trustScore,
        requires_review: requiresReview,
      })
      .select('id')
      .single()

    const insertDraftRes = await withTimeout(insertDraftAttempt, 4000, 'generated_content_insert_timeout')
    let insertedDraftId = ''
    if (!insertDraftRes.ok) {
      console.error('[RAG] Failed to save generated content:', insertDraftRes.reason)
    } else {
      const data = (insertDraftRes.value as unknown as { data?: unknown } | null)?.data
      const error = (insertDraftRes.value as unknown as { error?: unknown } | null)?.error
      if (error) console.error('[RAG] Failed to save generated content:', error)
      if (isRecord(data) && 'id' in data) insertedDraftId = String((data as Record<string, unknown>).id || '')
    }

    if (insertedDraftId) {
      const agentRows = swarm.agentInserts.map((a) => ({
        draft_id: insertedDraftId,
        agent_name: a.agent_name,
        status: a.status,
        details: a.details,
        confidence: a.confidence,
      }))
      const insertAgentsAttempt = supabaseAdmin.from('agent_results').insert(agentRows)
      const insertAgentsRes = await withTimeout(insertAgentsAttempt, 3500, 'agent_results_insert_timeout')
      if (!insertAgentsRes.ok) {
        console.error('[RAG] Failed to save agent results:', insertAgentsRes.reason)
      } else {
        const error = (insertAgentsRes.value as unknown as { error?: unknown } | null)?.error
        if (error) console.error('[RAG] Failed to save agent results:', error)
      }
    }

    return NextResponse.json({ ...outputForClient, draft_id: insertedDraftId })
  } catch (err: unknown) {
    console.error('[RAG] Unhandled error in POST:', errorMessage(err))
    return NextResponse.json({ error: 'server_error', details: errorMessage(err) || 'Unknown error' }, { status: 500 })
  }
}
