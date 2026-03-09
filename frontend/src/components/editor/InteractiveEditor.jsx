import { Plus, Trash2, Globe, Phone, MessageSquareReply, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

const BUTTON_TYPES = [
  { value: 'url', label: '🔗 URL Link', icon: Globe, placeholder: 'https://example.com', desc: 'Opens a website' },
  { value: 'call', label: '📞 Call', icon: Phone, placeholder: '+628123456789', desc: 'Makes a phone call' },
  { value: 'quick_reply', label: '💬 Quick Reply', icon: MessageSquareReply, placeholder: 'reply-id', desc: 'Sends a quick reply' },
];

export default function InteractiveEditor({ type, data, onChange }) {
  if (type === 'buttons') return <ButtonsEditor data={data} onChange={onChange} />;
  if (type === 'list') return <ListEditor data={data} onChange={onChange} />;
  return null;
}

function ButtonsEditor({ data, onChange }) {
  const buttons = data?.buttons || [];

  const update = (idx, field, val) => {
    const newBtns = [...buttons];
    newBtns[idx] = { ...newBtns[idx], [field]: val };
    onChange({ ...data, buttons: newBtns });
  };

  const add = () => {
    if (buttons.length >= 3) return;
    onChange({ ...data, buttons: [...buttons, { type: 'url', text: '', value: '' }] });
  };

  const remove = (idx) => {
    onChange({ ...data, buttons: buttons.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">CTA Buttons (max 3)</label>
        {buttons.length < 3 && (
          <Button type="button" size="sm" variant="ghost" onClick={add}>
            <Plus className="h-3 w-3 mr-1" />Add Button
          </Button>
        )}
      </div>

      {buttons.length === 0 && (
        <div className="border border-dashed border-[hsl(var(--border))] rounded-lg p-4 text-center">
          <ExternalLink className="h-5 w-5 mx-auto mb-2 text-[hsl(var(--muted-foreground))] opacity-50" />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Add buttons with clickable links, phone calls, or quick replies</p>
          <Button type="button" size="sm" variant="outline" onClick={add} className="mt-2">
            <Plus className="h-3 w-3 mr-1" />Add First Button
          </Button>
        </div>
      )}

      {buttons.map((btn, i) => {
        const typeInfo = BUTTON_TYPES.find(t => t.value === btn.type) || BUTTON_TYPES[0];
        const TypeIcon = typeInfo.icon;
        return (
          <div key={i} className="border border-[hsl(var(--border))] rounded-lg p-3 space-y-2">
            <div className="flex gap-2 items-center">
              <span className="text-xs text-[hsl(var(--muted-foreground))] font-medium min-w-[20px]">#{i + 1}</span>
              <Select value={btn.type || 'url'} onChange={e => update(i, 'type', e.target.value)} className="w-40 text-xs">
                {BUTTON_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
              <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-300 p-1 ml-auto"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <Input placeholder="Button text (e.g. Kunjungi Website)" value={btn.text || ''} onChange={e => update(i, 'text', e.target.value)} className="text-xs" />
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <TypeIcon className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] shrink-0" />
              <Input placeholder={typeInfo.placeholder} value={btn.value || ''} onChange={e => update(i, 'value', e.target.value)} className="text-xs flex-1" />
            </div>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] ml-5">{typeInfo.desc}</p>
          </div>
        );
      })}

      <Input placeholder="Footer text (optional)" value={data?.footer || ''} onChange={e => onChange({ ...data, footer: e.target.value })} className="text-xs" />

      {/* Button Preview */}
      {buttons.length > 0 && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[#0b141a] p-3">
          <div className="text-[10px] text-[hsl(var(--muted-foreground))] mb-2">Button Preview</div>
          <div className="bg-[#005c4b] rounded-t-lg p-2.5 text-sm text-white max-w-[85%] ml-auto">
            <div className="text-white/70 text-xs italic">Your message text...</div>
            {data?.footer && <div className="text-white/40 text-[10px] mt-1">{data.footer}</div>}
          </div>
          <div className="max-w-[85%] ml-auto space-y-px">
            {buttons.map((btn, i) => {
              const isUrl = btn.type === 'url';
              const isCall = btn.type === 'call';
              return (
                <div key={i} className="bg-[#1a2c36] text-center py-2 px-3 text-[#53bdeb] text-xs font-medium flex items-center justify-center gap-1.5 first:rounded-none last:rounded-b-lg border-t border-[#0b141a]">
                  {isUrl && <ExternalLink className="h-3 w-3" />}
                  {isCall && <Phone className="h-3 w-3" />}
                  {!isUrl && !isCall && <MessageSquareReply className="h-3 w-3" />}
                  {btn.text || `Button ${i + 1}`}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ListEditor({ data, onChange }) {
  const sections = data?.sections || [];

  const addSection = () => {
    onChange({ ...data, sections: [...sections, { title: '', rows: [{ title: '', description: '' }] }] });
  };

  const removeSection = (idx) => {
    onChange({ ...data, sections: sections.filter((_, i) => i !== idx) });
  };

  const updateSection = (idx, field, val) => {
    const s = [...sections];
    s[idx] = { ...s[idx], [field]: val };
    onChange({ ...data, sections: s });
  };

  const addRow = (sIdx) => {
    const s = [...sections];
    s[sIdx] = { ...s[sIdx], rows: [...(s[sIdx].rows || []), { title: '', description: '' }] };
    onChange({ ...data, sections: s });
  };

  const updateRow = (sIdx, rIdx, field, val) => {
    const s = [...sections];
    const rows = [...s[sIdx].rows];
    rows[rIdx] = { ...rows[rIdx], [field]: val };
    s[sIdx] = { ...s[sIdx], rows };
    onChange({ ...data, sections: s });
  };

  const removeRow = (sIdx, rIdx) => {
    const s = [...sections];
    s[sIdx] = { ...s[sIdx], rows: s[sIdx].rows.filter((_, i) => i !== rIdx) };
    onChange({ ...data, sections: s });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="List title" value={data?.title || ''} onChange={e => onChange({ ...data, title: e.target.value })} className="text-xs" />
        <Input placeholder="Button text" value={data?.buttonText || ''} onChange={e => onChange({ ...data, buttonText: e.target.value })} className="text-xs" />
      </div>
      <Input placeholder="Footer (optional)" value={data?.footer || ''} onChange={e => onChange({ ...data, footer: e.target.value })} className="text-xs" />

      {sections.map((sec, sIdx) => (
        <div key={sIdx} className="border border-[hsl(var(--border))] rounded-lg p-2 space-y-2">
          <div className="flex gap-2 items-center">
            <Input placeholder="Section title" value={sec.title || ''} onChange={e => updateSection(sIdx, 'title', e.target.value)} className="text-xs flex-1" />
            <button type="button" onClick={() => removeSection(sIdx)} className="text-red-400 hover:text-red-300 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          {(sec.rows || []).map((row, rIdx) => (
            <div key={rIdx} className="flex gap-2 items-center ml-3">
              <Input placeholder="Row title" value={row.title || ''} onChange={e => updateRow(sIdx, rIdx, 'title', e.target.value)} className="text-xs flex-1" />
              <Input placeholder="Description" value={row.description || ''} onChange={e => updateRow(sIdx, rIdx, 'description', e.target.value)} className="text-xs flex-1" />
              <button type="button" onClick={() => removeRow(sIdx, rIdx)} className="text-red-400 hover:text-red-300 p-1"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => addRow(sIdx)} className="ml-3 text-xs"><Plus className="h-3 w-3 mr-1" />Row</Button>
        </div>
      ))}

      <Button type="button" size="sm" variant="outline" onClick={addSection}><Plus className="h-3 w-3 mr-1" />Add Section</Button>
    </div>
  );
}
