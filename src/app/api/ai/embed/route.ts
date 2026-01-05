import { NextResponse } from 'next/server'
import { env, requireKeys } from '@/lib/env'

export async function POST(req: Request) {
  try {
    requireKeys(['cohereApiKey'])
    const { text } = await req.json()
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

    const r = await fetch('https://api.cohere.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.cohereApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ texts: [text], model: env.embeddingModel }),
    })
    if (!r.ok) return NextResponse.json({ error: 'embedding_failed' }, { status: 500 })
    const data = await r.json()
    const embedding = data.embeddings?.[0]
    return NextResponse.json({ embedding })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
