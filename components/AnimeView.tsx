import React, { useState, useEffect } from 'react';
import { ApiService } from '../services/api';
import { AnimeItem } from '../types';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { ArrowLeft, Search, X, Play, Download, Sparkles, Film, Tv, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import AnimeThreeCanvas from './AnimeThreeCanvas';
import AnimeDetailView from './AnimeDetailView';

interface AnimeViewProps {
  onBack: () => void;
  onPlayStream?: (title: string, sources: any[], poster: string) => void;
}

const POPULAR_ANIME_SUGGESTIONS = [
  'Naruto',
  'One Piece',
  'Bleach',
  'Attack on Titan',
  'Jujutsu Kaisen',
  'Demon Slayer',
  'Solo Leveling',
  'Oshi no Ko'
];

export const AnimeView: React.FC<AnimeViewProps> = ({ onBack, onPlayStream }) => {
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [trending, setTrending] = useState<AnimeItem[]>([]);
  const [results, setResults] = useState<AnimeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<AnimeItem | null>(null);

  useEffect(() => {
    fetchHome();

    // Check if URL has ?url= for direct detail routing
    const params = new URLSearchParams(window.location.search);
    const detailUrl = params.get('url');
    if (detailUrl && (window.location.pathname.includes('/anime/detail') || window.location.pathname === '/anime')) {
      setSelectedItem({
        title: 'Anime Detail',
        link: detailUrl,
        image: ''
      });
      setViewMode('detail');
    }

    const handlePopState = (e: PopStateEvent) => {
      if (window.location.pathname === '/anime' || window.location.pathname === '/anime/') {
        setViewMode('list');
        setSelectedItem(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const fetchHome = async () => {
    setLoading(true);
    try {
      const data = await ApiService.getAnimeHome();
      setTrending(data.trending || []);
    } catch (err) {
      console.error('Failed to load anime home:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (searchQuery: string) => {
    const q = searchQuery.trim();
    if (!q) return;
    setQuery(q);
    setLoading(true);
    try {
      const data = await ApiService.searchAnime(q);
      setResults(data.results || []);
    } catch (err) {
      console.error('Search anime failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnimeClick = (item: AnimeItem) => {
    setSelectedItem(item);
    setViewMode('detail');
    window.history.pushState(
      { animeUrl: item.link }, 
      '', 
      `/anime/detail?url=${encodeURIComponent(item.link)}`
    );
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedItem(null);
    window.history.pushState({}, '', '/anime');
  };

  // If in Detail Mode, render the dedicated full-page view (NOT a pop-up)
  if (viewMode === 'detail' && selectedItem) {
    return (
      <AnimeDetailView
        animeItem={selectedItem}
        onBack={handleBackToList}
        onPlayStream={onPlayStream}
        onSelectOtherAnime={(newItem) => {
          setSelectedItem(newItem);
          window.history.pushState(
            { animeUrl: newItem.link }, 
            '', 
            `/anime/detail?url=${encodeURIComponent(newItem.link)}`
          );
        }}
        otherAnime={trending.filter((t) => t.link !== selectedItem.link)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#060714] text-white pb-32 animate-fade-in relative overflow-x-hidden">
      {/* 3D Hero Animated Canvas Background */}
      <div className="relative h-72 md:h-96 w-full overflow-hidden border-b border-white/10 bg-gradient-to-b from-[#0e0f2b] to-[#060714]">
        <AnimeThreeCanvas className="w-full h-full absolute inset-0 z-0" variant="cyber" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060714] via-[#060714]/60 to-transparent z-10" />

        <div className="relative z-20 max-w-7xl mx-auto px-4 md:px-8 h-full flex flex-col justify-end pb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="w-11 h-11 rounded-2xl bg-white/10 hover:bg-primary hover:text-black border border-white/15 flex items-center justify-center transition-all shadow-xl backdrop-blur-md cursor-pointer"
                title="Back to Home"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/40 text-primary text-[11px] font-black uppercase tracking-wider mb-1.5">
                  <Sparkles size={12} />
                  <span>Anime Stream & Download Hub</span>
                </div>
                <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white flex items-center gap-2">
                  SL<span className="text-primary drop-shadow-[0_0_15px_rgba(0,229,255,0.6)]">ANIME</span>
                  <span className="text-xs bg-gradient-to-r from-primary to-purple-500 text-black font-extrabold px-2.5 py-0.5 rounded-lg ml-1">PRO</span>
                </h1>
              </div>
            </div>

            {/* Quick Refresh */}
            <button
              onClick={() => { setResults([]); setQuery(''); fetchHome(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-300 hover:text-white transition-all backdrop-blur-md cursor-pointer"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span>Refresh Library</span>
            </button>
          </div>

          {/* Search Input Bar */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSearch(query); }}
            className="relative max-w-2xl w-full mt-2"
          >
            <div className="relative flex items-center">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search anime (e.g. Naruto, Bleach, One Piece)..."
                className="w-full bg-white/10 hover:bg-white/15 focus:bg-[#121324] border border-white/20 focus:border-primary rounded-2xl py-3.5 pl-12 pr-28 text-sm text-white placeholder-gray-400 outline-none backdrop-blur-xl transition-all shadow-2xl"
              />
              <Search className="absolute left-4 text-primary" size={18} />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); setResults([]); }}
                  className="absolute right-24 text-gray-400 hover:text-white p-1"
                >
                  <X size={16} />
                </button>
              )}
              <button
                type="submit"
                className="absolute right-2 px-5 py-2 rounded-xl bg-primary hover:bg-white text-black font-extrabold text-xs transition-all shadow-[0_0_15px_rgba(0,229,255,0.4)] cursor-pointer"
              >
                Search
              </button>
            </div>

            {/* Suggestions Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-2 mt-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex-shrink-0 mr-1">Popular:</span>
              {POPULAR_ANIME_SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => handleSearch(sug)}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/40 text-[11px] font-semibold text-gray-300 hover:text-primary whitespace-nowrap transition-all flex-shrink-0 cursor-pointer"
                >
                  {sug}
                </button>
              ))}
            </div>
          </form>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8">
        {/* Search Results Header */}
        {results.length > 0 && (
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-7 bg-primary rounded-full" />
              <h2 className="text-2xl font-bold text-white">
                Results for <span className="text-primary">"{query}"</span>
              </h2>
              <span className="text-xs text-gray-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                {results.length} found
              </span>
            </div>
            <button
              onClick={() => { setResults([]); setQuery(''); }}
              className="text-xs text-gray-400 hover:text-white underline font-bold cursor-pointer"
            >
              Clear search
            </button>
          </div>
        )}

        {/* Skeleton Loading State Grid */}
        {loading ? (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-2 h-7 bg-primary/40 rounded-full animate-pulse" />
                <div className="h-6 w-52 rounded-lg skeleton-shimmer" />
              </div>
              <div className="h-5 w-28 rounded-full skeleton-shimmer hidden sm:block" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div
                  key={idx}
                  className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-xl"
                >
                  <div className="relative aspect-[3/4] overflow-hidden skeleton-shimmer">
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/40 border border-white/10 w-16 h-4 skeleton-shimmer" />
                  </div>
                  <div className="p-3 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-1.5">
                      <div className="h-3 w-4/5 rounded skeleton-shimmer" />
                      <div className="h-3 w-3/5 rounded skeleton-shimmer" />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <div className="h-2.5 w-14 rounded skeleton-shimmer" />
                      <div className="h-2.5 w-10 rounded skeleton-shimmer" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Anime Grid (Results or Trending) */}
            {results.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
                {results.map((item, idx) => (
                  <AnimeCard key={`${item.link}-${idx}`} item={item} onClick={() => handleAnimeClick(item)} />
                ))}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-7 bg-primary rounded-full" />
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                      <Film size={20} className="text-primary" />
                      <span>Featured & Latest Anime Releases</span>
                    </h2>
                  </div>
                  <span className="text-xs text-gray-400">{trending.length} titles available</span>
                </div>

                {trending.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
                    {trending.map((item, idx) => (
                      <AnimeCard key={`${item.link}-${idx}`} item={item} onClick={() => handleAnimeClick(item)} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-24 bg-white/5 rounded-3xl border border-white/10 p-8">
                    <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto mb-4 text-2xl">
                      <Tv size={28} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">No Anime Available Currently</h3>
                    <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
                      Could not reach Nimegami anime servers. Try searching for a specific title above.
                    </p>
                    <button
                      onClick={() => handleSearch('Naruto')}
                      className="px-6 py-2.5 rounded-xl bg-primary text-black font-bold text-xs hover:bg-white transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] cursor-pointer"
                    >
                      Search Popular Anime
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Anime Card Sub-Component
const AnimeCard: React.FC<{ item: AnimeItem; onClick: () => void }> = ({ item, onClick }) => {
  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary/50 rounded-2xl overflow-hidden cursor-pointer flex flex-col transition-all shadow-xl"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-black/40">
        <LazyLoadImage
          src={item.image}
          alt={item.title}
          effect="blur"
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          wrapperClassName="w-full h-full"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
          <div className="w-9 h-9 rounded-full bg-primary text-black flex items-center justify-center shadow-lg shadow-primary/40 font-bold">
            <Play size={16} className="translate-x-0.5 fill-black" />
          </div>
        </div>
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/20 text-[10px] font-mono font-bold text-primary">
          SUB INDO
        </div>
      </div>
      <div className="p-3 flex-1 flex flex-col justify-between">
        <h3 className="text-xs font-bold text-white line-clamp-2 group-hover:text-primary transition-colors leading-snug">
          {item.title}
        </h3>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[10px] text-gray-400">
          <span className="flex items-center gap-1 text-primary font-bold">
            <Tv size={11} /> Sub Indo
          </span>
          <span className="font-semibold text-gray-500 hover:text-white flex items-center gap-1">
            <Download size={10} /> MP4
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default AnimeView;
