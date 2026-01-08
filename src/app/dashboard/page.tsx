'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Users, 
  Clock, 
  TrendingUp, 
  CheckCircle, 
  AlertCircle,
  Plus,
  Eye,
  Edit,
  Download,
} from 'lucide-react';

import { useAuth } from '@/contexts/auth-context';
import { getUserPermissions } from '@/utils/auth';
import { supabaseClient } from '@/lib/supabaseClient';

interface DashboardStats {
  totalContent: number;
  publishedContent: number;
  draftContent: number;
  reviewContent: number;
  totalUsers: number;
  activeUsers: number;
  averageTrustScore: number;
  recentRunCostAvgUsd?: number | null;
  recentRunCostTotalUsd?: number | null;
  recentActivities: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
    user?: {
      name: string;
    };
  }>;
  recentContent: Array<{
    id: string;
    title: string;
    status: string;
    trustScore: number;
    createdAt: string;
    runCostUsd?: number | null;
    runTokens?: number | null;
  }>;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
      return;
    }
    if (!authLoading && user) {
      fetchDashboardData();
    }
  }, [authLoading, router, user]);

  const fetchDashboardData = async () => {
    try {
      const { data: session } = await supabaseClient.auth.getSession();
      const token = session?.session?.access_token || '';
      const response = await fetch('/api/dashboard/stats', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

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

  const formatUsd = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return `$${value.toFixed(2)}`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Welcome back, {user.name}!
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Here&apos;s what&apos;s happening with your pharma content generator.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Content</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalContent || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.publishedContent || 0} published
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trust Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.averageTrustScore || 0}%</div>
            <p className="text-xs text-muted-foreground">
              Average content quality
            </p>
          </CardContent>
        </Card>

        {permissions.canManageUsers && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.activeUsers || 0} active
              </p>
            </CardContent>
          </Card>
        )}

        {permissions.canManageUsers && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Run Cost</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatUsd(stats?.recentRunCostAvgUsd)}</div>
              <p className="text-xs text-muted-foreground">
                Total: {formatUsd(stats?.recentRunCostTotalUsd)} (recent runs)
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.recentActivities?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Actions this week
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="content">Recent Content</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          {permissions.canManageUsers && <TabsTrigger value="users">Users</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>Content Overview</CardTitle>
                <CardDescription>
                  Your content creation progress this month
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">Published</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {stats?.publishedContent || 0} items
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Edit className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">In Progress</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {stats?.draftContent || 0} items
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm font-medium">Needs Review</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {stats?.reviewContent || 0} items
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>
                  Common tasks you might want to perform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  className="w-full justify-start"
                  onClick={() => router.push('/content/create')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create New Content
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => router.push('/content')}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View All Content
                </Button>
                {permissions.canManageUsers && (
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => router.push('/users')}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Manage Users
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Content</CardTitle>
              <CardDescription>
                Your latest pharmaceutical content
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats?.recentContent?.map((content) => (
                  <div key={content.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium">{content.title}</h4>
                      <div className="flex items-center space-x-2">
                        {getStatusBadge(content.status)}
                        <span className={`text-sm font-medium ${getTrustScoreColor(content.trustScore)}`}>
                          {content.trustScore}% Trust Score
                        </span>
                      </div>
                      {permissions.canManageUsers && (
                        <div className="text-xs text-muted-foreground">
                          Run cost: {formatUsd(content.runCostUsd)} · Tokens: {typeof content.runTokens === 'number' ? content.runTokens : '—'}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )) || (
                  <div className="text-center py-8 text-muted-foreground">
                    No content created yet. Start by creating your first piece of content!
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                Your recent actions and system events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats?.recentActivities?.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(activity.createdAt).toLocaleString()}
                        {activity.user && ` by ${activity.user.name}`}
                      </p>
                    </div>
                  </div>
                )) || (
                  <div className="text-center py-8 text-muted-foreground">
                    No recent activity to display.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {permissions.canManageUsers && (
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  Manage platform users and their permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">
                    User management interface coming soon
                  </p>
                  <Button onClick={() => router.push('/admin/users')}>
                    Go to Admin Panel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
