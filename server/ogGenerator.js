import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pre-load font buffers once
const fontBuffers = [];
try {
    const regFontPath = path.resolve(__dirname, 'fonts/LiberationSans-Regular.ttf');
    const boldFontPath = path.resolve(__dirname, 'fonts/LiberationSans-Bold.ttf');
    if (fs.existsSync(regFontPath)) fontBuffers.push(fs.readFileSync(regFontPath));
    if (fs.existsSync(boldFontPath)) fontBuffers.push(fs.readFileSync(boldFontPath));
    console.log(`[OG Generator] Loaded ${fontBuffers.length} font buffer(s) for Resvg rendering.`);
} catch (e) {
    console.warn('[OG Generator] Warning loading font buffers:', e.message);
}

// Pre-load default SLFLIX logo data URI
let defaultLogoDataUri = '';
try {
    const defaultLogoPath = path.resolve(__dirname, '../public/icons/slflix.png');
    if (fs.existsSync(defaultLogoPath)) {
        defaultLogoDataUri = `data:image/png;base64,${fs.readFileSync(defaultLogoPath).toString('base64')}`;
    }
} catch (e) {
    console.warn('[OG Generator] Warning preloading default logo:', e.message);
}

// In-memory LRU cache for generated PNGs
const ogCache = new Map();
const MAX_CACHE_SIZE = 800;

export function escapeXml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function wrapText(text, maxCharsPerLine = 52, maxLines = 3) {
    if (!text) return [];
    const clean = String(text).replace(/[\r\n\t]+/g, ' ').trim();
    const words = clean.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    let wordIdx = 0;

    for (; wordIdx < words.length; wordIdx++) {
        const w = words[wordIdx];
        const test = cur ? cur + ' ' + w : w;
        if (test.length <= maxCharsPerLine) {
            cur = test;
        } else {
            if (cur) lines.push(cur);
            cur = w;
            if (lines.length >= maxLines) break;
        }
    }
    if (cur && lines.length < maxLines) {
        lines.push(cur);
    }
    if (lines.length > maxLines) {
        lines.length = maxLines;
    }
    if (wordIdx < words.length && lines.length > 0) {
        lines[lines.length - 1] = lines[lines.length - 1].replace(/[.,;:!?\s]+$/, '') + '...';
    }
    return lines.map(escapeXml);
}

export async function fetchImageDataUri(url) {
    if (!url || typeof url !== 'string') return defaultLogoDataUri;
    
    // Check if it is a local file path
    if (url.startsWith('/') || url.startsWith('.') || url.includes('public/icons/') || url.includes('icons/')) {
        try {
            const cleanPath = url.replace(/^\//, '');
            const localFile = path.resolve(__dirname, '..', cleanPath.startsWith('public/') ? cleanPath : `public/${cleanPath}`);
            if (fs.existsSync(localFile)) {
                const ext = path.extname(localFile).toLowerCase();
                const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
                return `data:${mime};base64,${fs.readFileSync(localFile).toString('base64')}`;
            }
        } catch (e) {}
    }

    try {
        const res = await fetch(url, { 
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': 'https://moviebox.ph/',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(6500) 
        });
        if (!res.ok) return defaultLogoDataUri;
        const buf = await res.arrayBuffer();
        if (!buf || buf.byteLength === 0) return defaultLogoDataUri;
        const mime = res.headers.get('content-type') || 'image/jpeg';
        return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
    } catch (e) {
        return defaultLogoDataUri;
    }
}

export const THEME_CONFIGS = {
    movie: {
        themeName: 'movie',
        primary: '#00e5ff',
        secondary: '#ec4899',
        accent: '#3b82f6',
        bgDark1: '#070913',
        bgDark2: '#0d1127',
        tagline: 'CINEMA PREVIEW • 4K ULTRA HD',
        typeBadge: 'MOVIE',
        ctaText: '▶ WATCH NOW ON SLFLIX',
        avatarShape: 'rect'
    },
    tv: {
        themeName: 'tv',
        primary: '#a855f7',
        secondary: '#f43f5e',
        accent: '#6366f1',
        bgDark1: '#09071a',
        bgDark2: '#160d2e',
        tagline: 'TV SERIES • FULL SEASONS BINGE',
        typeBadge: 'TV SERIES',
        ctaText: '▶ BINGE ALL EPISODES',
        avatarShape: 'rect'
    },
    staff: {
        themeName: 'staff',
        primary: '#fbbf24',
        secondary: '#d97706',
        accent: '#ea580c',
        bgDark1: '#0d0a06',
        bgDark2: '#1f160a',
        tagline: 'HOLLYWOOD TALENT • FILMOGRAPHY',
        typeBadge: 'CELEBRITY',
        ctaText: '★ EXPLORE FILMOGRAPHY',
        avatarShape: 'circle'
    },
    live: {
        themeName: 'live',
        primary: '#ef4444',
        secondary: '#10b981',
        accent: '#3b82f6',
        bgDark1: '#0a0d0d',
        bgDark2: '#0f1f1d',
        tagline: '24/7 LIVE BROADCAST • NO DELAY',
        typeBadge: 'LIVE TV',
        ctaText: '🔴 WATCH LIVE BROADCAST',
        avatarShape: 'rect'
    },
    anime: {
        themeName: 'anime',
        primary: '#f43f5e',
        secondary: '#06b6d4',
        accent: '#a855f7',
        bgDark1: '#0f0714',
        bgDark2: '#1c0c27',
        tagline: 'ANIME SIMULCAST • SUB & DUB HD',
        typeBadge: 'ANIME',
        ctaText: '▶ STREAM ANIME FREE',
        avatarShape: 'rect'
    },
    home: {
        themeName: 'home',
        primary: '#00e5ff',
        secondary: '#8b5cf6',
        accent: '#10b981',
        bgDark1: '#060714',
        bgDark2: '#0f1026',
        tagline: 'SLFLIX PRO STREAMING PLATFORM',
        typeBadge: 'FREE STREAMING',
        ctaText: '▶ EXPLORE 10,000+ TITLES',
        avatarShape: 'rect'
    },
    novel: {
        themeName: 'novel',
        primary: '#38bdf8',
        secondary: '#c084fc',
        accent: '#f472b6',
        bgDark1: '#070913',
        bgDark2: '#121226',
        tagline: 'SLFLIX NOVEL HUB • IMMERSIVE E-READER',
        typeBadge: 'WEB NOVEL',
        ctaText: '📖 START READING ONLINE',
        avatarShape: 'circle'
    }
};

/**
 * Generate rich OpenGraph SVG
 */
export function buildOgSvg(options = {}) {
    let themeType = options.theme || (options.isTv ? 'tv' : (options.isStaff ? 'staff' : (options.isLive ? 'live' : 'movie')));
    if (!THEME_CONFIGS[themeType]) themeType = 'movie';
    const theme = THEME_CONFIGS[themeType];

    const rawTitle = (options.title || (themeType === 'staff' ? 'Hollywood Star' : 'SLFLIX Premier')).trim();
    const titleEscaped = escapeXml(rawTitle);

    // Dynamic title typography calculation
    let titleLines = [];
    let titleFontSize = 50;
    if (rawTitle.length > 34) {
        titleFontSize = 38;
        titleLines = wrapText(rawTitle, 26, 2);
    } else if (rawTitle.length > 20) {
        titleFontSize = 44;
        titleLines = wrapText(rawTitle, 21, 2);
    } else {
        titleFontSize = 50;
        titleLines = [titleEscaped];
    }

    const isTwoLineTitle = titleLines.length > 1;

    // Rating value with star handling
    let rawRating = options.rating;
    if (!rawRating || rawRating === '0' || rawRating === 'N/A' || rawRating === '0.0') {
        rawRating = themeType === 'staff' ? 'TOP STAR' : '8.2';
    }
    const ratingText = escapeXml(String(rawRating));

    // Release year, type, quality, audio
    const yearText = escapeXml(options.year || (themeType === 'staff' ? 'CAREER' : '2026'));
    const durationText = escapeXml(options.duration || (options.isTv ? 'ALL SEASONS' : (themeType === 'staff' ? 'HOLLYWOOD' : '4K HDR')));
    const qualityText = escapeXml(options.quality || (themeType === 'live' ? '60 FPS' : '4K ULTRA HD'));
    const audioText = escapeXml(options.audio || (themeType === 'staff' ? 'FEATURED' : 'DOLBY AUDIO'));
    const typeLabel = escapeXml(options.typeLabel || (options.role ? options.role.toUpperCase() : theme.typeBadge));

    // Genres / Roles row
    const defaultGenres = themeType === 'staff' ? ['Actor', 'Filmography'] : (themeType === 'live' ? ['Live TV', 'Sports'] : ['Action', 'Drama', 'Cinema']);
    const rawGenres = (options.genre || '').split(/[,/|]+/).map(s => s.trim()).filter(Boolean).slice(0, 3);
    const genrePills = rawGenres.length > 0 ? rawGenres : defaultGenres;

    // Synopsis / Description wrapping
    const maxSynopsisLines = isTwoLineTitle ? 3 : 4;
    const defaultDesc = themeType === 'staff'
        ? `Explore the complete filmography, upcoming releases, and classic performances starring ${rawTitle} in ultra-high definition on SLFLIX.`
        : (themeType === 'live'
            ? `Watch ${rawTitle} live stream around the clock with zero buffering, multi-language commentary, and crystal clear 60FPS video.`
            : `Watch ${rawTitle} online free in ultra-high definition with multi-subtitles and zero interruptions on the official SLFLIX platform.`);
    let rawDesc = (options.description || options.synopsis || '').trim();
    if (!rawDesc || rawDesc.length < 5) {
        rawDesc = defaultDesc;
    }
    const descLines = wrapText(rawDesc, 52, maxSynopsisLines);

    const isCircleAvatar = theme.avatarShape === 'circle';
    const posterUri = options.posterDataUri || '';

    // Vertical spacing math
    const titleStartY = 65;
    const badgesY = isTwoLineTitle ? 172 : 140;
    const genresY = isTwoLineTitle ? 228 : 196;
    const synopsisBoxY = isTwoLineTitle ? 272 : 242;
    const synopsisBoxHeight = isTwoLineTitle ? 138 : 155;
    const ctaY = isTwoLineTitle ? 425 : 412;

    return `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.bgDark1}" />
      <stop offset="50%" stop-color="${theme.bgDark2}" />
      <stop offset="100%" stop-color="${theme.bgDark1}" />
    </linearGradient>

    <!-- Theme Brand Gradient -->
    <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.primary}" />
      <stop offset="100%" stop-color="${theme.secondary}" />
    </linearGradient>

    <!-- Button Glow Gradient -->
    <linearGradient id="btnGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.primary}" />
      <stop offset="100%" stop-color="${theme.accent}" />
    </linearGradient>

    <!-- Card Drop Shadow -->
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="22" flood-color="#000000" flood-opacity="0.88" />
    </filter>

    <!-- Ambient Glow Filter -->
    <filter id="glowBlur" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="65" />
    </filter>

    <!-- Poster Rectangular Clip -->
    <clipPath id="rectPosterClip">
      <rect x="60" y="50" width="360" height="530" rx="24" />
    </clipPath>

    <!-- Staff Circular Avatar Clip -->
    <clipPath id="circlePosterClip">
      <circle cx="240" cy="315" r="165" />
    </clipPath>

    <!-- Subtle Tech Grid -->
    <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" stroke-width="0.5" stroke-opacity="0.04" />
    </pattern>
  </defs>

  <!-- Deep Canvas Backdrop -->
  <rect width="1200" height="630" fill="url(#bgGrad)" />
  <rect width="1200" height="630" fill="url(#gridPattern)" />

  <!-- Themed Ambient Glow Orbs -->
  <circle cx="1100" cy="100" r="300" fill="${theme.primary}" fill-opacity="0.12" filter="url(#glowBlur)" />
  <circle cx="180" cy="530" r="280" fill="${theme.secondary}" fill-opacity="0.10" filter="url(#glowBlur)" />
  <circle cx="650" cy="315" r="240" fill="${theme.accent}" fill-opacity="0.06" filter="url(#glowBlur)" />

  <!-- LEFT COLUMN: Poster / Portrait Card -->
  <g filter="url(#cardShadow)">
    ${isCircleAvatar ? `
      <!-- Double Gold Halo Rings for Staff / Celebrity -->
      <circle cx="240" cy="315" r="178" fill="none" stroke="url(#primaryGrad)" stroke-width="4" stroke-opacity="0.9" />
      <circle cx="240" cy="315" r="168" fill="#14141d" stroke="white" stroke-opacity="0.2" stroke-width="1.5" />
      ${posterUri ? `<image href="${posterUri}" x="75" y="150" width="330" height="330" preserveAspectRatio="xMidYMid slice" clip-path="url(#circlePosterClip)" />` : `
        <circle cx="240" cy="275" r="60" fill="${theme.primary}" fill-opacity="0.2" />
        <text x="240" y="295" font-family="Liberation Sans, sans-serif" font-size="70" font-weight="bold" fill="${theme.primary}" text-anchor="middle">★</text>
      `}
      <!-- Staff Role Pill Below Avatar -->
      <g transform="translate(145, 505)">
        <rect width="190" height="40" rx="12" fill="#0c0d18" stroke="${theme.primary}" stroke-width="1.5" />
        <text x="95" y="26" font-family="Liberation Sans, sans-serif" font-size="15" font-weight="bold" fill="${theme.primary}" text-anchor="middle" letter-spacing="1.5">${typeLabel}</text>
      </g>
    ` : `
      <!-- Standard Poster Frame for Movie / TV / Live -->
      <rect x="60" y="50" width="360" height="530" rx="24" fill="#0e101f" stroke="${theme.primary}" stroke-opacity="0.3" stroke-width="2" />
      ${posterUri ? `<image href="${posterUri}" x="60" y="50" width="360" height="530" preserveAspectRatio="xMidYMid slice" clip-path="url(#rectPosterClip)" />` : `
        <!-- Fallback Poster Artwork when no image -->
        <rect x="60" y="50" width="360" height="530" rx="24" fill="#0e101f" />
        <circle cx="240" cy="280" r="70" fill="url(#primaryGrad)" fill-opacity="0.2" />
        <polygon points="225,250 270,280 225,310" fill="${theme.primary}" />
        <text x="240" y="390" font-family="Liberation Sans, sans-serif" font-size="22" font-weight="bold" fill="#ffffff" text-anchor="middle">SLFLIX PRO</text>
        <text x="240" y="420" font-family="Liberation Sans, sans-serif" font-size="14" fill="#64748b" text-anchor="middle">ULTRA HD STREAMING</text>
      `}
      <!-- Top Quality Badge on Poster -->
      <g transform="translate(76, 68)">
        <rect width="120" height="34" rx="10" fill="#000000" fill-opacity="0.82" stroke="${theme.primary}" stroke-width="1.2" stroke-opacity="0.8" />
        <text x="60" y="22" font-family="Liberation Sans, sans-serif" font-size="13" font-weight="bold" fill="${theme.primary}" text-anchor="middle" letter-spacing="1.2">${qualityText}</text>
      </g>
      <!-- Bottom Live / Status Badge on Poster -->
      <g transform="translate(76, 530)">
        <rect width="140" height="34" rx="10" fill="${theme.primary}" fill-opacity="0.9" />
        <text x="70" y="22" font-family="Liberation Sans, sans-serif" font-size="13" font-weight="bold" fill="#000000" text-anchor="middle" letter-spacing="1">▶ 4K STREAM</text>
      </g>
    `}
  </g>

  <!-- RIGHT COLUMN: Rich Media Content -->
  <g transform="translate(450, 48)">
    <!-- Top Header Bar: Category Tag & Platform Logo -->
    <g transform="translate(0, 0)">
      <!-- Tagline Pill -->
      <rect x="0" y="0" width="290" height="36" rx="18" fill="${theme.primary}" fill-opacity="0.15" stroke="${theme.primary}" stroke-opacity="0.5" stroke-width="1.2" />
      <text x="18" y="23" font-family="Liberation Sans, sans-serif" font-size="13" font-weight="bold" fill="${theme.primary}" letter-spacing="2.2">${escapeXml(theme.tagline)}</text>

      <!-- Top Right Watermark Brand Badge -->
      <g transform="translate(520, -2)">
        <rect width="130" height="42" rx="12" fill="#0d1021" stroke="${theme.primary}" stroke-opacity="0.3" stroke-width="1.5" />
        <!-- Sleek Play Logo Mark -->
        <rect x="10" y="9" width="24" height="24" rx="6" fill="url(#primaryGrad)" />
        <polygon points="19,16 27,21 19,26" fill="#000000" />
        <text x="42" y="26" font-family="Liberation Sans, sans-serif" font-size="14" font-weight="bold" fill="#ffffff" letter-spacing="1">SLFLIX</text>
        <rect x="96" y="14" width="26" height="15" rx="4" fill="${theme.primary}" fill-opacity="0.25" />
        <text x="109" y="25" font-family="Liberation Sans, sans-serif" font-size="9" font-weight="bold" fill="${theme.primary}" text-anchor="middle">PRO</text>
      </g>
    </g>

    <!-- Main Title -->
    <g transform="translate(0, 52)">
      ${titleLines.map((line, idx) => `
        <text x="0" y="${(idx + 1) * (titleFontSize + 4) - 4}" font-family="Liberation Sans, sans-serif" font-size="${titleFontSize}" font-weight="bold" fill="#ffffff">${line}</text>
      `).join('')}
    </g>

    <!-- Key Badges Row: Rating, Year, Content Type, Audio, Duration -->
    <g transform="translate(0, ${badgesY})">
      <!-- IMDb Rating Badge with Bold Star -->
      <g>
        <rect x="0" y="0" width="112" height="44" rx="12" fill="url(#primaryGrad)" />
        <text x="56" y="28" font-family="Liberation Sans, sans-serif" font-size="18" font-weight="bold" fill="#000000" text-anchor="middle">★ ${ratingText}</text>
      </g>

      <!-- Year / Release Badge -->
      <g transform="translate(124, 0)">
        <rect width="95" height="44" rx="12" fill="#151932" stroke="white" stroke-opacity="0.25" stroke-width="1.2" />
        <text x="47" y="28" font-family="Liberation Sans, sans-serif" font-size="17" font-weight="bold" fill="#ffffff" text-anchor="middle">${yearText}</text>
      </g>

      <!-- Content Type Badge -->
      <g transform="translate(231, 0)">
        <rect width="130" height="44" rx="12" fill="#151932" stroke="white" stroke-opacity="0.25" stroke-width="1.2" />
        <text x="65" y="28" font-family="Liberation Sans, sans-serif" font-size="15" font-weight="bold" fill="#ffffff" text-anchor="middle">${typeLabel}</text>
      </g>

      <!-- Audio / Features Badge -->
      <g transform="translate(373, 0)">
        <rect width="135" height="44" rx="12" fill="${theme.secondary}" fill-opacity="0.18" stroke="${theme.secondary}" stroke-opacity="0.6" stroke-width="1.2" />
        <text x="67" y="28" font-family="Liberation Sans, sans-serif" font-size="14" font-weight="bold" fill="${theme.secondary}" text-anchor="middle">${audioText}</text>
      </g>

      <!-- Duration Badge -->
      <g transform="translate(520, 0)">
        <rect width="130" height="44" rx="12" fill="#151932" stroke="white" stroke-opacity="0.18" stroke-width="1.2" />
        <text x="65" y="28" font-family="Liberation Sans, sans-serif" font-size="14" font-weight="bold" fill="#cbd5e1" text-anchor="middle">${durationText}</text>
      </g>
    </g>

    <!-- Genre Chips Row -->
    <g transform="translate(0, ${genresY})">
      <text x="0" y="21" font-family="Liberation Sans, sans-serif" font-size="13" font-weight="bold" fill="#94a3b8" letter-spacing="1.5">GENRES</text>
      <g transform="translate(85, 0)">
        ${genrePills.map((g, i) => `
          <g transform="translate(${i * 125}, 0)">
            <rect width="115" height="32" rx="10" fill="#161a30" stroke="${theme.primary}" stroke-opacity="0.3" stroke-width="1.2" />
            <text x="57" y="21" font-family="Liberation Sans, sans-serif" font-size="13" font-weight="bold" fill="#f1f5f9" text-anchor="middle">${escapeXml(g)}</text>
          </g>
        `).join('')}
      </g>
    </g>

    <!-- Synopsis / Plot Card Box -->
    <g transform="translate(0, ${synopsisBoxY})">
      <rect width="680" height="${synopsisBoxHeight}" rx="18" fill="#111428" fill-opacity="0.92" stroke="${theme.primary}" stroke-opacity="0.25" stroke-width="1.5" />
      <g transform="translate(24, 20)">
        <text x="0" y="10" font-family="Liberation Sans, sans-serif" font-size="12" font-weight="bold" fill="${theme.primary}" letter-spacing="2">SYNOPSIS &amp; PLOT</text>
        ${descLines.map((dLine, dIdx) => `
          <text x="0" y="${40 + (dIdx * 30)}" font-family="Liberation Sans, sans-serif" font-size="17" fill="#cbd5e1" font-weight="normal">${dLine}</text>
        `).join('')}
      </g>
    </g>

    <!-- Bottom CTA Button & Features Trust Bar -->
    <g transform="translate(0, ${ctaY})">
      <!-- Glowing CTA Button -->
      <rect width="260" height="50" rx="16" fill="url(#btnGrad)" />
      <text x="130" y="32" font-family="Liberation Sans, sans-serif" font-size="15" font-weight="bold" fill="#000000" text-anchor="middle" letter-spacing="1.2">${escapeXml(theme.ctaText)}</text>

      <!-- Trust Badges -->
      <g transform="translate(280, 30)">
        <text font-family="Liberation Sans, sans-serif" font-size="14" font-weight="bold" fill="#94a3b8">
          NO REGISTRATION <tspan fill="${theme.primary}">•</tspan> FAST SERVERS <tspan fill="${theme.primary}">•</tspan> 4K HDR
        </text>
      </g>
    </g>
  </g>

  <!-- Bottom Slim Accent Border -->
  <rect x="0" y="624" width="1200" height="6" fill="url(#primaryGrad)" />
</svg>`;
}

/**
 * Render PNG Buffer with @resvg/resvg-js using pre-loaded Liberation Sans font buffers
 */
export async function renderOgPng(options = {}, cacheKey = '') {
    if (cacheKey && ogCache.has(cacheKey)) {
        return ogCache.get(cacheKey);
    }

    // Fetch poster/avatar image data URI if provided as remote URL
    if (options.posterUrl && !options.posterDataUri) {
        options.posterDataUri = await fetchImageDataUri(options.posterUrl);
    }

    const svg = buildOgSvg(options);

    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: 1200 },
        font: {
            fontBuffers: fontBuffers,
            defaultFontFamily: 'Liberation Sans',
            loadSystemFonts: true
        }
    });

    const pngBuffer = resvg.render().asPng();

    if (cacheKey) {
        if (ogCache.size >= MAX_CACHE_SIZE) {
            const firstKey = ogCache.keys().next().value;
            ogCache.delete(firstKey);
        }
        ogCache.set(cacheKey, pngBuffer);
    }

    return pngBuffer;
}
