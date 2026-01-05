import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';

type ContentStatus = 'draft' | 'review' | 'published';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return { user: null, token: '' };
  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) return { user: null, token: '' };
  return { user: data.user, token };
}

function normalizeStatusFromRow(row: { output_json: unknown; requires_review: boolean }): ContentStatus {
  const out = row.output_json;
  const raw = isRecord(out) ? out.status : undefined;
  const rawStatus = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (rawStatus === 'published' || rawStatus === 'draft' || rawStatus === 'review') return rawStatus as ContentStatus;
  return row.requires_review ? 'review' : 'draft';
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request);
    if (!user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const metadata =
      user.user_metadata && typeof user.user_metadata === 'object' ? (user.user_metadata as Record<string, unknown>) : {};
    const name = typeof metadata.name === 'string' && metadata.name.trim() ? metadata.name.trim() : user.email || 'User';

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get('id') || '').trim();

    const mapRow = (row: { id: unknown; topic: unknown; output_json: unknown; trust_score: unknown; requires_review: unknown; created_at: unknown }) => {
      const outputJson = row.output_json as unknown;
      const body =
        isRecord(outputJson) && typeof outputJson.body === 'string'
          ? outputJson.body
          : isRecord(outputJson) && typeof outputJson.content === 'string'
            ? outputJson.content
            : '';
      const status = normalizeStatusFromRow({ output_json: outputJson, requires_review: Boolean(row.requires_review) });
      return {
        id: String(row.id),
        title: String(row.topic || ''),
        content: body,
        status,
        trustScore: Number(row.trust_score || 0),
        createdAt: String(row.created_at),
        updatedAt: String(row.created_at),
        author: { name },
        tags: [],
      };
    };

    if (id) {
      const { data, error } = await supabaseAdmin
        .from('generated_content')
        .select('id,topic,output_json,trust_score,requires_review,created_at')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      return NextResponse.json(mapRow(data as unknown as { id: unknown; topic: unknown; output_json: unknown; trust_score: unknown; requires_review: unknown; created_at: unknown }));
    }

    const { data, error } = await supabaseAdmin
      .from('generated_content')
      .select('id,topic,output_json,trust_score,requires_review,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });

    const items = (Array.isArray(data) ? data : []).map((row) =>
      mapRow(row as unknown as { id: unknown; topic: unknown; output_json: unknown; trust_score: unknown; requires_review: unknown; created_at: unknown })
    );

    return NextResponse.json(items);
  } catch (error) {
    console.error('Content fetch error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request);
    if (!user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const bodyUnknown: unknown = await request.json().catch(() => null);
    const body = isRecord(bodyUnknown) ? bodyUnknown : {};

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const content = typeof body.content === 'string' ? body.content : '';
    const modeRaw = typeof body.mode === 'string' ? body.mode.trim() : 'general';
    const mode = modeRaw === 'news' || modeRaw === 'private' || modeRaw === 'general' ? modeRaw : 'general';

    if (!title || !content) return NextResponse.json({ message: 'Title and content are required' }, { status: 400 });

    const outputJson = { body: content, status: 'draft' as ContentStatus };
    const { data, error } = await supabaseAdmin
      .from('generated_content')
      .insert({
        user_id: user.id,
        topic: title,
        mode,
        output_json: outputJson,
        trust_score: 0,
        requires_review: false,
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ id: data?.id }, { status: 201 });
  } catch (error) {
    console.error('Content creation error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request);
    if (!user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const bodyUnknown: unknown = await request.json().catch(() => null);
    const body = isRecord(bodyUnknown) ? bodyUnknown : {};

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const statusRaw = typeof body.status === 'string' ? body.status.trim().toLowerCase() : '';
    const status = (statusRaw === 'draft' || statusRaw === 'review' || statusRaw === 'published'
      ? statusRaw
      : '') as ContentStatus | '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const content = typeof body.content === 'string' ? body.content : '';
    const modeRaw = typeof body.mode === 'string' ? body.mode.trim() : '';
    const mode = modeRaw === 'news' || modeRaw === 'private' || modeRaw === 'general' ? modeRaw : '';

    if (!id) return NextResponse.json({ message: 'id is required' }, { status: 400 });
    if (!status && !title && !content && !mode) {
      return NextResponse.json({ message: 'Nothing to update' }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('generated_content')
      .select('output_json,requires_review')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (fetchErr) return NextResponse.json({ message: fetchErr.message }, { status: 500 });

    const current = existing?.output_json as unknown;
    const nextJson: Record<string, unknown> = isRecord(current) ? { ...current } : {};
    if (status) nextJson.status = status;
    if (content) {
      nextJson.body = content;
      nextJson.content = content;
    }

    const existingRequiresReview = Boolean(existing?.requires_review);
    const requiresReview = status ? status === 'review' : existingRequiresReview;
    const payload: Record<string, unknown> = { output_json: nextJson, requires_review: requiresReview };
    if (title) payload.topic = title;
    if (mode) payload.mode = mode;
    const { error: updateErr } = await supabaseAdmin
      .from('generated_content')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id);
    if (updateErr) return NextResponse.json({ message: updateErr.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Content update error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request);
    if (!user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get('id') || '').trim();
    if (!id) return NextResponse.json({ message: 'id is required' }, { status: 400 });

    const { error } = await supabaseAdmin.from('generated_content').delete().eq('id', id).eq('user_id', user.id);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Content delete error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
