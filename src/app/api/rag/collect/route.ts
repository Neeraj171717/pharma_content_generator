import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { env, requireKeys } from '@/lib/env'

type Source = { name: string; host: string; search: (q: string) => string }

const knownSources: Source[] = [
  { name: 'FDA', host: 'fda.gov', search: (q) => `https://www.fda.gov/search?s=${encodeURIComponent(q)}` },
  { name: 'NIH', host: 'nih.gov', search: (q) => `https://search.nih.gov/search?query=${encodeURIComponent(q)}` },
  { name: 'CDC', host: 'cdc.gov', search: (q) => `https://www.cdc.gov/search/?query=${encodeURIComponent(q)}` },
  { name: 'ResearchGate', host: 'researchgate.net', search: (q) => `https://www.researchgate.net/search/publication?q=${encodeURIComponent(q)}` },
  { name: 'Science', host: 'science.org', search: (q) => `https://www.science.org/search?query=${encodeURIComponent(q)}` },
  { name: 'FierceBiotech', host: 'fiercebiotech.com', search: (q) => `https://www.fiercebiotech.com/search/node/${encodeURIComponent(q)}` },
]

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

function normalizeHost(input: string) {
  try {
    if (input.startsWith('http://') || input.startsWith('https://')) return new URL(input).hostname.replace(/^www\./, '')
  } catch {}
  return input.replace(/^www\./, '').split('/')[0]
}

function hostMatches(host: string, allowedHost: string) {
  const h = host.replace(/^www\./, '').toLowerCase()
  const a = allowedHost.replace(/^www\./, '').toLowerCase()
  return h === a || h.endsWith(`.${a}`)
}

function isAllowedUrl(url: string) {
  try {
    const h = new URL(url).hostname
    return env.allowedDomains.some((d) => hostMatches(h, d))
  } catch {
    return false
  }
}

function strip(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleOf(html: string) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? m[1].trim() : ''
}

function extractUrls(html: string, baseUrl: string) {
  const out = new Set<string>()

  for (const m of html.matchAll(/href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    const raw = (m[1] || m[2] || m[3] || '').trim()
    if (!raw) continue
    if (raw.startsWith('#')) continue
    const lowered = raw.toLowerCase()
    if (lowered.startsWith('javascript:') || lowered.startsWith('mailto:') || lowered.startsWith('tel:')) continue
    try {
      const u = new URL(raw, baseUrl)
      out.add(u.toString())
    } catch {}
  }

  for (const abs of html.match(/https?:\/\/[^"'>\s]+/g) || []) {
    try {
      out.add(new URL(abs).toString())
    } catch {}
  }

  return [...out]
}

function extractDuckDuckGoResultUrls(html: string) {
  const out = new Set<string>()
  for (const m of html.matchAll(/href\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)) {
    const href = (m[1] || m[2] || '').trim()
    if (!href) continue
    if (!href.startsWith('https://duckduckgo.com/l/')) continue
    try {
      const u = new URL(href)
      const uddg = u.searchParams.get('uddg')
      if (!uddg) continue
      const decoded = decodeURIComponent(uddg)
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) out.add(decoded)
    } catch {}
  }
  return [...out]
}

function decodeXmlEntities(input: string) {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractRssItems(xml: string) {
  const items: Array<{ title: string; link: string; description: string }> = []
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const block = m[0] || ''
    const title = decodeXmlEntities((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim())
    const link = decodeXmlEntities((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '').trim())
    const description = decodeXmlEntities((block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || '').trim())
    if (!link) continue
    items.push({ title, link, description })
  }
  return items
}

function scoreKeywordMatch(text: string, keyword: string) {
  const hay = text.toLowerCase()
  const tokens = keyword
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

function looksLikeAsset(url: string) {
  const lower = url.toLowerCase()
  if (lower.includes('/favicon')) return true
  return /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|mjs|map|json|pdf|zip|rar|7z|gz|mp4|mp3|wav|woff2?|ttf|eot)(\?|#|$)/i.test(lower)
}

function isLikelyContentUrl(url: string, searchUrl: string, sourceHost: string) {
  try {
    const u = new URL(url)
    if (u.toString() === searchUrl) return false
    if (looksLikeAsset(u.toString())) return false
    const path = u.pathname.toLowerCase()
    if (path === '/' || path === '') return false
    if (path.startsWith('/search')) return false
    if (path.startsWith('/user')) return false
    const segments = path.split('/').filter(Boolean)
    if (segments.length === 1) {
      const s0 = segments[0]
      if (['about', 'about-us', 'contact', 'contact-us', 'media', 'phone', 'chat', 'cdc-info', 'cdcinfo'].includes(s0)) return false
    }
    if (sourceHost === 'fiercebiotech.com') {
      if (u.toString().includes('/search/node')) return false
    }
    return true
  } catch {
    return false
  }
}

function ddgSearchUrl(host: string, keyword: string) {
  const q = `site:${host} ${keyword}`
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`
}

function withTimeout(url: string, ms = 5000, init?: RequestInit) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  const headers = { ...FETCH_HEADERS, ...(init?.headers || {}) }
  return fetch(url, { ...init, headers, signal: controller.signal }).finally(() => clearTimeout(id))
}

export async function POST(req: Request) {
  try {
    requireKeys(['supabaseServiceRoleKey'])
    const { keyword, returnDocuments, waitForCompletion } = await req.json()
    if (!keyword) return NextResponse.json({ error: 'keyword required' }, { status: 400 })

    const allowedHosts = new Set(env.allowedDomains.map(normalizeHost).filter(Boolean))
    const allowedList = [...allowedHosts]
    const baseSources = knownSources.filter((s) => allowedList.some((h) => hostMatches(s.host, h)))
    const knownHosts = new Set(baseSources.map((s) => normalizeHost(s.host)))
    const extraHosts = allowedList.filter((h) => ![...knownHosts].some((k) => hostMatches(h, k) || hostMatches(k, h)))
    const extraSources: Source[] = extraHosts.map((h) => ({ name: h, host: h, search: (q) => ddgSearchUrl(h, q) }))
    const sources = [...baseSources, ...extraSources]

    const collected: Array<{ source: string; url: string; title: string; content: string }> = []
    for (const s of sources) {
      try {
        let candidateLinks: string[] = []

        if (s.host === 'fiercebiotech.com') {
          try {
            const rssUrl = 'https://www.fiercebiotech.com/rss.xml'
            const rr = await withTimeout(rssUrl, 20000)
            const xml = await rr.text()
            const items = extractRssItems(xml)
            const ranked = items
              .map((it) => ({ it, score: scoreKeywordMatch(`${it.title} ${it.description}`, keyword) }))
              .sort((a, b) => b.score - a.score)
            const itemsToUse = ranked.map((x) => x.it).slice(0, 5)
            for (const it of itemsToUse) {
              const url = it.link
              if (!url) continue
              if (!isAllowedUrl(url)) continue
              try {
                if (!hostMatches(new URL(url).hostname, s.host)) continue
              } catch {
                continue
              }
              if (!isLikelyContentUrl(url, rssUrl, s.host)) continue
              const raw = decodeXmlEntities(it.description || '')
              const text = strip(raw)
              const content = (text || it.title || url).slice(0, 10000)
              if (content.length > 50) collected.push({ source: s.name, url, title: it.title || url, content })
            }
          } catch {}
          continue
        }

        if (candidateLinks.length === 0) {
          const directSearchUrl = s.search(keyword)
          const baseUrl = new URL(directSearchUrl).origin
          const linksFromSearchPage: string[] = []
          try {
            const sr = await withTimeout(directSearchUrl, 12000)
            const sh = await sr.text()
            linksFromSearchPage.push(
              ...extractUrls(sh, baseUrl)
                .filter((u) => isAllowedUrl(u))
                .filter((u) => {
                  try {
                    return hostMatches(new URL(u).hostname, s.host)
                  } catch {
                    return false
                  }
                })
                .filter((u) => isLikelyContentUrl(u, directSearchUrl, s.host))
            )
          } catch {}

          candidateLinks = Array.from(new Set(linksFromSearchPage))
          if (candidateLinks.length === 0) {
            try {
              const ddgUrl = ddgSearchUrl(s.host, keyword)
              const dr = await withTimeout(ddgUrl, 12000)
              const dh = await dr.text()
              candidateLinks = extractDuckDuckGoResultUrls(dh)
                .filter((u) => isAllowedUrl(u))
                .filter((u) => {
                  try {
                    return hostMatches(new URL(u).hostname, s.host)
                  } catch {
                    return false
                  }
                })
                .filter((u) => isLikelyContentUrl(u, ddgUrl, s.host))
            } catch {}
          }
        }

        const links = candidateLinks.slice(0, 5)
        for (const url of links) {
          try {
            const r = await withTimeout(url, 15000, { redirect: 'follow' })
            const contentType = (r.headers.get('content-type') || '').toLowerCase()
            if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) continue
            const html = await r.text()
            const text = strip(html)
            const title = titleOf(html) || url
            if (text.length > 100) {
              collected.push({ source: s.name, url, title, content: text.slice(0, 10000) })
            }
          } catch {}
        }
      } catch {}
    }

    if (collected.length > 0 && !returnDocuments) {
      const shouldWait = waitForCompletion !== false
      if (shouldWait) {
        const { error } = await supabaseAdmin.functions.invoke('embed-docs', {
          body: {
            mode: 'public',
            documents: collected,
          },
        })
        if (error) {
          console.error('Embed-docs error:', error)
          const details =
            typeof error === 'object' && error && 'message' in error
              ? String((error as { message?: unknown }).message || error)
              : String(error)
          return NextResponse.json({ inserted: collected.length, embed_error: details })
        }
      } else {
        void supabaseAdmin.functions
          .invoke('embed-docs', {
            body: {
              mode: 'public',
              documents: collected,
            },
          })
          .then(({ error }) => {
            if (error) console.error('Embed-docs error (async):', error)
          })
      }
    }

    if (returnDocuments) {
      return NextResponse.json({ inserted: collected.length, documents: collected })
    }
    return NextResponse.json({ inserted: collected.length })

  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
