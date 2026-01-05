import { env, requireKeys } from '@/lib/env'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function timeoutSignal(ms: number): AbortSignal {
  const anyAbortSignal = AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }
  if (typeof anyAbortSignal?.timeout === 'function') return anyAbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

function isRetryableHfFailure(status: number, bodyText: string) {
  const t = String(bodyText || '').toLowerCase()
  if (status === 429) return true
  if (status === 503) return true
  if (status === 504) return true
  if (t.includes('currently loading')) return true
  if (t.includes('loading')) return true
  if (t.includes('try again later')) return true
  return false
}

function inferImageExtFromContentType(contentType: string) {
  const ct = String(contentType || '').toLowerCase()
  if (ct.includes('png')) return 'png'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg'
  return 'png'
}

async function hfGenerateImageWithRetry(args: {
  token: string
  model: string
  prompt: string
  width: number
  height: number
  seed?: number
  maxAttempts?: number
}) {
  const max = Math.max(1, Math.floor(args.maxAttempts ?? 2))
  const baseUrl = env.huggingFaceInferenceBaseUrl.replace(/\/+$/, '')
  const url = `${baseUrl}/models/${args.model}`
  let lastStatus = 0
  let lastText = ''

  for (let attempt = 1; attempt <= max; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.token}`,
        'Content-Type': 'application/json',
        Accept: 'image/png',
      },
      body: JSON.stringify({
        inputs: args.prompt,
        parameters: {
          width: args.width,
          height: args.height,
          negative_prompt: 'text, watermark, logo, banner, label',
          ...(Number.isFinite(args.seed) ? { seed: args.seed } : {}),
        },
        options: { wait_for_model: true },
      }),
      signal: timeoutSignal(70000),
    })

    if (resp.ok) {
      const contentType = resp.headers.get('content-type') || 'image/png'
      const ctLower = contentType.toLowerCase()
      if (ctLower.includes('application/json') || ctLower.includes('text/plain')) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || 'hf_invalid_image_response')
      }
      const buf = await resp.arrayBuffer()
      return { contentType, buf }
    }

    lastStatus = resp.status
    lastText = await resp.text().catch(() => '')
    if (attempt < max && isRetryableHfFailure(resp.status, lastText)) {
      const backoff = 400 * Math.pow(2, attempt - 1)
      await sleep(backoff + Math.floor(Math.random() * 200))
      continue
    }
    throw new Error(lastText || `http_${resp.status}`)
  }

  throw new Error(lastText || `http_${lastStatus}`)
}

const FALLBACK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY0kAAAAASUVORK5CYII='

function fallbackImageResponse(asInline: boolean) {
  const buf = Buffer.from(FALLBACK_PNG_BASE64, 'base64')
  return new Response(buf, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `${asInline ? 'inline' : 'attachment'}; filename="hero.png"`,
      'Cache-Control': 'public, max-age=300',
    },
  })
}

export async function GET(req: Request) {
  const disposition = new URL(req.url).searchParams.get('disposition') || ''
  const asInline = String(disposition).toLowerCase() === 'inline'
  try {
    const { searchParams } = new URL(req.url)
    const prompt = String(searchParams.get('prompt') || '').trim()
    if (!prompt) return fallbackImageResponse(asInline)

    const width = 1024
    const height = 576
    const seedRaw = String(searchParams.get('seed') || '').trim()
    const seed = seedRaw && /^[0-9]+$/.test(seedRaw) ? Number(seedRaw) : undefined

    requireKeys(['huggingFaceAccessToken', 'huggingFaceImageCreationModel'])

    const { buf, contentType } = await hfGenerateImageWithRetry({
      token: env.huggingFaceAccessToken,
      model: env.huggingFaceImageCreationModel,
      prompt,
      width,
      height,
      seed,
      maxAttempts: 3,
    })
    const ext = inferImageExtFromContentType(contentType)

    return new Response(buf, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${asInline ? 'inline' : 'attachment'}; filename="hero.${ext}"`,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return fallbackImageResponse(asInline)
  }
}
