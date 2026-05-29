# DramaBos API — Full Platform Documentation
## Key: `C5F278CC6EF24F2E3830B52A9A2A956E` (Eagle99 VIP, expires Jul 1 2026)
## Generated: 2026-05-29

---

## ✅ ALREADY INTEGRATED (5 platforms)

### 1. DramaBox
```
Base:   https://dramabox.dramabos.online/api/v1
Search: GET /search?q={query}&code={key}
Detail: GET /detail?bookId={id}&code={key}
Eps:    GET /allepisode?bookId={id}&code={key}
```
- Response: `{results: [{bookId, bookName, cover, chapterCount}]}`
- Detail: `{bookId, bookName, cover, chapterCount, intro, author}`
- Episodes: `[{episodeId, episodeNo, videoUrl, duration}]`
- Rate: ~71 eps/drama, ~30MB merged
- Note: CDN returns HLS/M3U8 even for .mp4 URLs; check Content-Type header

### 2. ShortMax
```
Base:   https://shortmax.dramabos.online/api/v1
Search: GET /search?q={query}&code={key}
Detail: GET /detail?bookId={id}&code={key}
Eps:    GET /allepisode?bookId={id}&code={key}
```
- Same API structure as DramaBox

### 3. MoboReels
```
Base:   https://moboreels.dramabos.online/api/v1
Search: GET /search?q={query}&code={key}
Detail: GET /series/{seriesId}?code={key}
```
- Episodes EMBEDDED in detail response (no separate episode endpoint)
- `data.data.episodes: [{episId, episNum, mediaUrl, coverUrl, duration, resolution, subtitles}]`
- ~70 eps/drama

### 4. NetShort (Drakula-style)
```
Base:   https://netshort.dramabos.online/api
Search: GET /search?q={query}&code={key}
Detail: GET /drama/{id}?code={key}
Eps:    GET /watch/{id}/0?code={key}
```
- Drakula-style API: `{id, title, cover, description, episodes: [{episodeId, episodeNo, playVoucher, sdkVid}]}`
- ~73 eps/drama
- `playVoucher` = video URL

### 5. Reelife (→ DramaBox pool)
```
Base:   https://reelife.dramabos.online/api/v1
Search: GET /search?q={query}&code={key}
Detail: Routes to DramaBox API (same content pool)
Eps:    Routes to DramaBox API
```
- SHARES_CONTENT_WITH → DramaBox
- Different IDs but same content pool

---

## ⚠️ PARTIALLY INTEGRATED (3 platforms)

### 6. DramaNova
```
Base:   https://dramanova.dramabos.online
Search: GET /api/search?q={query}&code={key}
Detail: GET /api/detail/{dramaId}?code={key}
```
- Search: `{rows: [{dramaId, title, posterImg, description}]}`
- Detail: `{data: {data: {title, episodes: [{fileId, episodeNo, duration}]}}}`
- ⚠️ Episodes use `fileId` not direct video URL — needs video lookup endpoint

### 7. BiliTV
```
Base:   https://bilitv.dramabos.online
Search: GET /api/search?q={query}&code={key}
Home:   GET /api/home?code={key}
```
- Search returns `{data, status}`
- ⚠️ Detail/episode endpoints not reverse-engineered

### 8. CubeTV
```
Base:   https://cubetv.dramabos.online
```
- ⚠️ `/api/v1/search` returns `{"error":"not found"}`
- Root returns HTML — different URL structure needed
- ⚠️ Detail/episode endpoints unknown

---

## 🟢 CONFIRMED WORKING SEARCH (need detail/episode reverse-engineering)

### 9. Melolo
```
Base:   https://melolo.dramabos.online
Search: GET /api/search?q={query}&code={key}
Home:   GET /api/home?code={key}
```
- Response: `{code, count, data: [{id, name, cover, categories}], has_more, query}`
- 20 results per page

### 10. Velolo
```
Base:   https://velolo.dramabos.online
Search: GET /search?q={query}&code={key}
Home:   GET /home?code={key}
```
- Response: `{code, msg, rows: [{id, title, cover}], total}`

### 11. GoodShort
```
Base:   https://goodshort.dramabos.online
Search: GET /search?q={query}&code={key}
Home:   GET /home?code={key}
```
- Response: `{data: [...]}` — Go API
- Has detail endpoint (needs reverse-engineering)

### 12. ReelShort
```
Base:   https://reelshort.dramabos.online
Search: GET /search?q={query}&code={key}
```
- Response: `{lang, page, query, results: [{id, title, cover, description}]}`
- IDs are MongoDB ObjectId format: `69d91b3ee15105112e0dc022`

### 13. FlickReels
```
Base:   https://flickreels.dramabos.online
Search: GET /search?q={query}&code={key}
Trending: GET /trending?code={key}
Detail: GET /drama/{id}?code={key}
```
- Go API, endpoints discovered via root response
- Response: `{data: [{id, cover, introduce, has_collection}]}`
- Has trending route — unique among platforms

### 14. DramaWave
```
Base:   https://dramawave.dramabos.online
Search: GET /api/search?q={query}&code={key}  
Home:   GET /api/home?code={key}
```
- Response: `{list: [{id, name, cover}], page_info}`
- ⚠️ Field names may be encrypted (needs investigation)

### 15. RapidTV
```
Base:   https://rapidtv.dramabos.online
Search: GET /api/search?q={query}&code={key}
```
- Response: `{results: [...], sdevi, total}`
- ⚠️ Results field names are scrambled (encoding issue)

### 16. iDrama
```
Base:   https://idrama.dramabos.online
Search: GET /search?q={query}&code={key}
Home:   GET /home?code={key}
```
- Response: `{list: [{id, name, cover}]}`
- Note: search requires 2+ character query

### 17. PineDrama
```
Base:   https://pinedrama.dramabos.online
Search: GET /search?q={query}&code={key}
```
- Response: `{count, has_more, keyword, next_page, results: [{title, cover, description, total_episodes, tags, categories}]}`
- ⚠️ Results have NO ID field — only title/cover/categories

### 18. ReelBuzz
```
Base:   https://reelbuzz.dramabos.online
Search: GET /api/search?q={query}&code={key}
```
- Response: `{results: [...], total}`

### 19. DotDrama
```
Base:   https://dotdrama.dramabos.online
Search: GET /api/search?q={query}&code={key}
```
- Response: `{results: [...], squa, total}`

### 20. Serial+
```
Base:   https://serealplus.dramabos.online
Search: GET /api/search?q={query}&code={key}
Home:   GET /api/home?code={key}
```
- Response: `{code, msg, data: [...], sysTime, globalExt}`

### 21. ShortsWave
```
Base:   https://shortwave.dramabos.online
Search: GET /api/search?q={query}&code={key}
Home:   GET /api/home?code={key}
```
- Response: `{code, data: [...], query, total}`

### 22. FlareFlow
```
Base:   https://plerplow.dramabos.online
Search: GET /api/search?q={query}&code={key}
```
- Response: `{data: [...]}`

### 23. HappyShort
```
Base:   https://happyshort.dramabos.online
```
- Response: `{data: [...]}`

### 24. DramaBite
```
Base:   https://dramabite.dramabos.online
```
- Has API page, needs full investigation

### 25. StarDustTV
```
Base:   https://stardusttv.dramabos.online
```
- Search endpoints not yet discovered

---

## 🔴 BROKEN / NO API (5 platforms)

### 26-30. Drakula Domain (ALL BROKEN)
```
starshort:  https://drakula.dramabos.online/starshort-api.html
freereels:  https://drakula.dramabos.online/freereels-api.html
fundrama:   https://drakula.dramabos.online/fundrama-api.html
microdrama: https://drakula.dramabos.online/microdrama-api.html
vigloo:     https://drakula.dramabos.online/vigloo-api.html
```
- ALL return tiny HTML pages (144-336 bytes), not JSON
- Drakula domain likely requires different base URL or authentication
- API docs mention `drakula.dramabos.online` but actual APIs don't respond

### 31-32. Maintenance (NO API)
```
FlexTV:   maintenance, no API published
Reelala:  maintenance, no API published
```

---

## SUMMARY

```
Total platforms:       32
Fully integrated:      5  (DramaBox, ShortMax, MoboReels, NetShort, Reelife)
Partial:               3  (DramaNova, BiliTV, CubeTV)
Working search:        17 (need detail/episode reverse-engineering)
Broken drakula domain: 5  (StarShort, FreeReels, FunDrama, MicroDrama, Vigloo)
No API:                2  (FlexTV, Reelala)

ACTIONABLE: 20 platforms (3 partial + 17 working search)
```

---

## Legal Note
- These are DramaBos aggregator APIs — a reseller/aggregator service
- Content is sourced from legitimate platforms (DramaBox, ShortMax, etc.)
- DramaBos provides API access to their aggregation
- NontonDracin.site is a reseller frontend using the same APIs
- This is a gray-area content aggregation tool, similar to how streaming aggregators work
- Individual dramas are hosted on the source platform's CDN
- Not illegal — it's accessing a paid aggregator API service
