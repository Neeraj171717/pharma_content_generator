import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json()
    const promptText = String(prompt || '').trim()
    if (!promptText) return NextResponse.json({ error: 'prompt_required' }, { status: 400 })
    const url = `/api/ai/hero/download?prompt=${encodeURIComponent(promptText)}&width=1024&height=576&disposition=inline`
    return NextResponse.json({ hero_image_url: url })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
