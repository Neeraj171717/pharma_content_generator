import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';

type ContentStatus = 'draft' | 'review' | 'published';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberOrNull(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
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
    const role = typeof metadata.role === 'string' ? metadata.role : 'user';
    const isAdmin = role === 'admin';

    const contentSelect = (columns: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) => {
      const q = supabaseAdmin.from('generated_content').select(columns, options);
      return isAdmin ? q : q.eq('user_id', user.id);
    };

    const { count: totalCount, error: totalErr } = await contentSelect('id', { count: 'exact', head: true });
    if (totalErr) return NextResponse.json({ message: totalErr.message }, { status: 500 });

    const { count: publishedCount, error: pubErr } = await contentSelect('id', { count: 'exact', head: true }).eq(
      'output_json->>status',
      'published'
    );
    if (pubErr) return NextResponse.json({ message: pubErr.message }, { status: 500 });

    const { count: reviewCount, error: reviewErr } = await contentSelect('id', { count: 'exact', head: true }).or(
      'requires_review.eq.true,output_json->>status.eq.review'
    );
    if (reviewErr) return NextResponse.json({ message: reviewErr.message }, { status: 500 });

    const totalContent = totalCount || 0;
    const publishedContent = publishedCount || 0;
    const reviewContent = reviewCount || 0;
    const draftContent = Math.max(0, totalContent - publishedContent - reviewContent);

    const { data: recentRows, error: recentErr } = await contentSelect('id,topic,trust_score,requires_review,output_json,created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    if (recentErr) return NextResponse.json({ message: recentErr.message }, { status: 500 });

    const recentRowsArr = Array.isArray(recentRows) ? (recentRows as unknown[]).filter(isRecord) : [];
    const recentContent = recentRowsArr.map((row) => {
      const status = normalizeStatusFromRow({ output_json: row.output_json, requires_review: Boolean(row.requires_review) });
      const out = row.output_json as unknown;
      const runMetrics = isRecord(out) ? (out.run_metrics as unknown) : null;
      const openrouter = isRecord(runMetrics) ? (runMetrics.openrouter as unknown) : null;
      const runCostUsd = isRecord(openrouter) ? numberOrNull((openrouter as Record<string, unknown>).total_cost_usd) : null;
      const runTokens = isRecord(openrouter) ? numberOrNull((openrouter as Record<string, unknown>).total_tokens) : null;
      return {
        id: String(row.id),
        title: String(row.topic || ''),
        status,
        trustScore: Number(row.trust_score || 0),
        createdAt: String(row.created_at),
        ...(isAdmin ? { runCostUsd, runTokens } : {}),
      };
    });

    const avg =
      recentContent.length > 0
        ? Math.round(recentContent.reduce((sum, c) => sum + (Number(c.trustScore) || 0), 0) / recentContent.length)
        : 0;

    const recentRunCosts = isAdmin
      ? recentContent
          .map((c) => (isRecord(c) ? numberOrNull((c as Record<string, unknown>).runCostUsd) : null))
          .filter((n): n is number => typeof n === 'number')
      : [];
    const recentRunCostTotalUsd = recentRunCosts.reduce((sum, n) => sum + n, 0);
    const recentRunCostAvgUsd = recentRunCosts.length ? recentRunCostTotalUsd / recentRunCosts.length : null;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const activitiesSelect = isAdmin
      ? 'id,topic,created_at,user_id,requires_review,output_json,profiles(full_name,email)'
      : 'id,topic,created_at,user_id,requires_review,output_json';
    const { data: activityRows, error: activityErr } = await contentSelect(activitiesSelect)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);
    if (activityErr) return NextResponse.json({ message: activityErr.message }, { status: 500 });

    const activityRowsArr = Array.isArray(activityRows) ? (activityRows as unknown[]).filter(isRecord) : [];
    const recentActivities = activityRowsArr.map((row) => {
      const title = String(row.topic || '').trim() || 'Untitled';
      const requiresReview = Boolean(row.requires_review);
      const base = {
        id: String(row.id),
        type: 'content_generated',
        description: requiresReview ? `Generated content (needs review): ${title}` : `Generated content: ${title}`,
        createdAt: String(row.created_at),
      };
      if (!isAdmin) return base;
      const profile = isRecord(row) ? (row.profiles as unknown) : null;
      const name =
        isRecord(profile) && typeof profile.full_name === 'string' && profile.full_name.trim()
          ? profile.full_name.trim()
          : isRecord(profile) && typeof profile.email === 'string' && profile.email.trim()
            ? profile.email.trim()
            : 'User';
      return { ...base, user: { name } };
    });

    let totalUsers = 0;
    let activeUsers = 0;
    if (isAdmin) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (!error) {
        const users = data?.users || [];
        totalUsers = users.length;
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        activeUsers = users.filter((u) => (u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() >= cutoff : false)).length;
      }
    }

    return NextResponse.json({
      totalContent,
      publishedContent,
      draftContent,
      reviewContent,
      totalUsers,
      activeUsers,
      averageTrustScore: avg,
      recentActivities,
      recentContent,
      ...(isAdmin ? { recentRunCostAvgUsd, recentRunCostTotalUsd } : {}),
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
