import { NextResponse } from 'next/server'
import { env, requireKeys } from '@/lib/env'

export async function POST(req: Request) {
  try {
    requireKeys(['openRouterApiKey'])
    const { prompt } = await req.json()
    if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

    const r = await fetch(`${env.openRouterBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.textModel,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!r.ok) return NextResponse.json({ error: 'generation_failed' }, { status: 500 })
    const data = await r.json()
    const content = data.choices?.[0]?.message?.content || ''
    return NextResponse.json({ content })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
