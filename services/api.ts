import { MovieResult, CastMember, Season, CategoryData, VideoSource, Subtitle, ImdbSuggestion, LiveChannel, IpcResult, WebtoonItem, WebtoonDetail, WebtoonRead, AnimeItem, AnimeDetail } from '../types';
import { cacheService, CacheService } from './cache';
import { safeConsole } from '../utils/productionGuard';
const VIRTUAL_API_PATH = "/slflix/api/v1";
const vttBlobCache = new Map<string, string>();
async function fetchWithRetry<T>(
    fetchFn: () => Promise<T>,
    retries: number = 10,
    delay: number = 2000
): Promise<T> {
    let lastError: Error | null = null;
    for (let i = 0; i < retries; i++) {
        try {
            return await fetchFn();
        } catch (error) {
                        lastError = error as Error;
            if ((error as any).status === 429) {
                console.warn('[API] Rate limit hit (429). Stop retrying.');
                break;
            }
            safeConsole.warn(`[API] Retry ${i + 1}/${retries} failed:`, error);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
            }
        }
    }
    throw lastError;
}
async function fetchJson(url: string, options: RequestInit = {}) {
    const baseHeaders: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };
    const res = await fetch(url, { ...options, headers: { ...baseHeaders, ...options.headers } });
        if (!res.ok) {
        const err = new Error(`HTTP Error: ${res.status}`);
        (err as any).status = res.status;
        throw err;
    }
    return res.json();
}
async function internalFetch(virtualEndpoint: string, options: RequestInit = {}): Promise<any> {
    const [pathPart, queryPart] = virtualEndpoint.split('?');
    const params = new URLSearchParams(queryPart || '');
    const cleanPath = pathPart.replace(VIRTUAL_API_PATH, '');
    if (cleanPath.startsWith('/search')) {
        const keyword = params.get('q') || '';
        const page = params.get('page') || '1';
        const targetUrl = `/api-omegatech/api/movie/MovieBox-pro?action=search&keyword=${encodeURIComponent(keyword)}&page=${page}`;
        return fetchJson(targetUrl, options);
    }
    if (cleanPath.startsWith('/home')) {
        return fetchJson('/api-metadata/home', options);
    }
    if (cleanPath.startsWith('/trending_search')) {
        return fetchJson('/api-metadata/subject/everyone-search', options);
    }
    if (cleanPath.startsWith('/ranking')) {
        const id = params.get('id') || '';
        const page = params.get('page') || '1';
        const perPage = params.get('perPage') || '12';
        return fetchJson(`/api-metadata/ranking-list/content?id=${id}&page=${page}&perPage=${perPage}`, options);
    }
    if (cleanPath.startsWith('/detail')) {
        const subjectId = params.get('subjectId') || '';
        const detailPath = params.get('path') || params.get('detailPath') || '';
        if (detailPath && !/^\d+$/.test(detailPath)) {
            return fetchJson(`/api-metadata/detail?detailPath=${encodeURIComponent(detailPath)}`, options);
        }
        return fetchJson(`/api-metadata/detail?subjectId=${subjectId}&detailPath=${encodeURIComponent(detailPath)}`, options);
    }
    if (cleanPath.startsWith('/play')) {
        const subjectId = params.get('subjectId') || '';
        const se = params.get('se') || '0';
        const ep = params.get('ep') || '0';
        const detailPath = params.get('detailPath') || '';
        const targetUrl = `/api-omegatech/api/movie/MovieBox-pro?action=download&subjectId=${subjectId}&se=${se}&ep=${ep}${detailPath ? `&detailPath=${encodeURIComponent(detailPath)}` : ''}`;
        return fetchJson(targetUrl, options);
    }
    if (cleanPath.startsWith('/rec')) {
        const id = params.get('id') || '';
        return fetchJson(`/api-metadata/subject/detail-rec?subjectId=${id}&page=1&perPage=12`, options);
    }
    return { code: -1, message: 'Unknown endpoint', data: null };
}
const normalizeItem = (item: any): MovieResult => {
    if (!item) return {} as MovieResult;
    const d = item.subject || item.data || item;
    let type = 'Movie';
    const sType = d.subjectType !== undefined ? d.subjectType : (d.type === 'TV' ? 2 : (d.type === 'Movie' ? 1 : d.type));
    if (sType === 2 || sType === 'TV Series' || d.category === 'Series' || d.type === 'TV') type = 'TV Series';
    else if (sType === 6) type = 'Music Video';
    else if (sType === 7) type = 'Short TV';
    else if (sType === 9 || d.category === 'Sport') type = 'Live Sport';
    let cover = '';
    if (typeof d.cover === 'string') cover = d.cover;
    else if (d.cover?.url) cover = d.cover.url;
    else if (d.thumbnail) cover = d.thumbnail;
    else if (d.image?.url) cover = d.image.url;
    else if (d.pic?.normal) cover = d.pic.normal;
    else if (d.poster?.url) cover = d.poster.url;
    else if (d.horizontal_cover?.url) cover = d.horizontal_cover.url;
    const description = d.description || d.introduction || d.synopsis || d.content || d.summary || d.desc || d.info || d.description_en || d.introduction_en || d.summary_en || d.postTitle;
    const rating = d.imdbRatingValue || d.imdbRating || d.rate || d.score || d.rating || '0';
    return {
        title: d.title || d.name || d.subjectName || "Unknown",
        cover: cover,
        thumbnail: cover,
        type: type,
        subjectId: String(d.subjectId || d.id || d.mid || ''),
        imdbRating: String(rating),
        releaseDate: String(d.releaseDate || d.release_date || d.year || d.publish_date || ''),
        genre: d.genre || d.genres || d.categoryName || '',
        description: description || '',
        countryName: d.countryName || d.country || '',
        detailPath: d.detailPath || d.path || '',
        hasResource: d.hasResource !== undefined ? d.hasResource : true
    };
};
const normalizeRankingItem = (item: any): MovieResult => {
    if (!item) return {} as MovieResult;
    let cover = '';
    if (typeof item.cover === 'string') cover = item.cover;
    else if (item.cover?.url) cover = item.cover.url;
    return {
        title: item.title || "Unknown",
        cover: cover,
        thumbnail: cover,
        type: item.subjectType === 1 ? 'Movie' : (item.subjectType === 2 ? 'TV Series' : 'Movie'),
        subjectId: String(item.subjectId || ''),
        imdbRating: String(item.imdbRatingValue || '0'),
        releaseDate: String(item.releaseDate || ''),
        genre: item.genre || '',
        description: item.description || '',
        countryName: item.countryName || '',
        detailPath: item.detailPath || '',
        hasResource: item.hasResource !== undefined ? item.hasResource : true
    };
};
const CATEGORY_IDS: Record<string, string> = {
    'trending': '1232643093049001320',
    'movies': '997144265920760504',
    'anime': '62133389738001440',
    'nollywood': '8216283712045280',
    'sa_series': '4307848214843217008',
    'black_drama': '8505361996374835640',
    'western': '2540573817806670120',
    'k_drama': '4380734070238626200',
    'c_drama': '173752404280836544',
    'thai_drama': '1164329479448281992',
    'turkish': '9193088611682599936',
    'animation': '7132534597631837112'
};
export const ApiService = {
    search: async (query: string, page: number = 1) => {
        if (!query || !query.trim()) return { results: [], hasMore: false, nextPage: 1, totalCount: 0 };
        const cacheKey = CacheService.searchKey(query, page);
        if (page === 1) {
            const cached = cacheService.get<{ results: MovieResult[]; hasMore: boolean; nextPage: number; totalCount: number }>(cacheKey);
            if (cached && cached.data) {
                cacheService.prefetch(cacheKey, () => ApiService.search(query, page), 3 * 60 * 1000);
                return cached.data;
            }
        }
        try {
            const url = `/api-omegatech/api/movie/MovieBox-pro?action=search&keyword=${encodeURIComponent(query.trim())}&page=${page}`;
            let data: any = null;
            try {
                data = await fetchJson(url);
            } catch (directErr) {
                console.warn('[SLFLIX] Direct Omegatech search proxy failed, attempting server route:', directErr);
            }

            if (data && (data.success || data.statusCode === 200)) {
                const searchData = data.data?.raw || data.data || data.results || {};
                const items = Array.isArray(searchData.results)
                    ? searchData.results
                    : (Array.isArray(searchData.items)
                        ? searchData.items
                        : (Array.isArray(data.results)
                            ? data.results
                            : (Array.isArray(data.data) ? data.data : [])));

                const pager = searchData.pager || {};
                const hasMore = pager.hasMore !== undefined
                    ? Boolean(pager.hasMore)
                    : (searchData.hasMore !== undefined ? Boolean(searchData.hasMore) : false);
                const nextPage = pager.nextPage
                    ? (parseInt(String(pager.nextPage), 10) || (page + 1))
                    : (searchData.nextPage ? (parseInt(String(searchData.nextPage), 10) || (page + 1)) : (page + 1));
                const totalCount = pager.totalCount !== undefined
                    ? pager.totalCount
                    : (searchData.total !== undefined ? searchData.total : items.length);

                if (items.length > 0) {
                    const result = {
                        results: items.map(normalizeItem),
                        hasMore,
                        nextPage,
                        totalCount
                    };
                    if (page === 1) {
                        cacheService.set(cacheKey, result, 3 * 60 * 1000);
                    }
                    return result;
                }
            }

            // Fallback to internal server search endpoint if direct proxy returns empty or fails
            try {
                const serverFallbackUrl = `/api/search?q=${encodeURIComponent(query.trim())}&page=${page}`;
                const fallbackData = await fetchJson(serverFallbackUrl);
                if (fallbackData && Array.isArray(fallbackData.results) && fallbackData.results.length > 0) {
                    const result = {
                        results: fallbackData.results.map(normalizeItem),
                        hasMore: Boolean(fallbackData.hasMore),
                        nextPage: page + 1,
                        totalCount: fallbackData.totalCount || fallbackData.results.length
                    };
                    if (page === 1) {
                        cacheService.set(cacheKey, result, 3 * 60 * 1000);
                    }
                    return result;
                }
            } catch (fallbackErr) {
                console.warn('[SLFLIX] Server fallback search error:', fallbackErr);
            }

            return { results: [], hasMore: false, nextPage: 1, totalCount: 0 };
        } catch (e) {
            console.error('[SLFLIX] Search error:', e);
            const cached = cacheService.get<{ results: MovieResult[]; hasMore: boolean; nextPage: number; totalCount: number }>(cacheKey);
            if (cached && cached.data) {
                return cached.data;
            }
            return { results: [], hasMore: false, nextPage: 1, totalCount: 0 };
        }
    },
    getHomeData: async () => {
        const cacheKey = 'home:data';
        const cached = cacheService.get<{ categories: CategoryData[]; hero: MovieResult[] }>(cacheKey);
        if (cached && cached.data && !cached.isStale) {
            cacheService.prefetch(cacheKey, () => ApiService.getHomeData(), 5 * 60 * 1000);
            return cached.data;
        }
        try {
            const data = await fetchWithRetry(
                () => internalFetch(`${VIRTUAL_API_PATH}/home`),
                2, 1
            );
            let categories: CategoryData[] = [];
            let hero: MovieResult[] = [];
            if (data && (Array.isArray(data.categories) || Array.isArray(data.hero))) {
                categories = (data.categories || []).map((cat: any) => ({
                    title: cat.name || cat.title || 'Featured',
                    query: cat.id || '',
                    movies: (cat.items || cat.movies || []).map((m: any) => ({
                        title: m.title || 'Unknown',
                        cover: m.cover || m.thumbnail || '',
                        thumbnail: m.thumbnail || m.cover || '',
                        type: m.type || 'Movie',
                        subjectId: String(m.subjectId || m.id || ''),
                        imdbRating: String(m.imdbRating || m.rating || '0'),
                        releaseDate: String(m.releaseDate || ''),
                        detailPath: m.detailPath || '',
                        hasResource: m.hasResource !== undefined ? m.hasResource : true
                    }))
                }));
                hero = (data.hero || []).map((m: any) => ({
                    title: m.title || 'Unknown',
                    cover: m.cover || m.backdrop || '',
                    thumbnail: m.thumbnail || m.cover || '',
                    type: m.type || 'Movie',
                    subjectId: String(m.subjectId || m.id || ''),
                    imdbRating: String(m.imdbRating || m.rating || '0'),
                    releaseDate: String(m.releaseDate || ''),
                    detailPath: m.detailPath || '',
                    hasResource: m.hasResource !== undefined ? m.hasResource : true
                }));
            } else if (data && data.code === 0 && data.data?.operatingList) {
                data.data.operatingList.forEach((op: any) => {
                    if (op.type === 'BANNER' && op.banner?.items) {
                        hero = op.banner.items.map(normalizeItem);
                    } else if ((op.type === 'SUBJECTS_MOVIE' || op.type === 'SUBJECT_LIST' || op.type === 'APPOINTMENT_LIST') && op.subjects?.length) {
                        categories.push({ title: op.title || "Recommended", query: op.id || '', movies: op.subjects.map(normalizeItem) });
                    }
                });
            } else {
                const staleCached = cacheService.get<{ categories: CategoryData[]; hero: MovieResult[] }>(cacheKey);
                return staleCached?.data || { categories: [], hero: [] };
            }
            try {
                const tvHome = await Promise.race([
                    ApiService.getTvHome(),
                    new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
                ]).catch(() => null);
                if (tvHome?.data?.trending?.films?.length) {
                    const geoMovies = tvHome.data.trending.films.map((f: any) => ({
                        title: f.title,
                        cover: f.image,
                        thumbnail: f.image,
                        type: 'Movie',
                        subjectId: String(f.id),
                        imdbRating: f.imdb_rating,
                        releaseDate: f.year,
                        detailPath: f.slug,
                        hasResource: true
                    }));
                    categories.unshift({ title: "Trending in Georgia", query: "georgia", movies: geoMovies });
                }
            } catch (e) {
                console.warn("[ApiService] Failed to fetch Georgian trending for home", e);
            }
            const result = { categories, hero };
            cacheService.set(cacheKey, result, 5 * 60 * 1000);
            return result;
        } catch (e) {
            console.error('[SLFLIX] Home data error:', e);
            const cached = cacheService.get<{ categories: CategoryData[]; hero: MovieResult[] }>(cacheKey);
            return cached?.data || { categories: [], hero: [] };
        }
    },
    getDetails: async (movie: MovieResult) => {
        let enhanced = { ...movie };
        const path = movie.detailPath;
        const subjectId = movie.subjectId;
        const cacheKey = CacheService.movieKey(subjectId, path);
        const cached = cacheService.get<MovieResult>(cacheKey);
        if (cached && cached.data && !cached.isStale) {
            return { ...cached.data, ...movie };
        }
        if (path || subjectId) {
            try {
                const data = await fetchWithRetry(
                    () => internalFetch(`${VIRTUAL_API_PATH}/detail?subjectId=${subjectId || ''}&path=${path || ''}`),
                    2, 1
                );
                if ((data.code === 0 || data.success) && data.data) {
                    const d = data.data;
                    const s = d.subject || d.subjectDetail || d.detail || d.info || d.data || d;
                    enhanced.description = s.description || s.introduction || s.synopsis || s.content || s.summary || s.desc || enhanced.description;
                    enhanced.title = s.title || s.name || s.subjectName || enhanced.title;
                    enhanced.imdbRating = String(s.imdbRatingValue || s.imdbRating || enhanced.imdbRating);
                    enhanced.subjectId = String(s.subjectId || enhanced.subjectId);
                    enhanced.detailPath = s.detailPath || enhanced.detailPath;
                    if (s.hasResource !== undefined) enhanced.hasResource = s.hasResource;
                    const coverUrl = s.cover?.url || s.pic?.normal || s.image?.url || s.cover || s.poster?.url;
                    if (coverUrl && typeof coverUrl === 'string') enhanced.cover = coverUrl;
                    const stars = d.stars || s.staffList || d.staffList || s.stars || s.actors || d.resource?.staffList;
                    if (stars && Array.isArray(stars)) {
                        enhanced.cast = stars.map((st: any) => ({ name: st.name || st.enName || st.staffName || "Unknown", character: st.character || st.role || '', avatar: st.avatar?.url || st.avatarUrl || st.avatar || st.photo || '', id: String(st.staffId || st.id || '') }));
                    }
                    let seasons: any[] = [];
                    const rawType = String(s.type || enhanced.type || movie.type || '').trim();
                    const isExplicitMovie = rawType.toLowerCase() === 'movie' || s.subjectType === 1 || rawType.toLowerCase().includes('feature');
                    const isExplicitSeries = rawType.toLowerCase().includes('tv') || rawType.toLowerCase().includes('series') || rawType.toLowerCase().includes('anime') || rawType.toLowerCase().includes('show') || rawType.toLowerCase().includes('drama') || s.subjectType === 2;

                    if (!isExplicitMovie) {
                        if (d.resource?.seasons && Array.isArray(d.resource.seasons)) {
                            seasons = d.resource.seasons;
                            console.log('[SLFLIX] Seasons from d.resource.seasons:', seasons);
                        }
                        else if (s.resource?.seasons && Array.isArray(s.resource.seasons)) {
                            seasons = s.resource.seasons;
                        }
                        else if (s.seasons && Array.isArray(s.seasons)) {
                            seasons = s.seasons;
                        }
                        else if (d.seasons && Array.isArray(d.seasons)) {
                            seasons = d.seasons;
                        }
                        else if (s.episodes && Array.isArray(s.episodes)) {
                            const seasonMap = new Map<number, number>();
                            s.episodes.forEach((ep: any) => {
                                const sn = ep.seasonNumber || ep.season || 1;
                                seasonMap.set(sn, (seasonMap.get(sn) || 0) + 1);
                            });
                            seasons = Array.from(seasonMap.entries()).map(([seasonNumber, episodeCount]) => ({
                                se: seasonNumber,
                                maxEp: episodeCount,
                                episodeCount
                            }));
                        }
                        else if (s.totalEpisodes && s.totalSeasons && isExplicitSeries) {
                            for (let i = 1; i <= (s.totalSeasons || 1); i++) {
                                seasons.push({
                                    se: i,
                                    maxEp: s.totalEpisodes,
                                    episodeCount: s.totalEpisodes
                                });
                            }
                        }

                        if (seasons.length > 0) {
                            // Filter out single-episode single-season movie artifacts
                            const parsedSeasons = seasons.map((se: any) => ({ 
                                seasonNumber: se.seasonNumber || se.se || 1, 
                                episodeCount: se.episodeCount || se.maxEp || (se.episodes ? se.episodes.length : 0) || se.totalEpisodes || 1 
                            }));
                            const totalEpisodesAcrossSeasons = parsedSeasons.reduce((acc, curr) => acc + (curr.episodeCount || 0), 0);
                            if (totalEpisodesAcrossSeasons > 1 || parsedSeasons.length > 1 || isExplicitSeries) {
                                enhanced.seasons = parsedSeasons;
                            }
                        } else if (isExplicitSeries) {
                            enhanced.seasons = [{ seasonNumber: 1, episodeCount: s.episodeCount || s.totalEpisodes || 1 }];
                        }
                    } else {
                        // Explicitly clear any seasons for movies
                        enhanced.seasons = undefined;
                    }
                    enhanced.trailerUrl = s.trailer?.videoAddress?.url || s.trailer?.url || s.trailerUrl;
                    if (s.dubs) enhanced.dubs = s.dubs;
                    cacheService.set(cacheKey, enhanced, 10 * 60 * 1000);
                }
            } catch (e) {
                console.warn("[SLFLIX] Detail metadata failed", e);
            }
        }
        const recId = enhanced.subjectId;
        if (recId && recId !== 'undefined') {
            try {
                const recData = await internalFetch(`${VIRTUAL_API_PATH}/rec?id=${recId}`);
                const recItems = recData.data?.items || recData.data?.list || [];
                if (Array.isArray(recItems)) {
                    enhanced.recommendations = recItems.map(normalizeItem);
                }
            } catch (e) {
                console.warn("[SLFLIX] Recommendations failed", e);
            }
        }
        return enhanced;
    },
    getSources: async (subjectId: string, type: string, season = 1, episode = 1, detailPath?: string, title?: string) => {
        const cacheKey = CacheService.sourcesKey(subjectId, season, episode);
        const cached = cacheService.get<{ videos: VideoSource[]; subs: Subtitle[] }>(cacheKey);
        if (cached && cached.data && !cached.isStale) {
            return cached.data;
        }
        try {
            const url = `/api/sources/${subjectId}?type=${type}&season=${season}&episode=${episode}${detailPath ? `&path=${encodeURIComponent(detailPath)}` : ''}${title ? `&title=${encodeURIComponent(title)}` : ''}`;
            console.log('[SLFLIX] Getting sources from backend:', url);
            const data = await fetchJson(url);
            if (data.results) {
                const videos: VideoSource[] = data.results.map((v: any) => {
                    const qualityStr = String(v.quality || '');
                    const resMatch = qualityStr.match(/(\d+)/);
                    const resolution = resMatch ? parseInt(resMatch[1]) : (typeof v.quality === 'number' ? v.quality : 0);
                    return {
                        quality: resolution,
                        label: qualityStr || 'Standard',
                        stream: v.url || v.stream || v.direct,
                        download: v.download,
                        size: v.size || (resolution ? `${resolution}p` : ''),
                        type: v.format?.toLowerCase() || 'mp4'
                    };
                });
                const subs: Subtitle[] = (data.subtitles || []).map((s: any) => ({
                    id: s.id || s.languageCode || s.lang,
                    lang: s.languageCode || s.lang || 'en',
                    language: s.language || s.name || s.label || 'English',
                    languageCode: s.languageCode || s.lang || 'en',
                    name: s.name || s.language || s.label || 'English',
                    label: s.label || s.language || s.name || 'English',
                    url: s.url,
                    proxyUrl: s.proxyUrl,
                    size: s.size,
                    delay: s.delay || 0
                }));
                const result = { videos, subs };
                cacheService.set(cacheKey, result, 5 * 60 * 1000);
                return result;
            }
            return { videos: [], subs: [] };
        } catch (e) {
            console.error("[SLFLIX] Sources fetch failed", e);
            return { videos: [], subs: [] };
        }
    },
    getTvHome: async (): Promise<any> => {
        try {
            return await fetchJson('/api/tv/home');
        } catch (e) {
            return { data: null };
        }
    },
    getTvChannels: async (params: { cat?: string; country?: string; q?: string; offset?: number; limit?: number } = {}): Promise<any> => {
        try {
            const query = new URLSearchParams();
            if (params.cat) query.set('cat', params.cat);
            if (params.country) query.set('country', params.country);
            if (params.q) query.set('q', params.q);
            if (params.offset !== undefined) query.set('offset', String(params.offset));
            if (params.limit !== undefined) query.set('limit', String(params.limit));
            return await fetchJson(`/api/tv/channels?${query.toString()}`);
        } catch (e) {
            return { data: [], total: 0 };
        }
    },
    getTvCategories: async (): Promise<any> => {
        try {
            return await fetchJson('/api/tv/categories');
        } catch (e) {
            return { data: [] };
        }
    },
    getTvCountries: async (): Promise<any> => {
        try {
            return await fetchJson('/api/tv/countries');
        } catch (e) {
            return { data: [] };
        }
    },
    getTvGuide: async (date?: string): Promise<any> => {
        try {
            const query = date ? `?date=${encodeURIComponent(date)}` : '';
            return await fetchJson(`/api/tv/guide${query}`);
        } catch (e) {
            return { data: [] };
        }
    },
    getTvOnNow: async (): Promise<any> => {
        try {
            return await fetchJson('/api/tv/onnow');
        } catch (e) {
            return { data: [] };
        }
    },
    getTvMatches: async (season?: string): Promise<any> => {
        try {
            const query = season ? `?season=${encodeURIComponent(season)}` : '';
            return await fetchJson(`/api/tv/matches${query}`);
        } catch (e) {
            return { data: [] };
        }
    },
    getLegacyLiveTv: async (): Promise<any> => {
        try {
            const res = await fetchJson('/api/tv/channels?limit=100');
            return res.data || [];
        } catch (e) {
            return [];
        }
    },
    getLiveChannels: async (): Promise<LiveChannel[]> => {
        try {
            const res = await fetchJson('/api/tv/channels?limit=200');
            return res.data || [];
        } catch (e) {
            return [];
        }
    },
    searchIpc: async (_query: string, _season?: number, _episode?: number): Promise<IpcResult[]> => {
        return [];
    },
    getTrendingSearches: async () => {
        const cacheKey = 'trending:searches';
        const cached = cacheService.get<string[]>(cacheKey);
        if (cached?.data) {
            cacheService.prefetch(cacheKey, () => ApiService.getTrendingSearches(), 2 * 60 * 1000);
            return cached.data;
        }
        try {
            const data = await internalFetch(`${VIRTUAL_API_PATH}/trending_search`);
            const result = data.data?.everyoneSearch?.map((s: any) => s.title) || [];
            cacheService.set(cacheKey, result, 2 * 60 * 1000);
            return result;
        } catch (e) { 
            const cached = cacheService.get<string[]>(cacheKey);
            return cached?.data || [];
        }
    },
    getTrending: async (page: number = 0, perPage: number = 18) => {
        const cacheKey = `trending:${page}:${perPage}`;
        const cached = cacheService.get<{ results: MovieResult[]; hasMore: boolean; nextPage: number; totalCount: number }>(cacheKey);
        if (cached?.data) {
            cacheService.prefetch(cacheKey, () => ApiService.getTrending(page, perPage), 2 * 60 * 1000);
            return cached.data;
        }
        try {
            const url = `/api-metadata/subject/trending?page=${page}&perPage=${perPage}`;
            const data = await fetchJson(url);
            console.log('[API] Trending response:', data);
            if ((data.code === 0 || data.success) && (data.data?.subjectList || data.data?.list)) {
                const pager = data.data.pager || {};
                const result = {
                    results: (data.data.subjectList || data.data.list || []).map(normalizeRankingItem),
                    hasMore: pager.hasMore || false,
                    nextPage: parseInt(pager.nextPage) || (page + 1),
                    totalCount: pager.totalCount || data.data.subjectList.length
                };
                cacheService.set(cacheKey, result, 2 * 60 * 1000);
                return result;
            }
            return { results: [], hasMore: false, nextPage: page + 1, totalCount: 0 };
        } catch (e) {
            console.error('[API] Trending error:', e);
            const cached = cacheService.get<{ results: MovieResult[]; hasMore: boolean; nextPage: number; totalCount: number }>(cacheKey);
            return cached?.data || { results: [], hasMore: false, nextPage: 1, totalCount: 0 };
        }
    },
    getRankingList: async (category: string, page: number = 1, perPage: number = 12) => {
        try {
            const catId = CATEGORY_IDS[category.toLowerCase()] || CATEGORY_IDS['trending'];
            const data = await internalFetch(`${VIRTUAL_API_PATH}/ranking?id=${catId}&page=${page}&perPage=${perPage}`);
            if ((data.code === 0 || data.success) && (data.data?.subjectList || data.data?.list)) {
                const pager = data.data.pager || {};
                return {
                    title: data.data.title || category,
                    results: (data.data.subjectList || data.data.list || []).map(normalizeRankingItem),
                    hasMore: pager.hasMore || false,
                    nextPage: parseInt(pager.nextPage) || (page + 1)
                };
            }
            return { title: category, results: [], hasMore: false, nextPage: page + 1 };
        } catch (e) {
            console.error('[SLFLIX] Ranking list error:', e);
            return { title: category, results: [], hasMore: false, nextPage: page + 1 };
        }
    },
    getImdbSuggestions: async (query: string) => {
        try {
            const clean = query.replace(/[^\w\s]/g, '').trim();
            if (clean.length < 2) return [];
            const url = `https://v3.sg.media-imdb.com/suggestion/${clean.charAt(0).toLowerCase()}/${encodeURIComponent(clean)}.json`;
            const res = await fetch(url);
            const data = await res.json();
            return data?.d || [];
        } catch (e) { return []; }
    },
    getMovieById: async (id: string): Promise<MovieResult> => ({
        title: "Loading...", cover: "", thumbnail: "", type: "Movie", subjectId: id, detailPath: id
    }),
        getNews: async (page: number = 1): Promise<any> => {
        const cacheKey = `news:page:${page}`;
        const cached = cacheService.get<any>(cacheKey);
        if (cached && cached.data) {
            return cached.data;
        }
        try {
            const res = await fetch(`/api/sport/trend?page=${page}`);
            if (!res.ok) throw new Error("API not found");
            const data = await res.json();
            cacheService.set(cacheKey, data, 5 * 60 * 1000); 
            return data;
        } catch (e) {
            throw e;
        }
    },
    getSportFeeds: async (): Promise<any> => {
        const cacheKey = 'sport:feeds';
        const cached = cacheService.get<any>(cacheKey);
        if (cached && cached.data) {
            return cached.data;
        }
        try {
            const data = await fetchJson('/api/sport/feeds');
            cacheService.set(cacheKey, data, 60 * 1000); 
            return data;
        } catch (e) {
            console.error('[API] Failed to fetch sport feeds:', e);
            return null;
        }
    },
    getSportMatchDetail: async (id: string): Promise<any> => {
        const cacheKey = `sport:match:${id}`;
        const cached = cacheService.get<any>(cacheKey);
        if (cached && cached.data) {
            return cached.data;
        }
        try {
            const data = await fetchJson(`/api/sport/match-detail?id=${id}`);
            cacheService.set(cacheKey, data, 30 * 1000); 
            return data;
        } catch (e) {
            console.error('[API] Failed to fetch sport match details:', e);
            return null;
        }
    },
    getWebtoonHome: async (): Promise<{ trending: WebtoonItem[] }> => {
        const cacheKey = 'webtoon:home';
        const cached = cacheService.get<{ trending: WebtoonItem[] }>(cacheKey);
        if (cached && cached.data) {
            return cached.data;
        }
        try {
            const data = await fetchJson('/api/webtoon/home');
            cacheService.set(cacheKey, data, 10 * 60 * 1000);
            return data;
        } catch (e) {
            return { trending: [] };
        }
    },
    searchWebtoon: async (query: string): Promise<{ results: WebtoonItem[] }> => {
        const cacheKey = `webtoon:search:${query}`;
        const cached = cacheService.get<{ results: WebtoonItem[] }>(cacheKey);
        if (cached && cached.data) {
            return cached.data;
        }
        try {
            const data = await fetchJson(`/api/webtoon/search?query=${encodeURIComponent(query)}`);
            cacheService.set(cacheKey, data, 5 * 60 * 1000); 
            return data;
        } catch (e) {
            return { results: [] };
        }
    },
    getWebtoonDetail: async (url: string): Promise<WebtoonDetail | null> => {
        const cacheKey = `webtoon:detail:${url}`;
        const cached = cacheService.get<WebtoonDetail>(cacheKey);
        if (cached && cached.data) {
            return cached.data;
        }
        try {
            const data = await fetchJson(`/api/webtoon/detail?url=${encodeURIComponent(url)}`);
            cacheService.set(cacheKey, data, 15 * 60 * 1000); 
            return data;
        } catch (e) {
            return null;
        }
    },
    readWebtoon: async (url: string): Promise<WebtoonRead | null> => {
        const cacheKey = `webtoon:read:${url}`;
        const cached = cacheService.get<WebtoonRead>(cacheKey);
        if (cached && cached.data) {
            return cached.data;
        }
        try {
            const data = await fetchJson(`/api/webtoon/read?url=${encodeURIComponent(url)}`);
            cacheService.set(cacheKey, data, 30 * 60 * 1000); 
            return data;
        } catch (e) {
            return null;
        }
    },
    getAnimeHome: async (): Promise<{ trending: AnimeItem[] }> => {
        const cacheKey = 'anime:home';
        const cached = cacheService.get<{ trending: AnimeItem[] }>(cacheKey);
        if (cached && cached.data) {
            return cached.data;
        }
        try {
            let data = await fetchJson('/api/anime/home');
            let items: AnimeItem[] = [];
            if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
                items = data.data;
            } else if (Array.isArray(data) && data.length > 0) {
                items = data;
            } else {
                // Direct Omegatech fallback (Oploverz Indonesian Sub)
                try {
                    const directRes = await fetch('https://api.omegatech.app/api/Anime/Oploverz?action=home');
                    const directJson = await directRes.json();
                    if (directJson && directJson.data) {
                        const raw = [...(directJson.data.trending || []), ...(directJson.data.latestEpisodes || []), ...(directJson.data.featured || [])];
                        const seen = new Set();
                        for (const it of raw) {
                            if (it.title && !seen.has(it.title)) {
                                seen.add(it.title);
                                items.push({ title: it.title, image: it.image || it.poster, link: it.url || it.watchUrl });
                            }
                        }
                    }
                } catch (e1) {
                    const directRes = await fetch('https://api.omegatech.app/api/Anime/Nimegami?action=home');
                    const directJson = await directRes.json();
                    if (directJson && directJson.data) items = directJson.data;
                }
            }
            const result = { trending: items };
            cacheService.set(cacheKey, result, 10 * 60 * 1000);
            return result;
        } catch (e) {
            console.error('[API] Failed to fetch anime home:', e);
            try {
                const directRes = await fetch('https://api.omegatech.app/api/Anime/Oploverz?action=home');
                const directJson = await directRes.json();
                if (directJson && directJson.data) {
                    const raw = [...(directJson.data.trending || []), ...(directJson.data.latestEpisodes || [])];
                    const items = raw.map((it: any) => ({ title: it.title, image: it.image || it.poster, link: it.url || it.watchUrl }));
                    return { trending: items };
                }
            } catch (err) {}
            return { trending: [] };
        }
    },
    searchAnime: async (query: string): Promise<{ results: AnimeItem[] }> => {
        const cacheKey = `anime:search:${query}`;
        const cached = cacheService.get<{ results: AnimeItem[] }>(cacheKey);
        if (cached && cached.data) {
            return cached.data;
        }
        try {
            let data = await fetchJson(`/api/anime/search?query=${encodeURIComponent(query)}`);
            let items: AnimeItem[] = [];
            if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
                items = data.data;
            } else if (Array.isArray(data) && data.length > 0) {
                items = data;
            } else {
                try {
                    const directRes = await fetch(`https://api.omegatech.app/api/Anime/Oploverz?action=search&query=${encodeURIComponent(query)}`);
                    const directJson = await directRes.json();
                    const list = directJson.data?.data || directJson.data?.results || [];
                    if (Array.isArray(list)) {
                        items = list.map((it: any) => ({ title: it.title, image: it.poster || it.image, link: it.url || '' }));
                    }
                } catch (e1) {
                    const directRes = await fetch(`https://api.omegatech.app/api/Anime/Nimegami?action=search&query=${encodeURIComponent(query)}`);
                    const directJson = await directRes.json();
                    if (directJson && directJson.data) items = directJson.data;
                }
            }
            const result = { results: items };
            cacheService.set(cacheKey, result, 5 * 60 * 1000);
            return result;
        } catch (e) {
            console.error('[API] Failed to search anime:', e);
            try {
                const directRes = await fetch(`https://api.omegatech.app/api/Anime/Oploverz?action=search&query=${encodeURIComponent(query)}`);
                const directJson = await directRes.json();
                const list = directJson.data?.data || directJson.data?.results || [];
                if (Array.isArray(list)) {
                    return { results: list.map((it: any) => ({ title: it.title, image: it.poster || it.image, link: it.url || '' })) };
                }
            } catch (err) {}
            return { results: [] };
        }
    },
    getAnimeDetail: async (url: string): Promise<AnimeDetail | null> => {
        const cacheKey = `anime:detail:${url}`;
        const cached = cacheService.get<AnimeDetail>(cacheKey);
        if (cached && cached.data) {
            return cached.data;
        }
        try {
            let data = await fetchJson(`/api/anime/detail?url=${encodeURIComponent(url)}`);
            if (data && (data.title || data.downloads)) {
                cacheService.set(cacheKey, data, 30 * 60 * 1000);
                return data;
            }
            // Direct fallback
            try {
                if (url.includes('oploverz')) {
                    const directRes = await fetch(`https://api.omegatech.app/api/Anime/Oploverz?action=detail&url=${encodeURIComponent(url)}`);
                    const directJson = await directRes.json();
                    if (directJson && directJson.data) {
                        const d = directJson.data;
                        const resObj: AnimeDetail = {
                            title: d.title,
                            synopsis: d.description || d.synopsis,
                            image: d.poster || d.image,
                            link: url,
                            downloads: [{ server: "Stream HD", url: d.watchUrl || url, resolution: "HD" }]
                        };
                        cacheService.set(cacheKey, resObj, 30 * 60 * 1000);
                        return resObj;
                    }
                }
            } catch (e1) {}
            const directRes = await fetch(`https://api.omegatech.app/api/Anime/Nimegami?action=detail&url=${encodeURIComponent(url)}`);
            const directJson = await directRes.json();
            if (directJson && directJson.data) {
                cacheService.set(cacheKey, directJson.data, 30 * 60 * 1000);
                return directJson.data;
            }
            return null;
        } catch (e) {
            console.error('[API] Failed to fetch anime detail:', e);
            try {
                const directRes = await fetch(`https://api.omegatech.app/api/Anime/Nimegami?action=detail&url=${encodeURIComponent(url)}`);
                const directJson = await directRes.json();
                if (directJson && directJson.data) return directJson.data;
            } catch (err) {}
            return null;
        }
    },
    resolveAnimeStream: async (url: string, name: string = ''): Promise<{
        success: boolean;
        directUrl?: string;
        streamProxyUrl?: string;
        embedUrl?: string;
        type?: 'mp4' | 'embed';
        fileId?: string;
    } | null> => {
        try {
            const data = await fetchJson(`/api/anime/stream-resolve?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`);
            if (data && data.success) {
                return data;
            }
            return null;
        } catch (e) {
            console.error('[API] Failed to resolve anime stream:', e);
            return null;
        }
    },
    getAdultContent: async (query: string = 'Trending', page: number = 1): Promise<any> => {
        try {
            const data = await fetchJson(`/api/adult/xnxx?action=search&query=${encodeURIComponent(query)}&page=${page}`);
            return data;
        } catch (e) {
            return { success: false, results: [] };
        }
    },
    getAdultDetail: async (url: string): Promise<any> => {
        try {
            const data = await fetchJson(`/api/adult/xnxx?action=detail&url=${encodeURIComponent(url)}`);
            return data;
        } catch (e) {
            return null;
        }
    },
    getNovels: async (action: string = 'search', query: string = 'Alone', opConfId?: string, page: number = 1): Promise<any> => {
        try {
            let url = `/api/novel?action=${action}&page=${page}`;
            if (query) url += `&query=${encodeURIComponent(query)}`;
            if (opConfId) url += `&opConfId=${opConfId}`;
            return await fetchJson(url);
        } catch (e) {
            return { success: false, results: [] };
        }
    },
    getNovelChapters: async (novelId: string): Promise<any> => {
        try {
            return await fetchJson(`/api/novel?action=chapters&novelId=${novelId}&perPage=100`);
        } catch (e) {
            return { success: false, chapters: [] };
        }
    },
    getNovelChapterContent: async (novelId: string, chapterId: string): Promise<any> => {
        try {
            return await fetchJson(`/api/novel?action=chapter&novelId=${novelId}&chapterId=${chapterId}`);
        } catch (e) {
            return { success: false, content: '' };
        }
    },
    getNovelRecommendations: async (novelId: string): Promise<any> => {
        try {
            return await fetchJson(`/api/novel?action=recommend&novelId=${novelId}`);
        } catch (e) {
            return { success: false, results: [] };
        }
    }
};
export const RANKING_CATEGORIES = [
    { id: 'trending', name: 'Trending Now', icon: 'fa-fire' },
    { id: 'movies', name: 'Popular Movies', icon: 'fa-film' },
    { id: 'anime', name: 'Anime', icon: 'fa-dragon' },
    { id: 'k_drama', name: 'K-Drama', icon: 'fa-heart' },
    { id: 'c_drama', name: 'C-Drama', icon: 'fa-scroll' },
    { id: 'thai_drama', name: 'Thai-Drama', icon: 'fa-spa' },
    { id: 'turkish', name: 'Turkish Drama', icon: 'fa-star' },
    { id: 'western', name: 'Western TV', icon: 'fa-tv' },
    { id: 'nollywood', name: 'Nollywood', icon: 'fa-mask' },
    { id: 'sa_series', name: 'South African', icon: 'fa-globe-africa' },
    { id: 'black_drama', name: 'Black Drama', icon: 'fa-users' },
    { id: 'animation', name: 'Animation', icon: 'fa-ghost' }
];
export const CATEGORIES: any[] = [];