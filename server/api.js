import express from 'express';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { 
    initIptvStorage, 
    getNormalizedChannels, 
    getCategories, 
    getCountries, 
    getGuides, 
    getMeta, 
    syncIptvDataFromApi 
} from './iptvStorage.js';

const router = express.Router();
// Initialize local JSON storage for IPTV and trigger 2-day auto-sync loop
try {
    initIptvStorage();
} catch (err) {
    console.error('[API] Failed to init iptvStorage:', err);
}
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 1000, 
    message: {
        error: "Too many requests",
        message: "Rate limit exceeded. Please try again later.",
        retryAfter: 900
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, default: false },
    keyGenerator: (req) => {
        const forwardedHeader = req.headers['forwarded'];
        if (forwardedHeader) {
            const match = forwardedHeader.match(/for="?([^;"]+)"?/);
            if (match && match[1]) return match[1].trim();
        }
        const xForwardedFor = req.headers['x-forwarded-for'];
        if (xForwardedFor) {
            return xForwardedFor.split(',')[0].trim();
        }
        return req.ip;
    }
});
const baseHeaders = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Origin': 'https://moviebox.ph',
    'Referer': 'https://moviebox.ph/'
};
async function fetchExternal(url, options = {}, attempt = 1) {
    if (attempt > 3) {
        console.error(`[API] Max retries reached for ${url}`);
        return { success: false, results: [], error: 'Max retries reached' };
    }
    let headers = { ...baseHeaders, ...options.headers };
    if (url.includes('omegatech')) {
        try {
            const origin = new URL(url).origin;
            headers['Origin'] = origin;
            headers['Referer'] = origin + '/';
        } catch (e) {}
    }
    const delay = Math.min(attempt * 1000, 5000);
    try {
        const res = await fetch(url, { 
            ...options, 
            headers,
            signal: AbortSignal.timeout(30000) 
        });
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            if (res.ok) {
                console.warn(`[API] Non-JSON response for ${url}:`, text.substring(0, 100));
                return { success: false, raw: text, data: {} };
            }
            throw new Error(`HTTP Error: ${res.status} (Non-JSON response)`);
        }
        if (res.ok) {
            return data;
        }
        if (res.status >= 500 || res.status === 0) {
            console.warn(`[API] ${res.status || 'Timeout'} for ${url}, retry ${attempt}...`);
            await new Promise(r => setTimeout(r, delay));
            return fetchExternal(url, options, attempt + 1);
        }
        return data;
    } catch (error) {
        if (error.name !== 'AbortError' && attempt < 3 && (error.message.includes('503') || error.message.includes('fetch') || error.message.includes('Failed') || error.message.includes('timeout'))) {
            console.warn(`[API] Error for ${url}: ${error.message}, retry ${attempt}...`);
            await new Promise(r => setTimeout(r, delay));
            return fetchExternal(url, options, attempt + 1);
        }
        console.warn(`[API] Final fail ${url}:`, error.message);
        return { success: false, results: [], error: error.message }; 
    }
}
router.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        const page = req.query.page || '1';
        if (!query || query.length < 2) {
            return res.status(400).json({
                error: "Invalid request",
                message: "Search query must be at least 2 characters"
            });
        }
        const cacheKey = `search_${query}_${page}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        try {
            const omegatechUrl = `https://api.omegatech.app/api/movie/MovieBox-pro?action=search&keyword=${encodeURIComponent(query)}&page=${page}`;
            const omegatechData = await fetchExternal(omegatechUrl);
            const searchData = omegatechData?.data?.raw || omegatechData?.data || omegatechData?.results || {};
            const items = Array.isArray(searchData.results)
                ? searchData.results
                : (Array.isArray(searchData.items)
                    ? searchData.items
                    : (Array.isArray(omegatechData?.results)
                        ? omegatechData.results
                        : (Array.isArray(omegatechData?.data) ? omegatechData.data : [])));

            if (omegatechData && (omegatechData.success || omegatechData.statusCode === 200) && items && items.length > 0) {
                const results = items.map(item => {
                    let cover = '';
                    if (typeof item.cover === 'string') cover = item.cover;
                    else if (item.cover?.url) cover = item.cover.url;
                    else if (item.thumbnail) cover = item.thumbnail;
                    let type = 'Movie';
                    const sType = item.subjectType !== undefined ? item.subjectType : 1;
                    if (sType === 2 || sType === 'TV Series' || item.type === 'TV') type = 'TV Series';
                    else if (sType === 6) type = 'Music Video';
                    else if (sType === 7) type = 'Short TV';
                    return {
                        id: String(item.subjectId || item.id || ''),
                        title: item.title || item.name || 'Unknown',
                        cover: cover,
                        releaseDate: String(item.releaseDate || ''),
                        genre: item.genre || '',
                        rating: String(item.imdbRatingValue || item.imdbRating || '0'),
                        description: item.description || '',
                        type: type,
                        detailPath: item.detailPath || '',
                        countryName: item.countryName || '',
                        hasResource: item.hasResource !== undefined ? item.hasResource : true
                    };
                });
                const pager = searchData.pager || {};
                const hasMore = pager.hasMore !== undefined
                    ? Boolean(pager.hasMore)
                    : (searchData.hasMore !== undefined ? Boolean(searchData.hasMore) : false);
                const totalCount = pager.totalCount !== undefined
                    ? pager.totalCount
                    : (searchData.total !== undefined ? searchData.total : results.length);
                const response = {
                    results,
                    hasMore,
                    totalCount
                };
                cache.set(cacheKey, response);
                return res.json(response);
            }
        } catch (e) {
            console.warn('[API] Omegatech search failed, falling back:', e.message);
        }
        try {
            const cineverseUrl = `https://cineverse.name.ng/api/search?q=${encodeURIComponent(query)}`;
            const cineverseData = await fetchExternal(cineverseUrl);
            if (cineverseData && cineverseData.results && cineverseData.results.items && cineverseData.results.items.length > 0) {
                const results = cineverseData.results.items.map(item => ({
                    id: String(item.subjectId || item.id),
                    title: item.title,
                    cover: item.cover?.url || (item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : ''),
                    releaseDate: item.releaseDate || item.release_date || item.first_air_date || '',
                    genre: item.genre || '',
                    rating: item.imdbRatingValue || item.vote_average || 0,
                    description: item.description || item.overview || '',
                    type: item.subjectType === 2 ? 'TV Series' : 'Movie'
                }));
                const response = {
                    results,
                    hasMore: cineverseData.results.pager?.hasMore || false,
                    totalCount: cineverseData.results.pager?.totalCount || results.length
                };
                cache.set(cacheKey, response);
                return res.json(response);
            }
        } catch (e) {
            console.warn('[API] Cineverse search failed:', e.message);
        }
        res.json({ results: [], hasMore: false, totalCount: 0 });
    } catch (error) {
        console.error('[API] Search error:', error);
        res.status(500).json({
            error: "Internal server error",
            message: "Service temporarily unavailable"
        });
    }
});
router.get('/staff/:staffId', async (req, res) => {
    try {
        const staffId = req.params.staffId;
        const subjectId = req.query.subjectId || '';
        const detailPath = req.query.path || '';
        const page = req.query.page || '1';
        const cacheKey = `staff_${staffId}_${subjectId}_${detailPath}_${page}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const url = `https://api.omegatech.app/api/movie/MovieBox-pro?action=staff&staffId=${encodeURIComponent(staffId)}&subjectId=${encodeURIComponent(subjectId)}&detailPath=${encodeURIComponent(detailPath)}&page=${page}`;
        const data = await fetchExternal(url);
        let results = [];
        let hasMore = false;
        if (data && data.success && data.data) {
            const items = data.data.items || [];
            hasMore = data.data.pager?.hasMore || false;
            results = items.map(d => {
                let type = 'Movie';
                const sType = d.subjectType;
                if (sType === 2) type = 'TV Series';
                let cover = '';
                if (typeof d.cover === 'string') cover = d.cover;
                else if (d.cover?.url) cover = d.cover.url;
                return {
                    id: String(d.subjectId || ''),
                    title: d.title || "Unknown",
                    cover: cover,
                    releaseDate: String(d.releaseDate || ''),
                    genre: d.genre || '',
                    rating: d.imdbRatingValue || '0',
                    description: d.description || '',
                    type: type,
                    detailPath: d.detailPath || ''
                };
            });
        }
        const response = { results, hasMore };
        cache.set(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('[API] Staff error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get('/movie/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const detailPath = req.query.path || '';
        const cacheKey = `movie_${id}_${detailPath}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        let targetUrl = `https://h5-api.aoneroom.com/wefeed-h5api-bff/detail?subjectId=${id}`;
        if (detailPath) {
            targetUrl += `&detailPath=${encodeURIComponent(detailPath)}`;
        }
        const data = await fetchExternal(targetUrl);
        const d = data.data?.resource || data.data || {};
        let type = 'Movie';
        const sType = d.subjectType !== undefined ? d.subjectType : (d.type === 'TV' ? 2 : (d.type === 'Movie' ? 1 : d.type));
        if (sType === 2 || sType === 'TV Series' || d.category === 'Series' || d.type === 'TV') type = 'TV Series';
        let cover = '';
        if (typeof d.cover === 'string') cover = d.cover;
        else if (d.cover?.url) cover = d.cover.url;
        else if (d.thumbnail) cover = d.thumbnail;
        else if (d.poster?.url) cover = d.poster.url;
        let backdrop = '';
        if (d.horizontal_cover?.url) backdrop = d.horizontal_cover.url;
        else if (d.backdrop?.url) backdrop = d.backdrop.url;
        let seasons = [];
        const seasonsData = d.seasons || d.resource?.seasons || [];
        if (Array.isArray(seasonsData)) {
            seasons = seasonsData.map(s => {
                const episodes = s.episodes || s.episodeList || [];
                return {
                    id: String(s.id || s.seasonId || s.season_number || ''),
                    name: s.name || s.title || `Season ${s.season_number || s.seasonNo || 1}`,
                    seasonNumber: parseInt(s.season_number || s.seasonNo || 1),
                    episodeCount: episodes.length,
                    episodes: episodes.map(ep => ({
                        id: String(ep.id || ep.episodeId || ep.episode_number || ''),
                        title: ep.title || ep.name || `Episode ${ep.episode_number || ep.episodeNo || 1}`,
                        episodeNumber: parseInt(ep.episode_number || ep.episodeNo || 1),
                        overview: ep.overview || ep.description || '',
                        stillPath: ep.still_path || ep.cover?.url || ''
                    }))
                };
            });
        }
        const response = {
            id: String(d.subjectId || d.id || d.mid || id),
            title: d.title || d.name || d.subjectName || "Unknown",
            description: d.description || d.introduction || d.summary || '',
            cover: cover,
            backdrop: backdrop,
            releaseDate: String(d.releaseDate || d.release_date || d.year || d.publish_date || ''),
            genre: d.genre || d.genres || d.categoryName || '',
            rating: d.imdbRatingValue || d.imdbRating || d.rate || d.score || d.rating || '0',
            duration: d.duration || d.runtime || '',
            cast: (d.actors || d.cast || []).map(a => a.name || a),
            staffList: (d.staffList || d.staffs || []).map(s => ({
                id: s.staffId || s.id || '',
                name: s.name || s.enName || '',
                avatar: s.avatar?.url || s.photo || '',
                role: s.role || ''
            })),
            director: (d.directors || d.director || []).map(d => d.name || d).join(', '),
            isSeries: type === 'TV Series',
            seasons: seasons,
            detailPath: d.detailPath || d.path || detailPath
        };
        cache.set(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('[API] Movie details error:', error);
        res.status(500).json({
            error: "Internal server error",
            message: "Service temporarily unavailable"
        });
    }
});
function convertSrtToVtt(srtContent) {
    if (!srtContent) return 'WEBVTT\n\n';
    if (srtContent.trim().startsWith('WEBVTT')) return srtContent;
    const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    let vtt = 'WEBVTT\n\n';
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) {
            vtt += '\n';
            continue;
        }
        if (line.includes('-->')) {
            line = line.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
            vtt += line + '\n';
        } else {
            vtt += line + '\n';
        }
    }
    return vtt;
}

router.get('/subtitle', async (req, res) => {
    try {
        const subUrl = req.query.url;
        if (!subUrl) {
            return res.status(400).send('WEBVTT\n\n400 Missing subtitle URL');
        }
        const format = req.query.format || 'vtt';
        const response = await fetch(subUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': '*/*'
            },
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) {
            return res.status(response.status).send('WEBVTT\n\nFailed to fetch subtitle');
        }
        const text = await response.text();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        if (format === 'raw') {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send(text);
        }
        const vtt = convertSrtToVtt(text);
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        return res.send(vtt);
    } catch (e) {
        console.error('[API] Subtitle proxy error:', e.message);
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(500).send('WEBVTT\n\nError loading subtitle');
    }
});

router.get('/sources/:id', async (req, res) => {
    try {
        let subjectId = req.params.id || '';
        if (subjectId === 'undefined' || subjectId === 'null' || subjectId === 'search') {
            subjectId = '';
        }
        const season = req.query.season || '0';
        const episode = req.query.episode || '0';
        const detailPath = req.query.path || '';
        const title = req.query.title || '';
        const isMovie = req.query.type === 'Movie';

        let resolvedPath = detailPath;
        if (!resolvedPath && subjectId) {
            try {
                const detailRes = await fetchExternal(`https://h5-api.aoneroom.com/wefeed-h5api-bff/detail?subjectId=${subjectId}`);
                resolvedPath = detailRes?.data?.subject?.detailPath || detailRes?.data?.detailPath || '';
            } catch (e) {}
        }

        const getStreamData = async (sid, dpath) => {
            if (!sid) return null;
            const se = isMovie ? '0' : season;
            const ep = isMovie ? '0' : episode;
            // 1. Primary: MovieBox-pro action=download endpoint (returns fixed multi-language subtitles)
            const downloadUrl = `https://api.omegatech.app/api/movie/MovieBox-pro?action=download&subjectId=${sid}&detailPath=${encodeURIComponent(dpath || '')}&se=${se}&ep=${ep}`;
            let resData = await fetchExternal(downloadUrl);
            if (resData && (resData.success || resData.statusCode === 200) && (resData.qualities?.length > 0 || resData.subtitles?.length > 0)) {
                return resData;
            }
            // 2. Fallback: stream.omegatech.app/info
            const infoUrl = `https://stream.omegatech.app/info?subjectId=${sid}&detailPath=${encodeURIComponent(dpath || '')}&se=${se}&ep=${ep}`;
            const fallbackData = await fetchExternal(infoUrl);
            if (fallbackData && (fallbackData.success || fallbackData.statusCode === 200) && (fallbackData.qualities?.length > 0 || fallbackData.subtitles?.length > 0)) {
                return fallbackData;
            }
            return resData || fallbackData;
        };

        let data = subjectId ? await getStreamData(subjectId, resolvedPath) : null;
        if ((!data || (!data.qualities?.length && !data.subtitles?.length)) && title) {
            console.log(`[API] No direct sources for subjectId "${subjectId}", trying search for "${title}"`);
            const omegatechUrl = `https://api.omegatech.app/api/movie/MovieBox-pro?action=search&keyword=${encodeURIComponent(title)}&page=1`;
            const omegatechData = await fetchExternal(omegatechUrl);
            const items = omegatechData?.data?.results || omegatechData?.data?.raw?.items || omegatechData?.data?.items || [];
            for (const d of items) {
                const newSid = String(d.subjectId || d.id || '');
                const newPath = d.detailPath || '';
                if (newSid && newSid !== subjectId) {
                    console.log(`[API] Found alternative subjectId ${newSid} for "${title}", trying...`);
                    const fallbackData = await getStreamData(newSid, newPath);
                    if (fallbackData && (fallbackData.success || fallbackData.statusCode === 200) && (fallbackData.qualities?.length > 0 || fallbackData.subtitles?.length > 0)) {
                        data = fallbackData;
                        break;
                    }
                }
            }
        }
        if (data && (data.success || data.statusCode === 200) && (data.qualities || data.subtitles)) {
            const forceHttps = (url) => {
                if (!url) return url;
                if (typeof url !== 'string') return url;
                return url.replace('http://', 'https://');
            };
            const rawQualities = Array.isArray(data.qualities) ? data.qualities : [];
            const videos = rawQualities.map(q => ({
                quality: q.quality,
                url: forceHttps(q.streamUrl || q.url || q.stream || q.direct), 
                download: forceHttps(q.downloadUrl || q.download || q.streamUrl || q.url || q.stream || q.direct),
                format: q.format || 'MP4',
                size: q.resolution ? `${q.resolution}p` : q.quality
            }));
            if (data.bestQualityUrl) {
                videos.unshift({
                    quality: 'Best (Auto)',
                    url: forceHttps(data.bestQualityUrl),
                    download: forceHttps(data.bestQualityUrl),
                    format: 'MP4',
                    size: 'Original'
                });
            } else if (data.bestQuality) {
                const bq = data.bestQuality;
                videos.unshift({
                    quality: 'Best (' + (bq.quality || 'Auto') + ')',
                    url: forceHttps(bq.streamUrl || bq.url || bq.stream || bq.direct),
                    download: forceHttps(bq.downloadUrl || bq.download || bq.streamUrl || bq.url || bq.stream || bq.direct),
                    format: bq.format || 'MP4',
                    size: bq.resolution ? `${bq.resolution}p` : 'Best'
                });
            }

            const rawSubs = Array.isArray(data.subtitles) ? data.subtitles : [];
            const subtitles = rawSubs.map((s, idx) => {
                const langCode = (s.languageCode || s.lang || 'en').trim();
                const langName = (s.language || s.name || s.label || langCode).trim();
                const rawUrl = s.url || s.streamUrl || '';
                const secureUrl = rawUrl.replace(/^http:\/\//i, 'https://');
                const proxyUrl = `/api/subtitle?url=${encodeURIComponent(secureUrl || rawUrl)}`;
                return {
                    id: s.id || `${langCode}-${idx}`,
                    lang: langCode,
                    language: langName,
                    languageCode: langCode,
                    name: langName,
                    label: langName,
                    url: secureUrl || rawUrl,
                    proxyUrl: proxyUrl,
                    size: s.size || '',
                    delay: typeof s.delay === 'number' ? s.delay : 0
                };
            });

            return res.json({ 
                results: videos, 
                subtitles: subtitles 
            });
        }
        res.json({ results: [], subtitles: [] });
    } catch (error) {
        console.error('[API] Sources error:', error);
        res.json({ results: [], subtitles: [] });
    }
});
router.get('/ranking/:category', async (req, res) => {
    try {
        const category = req.params.category;
        const page = req.query.page || '1';
        const cacheKey = `ranking_${category}_${page}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        let id = '';
        let title = 'Trending Movies';
        switch (category) {
            case 'trending': id = '1001'; title = 'Trending Now'; break;
            case 'popular': id = '1002'; title = 'Popular Movies'; break;
            case 'top-rated': id = '1003'; title = 'Top Rated'; break;
            case 'new-releases': id = '1004'; title = 'New Releases'; break;
            default: id = category; title = 'Ranking List';
        }
        const targetUrl = `https://h5-api.aoneroom.com/wefeed-h5api-bff/ranking-list/content?id=${id}&page=${page}&perPage=24`;
        const data = await fetchExternal(targetUrl);
        const results = (data.data?.list || []).map((item, index) => {
            const d = item.subject || item;
            let cover = '';
            if (typeof d.cover === 'string') cover = d.cover;
            else if (d.cover?.url) cover = d.cover.url;
            else if (d.thumbnail) cover = d.thumbnail;
            return {
                id: String(d.subjectId || d.id || d.mid || ''),
                rank: index + 1 + ((parseInt(page) - 1) * 24),
                title: d.title || d.name || d.subjectName || "Unknown",
                cover: cover,
                rating: d.imdbRatingValue || d.imdbRating || d.rate || d.score || d.rating || '0',
                releaseDate: String(d.releaseDate || d.release_date || d.year || d.publish_date || ''),
                detailPath: d.detailPath || d.path || ''
            };
        });
        const response = {
            results,
            hasMore: data.data?.hasMore || false,
            title: title,
            totalCount: data.data?.total || results.length
        };
        cache.set(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('[API] Ranking error:', error);
        res.status(500).json({
            error: "Internal server error",
            message: "Service temporarily unavailable"
        });
    }
});
router.get('/home', async (req, res) => {
    try {
        const cacheKey = 'home_data';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const targetUrl = `https://h5-api.aoneroom.com/wefeed-h5api-bff/home`;
        const data = await fetchExternal(targetUrl);
        const categories = [];
        const hero = [];
        if (data.data?.list) {
            data.data.list.forEach(block => {
                if (block.type === 'banner' && block.items) {
                    block.items.forEach(item => {
                        const d = item.subject || item;
                        let cover = '';
                        if (typeof d.cover === 'string') cover = d.cover;
                        else if (d.cover?.url) cover = d.cover.url;
                        else if (d.thumbnail) cover = d.thumbnail;
                        let backdrop = '';
                        if (d.horizontal_cover?.url) backdrop = d.horizontal_cover.url;
                        else if (d.backdrop?.url) backdrop = d.backdrop.url;
                        hero.push({
                            id: String(d.subjectId || d.id || d.mid || ''),
                            title: d.title || d.name || d.subjectName || "Unknown",
                            cover: cover,
                            backdrop: backdrop || cover,
                            detailPath: d.detailPath || d.path || ''
                        });
                    });
                } else if (block.items && block.items.length > 0) {
                    const items = block.items.map(item => {
                        const d = item.subject || item;
                        let cover = '';
                        if (typeof d.cover === 'string') cover = d.cover;
                        else if (d.cover?.url) cover = d.cover.url;
                        else if (d.thumbnail) cover = d.thumbnail;
                        return {
                            id: String(d.subjectId || d.id || d.mid || ''),
                            title: d.title || d.name || d.subjectName || "Unknown",
                            cover: cover,
                            rating: d.imdbRatingValue || d.imdbRating || d.rate || d.score || d.rating || '0',
                            releaseDate: String(d.releaseDate || d.release_date || d.year || d.publish_date || ''),
                            detailPath: d.detailPath || d.path || ''
                        };
                    });
                    categories.push({
                        id: block.id || block.title || 'category',
                        name: block.title || 'Featured',
                        items: items
                    });
                }
            });
        }
        const response = { categories, hero };
        cache.set(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('[API] Home data error:', error);
        res.status(500).json({
            error: "Internal server error",
            message: "Service temporarily unavailable"
        });
    }
});
router.get('/suggestions', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 2) {
            return res.status(400).json({
                error: "Invalid request",
                message: "Search query must be at least 2 characters"
            });
        }
        const cacheKey = `suggestions_${query}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const firstLetter = query.charAt(0).toLowerCase();
        const targetUrl = `https://v3.sg.media-imdb.com/suggestion/x/${firstLetter}/${encodeURIComponent(query)}.json`;
        const response = await fetch(targetUrl);
        if (!response.ok) throw new Error(`IMDb Error: ${response.status}`);
        const data = await response.json();
        cache.set(cacheKey, data);
        res.json(data);
    } catch (error) {
        console.error('[API] Suggestions error:', error);
        res.status(500).json({
            error: "Internal server error",
            message: "Service temporarily unavailable"
        });
    }
});
router.get('/tv/img', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('No URL provided');
    try {
        const decodedUrl = decodeURIComponent(url);
        if (!decodedUrl.startsWith('http')) return res.redirect(decodedUrl);
        const isOmegaTv = decodedUrl.includes("omegatech.app") || 
                          decodedUrl.includes("televizia.online") || 
                          decodedUrl.includes("1tv.ge") || 
                          decodedUrl.includes("pbcdnw.aoneroom.com") || 
                          decodedUrl.includes("comments.ge") ||
                          decodedUrl.includes("adjaranett.com") ||
                          decodedUrl.includes("imoviesge.com");
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        };
        if (isOmegaTv) {
            if (decodedUrl.includes("comments.ge")) {
                headers['Referer'] = 'https://comments.ge/';
            } else if (decodedUrl.includes("adjaranett.com")) {
                headers['Referer'] = 'https://adjaranett.com/';
            } else if (decodedUrl.includes("imoviesge.com")) {
                headers['Referer'] = 'https://imoviesge.com/';
            } else {
                headers['Referer'] = 'https://api.omegatech.app/';
                headers['Origin'] = 'https://api.omegatech.app';
            }
        }
        const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#141414"/><path d="M38 32 L68 50 L38 68 Z" fill="#00e5ff"/></svg>`;
        const sendFallback = () => {
            if (!res.headersSent) {
                res.setHeader('Content-Type', 'image/svg+xml');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                res.status(200).send(FALLBACK_SVG);
            }
        };

        const protocol = decodedUrl.startsWith('https') ? https : http;
        const request = protocol.get(decodedUrl, { headers, timeout: 8000 }, (proxyRes) => {
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                return res.redirect(`/api/tv/img?url=${encodeURIComponent(proxyRes.headers.location)}`);
            }
            if (proxyRes.statusCode !== 200) {
                console.warn(`[IMG PROXY] Upstream status ${proxyRes.statusCode} for ${decodedUrl}, sending SVG fallback.`);
                return sendFallback();
            }
            res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            proxyRes.pipe(res);
        });
        request.on('error', (err) => {
            console.warn(`[IMG PROXY] Request error for ${decodedUrl}:`, err.message);
            sendFallback();
        });
        request.on('timeout', () => {
            request.destroy();
            sendFallback();
        });
    } catch (error) {
        console.warn(`[IMG PROXY] Catch error:`, error.message);
        if (!res.headersSent) {
            res.setHeader('Content-Type', 'image/svg+xml');
            res.status(200).send(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#141414"/></svg>`);
        }
    }
});

router.get('/tv/channels', async (req, res) => {
    try {
        const { cat, country, q, offset, limit } = req.query;
        const pageLimit = parseInt(limit) || 100;
        const pageOffset = parseInt(offset) || 0;

        const result = getNormalizedChannels({
            category: cat,
            country: country,
            query: q,
            offset: pageOffset,
            limit: pageLimit
        });

        res.json({
            data: result.data,
            total: result.total,
            offset: result.offset,
            limit: result.limit,
            meta: result.meta
        });
    } catch (error) {
        console.error('[API] IPTV channels error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get('/tv/categories', async (req, res) => {
    try {
        const categories = getCategories();
        res.json({ data: categories });
    } catch (error) {
        console.error('[API] IPTV categories error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get('/tv/countries', async (req, res) => {
    try {
        const countries = getCountries();
        res.json({ data: countries });
    } catch (error) {
        console.error('[API] IPTV countries error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get('/tv/sync-status', async (req, res) => {
    try {
        const meta = getMeta();
        res.json({ data: meta });
    } catch (error) {
        console.error('[API] IPTV sync-status error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get('/tv/sync-force', async (req, res) => {
    try {
        syncIptvDataFromApi();
        res.json({ success: true, message: "IPTV background sync initiated." });
    } catch (error) {
        console.error('[API] IPTV sync-force error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get('/tv/guide', async (req, res) => {
    try {
        const result = getNormalizedChannels({ limit: 100 });
        const now = new Date();
        const flattenedPrograms = (result.data || []).map((ch, idx) => ({
            id: `guide_${ch.id}`,
            channel_id: ch.id,
            channel_name: ch.name,
            channel_logo: ch.logo,
            title: `${ch.name} Live Stream`,
            start: new Date(now.getTime() - (idx * 10 * 60000)).toISOString(),
            end: new Date(now.getTime() + (50 * 60000)).toISOString(),
            description: ch.description || `Live stream on ${ch.name}`
        }));
        res.json({ data: flattenedPrograms });
    } catch (error) {
        console.error("TV Guide error:", error);
        res.status(500).json({ error: "Internal server error", data: [] });
    }
});

router.get('/tv/onnow', async (req, res) => {
    try {
        const result = getNormalizedChannels({ limit: 50 });
        const normalized = (result.data || []).map(ch => ({
            id: ch.id,
            channel_name: ch.name,
            title: `${ch.name} Live`,
            logo: ch.logo,
            thumbnail: ch.logo,
            stream_url: ch.url || ch.stream_url,
            url: ch.url || ch.stream_url
        }));
        res.json({ data: normalized });
    } catch (error) {
        console.error("TV OnNow error:", error);
        res.status(500).json({ error: "Internal server error", data: [] });
    }
});

router.get('/tv/matches', async (req, res) => {
    try {
        const data = await fetchExternal('https://omegatech-api.dixonomega.tech/api/Sport/sport-feeds');
        const rawMatches = data?.matches || (Array.isArray(data) ? data : []);
        const normalized = rawMatches.map(m => {
            const home = m.homeTeam || m.team1 || { name: m.home_team, crest: m.home_logo };
            const away = m.awayTeam || m.team2 || { name: m.away_team, crest: m.away_logo };
            const comp = m.competition || { name: m.league, emblem: m.league_logo };
            let scoreStr = `${home.score || '0'} - ${away.score || '0'}`;
            return {
                id: m.id || Math.random().toString(),
                home_team: home.name || 'Home Team',
                away_team: away.name || 'Away Team',
                home_logo: home.crest || home.logo || home.icon || '',
                away_logo: away.crest || away.logo || away.icon || '',
                score: scoreStr,
                date: m.utcDate || m.date || new Date().toISOString(),
                time: m.time || 'LIVE',
                status: m.status || 'LIVE',
                league: comp.name || 'Sports',
                league_logo: comp.emblem || comp.logo || '',
                urls: (m.urls || m.streamUrls || []).map(u => typeof u === 'string' ? { url: u } : u)
            };
        });
        res.json({ data: normalized });
    } catch (error) {
        console.error("TV Matches error:", error);
        res.status(500).json({ error: "Internal server error", data: [] });
    }
});

router.get('/tv/home', async (req, res) => {
    try {
        const result = getNormalizedChannels({ limit: 50 });
        const categories = getCategories();
        const channelsList = result.data || [];
        const banners = channelsList.slice(0, 5).map(ch => ({
            id: ch.id,
            title: ch.name,
            description: ch.description || `Watch ${ch.name} Live Stream`,
            thumbnail: ch.logo,
            stream_url: ch.url || ch.stream_url
        }));
        const onnow = channelsList.slice(0, 10).map(ch => ({
            id: ch.id,
            channel_name: ch.name,
            title: `${ch.name} Live`,
            logo: ch.logo,
            thumbnail: ch.logo,
            stream_url: ch.url || ch.stream_url,
            url: ch.url || ch.stream_url
        }));
        res.json({ banners, onnow, categories });
    } catch (error) {
        console.error("TV Home error:", error);
        res.json({ banners: [], onnow: [], categories: [] });
    }
});

router.get('/live-tv', async (req, res) => {
    try {
        const cacheKey = 'live_tv_list';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const targetUrl = 'https://omegatech-api.dixonomega.tech/api/movie/Live-Tv?action=list';
        const data = await fetchExternal(targetUrl);
        if (data.success && data.data) {
            const channels = Object.entries(data.data).map(([id, ch]) => {
                const channel = ch;
                return {
                    id,
                    ...channel,
                    url: channel.url
                };
            });
            cache.set(cacheKey, channels, 1800); 
            return res.json(channels);
        }
        res.json([]);
    } catch (error) {
        console.error('[API] Live TV error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get('/sport/feeds', async (req, res) => {
    try {
        const cacheKey = 'sport_feeds';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const data = await fetchExternal('https://omegatech-api.dixonomega.tech/api/Sport/sport-feeds');
        if (data && data.success) {
            if (Array.isArray(data.matches)) {
                data.matches.forEach(m => {
                    m.playPath = '';
                    m.playSource = [];
                });
            }
            if (Array.isArray(data.highlights)) {
                data.highlights.forEach(h => {
                    h.path = '';
                });
            }
        }
        cache.set(cacheKey, data, 120); 
        res.json(data);
    } catch (error) {
        console.error('[API] Sports feeds error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/sport/trend', async (req, res) => {
    try {
        const { page = 1 } = req.query;
        const cacheKey = `sport_trend_page_${page}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const data = await fetchExternal(`https://omegatech-api.dixonomega.tech/api/Sport/sport-trend?page=${page}&perPage=50`);
        cache.set(cacheKey, data, 300); 
        res.json(data);
    } catch (error) {
        console.error('[API] Sports trends error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/sport/match-detail', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Missing id parameter' });
        const cacheKey = `sport_match_${id}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const data = await fetchExternal(`https://omegatech-api.dixonomega.tech/api/Sport/match-detail?id=${id}`);
        if (data && data.success) {
            if (data.stream) {
                data.stream.main = '';
                data.stream.channels = [];
            }
            if (data.match) {
                data.match.playPath = '';
            }
        }
        cache.set(cacheKey, data, 60); 
        res.json(data);
    } catch (error) {
        console.error('[API] Sports match detail error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/webtoon/home', async (req, res) => {
    try {
        const cacheKey = 'webtoon_home';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const targetUrl = 'https://omegatech-api.dixonomega.tech/api/Fun/webtoon?action=home';
        const data = await fetchExternal(targetUrl);
        if (data.success && data.data) {
            const result = {
                trending: data.data.trending || (Array.isArray(data.data) ? data.data : [])
            };
            cache.set(cacheKey, result, 3600);
            return res.json(result);
        }
        res.json({ trending: [] });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get('/webtoon/search', async (req, res) => {
    const { query } = req.query;
    try {
        const targetUrl = `https://omegatech-api.dixonomega.tech/api/Fun/webtoon?action=search&query=${encodeURIComponent(query)}`;
        const data = await fetchExternal(targetUrl);
        if (data.success && data.data) {
            const result = {
                results: Array.isArray(data.data) ? data.data : (data.data.results || [])
            };
            return res.json(result);
        }
        res.json({ results: [] });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get('/webtoon/detail', async (req, res) => {
    const { url } = req.query;
    try {
        const targetUrl = `https://omegatech-api.dixonomega.tech/api/Fun/webtoon?action=detail&url=${encodeURIComponent(url)}`;
        const data = await fetchExternal(targetUrl);
        if (data.success && data.data) {
            return res.json(data.data);
        }
        res.status(404).json({ error: "Not found" });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get('/webtoon/read', async (req, res) => {
    const { url } = req.query;
    try {
        const targetUrl = `https://omegatech-api.dixonomega.tech/api/Fun/webtoon?action=read&url=${encodeURIComponent(url)}`;
        const data = await fetchExternal(targetUrl);
        if (data.success && data.data) {
            return res.json(data.data);
        }
        res.status(404).json({ error: "Not found" });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

// Anime (Nimegami) API
const FALLBACK_ANIME_HOME = [
    { title: "Naruto Shippuden", image: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800", link: "naruto-shippuden", synopsis: "The epic journey of Naruto Uzumaki." },
    { title: "One Piece", image: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800", link: "one-piece", synopsis: "Monkey D. Luffy sets out to find the One Piece." },
    { title: "Bleach: Thousand-Year Blood War", image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800", link: "bleach-tybw", synopsis: "The final battle of the Soul Reapers." },
    { title: "Attack on Titan", image: "https://images.unsplash.com/photo-1563089145-599997674d42?w=800", link: "attack-on-titan", synopsis: "Humanity fights for survival against giant humanoid Titans." },
    { title: "Jujutsu Kaisen", image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800", link: "jujutsu-kaisen", synopsis: "Sorcerers battle cursed spirits." },
    { title: "Demon Slayer", image: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800", link: "demon-slayer", synopsis: "Tanjiro's quest to cure his sister and avenge his family." }
];

router.get('/anime/home', async (req, res) => {
    try {
        const cacheKey = 'anime_home';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const targetUrl = 'https://api.omegatech.app/api/Anime/Nimegami?action=home';
        try {
            const directRes = await fetch(targetUrl, { signal: AbortSignal.timeout(3000) });
            if (directRes.ok) {
                const directData = await directRes.json();
                if (directData && directData.data && Array.isArray(directData.data) && directData.data.length > 0) {
                    const result = { success: true, data: directData.data };
                    cache.set(cacheKey, result, 1800);
                    return res.json(result);
                }
            }
        } catch (e) {}
        // Fallback to robust static anime list instantly without retry spam
        return res.json({ success: true, data: FALLBACK_ANIME_HOME });
    } catch (error) {
        return res.json({ success: true, data: FALLBACK_ANIME_HOME });
    }
});

router.get('/anime/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.json({ success: true, data: [] });
    try {
        const cacheKey = `anime_search_${query.toLowerCase()}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const targetUrl = `https://api.omegatech.app/api/Anime/Nimegami?action=search&query=${encodeURIComponent(query)}`;
        try {
            const directRes = await fetch(targetUrl, { signal: AbortSignal.timeout(3000) });
            if (directRes.ok) {
                const directData = await directRes.json();
                if (directData && directData.data && Array.isArray(directData.data)) {
                    const result = { success: true, data: directData.data };
                    cache.set(cacheKey, result, 600);
                    return res.json(result);
                }
            }
        } catch (e) {}
        // Filter fallback list by query
        const q = String(query).toLowerCase();
        const filtered = FALLBACK_ANIME_HOME.filter(item => item.title.toLowerCase().includes(q));
        return res.json({ success: true, data: filtered.length > 0 ? filtered : FALLBACK_ANIME_HOME });
    } catch (error) {
        const q = String(query).toLowerCase();
        const filtered = FALLBACK_ANIME_HOME.filter(item => item.title.toLowerCase().includes(q));
        return res.json({ success: true, data: filtered });
    }
});

router.get('/anime/detail', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing url parameter" });
    try {
        const cacheKey = `anime_detail_${url}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const targetUrl = `https://api.omegatech.app/api/Anime/Nimegami?action=detail&url=${encodeURIComponent(url)}`;
        try {
            const directRes = await fetch(targetUrl, { signal: AbortSignal.timeout(4000) });
            if (directRes.ok) {
                const directData = await directRes.json();
                if (directData && directData.data) {
                    cache.set(cacheKey, directData.data, 3600);
                    return res.json(directData.data);
                }
            }
        } catch (e) {}
        // Fallback detail object
        const mockDetail = {
            title: String(url).replace(/-/g, ' ').toUpperCase(),
            cover: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800",
            synopsis: "Detailed description for this anime series.",
            episodes: [
                { title: "Episode 1", link: "ep-1" },
                { title: "Episode 2", link: "ep-2" },
                { title: "Episode 3", link: "ep-3" }
            ]
        };
        cache.set(cacheKey, mockDetail, 3600);
        return res.json(mockDetail);
    } catch (error) {
        return res.json({
            title: "Anime Episode",
            cover: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800",
            synopsis: "Anime series streaming.",
            episodes: [{ title: "Episode 1", link: "ep-1" }]
        });
    }
});

router.get('/anime/stream-resolve', async (req, res) => {
    const { url, name = '' } = req.query;
    if (!url) return res.status(400).json({ success: false, error: "Missing url parameter" });

    try {
        const decodedUrl = decodeURIComponent(url);
        
        // 1. If it's a stordl.halahgan.com or berkasdrive link
        if (decodedUrl.includes('stordl.halahgan.com') || decodedUrl.includes('halahgan.com')) {
            try {
                const parsed = new URL(decodedUrl);
                const pathParts = parsed.pathname.split('/').filter(Boolean);
                const fileId = pathParts[0] === 'streaming' ? pathParts[1] : pathParts[0];
                const fileName = parsed.searchParams.get('name') || name || '';

                if (fileId) {
                    const apiUrl = `https://stordl.halahgan.com/${fileId}?action=file-url&id=${fileId}&name=${encodeURIComponent(fileName)}`;
                    const directRes = await fetch(apiUrl, { signal: AbortSignal.timeout(6000) });
                    if (directRes.ok) {
                        const directData = await directRes.json();
                        if (directData && directData.ok && directData.url) {
                            return res.json({
                                success: true,
                                directUrl: directData.url,
                                streamProxyUrl: `/api/anime/stream-proxy?url=${encodeURIComponent(directData.url)}`,
                                embedUrl: `https://stordl.halahgan.com/streaming/${fileId}`,
                                type: 'mp4',
                                fileId
                            });
                        }
                    }
                    // Fallback to streaming embed page
                    return res.json({
                        success: true,
                        directUrl: decodedUrl,
                        embedUrl: `https://stordl.halahgan.com/streaming/${fileId}`,
                        type: 'embed',
                        fileId
                    });
                }
            } catch (err) {
                console.error('[ANIME] Resolve stordl error:', err.message);
            }
        }

        // 2. Direct MP4 link
        if (decodedUrl.toLowerCase().includes('.mp4')) {
            return res.json({
                success: true,
                directUrl: decodedUrl,
                streamProxyUrl: `/api/anime/stream-proxy?url=${encodeURIComponent(decodedUrl)}`,
                type: 'mp4'
            });
        }

        // 3. Fallback
        return res.json({
            success: true,
            directUrl: decodedUrl,
            streamProxyUrl: decodedUrl,
            embedUrl: decodedUrl,
            type: 'embed'
        });
    } catch (err) {
        console.error('[ANIME] stream-resolve error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/anime/stream-proxy', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).end();

        const decodedUrl = decodeURIComponent(url);
        const parsedUrl = new URL(decodedUrl);

        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Referer': parsedUrl.origin + '/',
                'Origin': parsedUrl.origin
            }
        };

        if (req.headers.range) {
            options.headers['Range'] = req.headers.range;
        }

        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        const proxyReq = protocol.request(options, (proxyRes) => {
            // Handle redirects
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                let redirectUrl = proxyRes.headers.location;
                if (redirectUrl.startsWith('/')) {
                    redirectUrl = parsedUrl.origin + redirectUrl;
                }
                res.redirect(`/api/anime/stream-proxy?url=${encodeURIComponent(redirectUrl)}`);
                return;
            }

            res.status(proxyRes.statusCode);

            Object.keys(proxyRes.headers).forEach(key => {
                const lowerKey = key.toLowerCase();
                if (lowerKey === 'content-disposition') {
                    res.setHeader('Content-Disposition', 'inline');
                } else if (lowerKey !== 'access-control-allow-origin' && lowerKey !== 'content-security-policy') {
                    res.setHeader(key, proxyRes.headers[key]);
                }
            });

            res.setHeader('Content-Disposition', 'inline');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
            res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('[ANIME PROXY] Stream error:', err.message);
            if (!res.headersSent) res.status(502).end();
        });

        proxyReq.end();
    } catch (err) {
        console.error('[ANIME PROXY] Catch Error:', err.message);
        if (!res.headersSent) res.status(500).end();
    }
});

router.get('/novel', async (req, res) => {
    try {
        const { action = 'search', query, novelId, chapterId, opConfId, page = 1, perPage = 10 } = req.query;
        let targetUrl = `https://api.omegatech.app/api/Novel/novel?action=${encodeURIComponent(action)}`;
        if (query) targetUrl += `&query=${encodeURIComponent(query)}`;
        if (novelId) targetUrl += `&novelId=${encodeURIComponent(novelId)}`;
        if (chapterId) targetUrl += `&chapterId=${encodeURIComponent(chapterId)}`;
        if (opConfId) targetUrl += `&opConfId=${encodeURIComponent(opConfId)}`;
        if (page) targetUrl += `&page=${encodeURIComponent(page)}`;
        if (perPage) targetUrl += `&perPage=${encodeURIComponent(perPage)}`;

        const data = await fetchExternal(targetUrl);
        res.json(data);
    } catch (err) {
        console.error('[NOVEL API] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/adult/xnxx', async (req, res) => {
    try {
        const { action = 'search', query = 'Trending', url, page = 1 } = req.query;
        let targetUrl = `https://api.omegatech.app/api/Porn/Xnxx?action=${encodeURIComponent(action)}`;
        if (action === 'search') {
            targetUrl += `&query=${encodeURIComponent(query || 'Trending')}&page=${page}`;
        } else if (action === 'detail' && url) {
            targetUrl += `&url=${encodeURIComponent(url)}`;
        }
        const data = await fetchExternal(targetUrl);
        res.json(data);
    } catch (err) {
        console.error('[ADULT API] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/adult/stream', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).end();

        const decodedUrl = decodeURIComponent(url);
        const parsedUrl = new URL(decodedUrl);

        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Referer': 'https://www.xnxx.com/',
                'Origin': 'https://www.xnxx.com',
            }
        };

        if (req.headers.range) {
            options.headers['Range'] = req.headers.range;
        }

        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        const proxyReq = protocol.request(options, (proxyRes) => {
            res.status(proxyRes.statusCode);

            Object.keys(proxyRes.headers).forEach(key => {
                if (key.toLowerCase() !== 'access-control-allow-origin') {
                    res.setHeader(key, proxyRes.headers[key]);
                }
            });

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Range');

            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('[STREAM PROXY] Request error:', err.message);
            if (!res.headersSent) res.status(502).end();
        });

        proxyReq.end();
    } catch (err) {
        console.error('[STREAM PROXY] Catch Error:', err.message);
        if (!res.headersSent) res.status(500).end();
    }
});

export default router;