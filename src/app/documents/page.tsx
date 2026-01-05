'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabaseClient } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, FileText, Upload, Trash2 } from 'lucide-react'

type UserFileRow = {
  id: string
  filename: string
  file_size: number
  uploaded_at: string
}

export default function DocumentsPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [files, setFiles] = useState<UserFileRow[]>([])
  const [uploading, setUploading] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(true)

  const loadFiles = useCallback(async () => {
    if (!user?.id) return
    try {
      setLoadingFiles(true)
      const { data, error } = await supabaseClient
        .from('user_files')
        .select('*')
        .eq('user_id', user.id)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      setFiles(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingFiles(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (user) void loadFiles()
  }, [loadFiles, user])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large', { description: 'Max 10MB' })
      return
    }

    try {
      setUploading(true)
      const formData = new FormData()
      formData.append('file', file)
      const { data: session } = await supabaseClient.auth.getSession()
      const token = session?.session?.access_token

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) {
        // Log status to see if it's 404 or 500
        console.error('Upload failed with status:', res.status)
        let errMsg = 'Upload failed'
        try {
            const err = await res.json()
            errMsg = err.error || errMsg
        } catch {
            errMsg = `Server error (${res.status})`
        }
        throw new Error(errMsg)
      }

      toast.success('File uploaded and embedded')
      void loadFiles()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Upload failed'
      toast.error('Upload failed', { description: message })
    } finally {
      setUploading(false)
      // Reset input
      e.target.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabaseClient.from('user_files').delete().eq('id', id)
      if (error) throw error
      // Also delete vectors (cascade should handle this, but good to know)
      setFiles((prev) => prev.filter((f) => f.id !== id))
      toast.success('File deleted')
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Delete failed'
      toast.error('Delete failed', { description: message })
    }
  }

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div>

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Private Documents</h1>
          <p className="text-gray-500">Upload SOPs and internal docs for RAG context</p>
        </div>
        <div>
          <Label htmlFor="file-upload" className="cursor-pointer">
            <div className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition">
              {uploading ? <Loader2 className="animate-spin h-4 w-4" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Uploading...' : 'Upload Document'}
            </div>
          </Label>
          <Input 
            id="file-upload" 
            type="file" 
            accept=".txt,.md,.pdf" 
            className="hidden" 
            onChange={handleUpload} 
            disabled={uploading}
          />
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Your Files</CardTitle>
            <CardDescription>Documents available for private generation context</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingFiles ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
            ) : files.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No documents uploaded yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {files.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded">
                        <FileText className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                      </div>
                      <div>
                        <p className="font-medium">{file.filename}</p>
                        <p className="text-xs text-gray-500">
                          {(file.file_size / 1024).toFixed(1)} KB • {new Date(file.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(file.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
