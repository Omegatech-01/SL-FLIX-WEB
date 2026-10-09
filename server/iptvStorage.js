import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const DATA_DIR = path.join(process.cwd(), 'data', 'iptv');
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000; // 48 hours

// Memory state
let iptvChannels = [];
let iptvStreams = [];
let iptvLogos = [];
let iptvCategories = [];
let iptvCountries = [];
let iptvGuides = [];
let iptvNormalized = [];
let metaData = {
  lastUpdated: 0,
  isSyncing: false,
  totalChannels: 0,
  totalStreams: 0,
  totalLogos: 0,
  lastError: null
};

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'SLFLIX-Server/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchJson(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP status ${res.statusCode} for ${url}`));
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const trimmed = body.trim();
        if (trimmed.startsWith('<') || trimmed.toLowerCase().includes('error code') || trimmed.toLowerCase().includes('502')) {
          return reject(new Error(`Non-JSON/Error response from ${url}: ${trimmed.substring(0, 40)}`));
        }
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error(`Request timeout for ${url}`));
    });
  });
}

function writeJsonFile(filename, data) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`[IPTV Storage] Error writing ${filename}:`, e.message);
    return false;
  }
}

function readJsonFile(filename) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`[IPTV Storage] Error reading ${filename}:`, e.message);
    return null;
  }
}

const CURATED_FALLBACK_CHANNELS = [
  { id: 'sky_sports_main', name: 'Sky Sports Main Event', category: 'Sports', country: 'UK', url: 'https://nrpus.bozztv.com/36bay2/gusa-skysportsmain/index.m3u8', logo: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=300' },
  { id: 'espn_usa', name: 'ESPN HD', category: 'Sports', country: 'US', url: 'https://nrpus.bozztv.com/36bay2/gusa-espn/index.m3u8', logo: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=300' },
  { id: 'redbull_tv', name: 'Red Bull TV', category: 'Sports', country: 'GLOBAL', url: 'https://rbmn-live.akamaized.net/hls/live/591070/GEO_GLOBAL/master.m3u8', logo: 'https://images.unsplash.com/photo-1517649763962-0c6232662000?w=300' },
  { id: 'bbc_news_uk', name: 'BBC News HD', category: 'News', country: 'UK', url: 'https://vs-c4-dash-uk-live.akamaized.net/pool_901/live/bbc_news_channel/bbc_news_channel.isml/bbc_news_channel-pa4%3d128000-video%3d1500000.m3u8', logo: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=300' },
  { id: 'al_jazeera_en', name: 'Al Jazeera English', category: 'News', country: 'GLOBAL', url: 'https://live-hls-web-aje.getaj.net/AJE/index.m3u8', logo: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=300' },
  { id: 'euronews_en', name: 'EuroNews English', category: 'News', country: 'EU', url: 'https://euronews-euronews-world-1-us.samsung.wurl.tv/manifest/playlist.m3u8', logo: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=300' },
  { id: 'france24_en', name: 'France 24 English', category: 'News', country: 'FR', url: 'https://static.france24.com/live/F24_EN_LO_HLS/live_tv.m3u8', logo: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=300' },
  { id: 'bloomberg_us', name: 'Bloomberg TV', category: 'Business', country: 'US', url: 'https://live-bloomberg-us.akamaized.net/live/bloomberg_us.m3u8', logo: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=300' },
  { id: 'dw_english', name: 'DW News English', category: 'News', country: 'DE', url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8', logo: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=300' },
  { id: 'nasa_tv', name: 'NASA TV Public', category: 'Science', country: 'US', url: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8', logo: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=300' }
];

function buildNormalizedChannels() {
  const streamsMap = new Map();
  const streamsByTitle = new Map();

  iptvStreams.forEach(s => {
    if (s.channel) {
      if (!streamsMap.has(s.channel)) streamsMap.set(s.channel, []);
      streamsMap.get(s.channel).push(s);
    }
    if (s.title) {
      const key = s.title.toLowerCase().trim();
      if (!streamsByTitle.has(key)) streamsByTitle.set(key, []);
      streamsByTitle.get(key).push(s);
    }
  });

  const logosMap = new Map();
  iptvLogos.forEach(l => {
    if (l.channel && !logosMap.has(l.channel)) {
      logosMap.set(l.channel, l.url);
    }
  });

  const channelMap = new Map();

  // 1. Process explicit channels from API
  iptvChannels.forEach(ch => {
    if (!ch || !ch.name) return;
    const channelStreams = streamsMap.get(ch.id) || streamsByTitle.get(ch.name.toLowerCase().trim()) || [];
    const logoUrl = logosMap.get(ch.id) || ch.logo || ch.posterUrl || '';

    let bestStreamUrl = ch.url || ch.stream_url || ch.streamUrl || '';
    if (channelStreams.length > 0) {
      const best = channelStreams.find(s => s.quality === '1080p') || channelStreams.find(s => s.quality === '720p') || channelStreams[0];
      if (best && best.url) bestStreamUrl = best.url;
    }

    const primaryCat = (ch.categories && ch.categories.length > 0) ? ch.categories[0] : 'general';

    channelMap.set(ch.id || ch.name, {
      id: ch.id || ch.name,
      name: ch.name,
      country: ch.country || 'GLOBAL',
      category: primaryCat,
      categories: ch.categories || [primaryCat],
      url: bestStreamUrl,
      stream_url: bestStreamUrl,
      logo: logoUrl,
      thumbnail: logoUrl,
      streams: channelStreams,
      hd: channelStreams.some(s => s.quality && s.quality.includes('1080p')) ? 1 : 0,
      description: ch.description || '',
      website: ch.website || ''
    });
  });

  // 2. Process streams that don't have matching channels
  iptvStreams.forEach(s => {
    if (!s || !s.url || !s.title) return;
    const titleKey = s.title.toLowerCase().trim();
    let existing = null;
    for (const [id, c] of channelMap.entries()) {
      if (c.name.toLowerCase().trim() === titleKey || id === s.channel) {
        existing = c;
        break;
      }
    }
    if (existing) {
      if (!existing.url) {
        existing.url = s.url;
        existing.stream_url = s.url;
      }
    } else {
      const autoId = s.channel || `stream_${titleKey.replace(/[^a-z0-9]/g, '_')}`;
      let cat = 'general';
      if (/sport|espn|sky|fc|league|race|nfl|nba|football/i.test(s.title)) cat = 'sports';
      else if (/news|bloomberg|cnn|bbc|euronews|dw/i.test(s.title)) cat = 'news';
      else if (/movie|cinema|film|hbo/i.test(s.title)) cat = 'movies';
      else if (/music|mtv|radio/i.test(s.title)) cat = 'music';

      channelMap.set(autoId, {
        id: autoId,
        name: s.title,
        country: 'GLOBAL',
        category: cat,
        categories: [cat],
        url: s.url,
        stream_url: s.url,
        logo: '',
        thumbnail: '',
        streams: [s],
        hd: s.quality === '1080p' ? 1 : 0,
        description: `${s.title} Live Stream`,
        website: ''
      });
    }
  });

  // 3. Add curated fallback channels
  CURATED_FALLBACK_CHANNELS.forEach(curated => {
    if (!channelMap.has(curated.id)) {
      channelMap.set(curated.id, {
        id: curated.id,
        name: curated.name,
        country: curated.country,
        category: curated.category,
        categories: [curated.category],
        url: curated.url,
        stream_url: curated.url,
        logo: curated.logo,
        thumbnail: curated.logo,
        streams: [{ url: curated.url, quality: '1080p' }],
        hd: 1,
        description: `${curated.name} Live Broadcast`,
        website: ''
      });
    } else {
      const existing = channelMap.get(curated.id);
      if (!existing.url) {
        existing.url = curated.url;
        existing.stream_url = curated.url;
      }
    }
  });

  iptvNormalized = Array.from(channelMap.values());
  console.log(`[IPTV Storage] Built ${iptvNormalized.length} normalized channels with streams & logos.`);
}

function loadFromDisk() {
  console.log('[IPTV Storage] Loading channels, streams, logos, categories, countries from disk JSON files...');
  const loadedMeta = readJsonFile('meta.json');
  if (loadedMeta) {
    metaData = { ...metaData, ...loadedMeta };
  }

  const loadedChannels = readJsonFile('channels.json');
  const loadedStreams = readJsonFile('streams.json');
  const loadedLogos = readJsonFile('logos.json');
  const loadedCategories = readJsonFile('categories.json');
  const loadedCountries = readJsonFile('countries.json');

  if (Array.isArray(loadedChannels) && loadedChannels.length > 0) {
    iptvChannels = loadedChannels;
    iptvStreams = Array.isArray(loadedStreams) ? loadedStreams : [];
    iptvLogos = Array.isArray(loadedLogos) ? loadedLogos : [];
    iptvCategories = Array.isArray(loadedCategories) ? loadedCategories : [];
    iptvCountries = Array.isArray(loadedCountries) ? loadedCountries : [];

    buildNormalizedChannels();
    return true;
  }
  return false;
}

async function syncIptvDataFromApi() {
  if (metaData.isSyncing) {
    console.log('[IPTV Storage] Sync already in progress, skipping.');
    return;
  }

  metaData.isSyncing = true;
  metaData.lastError = null;
  console.log('[IPTV Storage] Starting background sync from Omegatech IPTV API...');

  try {
    const endpoints = [
      { key: 'channels', file: 'channels.json', action: 'channels' },
      { key: 'streams', file: 'streams.json', action: 'streams' },
      { key: 'logos', file: 'logos.json', action: 'logos' },
      { key: 'categories', file: 'categories.json', action: 'categories' },
      { key: 'countries', file: 'countries.json', action: 'countries' },
      { key: 'guides', file: 'guides.json', action: 'guides' }
    ];

    for (const ep of endpoints) {
      try {
        console.log(`[IPTV Storage] Fetching ${ep.action}...`);
        const url = `https://api.omegatech.app/api/movie/Iptv?action=${ep.action}`;
        const res = await fetchJson(url);
        const list = Array.isArray(res) ? res : (res?.data || res?.results || []);
        
        if (list.length > 0) {
          writeJsonFile(ep.file, list);
          if (ep.key === 'channels') iptvChannels = list;
          if (ep.key === 'streams') iptvStreams = list;
          if (ep.key === 'logos') iptvLogos = list;
          if (ep.key === 'categories') iptvCategories = list;
          if (ep.key === 'countries') iptvCountries = list;
          if (ep.key === 'guides') iptvGuides = list;
          buildNormalizedChannels();
          console.log(`[IPTV Storage] Saved ${list.length} ${ep.key} to disk & rebuilt in-memory channels.`);
        }
      } catch (err) {
        console.warn(`[IPTV Storage] Error syncing ${ep.action}:`, err.message);
      }
    }

    metaData.lastUpdated = Date.now();
    metaData.totalChannels = iptvChannels.length;
    metaData.totalStreams = iptvStreams.length;
    metaData.totalLogos = iptvLogos.length;
    metaData.isSyncing = false;

    writeJsonFile('meta.json', metaData);
    buildNormalizedChannels();
    console.log('[IPTV Storage] IPTV background sync complete! Next update scheduled in 2 days.');
  } catch (error) {
    metaData.isSyncing = false;
    metaData.lastError = error.message;
    console.error('[IPTV Storage] Failed background sync:', error);
  }
}

function checkAndAutoSync() {
  const age = Date.now() - (metaData.lastUpdated || 0);
  console.log(`[IPTV Storage] Data age: ${(age / (1000 * 60 * 60)).toFixed(1)} hours. (Limit: 48h)`);
  if (age >= TWO_DAYS_MS || iptvChannels.length === 0) {
    console.log('[IPTV Storage] Data is older than 2 days or empty. Triggering background auto-sync...');
    syncIptvDataFromApi();
  }
}

function initIptvStorage() {
  setImmediate(() => {
    try {
      const loaded = loadFromDisk();
      if (!loaded) {
        console.log('[IPTV Storage] No local JSON files found on first boot. Triggering initial fetch...');
        syncIptvDataFromApi();
      } else {
        checkAndAutoSync();
      }
    } catch (err) {
      console.warn('[IPTV Storage] Initialization error:', err.message);
    }
  });

  // Check every 6 hours if 2 days have passed
  setInterval(() => {
    checkAndAutoSync();
  }, 6 * 60 * 60 * 1000);
}

function getNormalizedChannels({ category, country, query, offset = 0, limit = 100 } = {}) {
  if (iptvNormalized.length === 0) {
    loadFromDisk();
    if (iptvNormalized.length === 0) {
      buildNormalizedChannels();
    }
  }
  let list = iptvNormalized;

  if (category && category.toLowerCase() !== 'all') {
    const catLower = category.toLowerCase();
    list = list.filter(c => c.categories && c.categories.some(cat => cat.toLowerCase() === catLower));
  }

  if (country && country.toLowerCase() !== 'all' && country.toLowerCase() !== 'global') {
    const countryLower = country.toLowerCase();
    list = list.filter(c => c.country && c.country.toLowerCase() === countryLower);
  }

  if (query && query.trim()) {
    const qLower = query.toLowerCase().trim();
    list = list.filter(c => (c.name && c.name.toLowerCase().includes(qLower)) || (c.id && c.id.toLowerCase().includes(qLower)));
  }

  const total = list.length;
  const paged = list.slice(offset, offset + limit);

  return {
    data: paged,
    total,
    offset,
    limit,
    meta: {
      lastUpdated: metaData.lastUpdated,
      isSyncing: metaData.isSyncing
    }
  };
}

function getCategories() {
  if (iptvCategories.length > 0) return iptvCategories;
  // Fallback build from channels
  const catsMap = new Map();
  iptvChannels.forEach(c => {
    if (c.categories && Array.isArray(c.categories)) {
      c.categories.forEach(cat => {
        catsMap.set(cat, (catsMap.get(cat) || 0) + 1);
      });
    }
  });
  return Array.from(catsMap.entries()).map(([id, count]) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), count }));
}

function getCountries() {
  return iptvCountries;
}

function getGuides() {
  if (!iptvGuides || iptvGuides.length === 0) {
    const loadedGuides = readJsonFile('guides.json');
    iptvGuides = Array.isArray(loadedGuides) ? loadedGuides : [];
  }
  return iptvGuides;
}

function getMeta() {
  return metaData;
}

export {
  initIptvStorage,
  getNormalizedChannels,
  getCategories,
  getCountries,
  getGuides,
  getMeta,
  syncIptvDataFromApi
};
