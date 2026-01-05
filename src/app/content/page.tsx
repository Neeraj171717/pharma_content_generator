'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabaseClient } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { 
  Plus, 
  Search, 
  Filter, 
  Eye, 
  Edit, 
  Download, 
  Share2,
  Trash2,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

import { useAuth } from '@/contexts/auth-context';
import { getUserPermissions } from '@/utils/auth';

interface ContentItem {
  id: string;
  title: string;
  content: string;
  status: 'draft' | 'published' | 'review';
  trustScore: number;
  createdAt: string;
  updatedAt: string;
  author: {
    name: string;
  };
  tags: Array<{
    id: string;
    name: string;
  }>;
}

export default function ContentPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [content, setContent] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const getAuthHeaders = useCallback(async () => {
    const { data: session } = await supabaseClient.auth.getSession();
    const token = session?.session?.access_token;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  const fetchContent = useCallback(async () => {
    try {
      setIsLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch('/api/content', { headers });
      if (response.ok) {
        const data = await response.json();
        setContent(data);
      } else {
        const err = await response.json().catch(() => ({}));
        const msg = typeof err?.message === 'string' ? err.message : 'Failed to load content';
        toast.error(msg);
      }
    } catch (error) {
      console.error('Failed to fetch content:', error);
      toast.error('Failed to load content');
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
      return;
    }
    if (!authLoading && user) {
      void fetchContent();
    }
  }, [authLoading, fetchContent, router, user]);

  const updateStatus = async (id: string, status: ContentItem['status']) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = typeof err?.message === 'string' ? err.message : 'Failed to update status';
        toast.error(msg);
        return;
      }
      setContent((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const deleteContent = async (id: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/content?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = typeof err?.message === 'string' ? err.message : 'Failed to delete content';
        toast.error(msg);
        return;
      }
      setContent((prev) => prev.filter((c) => c.id !== id));
      toast.success('Content deleted');
    } catch {
      toast.error('Failed to delete content');
    }
  };

  const shareContent = async (item: ContentItem) => {
    try {
      const url = `${window.location.origin}/content/${item.id}`;
      const nav = typeof window !== 'undefined' ? window.navigator : undefined;
      const navWithShare = nav as (Navigator & {
        share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
      }) | undefined;
      if (navWithShare?.share) {
        await navWithShare.share({
          title: item.title,
          text: item.title,
          url,
        });
        return;
      }
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(url);
        toast.success('Link copied');
        return;
      }
      toast.error('Sharing is not supported in this browser');
    } catch {
      toast.error('Failed to share');
    }
  };

  const downloadAsDoc = (item: ContentItem) => {
    const safeTitle = (item.title || 'content').replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '_') || 'content';
    const escaped = String(item.content || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r?\n/g, '<br/>');
    const html = `<!doctype html><html><head><meta charset="utf-8"/></head><body><h1>${safeTitle}</h1><div>${escaped}</div></body></html>`;
    const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const filteredContent = content.filter((item) => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const permissions = getUserPermissions(user);
  const canDelete = typeof permissions.canDeleteContent === 'function'
    ? permissions.canDeleteContent(user.id)
    : permissions.canDeleteContent;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-green-100 text-green-800">Published</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'review':
        return <Badge className="bg-yellow-100 text-yellow-800">In Review</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTrustScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'published':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'draft':
        return <Edit className="h-4 w-4 text-gray-600" />;
      case 'review':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Content Management
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Manage your pharmaceutical content and track compliance
            </p>
          </div>
          <Button onClick={() => router.push('/content/create')}>
            <Plus className="mr-2 h-4 w-4" />
            Create Content
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Workflow</CardTitle>
          <CardDescription>
            Draft is for writing. In Review is for compliance/SME checks. Published is final.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Search and Filter */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search content..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <select
                className="px-3 py-2 border rounded-md bg-background"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="review">In Review</option>
                <option value="published">Published</option>
              </select>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Grid */}
      <div className="grid gap-6">
        {filteredContent.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No content found</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {searchTerm || statusFilter !== 'all' 
                  ? 'Try adjusting your search or filter criteria.'
                  : 'Get started by creating your first piece of content.'}
              </p>
              <Button onClick={() => router.push('/content/create')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Content
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredContent.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                    <CardDescription>
                      Created {new Date(item.createdAt).toLocaleDateString()} by {item.author.name}
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(item.status)}
                    {getStatusBadge(item.status)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
                    {item.content.substring(0, 200)}...
                  </p>
                  
                  {item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {item.tags.map((tag) => (
                        <Badge key={tag.id} variant="outline">
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-1">
                        <AlertCircle className={`h-4 w-4 ${getTrustScoreColor(item.trustScore)}`} />
                        <span className={`text-sm font-medium ${getTrustScoreColor(item.trustScore)}`}>
                          {item.trustScore}% Trust Score
                        </span>
                      </div>
                      <span className="text-sm text-gray-500">
                        Updated {new Date(item.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => router.push(`/content/${item.id}`)}>
                        <Eye className="h-4 w-4" />
                        View
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => router.push(`/content/${item.id}/edit`)}>
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                      <select
                        className="px-2 py-1 border rounded-md bg-background text-sm"
                        value={item.status}
                        onChange={(e) => updateStatus(item.id, e.target.value as ContentItem['status'])}
                      >
                        <option value="draft">Draft</option>
                        <option value="review">In Review</option>
                        <option value="published">Published</option>
                      </select>
                      <Button variant="ghost" size="sm" onClick={() => downloadAsDoc(item)}>
                        <Download className="h-4 w-4" />
                        Export
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => shareContent(item)}>
                        <Share2 className="h-4 w-4" />
                        Share
                      </Button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => deleteContent(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
