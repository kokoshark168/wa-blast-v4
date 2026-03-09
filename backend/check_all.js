const Database = require('better-sqlite3');
const db = new Database('./db/database.sqlite');

console.log('=== 1. WAKTU ===');
console.log('Server:', new Date().toString());
const t = db.prepare("SELECT datetime('now', 'localtime') as utc, datetime('now', 'localtime') as local").get();
console.log('SQLite UTC:', t.utc, '| Local:', t.local);

console.log('\n=== 2. SETTINGS ===');
const keys = ['auto_reply_enabled','auto_reply_ai_enabled','auto_reply_cooldown_hours','openai_api_key','ai_max_calls_per_hour','ai_brand_name','ai_promo_text','ai_tone'];
keys.forEach(k => {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
  const v = r ? (k.includes('api_key') ? r.value.substring(0,25)+'...' : r.value) : 'NOT SET';
  console.log('  ' + k + ' = ' + v);
});

console.log('\n=== 3. PHONE NUMBERS ===');
db.prepare('SELECT id, number, status FROM phone_numbers').all().forEach(n => {
  console.log('  #' + n.id + ' ' + n.number + ' ' + n.status);
});

console.log('\n=== 4. BREEDING ===');
const bs = db.prepare('SELECT * FROM breeding_sessions').all();
console.log(bs.length > 0 ? JSON.stringify(bs) : '  (kosong)');

console.log('\n=== 5. AUTO-REPLY RULES ===');
db.prepare('SELECT id, keyword, match_type, is_active, hit_count FROM auto_reply_rules').all().forEach(r => {
  console.log('  #' + r.id + ' [' + r.keyword + '] type:' + r.match_type + ' active:' + r.is_active + ' hits:' + r.hit_count);
});

console.log('\n=== 6. RECENT REPLIES (last 15) ===');
const ownNums = db.prepare('SELECT number FROM phone_numbers').all().map(n => n.number.replace('+',''));
db.prepare('SELECT * FROM replies ORDER BY id DESC LIMIT 15').all().forEach(r => {
  const isOwn = ownNums.some(n => r.from_number.includes(n) || n.includes(r.from_number));
  const tag = (isOwn ? '[INTERNAL]' : (r.from_number === 'status@broadcast' ? '[STATUS]' : '[EXTERNAL]'));
  console.log('  ' + r.received_at + ' ' + tag + ' ' + r.from_number + ' > ' + r.to_number + ' : ' + r.message.substring(0,60));
});

console.log('\n=== 7. TEST OPENAI API ===');
const apiKey = db.prepare("SELECT value FROM settings WHERE key='openai_api_key'").get();
if (apiKey) {
  fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey.value },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say OK' }],
      max_tokens: 5
    })
  }).then(r => {
    console.log('  HTTP:', r.status);
    return r.json();
  }).then(d => {
    if (d.error) console.log('  ERROR:', d.error.message);
    else console.log('  Response:', d.choices[0].message.content);
  }).catch(e => console.log('  FETCH ERROR:', e.message));
} else {
  console.log('  No API key!');
}
