import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Plus, Pencil, Trash2, Zap, ZapOff, MessageSquare, Ban, Forward, VolumeX } from 'lucide-react';

const MATCH_TYPES = [
  { value: 'contains', label: 'Contains' },
  { value: 'exact', label: 'Exact Match' },
  { value: 'startswith', label: 'Starts With' },
  { value: 'regex', label: 'Regex' },
];

const ACTIONS = [
  { value: 'reply', label: 'Auto Reply', icon: MessageSquare, color: 'text-green-400' },
  { value: 'blacklist', label: 'Blacklist', icon: Ban, color: 'text-red-400' },
  { value: 'forward', label: 'Forward to Admin', icon: Forward, color: 'text-blue-400' },
  { value: 'ignore', label: 'Ignore', icon: VolumeX, color: 'text-gray-400' },
];

const defaultForm = { keyword: '', match_type: 'contains', action: 'reply', response_text: '', is_active: 1, priority: 0 };

export default function AutoReplyPage() {
  const [rules, setRules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiKey, setAiKey] = useState('');
  const [aiBrand, setAiBrand] = useState('');
  const [aiCooldown, setAiCooldown] = useState('0');
  const [aiMaxCalls, setAiMaxCalls] = useState('2000');
  const [aiTone, setAiTone] = useState('');
  const [aiPromo, setAiPromo] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/auto-replies').then(r => setRules(r.data)).catch(() => {}).finally(() => setLoading(false));
    api.get('/settings/auto_reply_enabled').then(r => setGlobalEnabled(r.data?.value === '1')).catch(() => {});
    api.get('/settings/auto_reply_ai_enabled').then(r => setAiEnabled(r.data?.value === '1')).catch(() => {});
    api.get('/settings/openai_api_key').then(r => setAiKey(r.data?.value || '')).catch(() => {});
    api.get('/settings/ai_brand_name').then(r => setAiBrand(r.data?.value || '')).catch(() => {});
    api.get('/settings/auto_reply_cooldown_hours').then(r => setAiCooldown(r.data?.value || '0')).catch(() => {});
    api.get('/settings/ai_max_calls_per_hour').then(r => setAiMaxCalls(r.data?.value || '2000')).catch(() => {});
    api.get('/settings/ai_tone').then(r => setAiTone(r.data?.value || '')).catch(() => {});
    api.get('/settings/ai_promo_text').then(r => setAiPromo(r.data?.value || '')).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const toggleGlobal = async () => {
    const newVal = globalEnabled ? '0' : '1';
    await api.put('/settings/auto_reply_enabled', { value: newVal });
    setGlobalEnabled(!globalEnabled);
  };
  const toggleAI = async () => {
    const newVal = aiEnabled ? '0' : '1';
    await api.put('/settings/auto_reply_ai_enabled', { value: newVal });
    setAiEnabled(!aiEnabled);
  };
  const saveAISettings = async () => {
    setAiSaving(true);
    try {
      await Promise.all([
        api.put('/settings/openai_api_key', { value: aiKey }),
        api.put('/settings/ai_brand_name', { value: aiBrand }),
        api.put('/settings/auto_reply_cooldown_hours', { value: aiCooldown }),
        api.put('/settings/ai_max_calls_per_hour', { value: aiMaxCalls }),
        api.put('/settings/ai_tone', { value: aiTone }),
        api.put('/settings/ai_promo_text', { value: aiPromo }),
      ]);
      alert('✅ AI Settings saved!');
    } catch (e) { alert('❌ Error: ' + e.message); }
    setAiSaving(false);
  };

  const save = async () => {
    if (!form.keyword.trim()) return alert('Keyword is required');
    try {
      if (editing) {
        await api.patch(`/auto-replies/${editing}`, form);
      } else {
        await api.post('/auto-replies', form);
      }
      setShowForm(false);
      setEditing(null);
      setForm(defaultForm);
      load();
    } catch (e) {
      alert(e.userMessage || 'Error saving rule');
    }
  };

  const edit = (rule) => {
    setEditing(rule.id);
    setForm({
      keyword: rule.keyword,
      match_type: rule.match_type,
      action: rule.action,
      response_text: rule.response_text || '',
      is_active: rule.is_active,
      priority: rule.priority,
    });
    setShowForm(true);
  };

  const del = async (id) => {
    if (!confirm('Delete this rule?')) return;
    await api.delete(`/auto-replies/${id}`);
    load();
  };

  const toggle = async (rule) => {
    await api.patch(`/auto-replies/${rule.id}`, { is_active: rule.is_active ? 0 : 1 });
    load();
  };

  const getActionInfo = (action) => ACTIONS.find(a => a.value === action) || ACTIONS[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Auto Reply Rules</h1>
          <p className="text-[hsl(var(--muted-foreground))] text-sm mt-1">Configure keyword-based auto responses for incoming WhatsApp messages</p>
        </div>
        <button
          onClick={() => { setEditing(null); setForm(defaultForm); setShowForm(true); }}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition"
        >
          <Plus className="h-4 w-4" /> New Rule
        </button>
      </div>

      {/* Global Toggle + AI Panel */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold">🤖 Auto Reply</h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Layer 1: Keyword rules → Layer 2: AI Sentiment</p>
          </div>
          <button onClick={toggleGlobal} className={`px-4 py-2 rounded-lg font-bold text-sm ${globalEnabled ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
            {globalEnabled ? '✅ ON' : '❌ OFF'}
          </button>
        </div>

        <div className="border-t border-[hsl(var(--border))] pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowAI(!showAI)}>
              <span className="text-sm font-medium">🧠 AI Sentiment (GPT-4o-mini)</span>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">{showAI ? '▼' : '▶'}</span>
            </div>
            <button onClick={toggleAI} className={`px-3 py-1 rounded text-xs font-bold ${aiEnabled ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
              {aiEnabled ? 'AI ON' : 'AI OFF'}
            </button>
          </div>
          {showAI && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">OpenAI API Key</label>
                  <input type="password" placeholder="sk-..." value={aiKey} onChange={e => setAiKey(e.target.value)}
                    className="w-full bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Brand Name</label>
                  <input placeholder="e.g. Kopi Nusantara" value={aiBrand} onChange={e => setAiBrand(e.target.value)}
                    className="w-full bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Cooldown (hours)</label>
                  <select value={aiCooldown} onChange={e => setAiCooldown(e.target.value)}
                    className="w-full bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded px-3 py-1.5 text-sm">
                    <option value="0">No cooldown</option>
                    <option value="1">1 hour</option>
                    <option value="3">3 hours</option>
                    <option value="6">6 hours</option>
                    <option value="12">12 hours</option>
                    <option value="24">24 hours</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Max AI calls/hour</label>
                  <input type="number" value={aiMaxCalls} onChange={e => setAiMaxCalls(e.target.value)}
                    className="w-full bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded px-3 py-1.5 text-sm" />
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1">🎯 AI Tone / Persona</label>
                <input placeholder="e.g. friendly, hangat, santai kayak temen ngobrol" value={aiTone} onChange={e => setAiTone(e.target.value)}
                  className="w-full bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded px-3 py-1.5 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1">📦 Product Info / Promo (5W+1H, soft-selling)</label>
                <textarea rows={6} placeholder="Masukkan info produk lengkap:&#10;☕ APA: Kopi premium arabika...&#10;💰 HARGA: Rp 85.000/250g...&#10;📦 CARA ORDER: WA ke...&#10;🚚 PENGIRIMAN: JNE/J&T..." 
                  value={aiPromo} onChange={e => setAiPromo(e.target.value)}
                  className="w-full bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded px-3 py-2 text-sm font-mono" />
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                  AI akan pakai info ini untuk soft-selling: jawab pertanyaan → sisipkan promo secara natural. Intents: marah → comfort + promo, bingung → helpful + info, senang → friendly + mention promo.
                </p>
              </div>
              <button onClick={saveAISettings} disabled={aiSaving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm font-medium transition">
                {aiSaving ? '⏳ Saving...' : '💾 Save AI Settings'}
              </button>
              
              {/* Flow Diagram */}
              <div className="bg-[hsl(var(--muted))] rounded-lg p-3 mt-2">
                <p className="text-xs font-medium mb-2">📊 Auto Reply Flow:</p>
                <div className="flex items-center gap-1 text-[10px] flex-wrap">
                  <span className="bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded">📩 Incoming</span>
                  <span className="text-[hsl(var(--muted-foreground))]">→</span>
                  <span className="bg-yellow-600/30 text-yellow-300 px-2 py-0.5 rounded">🔍 Keywords</span>
                  <span className="text-[hsl(var(--muted-foreground))]">→ match?</span>
                  <span className="bg-green-600/30 text-green-300 px-2 py-0.5 rounded">✅ Reply</span>
                  <span className="text-[hsl(var(--muted-foreground))]">| no match →</span>
                  <span className="bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded">🧠 AI Sentiment</span>
                  <span className="text-[hsl(var(--muted-foreground))]">→</span>
                  <span className="bg-green-600/30 text-green-300 px-2 py-0.5 rounded">💬 Smart Reply</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          💡 Rules diproses berdasarkan <strong>priority</strong> (tertinggi dulu). Keyword bisa dipisah koma untuk multiple match.
          Contoh: <code className="bg-[hsl(var(--muted))] px-1 rounded">stop, berhenti, unsub</code>
        </p>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold">{editing ? 'Edit Rule' : 'New Rule'}</h2>

            <div>
              <label className="block text-sm font-medium mb-1">Keywords <span className="text-[hsl(var(--muted-foreground))]">(comma separated)</span></label>
              <input
                className="w-full bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-lg px-3 py-2 text-sm"
                placeholder="stop, berhenti, unsubscribe"
                value={form.keyword}
                onChange={e => setForm({ ...form, keyword: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Match Type</label>
                <select
                  className="w-full bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-lg px-3 py-2 text-sm"
                  value={form.match_type}
                  onChange={e => setForm({ ...form, match_type: e.target.value })}
                >
                  {MATCH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Action</label>
                <select
                  className="w-full bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-lg px-3 py-2 text-sm"
                  value={form.action}
                  onChange={e => setForm({ ...form, action: e.target.value })}
                >
                  {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
            </div>

            {(form.action === 'reply' || form.action === 'blacklist') && (
              <div>
                <label className="block text-sm font-medium mb-1">Response Text</label>
                <textarea
                  className="w-full bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-lg px-3 py-2 text-sm h-24 resize-none"
                  placeholder={form.action === 'blacklist' ? 'Maaf mengganggu, nomor Anda telah dihapus dari daftar.' : 'Terima kasih! Info lengkap: https://...'}
                  value={form.response_text}
                  onChange={e => setForm({ ...form, response_text: e.target.value })}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Priority</label>
                <input
                  type="number"
                  className="w-full bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-lg px-3 py-2 text-sm"
                  value={form.priority}
                  onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })}
                    className="rounded"
                  />
                  <span className="text-sm">Active</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--muted))]">Cancel</button>
              <button onClick={save} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Table */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[hsl(var(--border))]">
              <th className="text-left px-4 py-3 text-sm font-medium">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium">Keywords</th>
              <th className="text-left px-4 py-3 text-sm font-medium">Match</th>
              <th className="text-left px-4 py-3 text-sm font-medium">Action</th>
              <th className="text-left px-4 py-3 text-sm font-medium">Response</th>
              <th className="text-left px-4 py-3 text-sm font-medium">Priority</th>
              <th className="text-left px-4 py-3 text-sm font-medium">Hits</th>
              <th className="text-left px-4 py-3 text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-[hsl(var(--muted-foreground))]">Loading...</td></tr>
            ) : rules.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-[hsl(var(--muted-foreground))]">No rules yet. Click "New Rule" to create one.</td></tr>
            ) : rules.map(rule => {
              const actionInfo = getActionInfo(rule.action);
              const ActionIcon = actionInfo.icon;
              return (
                <tr key={rule.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]">
                  <td className="px-4 py-3">
                    <button onClick={() => toggle(rule)} title={rule.is_active ? 'Active — click to disable' : 'Inactive — click to enable'}>
                      {rule.is_active ? <Zap className="h-4 w-4 text-green-400" /> : <ZapOff className="h-4 w-4 text-gray-500" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {rule.keyword.split(',').map((kw, i) => (
                        <span key={i} className="bg-[hsl(var(--muted))] text-xs px-2 py-0.5 rounded">{kw.trim()}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">{rule.match_type}</td>
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-1 text-sm ${actionInfo.color}`}>
                      <ActionIcon className="h-3 w-3" /> {actionInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))] max-w-[200px] truncate">{rule.response_text || '-'}</td>
                  <td className="px-4 py-3 text-sm">{rule.priority}</td>
                  <td className="px-4 py-3 text-sm font-mono text-green-400">{rule.hit_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => edit(rule)} className="p-1 hover:bg-[hsl(var(--muted))] rounded"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => del(rule.id)} className="p-1 hover:bg-[hsl(var(--muted))] rounded"><Trash2 className="h-3 w-3 text-red-400" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
