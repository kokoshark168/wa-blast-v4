import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Trash2, FileText, Image as ImageIcon, Video, File } from 'lucide-react';

const getIcon = (mime) => {
  if (mime?.startsWith('image/')) return ImageIcon;
  if (mime?.startsWith('video/')) return Video;
  if (mime?.includes('pdf') || mime?.includes('document')) return FileText;
  return File;
};

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

export default function MediaPage() {
  const [files, setFiles] = useState([]);
  const fileRef = useRef();

  const load = () => api.get('/media').then(r => setFiles(r.data?.data || r.data || [])).catch(() => setFiles([]));
  useEffect(() => { load(); }, []);

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    await api.post('/media/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    load();
  };

  const del = async (id) => { if (confirm('Delete?')) { await api.delete(`/media/${id}`); load(); } };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Media Library</h1>
        <div>
          <input type="file" ref={fileRef} onChange={upload} className="hidden" />
          <Button onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Upload</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {files.map(f => {
          const Icon = getIcon(f.mime_type);
          return (
            <Card key={f.id} className="group relative">
              <CardContent className="p-4 text-center">
                {f.mime_type?.startsWith('image/') ? (
                  <img src={`/api/media/file/${f.filename}`} alt={f.original_name} className="w-full h-24 object-cover rounded mb-2" />
                ) : (
                  <div className="w-full h-24 flex items-center justify-center mb-2"><Icon className="h-10 w-10 text-[hsl(var(--muted-foreground))]" /></div>
                )}
                <p className="text-xs truncate">{f.original_name}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatSize(f.size)}</p>
                <Button size="sm" variant="ghost" className="absolute top-1 right-1 opacity-0 group-hover:opacity-100" onClick={() => del(f.id)}>
                  <Trash2 className="h-3 w-3 text-red-400" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {files.length === 0 && <p className="text-center py-12 text-[hsl(var(--muted-foreground))]">No media files yet</p>}
    </div>
  );
}
