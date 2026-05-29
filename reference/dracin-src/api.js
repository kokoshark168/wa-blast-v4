import axios from 'axios';

const DRAMABOS_KEY = process.env.DRAMABOS_KEY || 'C5F278CC6EF24F2E3830B52A9A2A956E';
const DRAMABOX_CODE = process.env.DRAMABOX_CODE || '5193CD21848193E43FC399BA4D73BB13';

const api = axios.create({ timeout: 12000 });

// ── Helpers ─────────────────────────────────────────────────────
function cleanCover(url) {
  if (!url) return url;
  // Strip resize param — prevents 300px thumbnails being stretched to 760px cards
  return url.replace(/[?&]image_process=resize[^&]*/g, '').replace(/&$/, '').replace(/\?$/, '');
}

// ── Platform Registry (8 of 32 confirmed working) ─────────────
const P = {
  dramabox: {
    name: 'DramaBox',
    base: 'https://dramabox.dramabos.online/api/v1',
    apiCode: DRAMABOX_CODE,
    searchPath: (q) => `/search?q=${encodeURIComponent(q)}&code=${P.dramabox.apiCode}`,
    detailPath: (id) => `/detail?bookId=${id}&code=${P.dramabox.apiCode}`,
    episodePath: (id) => `/allepisode?bookId=${id}&code=${P.dramabox.apiCode}`,
    normalizeList: (d) => d?.results || [],
    normalize: (o) => ({ id: o.bookId, title: o.bookName, cover: cleanCover(o.cover), chapterCount: o.chapterCount }),
  },
  shortmax: {
    name: 'ShortMax',
    base: 'https://shortmax.dramabos.online/api/v1',
    apiCode: DRAMABOS_KEY,
    searchPath: (q) => {
      const kw = q.includes(' ') ? q : q + ' ' + q;
      return `/search?q=${encodeURIComponent(kw)}&code=${P.shortmax.apiCode}`;
    },
    detailPath: (id) => `/detail?code=${P.shortmax.apiCode}&bookId=${id}`,
    episodePath: (id) => `/allepisode?bookId=${id}&code=${P.shortmax.apiCode}`,
    normalizeList: (d) => d?.data || [],
    normalize: (o) => ({ id: o.code || o.id, title: o.name, cover: o.cover }),
  },
  reelife: {
    name: 'Reelife',
    base: 'https://reelife.dramabos.online/api/v1',
    apiCode: DRAMABOS_KEY,
    searchPath: (q) => `/search?q=${encodeURIComponent(q)}&code=${P.reelife.apiCode}`,
    detailPath: (id) => `/detail?bookId=${id}&code=${P.reelife.apiCode}`,
    episodePath: (id) => `/allepisode?bookId=${id}&code=${P.reelife.apiCode}`,
    normalizeList: (d) => d?.dramas || [],
    normalize: (o) => ({ id: o.bookId, title: o.bookName, cover: o.coverWap }),
  },
  moboreels: {
    name: 'MoboReels',
    base: 'https://moboreels.dramabos.online/api/v1',
    apiCode: DRAMABOS_KEY,
    searchPath: (q) => `/search?q=${encodeURIComponent(q)}&code=${P.moboreels.apiCode}`,
    // MoboReels has no separate detail/episode endpoints — episodes embedded in /series/:id
    detailPath: (id) => `/series/${id}?code=${P.moboreels.apiCode}`,
    episodePath: null, // episodes come from detail response
    normalizeList: (d) => d?.data?.mainData?.rows || [],
    normalize: (o) => ({ id: o.seriesId, title: o.seriesName, cover: o.coverUrl, platform: 'moboreels' }),
  },
  netshort: {
    name: 'NetShort',
    base: 'https://netshort.dramabos.online/api',
    apiCode: DRAMABOS_KEY,
    searchPath: (q) => `/search?q=${encodeURIComponent(q)}&code=${DRAMABOS_KEY}`,
    // Drakula-style path params: /drama/:id — episodes embedded in detail
    detailPath: (id) => `/drama/${id}?code=${P.netshort.apiCode}`,
    episodePath: null,
    homePath: `/home/?code=${DRAMABOS_KEY}`,
    normalizeList: (d) => d?.data?.searchCodeSearchResult || [],
    normalizeHomeList: (d) => d?.data?.contentInfos || [],
    normalize: (o) => ({ id: o.shortPlayId, title: o.shortPlayName, cover: o.shortPlayCover, platform: 'netshort' }),
  },
  dramanova: {
    name: 'DramaNova',
    base: 'https://dramanova.dramabos.online/api',
    apiCode: DRAMABOS_KEY,
    searchPath: (q) => `/search?q=${encodeURIComponent(q)}&code=${P.dramanova.apiCode}`,
    // Detail returns episodes embedded but videos use fileId (no direct URL)
    detailPath: (id) => `/detail/${id}?code=${P.dramanova.apiCode}`,
    episodePath: null,
    normalizeList: (d) => d?.rows || [],
    normalize: (o) => ({ id: o.dramaId, title: o.title, cover: o.posterImg, chapterCount: o.totalEpisodes, platform: 'dramanova' }),
  },
  bilitv: {
    name: 'BiliTV',
    base: 'https://bilitv.dramabos.online/api',
    apiCode: DRAMABOS_KEY,
    homePath: `/home?code=${DRAMABOS_KEY}`,
    normalizeHomeList: (d) => d?.data?.dramas || [],
    normalize: (o) => ({ id: o.id, title: o.title, cover: o.cover_img, chapterCount: o.total_num }),
  },
  cubetv: {
    name: 'CubeTV',
    base: 'https://cubetv.dramabos.online/api',
    apiCode: DRAMABOS_KEY,
    searchPath: (q) => `/search?q=${encodeURIComponent(q)}&code=${P.cubetv.apiCode}`,
    normalizeList: (d) => d?.rows || [],
    normalize: (o) => ({ id: o.videoid, title: o.videoName, cover: o.cover }),
  },
};

// ── Helpers ────────────────────────────────────────────────────

async function fetchPlatform(key, path) {
  try {
    const { data } = await api.get(`${P[key].base}${path}`, { timeout: 10000 });
    return data;
  } catch {
    return null;
  }
}

async function searchPlatform(key, query) {
  const p = P[key];
  if (!p.searchPath) return [];
  const data = await fetchPlatform(key, p.searchPath(query));
  if (!data) return [];
  const list = p.normalizeList(data);
  return list.map(o => ({ ...p.normalize(o), platform: key }));
}

async function homePlatform(key) {
  const p = P[key];
  if (!p.homePath) return [];
  const data = await fetchPlatform(key, p.homePath);
  if (!data) return [];
  const list = (p.normalizeHomeList || p.normalizeList)(data);
  return list.map(o => ({ ...p.normalize(o), platform: key }));
}

// ── Public API ─────────────────────────────────────────────────

// Platforms that share DramaBox content — route detail/episodes to DramaBox API
const SHARES_CONTENT_WITH = { reelife: true }; // reelife uses same bookId format

export async function getDramaDetail(bookId, platform = 'dramabox') {
  const p = P[SHARES_CONTENT_WITH[platform] ? 'dramabox' : platform] || P.dramabox;
  const { data } = await api.get(`${p.base}${p.detailPath(bookId)}`);
  if (platform === 'shortmax') return data?.data ?? null;
  if (platform === 'reelife') return data ?? null; // goes through dramabox API
  if (platform === 'moboreels') return {
    ...(data?.data || {}),
    // Map MoboReels series detail to standard format
    totalEpisodes: data?.data?.totalEpisodes,
    episodes: data?.data?.episodes || [],
  };
  if (platform === 'netshort') return data?.data ?? data;
  if (platform === 'dramanova') return data?.data ?? null;
  return data;
}

export async function getEpisodes(bookId, platform = 'dramabox') {
  const p = P[SHARES_CONTENT_WITH[platform] ? 'dramabox' : platform] || P.dramabox;
  
  // Platforms without separate episode endpoint — fetch from detail
  if (!p.episodePath) {
    const detailData = await getDramaDetail(bookId, platform);
    if (platform === 'moboreels') {
      return (detailData?.episodes || []).map(e => ({
        episodeId: e.episId, episodeNo: e.episNum, videoUrl: e.mediaUrl,
        episodeCover: e.coverUrl, duration: e.duration, isFree: e.isFree,
      }));
    }
    if (platform === 'dramanova') {
      const eps = detailData?.episodes || [];
      return eps.map(e => ({
        episodeId: e.id, episodeNo: e.episodeNumber, 
        videoUrl: e.fileId ? `fileId:${e.fileId}` : null, // needs video lookup
        episodeCover: e.thumbnailImg, episodeTitle: e.episodeTitle,
      }));
    }
    if (platform === 'netshort') {
      const eps = detailData?.shortPlayEpisodeList || [];
      return eps.map(e => ({
        episodeId: e.episodeId, episodeNo: e.episodeNo, videoUrl: e.playVoucher,
        episodeCover: e.episodeCover, isLock: e.isLock,
      }));
    }
    return Array.isArray(detailData) ? detailData : [];
  }
  
  const { data } = await api.get(`${p.base}${p.episodePath(bookId)}`);
  if (platform === 'shortmax') return Array.isArray(data?.data) ? data.data : [];
  if (platform === 'reelife') return Array.isArray(data) ? data : [];
  return Array.isArray(data) ? data : [];
}

export async function searchDramas(query) {
  const keys = ['dramabox', 'shortmax', 'reelife', 'moboreels', 'netshort', 'dramanova', 'cubetv'];
  const all = await Promise.all(keys.map(k => searchPlatform(k, query).catch(() => [])));
  const seen = new Set();
  const merged = [];
  for (const list of all) {
    for (const item of list) {
      if (item.id && !seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
  }
  return merged;
}

const HOME_KW = ['drama', 'cinta', 'istri', 'CEO', 'suami'];

export async function getHomeFeed() {
  // Platform search
  const searchKeys = ['dramabox', 'shortmax', 'reelife', 'moboreels', 'netshort', 'dramanova', 'cubetv'];
  const searchPromises = searchKeys.flatMap(k =>
    HOME_KW.map(kw => searchPlatform(k, kw).catch(() => []))
  );
  // Platform home feeds (no search needed)
  const homePromises = ['netshort', 'bilitv'].map(k => homePlatform(k).catch(() => []));
  
  const all = await Promise.all([...searchPromises, ...homePromises]);

  const seen = new Set();
  const merged = [];
  for (const list of all) {
    for (const item of list) {
      if (item.id && !seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
  }
  return merged;
}

export async function getHlsUrl(videoUrl) {
  if (videoUrl.includes('/proxy')) return videoUrl;
  const encoded = encodeURIComponent(videoUrl);
  return `https://dramabox.dramabos.online/proxy?url=${encoded}`;
}

export async function getHlsSegments(proxyUrl) {
  const { data } = await axios.get(proxyUrl, { responseType: 'text' });
  return data.split('\n').filter(l => l.startsWith('http'));
}
