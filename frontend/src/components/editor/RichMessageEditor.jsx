import { useState, useRef, useCallback, useEffect } from 'react';
import { Bold, Italic, Strikethrough, Code, Smile, Variable, Shuffle, Image, X, Eye, EyeOff, Upload } from 'lucide-react';

const EMOJIS = ['😀','😂','🤣','😍','🥰','😎','🤩','😇','🙏','👍','👋','🎉','🔥','❤️','💪','✅','⭐','🚀','💰','📱','🎯','💡','📢','🛒','🏷️','⏰','📌','🔗','✨','🙌'];

const VARIABLES = [
  { label: '{{phone}}', desc: 'Nomor HP' },
  { label: '{{name}}', desc: 'Nama kontak' },
  { label: '{{date}}', desc: 'Tanggal hari ini' },
];

// Format WhatsApp-style text to preview HTML
function formatWAPreview(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<del>$1</del>')
    .replace(/```([^`]+)```/g, '<code class="bg-gray-700 px-1 rounded text-sm">$1</code>')
    .replace(/\n/g, '<br/>');
  // Show spin syntax as highlighted
  html = html.replace(/\{([^}]*\|[^}]*)\}/g, '<span class="text-yellow-400 bg-yellow-400/10 rounded px-0.5">{$1}</span>');
  // Show variables as highlighted
  html = html.replace(/\{\{(\w+)\}\}/g, '<span class="text-blue-400 bg-blue-400/10 rounded px-0.5">{{$1}}</span>');
  return html;
}

export default function RichMessageEditor({ value, onChange, mediaFile, mediaPreview, onMediaUpload, onMediaRemove, campaignId }) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const [showVars, setShowVars] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const wrapSelection = useCallback((before, after) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = value || '';
    const selected = text.substring(start, end);
    const newText = text.substring(0, start) + before + selected + (after || before) + text.substring(end);
    onChange(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  }, [value, onChange]);

  const insertText = useCallback((text) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const current = value || '';
    const newText = current.substring(0, start) + text + current.substring(start);
    onChange(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  }, [value, onChange]);

  const handleSpinSyntax = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = value || '';
    const selected = text.substring(start, end);
    const spinText = selected ? `{${selected}|alt1|alt2}` : '{option1|option2|option3}';
    const newText = text.substring(0, start) + spinText + text.substring(end);
    onChange(newText);
    setTimeout(() => { ta.focus(); }, 0);
  }, [value, onChange]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) onMediaUpload?.(file);
  }, [onMediaUpload]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) onMediaUpload?.(file);
    e.target.value = '';
  }, [onMediaUpload]);

  const charCount = (value || '').length;

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-1 flex-wrap p-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <ToolBtn icon={Bold} title="Bold (*text*)" onClick={() => wrapSelection('*')} />
        <ToolBtn icon={Italic} title="Italic (_text_)" onClick={() => wrapSelection('_')} />
        <ToolBtn icon={Strikethrough} title="Strikethrough (~text~)" onClick={() => wrapSelection('~')} />
        <ToolBtn icon={Code} title="Monospace (```text```)" onClick={() => wrapSelection('```')} />
        <div className="w-px h-5 bg-[hsl(var(--border))] mx-1" />
        <div className="relative">
          <ToolBtn icon={Smile} title="Emoji" onClick={() => { setShowEmojis(!showEmojis); setShowVars(false); }} active={showEmojis} />
          {showEmojis && (
            <div className="absolute top-full left-0 mt-1 z-50 p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl grid grid-cols-6 gap-1 w-56">
              {EMOJIS.map(e => (
                <button key={e} type="button" onClick={() => { insertText(e); setShowEmojis(false); }}
                  className="text-xl p-1 rounded hover:bg-[hsl(var(--accent))] transition-colors">{e}</button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <ToolBtn icon={Variable} title="Insert Variable" onClick={() => { setShowVars(!showVars); setShowEmojis(false); }} active={showVars} />
          {showVars && (
            <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl w-48">
              {VARIABLES.map(v => (
                <button key={v.label} type="button" onClick={() => { insertText(v.label); setShowVars(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--accent))] transition-colors flex justify-between">
                  <code className="text-blue-400">{v.label}</code>
                  <span className="text-[hsl(var(--muted-foreground))] text-xs">{v.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <ToolBtn icon={Shuffle} title="Spin Syntax {a|b|c}" onClick={handleSpinSyntax} />
        <div className="w-px h-5 bg-[hsl(var(--border))] mx-1" />
        <ToolBtn icon={Image} title="Upload Image" onClick={() => fileInputRef.current?.click()} />
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleFileSelect} />
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-xs ${charCount > 4096 ? 'text-red-400' : 'text-[hsl(var(--muted-foreground))]'}`}>{charCount}</span>
          <ToolBtn icon={showPreview ? EyeOff : Eye} title="Preview" onClick={() => setShowPreview(!showPreview)} active={showPreview} />
        </div>
      </div>

      {/* Image drop zone / preview */}
      {mediaPreview ? (
        <div className="relative inline-block">
          <img src={mediaPreview} alt="Campaign media" className="h-24 rounded-lg border border-[hsl(var(--border))] object-cover" />
          <button type="button" onClick={onMediaRemove}
            className="absolute -top-2 -right-2 p-0.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-3 text-center text-xs cursor-pointer transition-colors ${
            dragOver ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50'
          } text-[hsl(var(--muted-foreground))]`}
        >
          <Upload className="h-4 w-4 mx-auto mb-1 opacity-50" />
          Drop image here or click to upload (max 5MB)
        </div>
      )}

      {/* Textarea + Preview */}
      <div className={showPreview ? 'grid grid-cols-2 gap-2' : ''}>
        <textarea
          ref={textareaRef}
          className="w-full min-h-[150px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
          placeholder="Type your message... Use *bold*, _italic_, ~strikethrough~, ```monospace```&#10;&#10;Spin syntax: {hi|hello|hey}&#10;Variables: {{phone}}, {{name}}, {{date}}"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onClick={() => { setShowEmojis(false); setShowVars(false); }}
        />
        {showPreview && (
          <div className="rounded-md border border-[hsl(var(--border))] bg-[#0b141a] p-3 min-h-[150px] overflow-auto">
            <div className="text-xs text-[hsl(var(--muted-foreground))] mb-2">WhatsApp Preview</div>
            <div className="bg-[#005c4b] rounded-lg p-2.5 text-sm text-white max-w-[90%] ml-auto">
              {mediaPreview && <img src={mediaPreview} alt="" className="rounded mb-2 max-h-32 object-cover" />}
              <div dangerouslySetInnerHTML={{ __html: formatWAPreview(value) }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBtn({ icon: Icon, title, onClick, active }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={`p-1.5 rounded transition-colors ${active ? 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]' : 'hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}>
      <Icon className="h-4 w-4" />
    </button>
  );
}
