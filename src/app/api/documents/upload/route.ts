import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

// Polyfill for pdf-parse (it uses DOMMatrix internally which is missing in Node)
const globalWithDomMatrix = globalThis as unknown as { DOMMatrix?: unknown }
if (typeof globalWithDomMatrix.DOMMatrix === 'undefined') {
  globalWithDomMatrix.DOMMatrix = class DOMMatrix {}
}

const parsePdf = async (buffer: Buffer): Promise<{ text: string }> => {
  const mod = await import('pdf-parse-new')
  const maybeDefault = (mod as { default?: unknown }).default
  const fn = (maybeDefault ?? mod) as unknown
  if (typeof fn !== 'function') throw new Error('pdf parser import is not a function')
  return (fn as (b: Buffer) => Promise<{ text: string }>)(buffer)
}

// Need Node.js runtime for pdf-parse
export const runtime = 'nodejs' 


export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) {
        console.error('[Upload] No auth token found')
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    // Verify user
    const userClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
        console.error('[Upload] User verification failed:', userErr)
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    // Debugging Env
    if (!env.supabaseServiceRoleKey) {
        console.error('[Upload] Missing SUPABASE_SERVICE_ROLE_KEY')
        return NextResponse.json({ error: 'Server misconfiguration: Missing Service Role Key' }, { status: 500 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) {
        console.error('[Upload] No file in form data')
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    let content = ''

    if (file.type === 'application/pdf') {
      try {
        const data = await parsePdf(buffer)
        content = data.text
      } catch (e) {
        console.error('[Upload] PDF Parse Error:', e)
        return NextResponse.json({ error: 'Failed to parse PDF' }, { status: 400 })
      }
    } else {
      content = buffer.toString('utf-8')
    }

    if (!content.trim()) return NextResponse.json({ error: 'File is empty or could not be parsed' }, { status: 400 })

    console.log(`[Upload] Saving file metadata: ${file.name}`)
    // 1. Save metadata to user_files
    const { data: fileRecord, error: dbErr } = await supabaseAdmin
      .from('user_files')
      .insert({
        user_id: user.id,
        filename: file.name,
        file_path: '', // Not storing in storage bucket for now, just DB vectors
        file_size: file.size,
      })
      .select()
      .single()

    if (dbErr) {
        console.error('[Upload] DB Insert Error:', dbErr)
        throw dbErr
    }

    // 2. Call Embed-Docs Edge Function
    // We send the whole content. Edge function chunks it.
    console.log(`[Upload] Invoking embed-docs for file: ${fileRecord.id}`)
    
    // Add a timeout for the edge function call
    const edgeFunctionPromise = supabaseAdmin.functions.invoke('embed-docs', {
      body: {
        mode: 'private',
        user_id: user.id,
        documents: [
          {
            title: file.name,
            content: content,
            metadata: { file_id: fileRecord.id }
          }
        ]
      }
    })

    const raced = await Promise.race([
      edgeFunctionPromise.then((result) => ({ kind: 'invoke' as const, result })),
      new Promise<{ kind: 'timeout' }>((resolve) => setTimeout(() => resolve({ kind: 'timeout' }), 25000)),
    ])
    if (raced.kind === 'timeout') {
      return NextResponse.json({ error: 'Edge Function Timeout' }, { status: 504 })
    }
    const { error: edgeErr } = raced.result

    if (edgeErr) {
      console.error('[Upload] Edge function error:', edgeErr)
      const edgeMessage =
        typeof edgeErr === 'object' && edgeErr && 'message' in edgeErr
          ? String((edgeErr as { message?: unknown }).message ?? edgeErr)
          : String(edgeErr)
      return NextResponse.json({ error: 'Embedding failed: ' + edgeMessage }, { status: 500 })
    }

    console.log('[Upload] Success')
    return NextResponse.json({ success: true, id: fileRecord.id })
  } catch (e: unknown) {
    console.error('[Upload] Unexpected error:', e)
    const message = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
