import React, { useState, useEffect, useRef, useCallback, Suspense, Component, ErrorInfo } from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { ApiService, RANKING_CATEGORIES } from './services/api';
import { updateMetaTags, resetToHomeSEO } from './services/seo';
import { CategoryData, MovieResult, VideoSource, Subtitle, ImdbSuggestion, MovieDub } from './types';
import Loader from './components/Loader';
import MovieCard from './components/MovieCard';
import HomePage from './components/HomePage';
import NetworkStatusNotifier from './components/NetworkStatusNotifier';
import PWAInstallButton from './components/PWAInstallButton';
import { Dock, DockIcon, DockItem, DockLabel } from "./components/Dock";
import SearchView from './components/SearchView';
const VideoPlayer = React.lazy(() => import('./components/VideoPlayer'));
const LiveTv = React.lazy(() => import('./components/LiveTv'));
const LiveTvStreamPlayer = React.lazy(() => import('./components/LiveTvStreamPlayer'));
const NewsView = React.lazy(() => import('./components/NewsView'));
const AnimeView = React.lazy(() => import('./components/AnimeView'));
const AdultView = React.lazy(() => import('./components/AdultView'));
const ApiDocsView = React.lazy(() => import('./components/ApiDocsView'));
const StaffView = React.lazy(() => import('./components/StaffView'));
const NovelHubView = React.lazy(() => import('./components/NovelHubView').then(m => ({ default: m.NovelHubView })));
const WatchPartyView = React.lazy(() => import('./components/WatchPartyView').then(m => ({ default: m.WatchPartyView })));
import { useHomeData } from './hooks/useHomeData';
import { useMovieDetails } from './hooks/useMovieDetails';
import { getOptimizedImageUrl, DEFAULT_FAVICON_FALLBACK } from './utils/image';

declare const io: any;
import { 
  StarIcon, PlayIcon, PlusIcon, ShareIcon, BackIcon,
  ChevronRightIcon, CalendarIcon, TagIcon, HeartIcon, FilmIcon, TvIcon, 
  GlobeIcon, EpisodeIcon, InfoIcon, YoutubeIcon, CheckIcon, SpinnerIcon, CopyIcon
} from './components/Icons';
import { RetroTvError } from './components/RetroTvError';

export class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a15] flex flex-col items-center justify-center p-4">
          <RetroTvError errorCode="500" errorMessage="SYS FAULT" />
          <p className="mt-8 text-gray-400 font-mono text-xs max-w-lg text-center break-all">
            {this.state.error?.toString()}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-2 bg-primary text-black font-bold rounded-lg hover:scale-105 transition-transform"
          >
            REBOOT SYSTEM
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
interface SearchState {
    query: string;
    results: MovieResult[];
    loading: boolean;
    hasMore: boolean;
    nextPage: number;
    loadingMore: boolean;
}
interface ToastState {
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
    timeoutId?: ReturnType<typeof setTimeout>;
}
const Toast: React.FC<ToastState> = ({ show, message, type }) => {
    if (!show) return null;
    const colors = { success: 'border-primary', error: 'border-red-500', info: 'border-blue-500' };
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const iconColors = { success: 'text-primary', error: 'text-red-500', info: 'text-blue-500' };
    return (
        <div className={`fixed top-20 right-4 z-[3000] animate-fade-in px-6 py-4 rounded-xl border ${colors[type]} bg-black/90 shadow-2xl backdrop-blur-md flex items-center gap-3`}>
            <i className={`fa-solid ${icons[type]} ${iconColors[type]}`}></i>
            <span className="font-semibold text-white text-sm">{message}</span>
        </div>
    );
};
const LoadingView: React.FC = () => (
    <div className="fixed inset-0 z-[5000] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in">
        <Loader />
    </div>
);
const SourceSelector: React.FC<{
    isOpen: boolean; 
    sources: VideoSource[]; 
    subtitles?: Subtitle[];
    onClose: () => void; 
    onSelect: (source: VideoSource) => void;
    onToast: (msg: string) => void;
}> = ({ isOpen, sources, subtitles, onClose, onSelect, onToast }) => {
    const [downloading, setDownloading] = useState<string | null>(null);
    if (!isOpen) return null;
    const handleDownload = (e: React.MouseEvent, source: VideoSource) => {
        e.stopPropagation();
        const link = source.download || source.direct || source.stream;
        if (link) {
            setDownloading(source.label || String(source.quality));
            onToast("Preparing download link...");
            const anchor = document.createElement('a');
            anchor.href = link;
            anchor.target = '_blank';
            anchor.setAttribute('download', '');
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            setTimeout(() => setDownloading(null), 3000);
        }
    };
    return (
        <div className="fixed inset-0 z-[2500] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-[#12121a] border border-white/10 rounded-3xl w-full max-w-lg p-0 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] overflow-hidden transition-all transform scale-100" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-primary/10 to-transparent">
                    <div>
                        <h3 className="text-2xl font-black text-white tracking-tight">Watch Options</h3>
                        <p className="text-gray-500 text-xs mt-1 uppercase tracking-widest font-bold">Choose Quality</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all">
                        <i className="fa-solid fa-times"></i>
                    </button>
                </div>
                <div className="p-6 space-y-6">
                    {subtitles && subtitles.length > 0 && (
                        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                                <i className="fa-solid fa-closed-captioning"></i>
                            </div>
                            <div>
                                <p className="text-white font-bold text-sm">Subtitles Available</p>
                                <p className="text-primary/70 text-xs font-medium">{subtitles.length} languages detected</p>
                            </div>
                        </div>
                    )}
                    <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        {sources.map((s, i) => (
                            <div key={i} className="group flex items-center gap-2 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                                <button 
                                    onClick={() => onSelect(s)} 
                                    className="flex-1 flex items-center gap-4 bg-white/5 hover:bg-primary/10 border border-white/10 hover:border-primary/30 p-4 rounded-2xl transition-all relative overflow-hidden"
                                >
                                    <div className={`w-14 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-inner ${
                                        parseInt(String(s.quality)) >= 1080 ? 'bg-primary text-black' : 
                                        parseInt(String(s.quality)) >= 720 ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400'
                                    }`}>
                                        {String(s.quality).toUpperCase().replace('P', '')}P
                                    </div>
                                    <div className="text-left">
                                        <p className="text-white font-bold text-sm flex items-center gap-2">
                                            Play Stream
                                            {s.type === 'hls' && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded uppercase">HLS</span>}
                                        </p>
                                        <p className="text-gray-500 text-xs font-medium">{s.size || 'Auto-select server'}</p>
                                    </div>
                                    <div className="ml-auto w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <i className="fa-solid fa-play text-primary text-xs"></i>
                                    </div>
                                </button>
                                <div className="flex flex-col items-center gap-1.5 min-w-[56px]">
                                    <button 
                                        onClick={(e) => handleDownload(e, s)} 
                                        className={`w-14 h-12 rounded-2xl flex items-center justify-center transition-all ${
                                            downloading === (s.label || String(s.quality)) 
                                            ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' 
                                            : 'bg-white/5 text-gray-400 hover:bg-emerald-500/20 hover:text-emerald-500 border border-white/10 hover:border-emerald-500/30'
                                        }`}
                                        disabled={!!downloading}
                                        title="Download"
                                    >
                                        {downloading === (s.label || String(s.quality)) ? (
                                            <i className="fa-solid fa-circle-notch fa-spin text-xl"></i>
                                        ) : (
                                            <i className="fa-solid fa-download text-xl"></i>
                                        )}
                                    </button>
                                    {s.size && (
                                        <span className="text-[10px] font-black text-emerald-500/70 tracking-tighter uppercase whitespace-nowrap">
                                            {s.size}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="p-6 bg-black/20 border-t border-white/5 text-center">
                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">
                        Server: <span className="text-primary">Omegatech Pro</span> • Type: <span className="text-primary">Multi-CDN</span>
                    </p>
                </div>
            </div>
        </div>
    );
};
const Footer: React.FC = () => {
    const currentYear = new Date().getFullYear();
    return (
        <footer className="bg-[#0a0a15] border-t border-white/10 mt-auto pt-12 pb-8 px-[4%]">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col items-center text-center gap-6 mb-8">
                    <div className="text-3xl font-extrabold text-white">SL<span className="text-primary">FLIX</span></div>
                    <p className="text-gray-400 text-sm max-w-md">Your ultimate destination for streaming movies, series, and more. No ads, just entertainment.</p>
                </div>
                <div className="border-t border-white/10 pt-6 flex flex-col items-center gap-4">
                    <p className="text-gray-500 text-xs">© {currentYear} SLFLIX. All rights reserved.</p>
                    <p className="text-gray-400 text-sm">Powered by <span className="text-primary font-bold">SLFLIX</span></p>
                </div>
            </div>
        </footer>
    );
};
const RankingBadge: React.FC<{ rank: number }> = ({ rank }) => {
    const getBadgeStyle = () => {
        if (rank === 1) return { bg: 'bg-yellow-500', text: 'text-black', shadow: 'shadow-yellow-500/50' };
        else if (rank === 2) return { bg: 'bg-gray-400', text: 'text-black', shadow: 'shadow-gray-400/50' };
        else if (rank === 3) return { bg: 'bg-amber-700', text: 'text-white', shadow: 'shadow-amber-700/50' };
        return { bg: 'bg-white/10', text: 'text-white', shadow: '' };
    };
    const style = getBadgeStyle();
    return <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg ${style.bg} ${style.text} flex items-center justify-center font-bold text-sm md:text-lg shadow-lg ${style.shadow}`}>{rank}</div>;
};
const ToplistView: React.FC<{ initialCategory?: string; onMovieClick: (m: MovieResult) => void; onBack: () => void; }> = ({ initialCategory = 'trending', onMovieClick, onBack }) => {
    const [selectedCategory, setSelectedCategory] = useState(initialCategory);
    const [movies, setMovies] = useState<MovieResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(1);
    const [categoryTitle, setCategoryTitle] = useState('');
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const loadMovies = useCallback(async (cat: string, pageNum: number, append = false) => {
        if (pageNum === 1) setLoading(true);
        try {
            const data = await ApiService.getRankingList(cat, pageNum);
            if (append) setMovies(prev => [...prev, ...data.results]);
            else setMovies(data.results);
            setCategoryTitle(data.title);
            setHasMore(data.hasMore);
            setPage(pageNum);
        } catch (e) {
            console.error("Failed to load ranking list:", e);
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        setLoading(true);
        setMovies([]);
        setPage(1);
        ApiService.getRankingList(selectedCategory, 1).then(data => {
            setMovies(data.results);
            setCategoryTitle(data.title);
            setHasMore(data.hasMore);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [selectedCategory]);
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore && !loading) {
                loadMovies(selectedCategory, page + 1, true);
            }
        }, { threshold: 0.1 });
        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [hasMore, loading, selectedCategory, page, loadMovies]);
    const scrollRef = useRef<HTMLDivElement>(null);
    return (
        <div className="flex flex-col md:flex-row min-h-[calc(100vh-64px)] pt-4 animate-fade-in">
            <div className="w-full md:w-64 flex-shrink-0 md:border-r border-white/10 pr-0 md:pr-4 mb-4 md:mb-0">
                <div className="sticky top-20">
                    <div className="flex items-center gap-2 mb-4 px-4 md:px-0">
                        <button onClick={onBack} className="md:hidden text-gray-400 hover:text-white"><i className="fa-solid fa-arrow-left text-xl"></i></button>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2"><i className="fa-solid fa-chart-line text-primary"></i> Top List</h2>
                    </div>
                    <div className="space-y-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                        {RANKING_CATEGORIES.map((cat) => (
                            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`w-full md:w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${selectedCategory === cat.id ? 'bg-primary text-black font-bold' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}>
                                <i className={`fa-solid ${cat.icon} ${selectedCategory === cat.id ? '' : 'text-gray-500'}`}></i>
                                <span className="text-sm truncate">{cat.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="flex-1 px-4 md:pl-6 pb-24" ref={scrollRef}>
                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">{categoryTitle || RANKING_CATEGORIES.find(c => c.id === selectedCategory)?.name}<span className="text-gray-500 text-sm font-normal">({movies.length} items)</span></h3>
                {loading && page === 1 ? <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div> : movies.length > 0 ? (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {movies.map((movie, index) => (
                                <div key={index} className="flex items-start gap-3 bg-white/5 hover:bg-white/10 rounded-xl p-2 transition-all cursor-pointer group" onClick={() => onMovieClick(movie)}>
                                    <RankingBadge rank={index + 1} />
                                    <div className="flex-1 min-w-0">
                                        <div className="w-16 h-20 md:w-20 md:h-28 rounded-lg overflow-hidden flex-shrink-0 shadow-lg">
                                            <LazyLoadImage src={getOptimizedImageUrl(movie.cover, 200)} alt={movie.title} effect="blur" className="w-full h-full object-cover" wrapperClassName="w-full h-full" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_FAVICON_FALLBACK; }} />
                                        </div>
                                        <h4 className="text-white text-xs font-medium mt-2 truncate group-hover:text-primary transition-colors">{movie.title}</h4>
                                        <p className="text-gray-500 text-[10px]">{movie.releaseDate?.split('-')[0]}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div ref={loadMoreRef} className="flex justify-center py-8">
                            {loading && <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>}
                            {!hasMore && movies.length > 0 && <p className="text-gray-500 text-xs uppercase tracking-wider font-bold">No more content</p>}
                        </div>
                    </>
                ) : <div className="text-center py-20"><div className="text-6xl mb-4 text-gray-600"><i className="fa-solid fa-film"></i></div><p className="text-gray-400 text-lg">No content available</p></div>}
            </div>
        </div>
    );
};
const Navbar: React.FC<{ 
    onSearch: (q: string) => void, 
    onHome: () => void, 
    onToplist: () => void, 
    onLiveTv: () => void, 
    onNews: () => void, 
    onAnime: () => void, 
    onNovels: () => void,
    onWatchParty: () => void,
    onAdult?: () => void, 
    isSearchOpen: boolean, 
    setIsSearchOpen: (v: boolean) => void, 
    trendingKeywords: string[], 
    recentSearches: string[],
    onClearRecentSearches: () => void,
    currentView: string 
}> = ({ 
    onSearch, 
    onHome, 
    onToplist, 
    onLiveTv, 
    onNews, 
    onAnime, 
    onNovels,
    onWatchParty,
    onAdult, 
    isSearchOpen, 
    setIsSearchOpen, 
    trendingKeywords, 
    recentSearches,
    onClearRecentSearches,
    currentView 
}) => {
    const [val, setVal] = useState('');
    const [suggestions, setSuggestions] = useState<ImdbSuggestion[]>([]);
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (val.trim().length > 2) {
                const suggs = await ApiService.getImdbSuggestions(val);
                setSuggestions(suggs);
            } else { setSuggestions([]); }
        }, 300);
        return () => clearTimeout(timer);
    }, [val]);
    const submit = (q: string) => {
        const query = q.trim();
        if (!query) return;
        onSearch(query);
        setIsSearchOpen(false);
        setVal('');
        setSuggestions([]);
    };
    return (
        <>
            <nav className="sticky top-0 z-[100] bg-[#0a0a15]/95 backdrop-blur-md px-[4%] h-16 flex justify-between items-center border-b border-white/5 pt-safe">
                <div className="flex items-center gap-4">
                    <button onClick={onHome} className="text-xl font-extrabold text-white flex items-center gap-1 select-none">SL<span className="text-primary">FLIX</span></button>
                    <button onClick={onToplist} className={`hidden md:flex text-sm font-medium ${currentView === 'toplist' ? 'text-primary' : 'text-gray-300 hover:text-primary'}`}><i className="fa-solid fa-chart-line"></i><span>Top List</span></button>
                    <button onClick={onLiveTv} className={`hidden md:flex text-sm font-medium ${currentView === 'live-tv' ? 'text-primary' : 'text-gray-300 hover:text-primary'}`}><i className="fa-solid fa-satellite-dish"></i><span>Live TV</span></button>
                    <button onClick={onNews} className={`hidden md:flex text-sm font-medium ${currentView === 'news' ? 'text-primary' : 'text-gray-300 hover:text-primary'}`}><i className="fa-solid fa-newspaper"></i><span>News</span></button>
                    <button onClick={onAnime} className={`hidden md:flex text-sm font-medium ${currentView === 'anime' ? 'text-primary' : 'text-gray-300 hover:text-primary'}`}><i className="fa-solid fa-tv text-primary"></i><span>Anime</span></button>
                    <button onClick={onNovels} className={`hidden md:flex text-sm font-medium items-center gap-1.5 ${currentView === 'novels' ? 'text-cyan-400' : 'text-gray-300 hover:text-cyan-400'}`}><i className="fa-solid fa-book-open text-cyan-400"></i><span>Novels</span></button>
                    <button onClick={onWatchParty} className={`hidden md:flex text-sm font-medium items-center gap-1.5 ${currentView === 'watch-party' ? 'text-purple-400' : 'text-gray-300 hover:text-purple-400'}`}><i className="fa-solid fa-users-viewfinder text-purple-400"></i><span>Watch Party</span></button>
                    {onAdult && (
                        <button onClick={onAdult} className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all ${currentView === 'adult' ? 'bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-lg shadow-fuchsia-600/40' : 'bg-fuchsia-500/10 text-fuchsia-400 hover:bg-fuchsia-500/20 border border-fuchsia-500/30'}`}>
                            <i className="fa-solid fa-[#18]"></i>
                            <span>+18</span>
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <PWAInstallButton />
                    <button onClick={() => setIsSearchOpen(true)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-300 hover:text-primary transition-colors"><i className="fa-solid fa-search"></i></button>
                </div>
            </nav>
            {isSearchOpen && (
                <div className="fixed inset-0 z-[110] bg-[#0a0a15]/98 backdrop-blur-xl p-4 pt-safe animate-fade-in flex flex-col">
                    <div className="flex gap-4 mb-4">
                        <input autoFocus type="text" className="flex-1 bg-white/10 border-none rounded-full py-3 px-6 text-white outline-none focus:ring-2 focus:ring-primary" placeholder="Search movies, series, anime..." value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') submit(val); if(e.key === 'Escape') setIsSearchOpen(false); }} />
                        <button onClick={() => setIsSearchOpen(false)} className="text-white font-bold">Cancel</button>
                    </div>
                    <div className="flex-1 overflow-y-auto pb-10">
                        {val.trim().length === 0 && (
                            <>
                                {recentSearches && recentSearches.length > 0 && (
                                    <div className="mb-6 bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <i className="fa-solid fa-clock-rotate-left text-primary"></i> Recent Searches
                                            </h3>
                                            <button 
                                                type="button" 
                                                onClick={onClearRecentSearches} 
                                                className="text-[11px] font-bold text-gray-400 hover:text-red-400 transition-colors"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {recentSearches.map((term, i) => (
                                                <button 
                                                    key={i} 
                                                    onClick={() => submit(term)} 
                                                    className="bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/40 px-3.5 py-1.5 rounded-full text-xs font-semibold text-gray-200 hover:text-primary transition-all flex items-center gap-1.5"
                                                >
                                                    <i className="fa-solid fa-magnifying-glass text-[10px] opacity-60"></i>
                                                    <span>{term}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {trendingKeywords.length > 0 && (
                                    <div className="mb-8">
                                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2"><i className="fa-solid fa-fire text-orange-500"></i> Trending Searches</h3>
                                        <div className="flex flex-wrap gap-2">{trendingKeywords.map((k, i) => (<button key={i} onClick={() => submit(k)} className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full text-sm text-gray-300 transition-colors">{k}</button>))}</div>
                                    </div>
                                )}
                            </>
                        )}
                        {suggestions.length > 0 && (
                            <div className="space-y-1">
                                {suggestions.map(s => (
                                    <div key={s.id} onClick={() => submit(s.l)} className="flex items-center gap-3 p-3 hover:bg-white/10 rounded-lg cursor-pointer transition-colors group">
                                        <div className="w-10 h-14 bg-white/5 rounded-lg overflow-hidden flex-none">{s.i && <LazyLoadImage src={getOptimizedImageUrl(s.i.imageUrl, 100)} effect="blur" className="w-full h-full object-cover group-hover:scale-110 transition-transform" wrapperClassName="w-full h-full" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_FAVICON_FALLBACK; }} />}</div>
                                        <div className="flex-1"><div className="text-white font-bold text-sm leading-tight">{s.l}</div><div className="text-gray-500 text-[10px] mt-1">{s.q || 'Movie'} {s.y ? `• ${s.y}` : ''}</div></div>
                                        <i className="fa-solid fa-arrow-up-right-from-square text-gray-600 text-xs group-hover:text-primary"></i>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
const DetailsView: React.FC<{ movie: MovieResult, onBack: () => void,
    onFetchSources: (title: string, season: number, episode: number, subjectId?: string, detailPath?: string) => void, 
    onPlayTrailer: () => void, 
    onMovieClick: (m: MovieResult) => void, 
    onDubClick: (dub: MovieDub) => void,
    onStaffClick: (id: string, name: string, avatar?: string) => void,
    loading: boolean
}> = ({ movie, onBack, onFetchSources, onPlayTrailer, onMovieClick, onDubClick, onStaffClick, loading }) => {
    const [selectedSeason, setSelectedSeason] = useState(1);
    const [copied, setCopied] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [watchedProgress, setWatchedProgress] = useState<Record<string, any>>({});
    const loadProgress = () => {
        if (movie.subjectId) {
            const key = `slflix_progress_${movie.subjectId}`;
            const stored = localStorage.getItem(key);
            if (stored) {
                try {
                    setWatchedProgress(JSON.parse(stored));
                } catch (e) {}
            }
        }
    };
    useEffect(() => {
        loadProgress();
        window.addEventListener('slflix_progress_update', loadProgress);
        return () => window.removeEventListener('slflix_progress_update', loadProgress);
    }, [movie.subjectId]);
    const showToast = (message: string) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 3000);
    };
    const handleCopyLink = () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            showToast('Link copied!');
            setTimeout(() => setCopied(false), 2000);
        });
    };
    const isSeries = movie.type.includes('Series') || movie.type.includes('TV');
    const hasSeasons = movie.seasons && movie.seasons.length > 0;
    const currentSeasonData = movie.seasons?.find(s => s.seasonNumber === selectedSeason);
    const episodeCount = currentSeasonData?.episodeCount || 0;
    const showSeasons = hasSeasons;
    const [recPage, setRecPage] = useState(0);
    const recsPerPage = 6;
    const maxRecPages = movie.recommendations ? Math.ceil(movie.recommendations.length / recsPerPage) : 0;
    const currentRecs = movie.recommendations?.slice(recPage * recsPerPage, (recPage + 1) * recsPerPage) || [];
    if (!movie || loading || !movie.title || movie.title === "Loading...") {
        return (
            <div className="min-h-screen bg-[#0a0a15] animate-fade-in pb-20 relative">
                {/* Hero Backdrop & Poster Skeleton */}
                <div className="relative h-[40vh] md:h-[60vh] overflow-hidden">
                    <div className="absolute top-4 left-4 z-20">
                        <button onClick={onBack} className="bg-black/40 backdrop-blur-md border border-white/10 w-10 h-10 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors">
                            <BackIcon className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="absolute inset-0 skeleton-shimmer bg-[#0f1026]"></div>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a15] via-[#0a0a15]/50 to-transparent"></div>
                    <div className="absolute bottom-0 left-0 w-full p-[4%] flex flex-col md:flex-row items-end gap-6 z-10">
                        {/* Poster Card Skeleton */}
                        <div className="hidden md:block w-[200px] h-[280px] rounded-2xl skeleton-shimmer bg-white/10 border border-white/15 shadow-2xl flex-shrink-0"></div>
                        <div className="flex-1 space-y-4 w-full">
                            {/* Title Skeleton */}
                            <div className="h-9 md:h-12 w-3/4 max-w-lg rounded-xl skeleton-shimmer bg-white/15"></div>
                            {/* Metadata Badges Skeleton */}
                            <div className="flex items-center gap-3">
                                <div className="h-5 w-16 rounded-md skeleton-shimmer bg-white/10"></div>
                                <div className="h-5 w-14 rounded-md skeleton-shimmer bg-white/10"></div>
                                <div className="h-5 w-20 rounded-md skeleton-shimmer bg-white/10"></div>
                                <div className="h-5 w-24 rounded-md skeleton-shimmer bg-white/10"></div>
                            </div>
                            {/* Action Buttons Skeleton */}
                            <div className="flex gap-4 flex-wrap pt-2">
                                <div className="h-12 w-32 rounded-full skeleton-shimmer bg-primary/20 border border-primary/30"></div>
                                <div className="h-12 w-28 rounded-full skeleton-shimmer bg-white/10"></div>
                                <div className="h-12 w-28 rounded-full skeleton-shimmer bg-white/10"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Layout Grid */}
                <div className="px-[4%] mt-6 grid grid-cols-1 lg:grid-cols-3 gap-10">
                    {/* Left Column: Synopsis, Cast, Episodes */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Synopsis Skeleton */}
                        <div className="bg-[#1a1a2e]/60 p-6 rounded-2xl border border-white/5 space-y-3">
                            <div className="h-5 w-28 rounded skeleton-shimmer bg-white/15 mb-4"></div>
                            <div className="h-4 w-full rounded skeleton-shimmer bg-white/10"></div>
                            <div className="h-4 w-11/12 rounded skeleton-shimmer bg-white/10"></div>
                            <div className="h-4 w-4/5 rounded skeleton-shimmer bg-white/10"></div>
                        </div>

                        {/* Cast Row Skeleton */}
                        <div className="bg-[#1a1a2e]/60 p-6 rounded-2xl border border-white/5 space-y-4">
                            <div className="h-5 w-20 rounded skeleton-shimmer bg-white/15"></div>
                            <div className="flex gap-4 overflow-hidden">
                                {[1, 2, 3, 4, 5, 6].map(i => (
                                    <div key={i} className="flex-shrink-0 flex flex-col items-center gap-2">
                                        <div className="w-20 h-20 md:w-24 md:h-24 rounded-full skeleton-shimmer bg-white/10 border border-white/10"></div>
                                        <div className="h-3 w-16 rounded skeleton-shimmer bg-white/10"></div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Episodes Grid Skeleton */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="h-6 w-32 rounded skeleton-shimmer bg-white/15"></div>
                                <div className="h-8 w-44 rounded-full skeleton-shimmer bg-white/10"></div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(ep => (
                                    <div key={ep} className="bg-[#1a1a2e]/60 border border-white/10 p-4 rounded-xl space-y-2">
                                        <div className="h-3 w-14 rounded skeleton-shimmer bg-white/10"></div>
                                        <div className="h-6 w-8 rounded skeleton-shimmer bg-white/15"></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: "You Might Also Like" Recommendation Grid Skeleton */}
                    <div className="lg:col-span-1">
                        <div className="h-6 w-44 rounded skeleton-shimmer bg-white/15 mb-4"></div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="rounded-xl overflow-hidden bg-white/5 border border-white/5 flex flex-col">
                                    <div className="aspect-[2/3] skeleton-shimmer bg-white/10"></div>
                                    <div className="p-2.5 space-y-1.5">
                                        <div className="h-3.5 w-5/6 rounded skeleton-shimmer bg-white/15"></div>
                                        <div className="h-2.5 w-1/2 rounded skeleton-shimmer bg-white/10"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="min-h-screen bg-[#0a0a15] animate-fade-in pb-20 relative">
            {toastMessage && (
                <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-emerald-500 text-white px-6 py-3 rounded-full shadow-lg font-bold animate-fade-in flex items-center gap-2">
                    <CheckIcon className="w-5 h-5" />
                    {toastMessage}
                </div>
            )}
            <div className="relative h-[40vh] md:h-[60vh]">
                <div className="absolute top-4 left-4 z-20"><button onClick={onBack} className="bg-black/40 backdrop-blur-md border border-white/10 w-10 h-10 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors"><BackIcon className="w-5 h-5" /></button></div>
                <div className="absolute inset-0 bg-cover bg-center transition-all duration-700" style={{ backgroundImage: `url(${getOptimizedImageUrl(movie.cover || movie.thumbnail, 1280)})` }}></div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a15] via-[#0a0a15]/40 to-transparent"></div>
                <div className="absolute bottom-0 left-0 w-full p-[4%] flex flex-col md:flex-row items-end gap-6">
                    <div className="hidden md:block w-[200px] rounded-xl overflow-hidden shadow-2xl border border-white/10"><LazyLoadImage src={getOptimizedImageUrl(movie.thumbnail || movie.cover, 400)} effect="blur" className="w-full h-full object-cover" wrapperClassName="w-full h-full" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_FAVICON_FALLBACK; }} /></div>
                    <div className="flex-1">
                        <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-2 drop-shadow-lg">{movie.title}</h1>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300 mb-4">
                            {movie.imdbRating && movie.imdbRating !== '0' && <span className="text-primary font-bold flex items-center gap-1"><StarIcon className="w-4 h-4" filled />{movie.imdbRating}</span>}
                            {movie.releaseDate && <span className="flex items-center gap-1"><CalendarIcon className="w-4 h-4" />{movie.releaseDate.split('-')[0]}</span>}
                            <span className="bg-white/10 px-2 py-0.5 rounded text-xs border border-white/10 flex items-center gap-1">{isSeries ? <TvIcon className="w-3 h-3" /> : <FilmIcon className="w-3 h-3" />}{movie.type}</span>
                            {movie.genre && <span className="flex items-center gap-1"><TagIcon className="w-4 h-4" />{movie.genre}</span>}
                        </div>
                        <div className="flex gap-4 flex-wrap">
                            {!isSeries && <button onClick={() => onFetchSources(movie.title, 1, 1, movie.subjectId, movie.detailPath)} disabled={loading || movie.hasResource === false} className={`bg-primary text-black font-bold py-3 px-8 rounded-full hover:bg-white transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(0,229,255,0.3)] group ${movie.hasResource === false ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}>{loading ? <SpinnerIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />} Play</button>}
                            {movie.trailerUrl && <button onClick={onPlayTrailer} className="bg-white/10 border border-white/20 text-white font-bold py-3 px-6 rounded-full hover:bg-white/20 transition-all flex items-center gap-2"><YoutubeIcon className="w-5 h-5" /> Trailer</button>}
                            <button onClick={handleCopyLink} className="bg-white/10 border border-white/20 text-white font-bold py-3 px-6 rounded-full hover:bg-white/20 transition-all flex items-center gap-2">
                                {copied ? <CheckIcon className="w-5 h-5 text-primary" /> : <CopyIcon className="w-5 h-5" />}
                                {copied ? 'Copied!' : 'Copy Link'}
                            </button>
                            <button onClick={() => {
                                const isSeries = movie.type?.toLowerCase().includes('series') || movie.type?.toLowerCase().includes('tv');
                                const url = `${window.location.origin}${isSeries ? '/tv/' : '/movie/'}${movie.subjectId || movie.detailPath}`;
                                if (navigator.share) {
                                    navigator.share({
                                        title: movie.title,
                                        text: `${movie.title} - Watch free HD online`,
                                        url: url
                                    }).then(() => {
                                        showToast('Shared successfully!');
                                    }).catch((err) => {
                                        if (err.name !== 'AbortError') {
                                            showToast('Failed to share');
                                        }
                                    });
                                } else {
                                    navigator.clipboard.writeText(url);
                                    setCopied(true);
                                    showToast('Link copied!');
                                    setTimeout(() => setCopied(false), 2000);
                                }
                            }} className="bg-white/10 border border-white/20 text-white font-bold py-3 px-4 rounded-full hover:bg-white/20 transition-all flex items-center gap-2"><ShareIcon className="w-5 h-5" /> Share</button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="px-[4%] mt-6 grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 space-y-8">
                    {movie.dubs && movie.dubs.length > 1 && (
                        <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2"><GlobeIcon className="w-4 h-4" /> Audio/Dub Versions</h3>
                            <div className="flex flex-wrap gap-2">{movie.dubs.map((dub, i) => (<button key={i} onClick={() => onDubClick(dub)} className={`px-4 py-2 rounded-full text-xs font-bold border transition-all flex items-center gap-1 ${dub.detailPath === movie.detailPath ? 'bg-primary text-black border-primary' : 'bg-white/5 text-white border-white/10 hover:bg-white/10'}`}>{dub.original && <CheckIcon className="w-3 h-3" />}{dub.lanName}</button>))}</div>
                        </div>
                    )}
                    <div className="bg-[#1a1a2e] p-6 rounded-xl border border-white/5">
                        <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2"><InfoIcon className="w-5 h-5 text-primary" /> Synopsis</h3>
                        <p className="text-gray-400 leading-relaxed text-sm md:text-base">{movie.description || "No description available."}</p>
                    </div>
                    {movie.cast && movie.cast.length > 0 && (
                        <div className="bg-[#1a1a2e] p-6 rounded-xl border border-white/5">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><i className="fa-solid fa-users text-primary"></i> Cast</h3>
                            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                                {movie.cast.slice(0, 10).map((actor, i) => (
                                    <button key={i} onClick={() => actor.id ? onStaffClick(actor.id, actor.name, actor.avatar) : undefined} className={`flex-shrink-0 text-center group ${actor.id ? 'cursor-pointer' : 'cursor-default'}`}>
                                        <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-primary transition-all mx-auto mb-2">
                                            {actor.avatar ? (
                                                <LazyLoadImage src={getOptimizedImageUrl(actor.avatar, 150)} alt={actor.name} effect="blur" className="w-full h-full object-cover" wrapperClassName="w-full h-full" onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(actor.name)}&background=1a1a2e&color=fff&size=128`; }} />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                                                    <i className="fa-solid fa-user text-white/50 text-2xl"></i>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-white text-xs font-medium truncate max-w-[90px] md:max-w-[100px] group-hover:text-primary transition-colors">{actor.name}</p>
                                        {actor.character && <p className="text-gray-500 text-[10px] truncate max-w-[90px] md:max-w-[100px]">{actor.character}</p>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {isSeries && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between"><h3 className="text-xl font-bold text-white flex items-center gap-2"><EpisodeIcon className="w-5 h-5 text-primary" /> Episodes</h3></div>
                            {showSeasons && <div className="flex gap-2 flex-wrap mb-4">{movie.seasons!.map(season => (<button key={season.seasonNumber} onClick={() => setSelectedSeason(season.seasonNumber)} className={`px-4 py-2 rounded-full text-sm font-bold ${selectedSeason === season.seasonNumber ? 'bg-primary text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>Season {season.seasonNumber}</button>))}</div>}
                            {showSeasons && episodeCount > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {Array.from({ length: episodeCount }, (_, i) => i + 1).map(ep => {
                                        const epKey = `S${selectedSeason}E${ep}`;
                                        const progressData = watchedProgress[epKey];
                                        const progress = progressData?.progress || 0;
                                        const isCompleted = progressData?.completed || false;
                                        return (
                                            <button 
                                                key={ep} 
                                                onClick={() => onFetchSources(movie.title, selectedSeason, ep, movie.subjectId, movie.detailPath)} 
                                                disabled={loading} 
                                                className="bg-[#1a1a2e] hover:bg-white/10 border border-white/10 p-3 rounded-xl relative overflow-hidden group transition-all text-left"
                                            >
                                                <span className="text-gray-500 text-xs uppercase mb-1 flex items-center justify-between">
                                                    <span className="flex items-center gap-1"><EpisodeIcon className="w-3 h-3" /> Episode</span>
                                                    {isCompleted && <CheckIcon className="w-3 h-3 text-emerald-500" />}
                                                </span> 
                                                <span className="text-white text-xl font-bold block mb-2">{ep}</span>
                                                {progress > 0 && (
                                                    <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10">
                                                        <div className={`h-full ${isCompleted ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${progress}%` }}></div>
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {!showSeasons && <div className="text-center py-8 text-gray-400 bg-white/5 rounded-xl border border-white/10">
                                <p className="mb-4">No season information available.</p>
                                <button onClick={() => onFetchSources(movie.title, 1, 1, movie.subjectId, movie.detailPath)} disabled={loading} className="bg-primary text-black font-bold py-2 px-6 rounded-full hover:bg-white transition-all">
                                    {loading ? 'Loading...' : 'Play Now'}
                                </button>
                            </div>}
                        </div>
                    )}
                </div>
                <div className="lg:col-span-1">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2"><HeartIcon className="w-5 h-5 text-primary" /> You Might Also Like</h3>
                    </div>
                    {currentRecs.length > 0 ? (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                                {currentRecs.map((rec, i) => (
                                    <div key={`${recPage}-${i}`} className="animate-fade-in">
                                        <MovieCard movie={rec} onClick={onMovieClick} />
                                    </div>
                                ))}
                            </div>
                            {maxRecPages > 1 && (
                                <div className="mt-4 flex justify-center">
                                    <button 
                                        onClick={() => setRecPage((prev) => (prev + 1) % maxRecPages)}
                                        className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-bold text-white transition-all flex items-center gap-2"
                                    >
                                        See More <i className="fa-solid fa-chevron-right text-[10px]"></i>
                                    </button>
                                </div>
                            )}
                        </>
                    ) : loading ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="rounded-xl overflow-hidden bg-white/5 border border-white/5 flex flex-col">
                                    <div className="aspect-[2/3] skeleton-shimmer bg-white/10"></div>
                                    <div className="p-2.5 space-y-1.5">
                                        <div className="h-3.5 w-5/6 rounded skeleton-shimmer bg-white/15"></div>
                                        <div className="h-2.5 w-1/2 rounded skeleton-shimmer bg-white/10"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-500 text-sm">No recommendations found.</p>
                    )}
                </div>
            </div>
        </div>
    );
};
const TrendingView: React.FC<{ movies: MovieResult[], loading: boolean, hasMore: boolean, onLoadMore: () => void, onMovieClick: (m: MovieResult) => void }> = ({ movies, loading, hasMore, onLoadMore, onMovieClick }) => {
    const loadMoreRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => { if (entries[0].isIntersecting && hasMore && !loading) onLoadMore(); }, { threshold: 0.1 });
        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [hasMore, loading, onLoadMore]);
    return (
        <div className="pt-8 px-[4%] pb-24">
            <div className="mb-6"><h2 className="text-2xl font-bold text-white flex items-center gap-2"><i className="fa-solid fa-fire text-orange-500"></i> Trending</h2><p className="text-gray-400 text-sm mt-1">Most popular movies and series right now</p></div>
            {movies.length > 0 ? (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">{movies.map((m, i) => (<div key={i} className="transform transition-all duration-300 hover:scale-105 hover:z-10"><MovieCard movie={m} onClick={onMovieClick} /></div>))}</div>
                    <div ref={loadMoreRef} className="flex justify-center py-8">{loading && <Loader type="circle" inline />}{!hasMore && movies.length > 0 && <p className="text-gray-500">No more content</p>}</div>
                </>
            ) : <div className="col-span-full text-center py-20"><div className="text-6xl mb-4 text-gray-600"><i className="fa-solid fa-fire"></i></div><p className="text-gray-400 text-lg">No trending content available</p></div>}
        </div>
    );
};
const normalizeTrendingItem = (item: any): MovieResult => {
    if (!item) return {} as MovieResult;
    let cover = '';
    if (typeof item.cover === 'string') cover = item.cover;
    else if (item.cover?.url) cover = item.cover.url;
    return { title: item.title || "Unknown", cover, thumbnail: cover, type: item.subjectType === 1 ? 'Movie' : item.subjectType === 2 ? 'TV Series' : 'Movie', subjectId: String(item.subjectId || ''), imdbRating: String(item.imdbRatingValue || '0'), releaseDate: String(item.releaseDate || ''), genre: item.genre || '', description: item.description || item.postTitle || '', countryName: item.countryName || '', detailPath: item.detailPath || '', hasResource: item.hasResource !== undefined ? item.hasResource : true };
};
const TelegramModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in">
            <div className="relative bg-[#12121a]/90 border border-white/10 rounded-[2.5rem] w-full max-w-md p-8 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.9)] text-center overflow-hidden">
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>
                
                <button onClick={onClose} className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-all border border-white/5 cursor-pointer">
                    <i className="fa-solid fa-times text-lg"></i>
                </button>

                <div className="w-20 h-20 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-3xl mx-auto flex items-center justify-center shadow-lg shadow-cyan-500/30 mb-6 text-white text-3xl">
                    <i className="fa-brands fa-telegram"></i>
                </div>

                <h3 className="text-2xl font-black text-white tracking-tight mb-2">Join Official SLFLIX</h3>
                <p className="text-gray-300 text-sm mb-6 leading-relaxed">
                    Stay updated with the latest releases, HD movie drops, fast anime mirrors, and exclusive requests on our official Telegram channel!
                </p>

                <a 
                    href="https://t.me/Sl_flix_ofiicial" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={onClose}
                    className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-extrabold rounded-2xl shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-3 transition-all transform active:scale-95 text-base"
                >
                    <i className="fa-brands fa-telegram text-xl"></i>
                    <span>Join @Sl_flix_ofiicial</span>
                </a>
                
                <div className="mt-4">
                    <button onClick={onClose} className="text-xs font-bold text-gray-400 hover:text-white transition-colors tracking-wide uppercase">
                        Continue to SLFLIX
                    </button>
                </div>
            </div>
        </div>
    );
};

const WatchPartyAnnouncementBanner: React.FC<{
    rooms: any[];
    onJoinRoom: (roomId: string) => void;
    currentView: string;
    isSearchOpen: boolean;
}> = ({ rooms, onJoinRoom, currentView, isSearchOpen }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (rooms.length <= 1) {
            setCurrentIndex(0);
            return;
        }
        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % rooms.length);
        }, 4500);
        return () => clearInterval(interval);
    }, [rooms.length]);

    if (dismissed || rooms.length === 0 || currentView === 'watch-party' || isSearchOpen) {
        return null;
    }

    const activeRoom = rooms[currentIndex] || rooms[0];
    if (!activeRoom) return null;

    const movieTitle = activeRoom.movie?.title || 'a movie';
    const viewersCount = activeRoom.users?.length || 1;

    return (
        <div className="relative z-30 bg-[#0c0e17]/95 border-b border-cyan-500/20 backdrop-blur-md px-4 py-2 text-white shadow-lg overflow-hidden transition-all duration-300">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 flex-1 min-w-0 overflow-hidden">
                    <span className="flex-shrink-0 flex items-center gap-1.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider animate-pulse">
                        <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                        LIVE
                    </span>

                    <div className="flex items-center gap-2 min-w-0 flex-1 truncate transition-all duration-500">
                        <span className="text-cyan-300 font-extrabold truncate">
                            {activeRoom.roomName}
                        </span>
                        <span className="text-gray-500 hidden sm:inline">•</span>
                        <span className="text-gray-200 truncate hidden xs:inline">
                            Watching <strong className="text-white font-bold">{movieTitle}</strong>
                        </span>
                        {rooms.length > 1 && (
                            <span className="text-[10px] text-cyan-400/80 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.2 rounded font-mono hidden md:inline">
                                {currentIndex + 1}/{rooms.length}
                            </span>
                        )}
                        <span className="text-gray-400 text-[11px] hidden lg:inline">
                            ({viewersCount} watching)
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {rooms.length > 1 && (
                        <div className="flex items-center gap-1 mr-1 hidden sm:flex">
                            <button
                                onClick={() => setCurrentIndex((prev) => (prev - 1 + rooms.length) % rooms.length)}
                                className="w-5 h-5 rounded-full bg-white/5 hover:bg-white/20 text-gray-300 flex items-center justify-center text-[9px] transition-colors cursor-pointer"
                                title="Previous Room"
                            >
                                <i className="fa-solid fa-chevron-left"></i>
                            </button>
                            <button
                                onClick={() => setCurrentIndex((prev) => (prev + 1) % rooms.length)}
                                className="w-5 h-5 rounded-full bg-white/5 hover:bg-white/20 text-gray-300 flex items-center justify-center text-[9px] transition-colors cursor-pointer"
                                title="Next Room"
                            >
                                <i className="fa-solid fa-chevron-right"></i>
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => onJoinRoom(activeRoom.roomId)}
                        className="px-3 py-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-black text-xs rounded-full shadow-md shadow-cyan-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                        <span>Join</span>
                        <i className="fa-solid fa-arrow-right text-[10px]"></i>
                    </button>

                    <button
                        onClick={() => setDismissed(true)}
                        className="w-6 h-6 rounded-full hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center text-xs transition-colors ml-1 cursor-pointer"
                        title="Dismiss announcement"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<'home' | 'search' | 'details' | 'trending' | 'toplist' | 'api-docs' | 'live-tv' | 'anime' | 'sports' | 'news' | 'staff' | 'adult' | 'novels' | 'watch-party'>('home');
    const [selectedStaff, setSelectedStaff] = useState<{ id: string, name: string, avatar?: string } | null>(null);
    const [activeRooms, setActiveRooms] = useState<any[]>([]);

    useEffect(() => {
        const s = typeof io !== 'undefined' ? io() : null;
        if (!s) return;
        s.emit('get_active_rooms');
        s.on('active_rooms_list', (rooms: any[]) => setActiveRooms(rooms || []));
        return () => { s.disconnect(); };
    }, []);

    const handleNovelsClick = () => {
        hasNavigatedRef.current = true;
        setCurrentView('novels');
        window.history.pushState({}, '', '/novels');
        resetToHomeSEO();
    };

    const handleWatchPartyClick = (roomId?: string) => {
        hasNavigatedRef.current = true;
        setCurrentView('watch-party');
        if (roomId) {
            window.history.pushState({}, '', `/watch-party?room=${roomId}`);
        } else {
            window.history.pushState({}, '', '/watch-party');
        }
        resetToHomeSEO();
    };
    const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
    const [recentlyViewed, setRecentlyViewed] = useState<MovieResult[]>(() => {
        try {
            const stored = localStorage.getItem('slflix_recently_viewed');
            return stored ? JSON.parse(stored) : [];
        } catch { return []; }
    });

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const cacheRecentlyViewed = (movie: MovieResult) => {
        try {
            const stored = localStorage.getItem('slflix_recently_viewed');
            let list: MovieResult[] = stored ? JSON.parse(stored) : [];
            list = [movie, ...list.filter(m => (m.subjectId && m.subjectId !== movie.subjectId) || (m.title !== movie.title))].slice(0, 15);
            localStorage.setItem('slflix_recently_viewed', JSON.stringify(list));
            setRecentlyViewed(list);
        } catch {}
    };

    const [showTelegramModal, setShowTelegramModal] = useState(false);
    useEffect(() => {
        const dismissed = localStorage.getItem('slflix_telegram_modal_dismissed');
        if (!dismissed) {
            const timer = setTimeout(() => setShowTelegramModal(true), 1500);
            return () => clearTimeout(timer);
        }
    }, []);
    const handleCloseTelegramModal = () => {
        setShowTelegramModal(false);
        localStorage.setItem('slflix_telegram_modal_dismissed', 'true');
    };
    const [recentSearches, setRecentSearches] = useState<string[]>(() => {
        try {
            const stored = localStorage.getItem('slflix_recent_searches');
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    });

    const saveRecentSearch = (query: string) => {
        const q = query.trim();
        if (!q) return;
        try {
            const stored = localStorage.getItem('slflix_recent_searches');
            let list: string[] = stored ? JSON.parse(stored) : [];
            list = [q, ...list.filter(item => item.toLowerCase() !== q.toLowerCase())].slice(0, 5);
            localStorage.setItem('slflix_recent_searches', JSON.stringify(list));
            setRecentSearches(list);
        } catch (e) {}
    };

    const clearRecentSearches = () => {
        try {
            localStorage.removeItem('slflix_recent_searches');
            setRecentSearches([]);
        } catch (e) {}
    };

    const removeRecentSearch = (term: string) => {
        try {
            const stored = localStorage.getItem('slflix_recent_searches');
            let list: string[] = stored ? JSON.parse(stored) : [];
            list = list.filter(item => item.toLowerCase() !== term.toLowerCase());
            localStorage.setItem('slflix_recent_searches', JSON.stringify(list));
            setRecentSearches(list);
        } catch (e) {}
    };

    const { data: homeData, loading: homeLoading, error: homeError } = useHomeData();
    const heroMovies = homeData?.hero || [];
    const categoriesData = homeData?.categories || [];
    const [selectedNovelId, setSelectedNovelId] = useState<string | null>(null);
    const [selectedMovie, setSelectedMovie] = useState<MovieResult | null>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [trendingKeywords, setTrendingKeywords] = useState<string[]>([]);
    const [toplistCategory, setToplistCategory] = useState('trending');
    const [trendingMovies, setTrendingMovies] = useState<MovieResult[]>([]);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const searchLoadMoreRef = useRef<HTMLDivElement>(null);
    const [trendingLoading, setTrendingLoading] = useState(false);
    const [trendingHasMore, setTrendingHasMore] = useState(true);
    const [trendingPage, setTrendingPage] = useState(0);
    const [searchState, setSearchState] = useState<SearchState>({ query: '', results: [], loading: false, hasMore: false, nextPage: 1, loadingMore: false });
    const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'info' });
    const [activeLiveChannel, setActiveLiveChannel] = useState<any>(null);
    const [allLiveChannels, setAllLiveChannels] = useState<any[]>([]);
    const [playerState, setPlayerState] = useState<{ isOpen: boolean; title: string; poster?: string; sources: VideoSource[]; subtitles?: Subtitle[]; subjectId?: string; detailPath?: string; mediaType?: string; season?: number; episode?: number; initialTime?: number; nextEpisode?: { season: number; episode: number; title: string }; isTrailer?: boolean; isLive?: boolean; startTime?: number; overlay?: boolean; }>({ isOpen: false, title: '', sources: [] });
    const [sourceModal, setSourceModal] = useState<{ isOpen: boolean; sources: VideoSource[]; subtitles?: Subtitle[]; pendingContext?: { title: string; season: number; episode: number; initialTime: number; subjectId?: string; detailPath?: string; mediaType?: string; }; }>({ isOpen: false, sources: [] });
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [loadingSources, setLoadingSources] = useState(false);
    const categoriesDataRef = useRef(categoriesData);
    const playerStateRef = useRef(playerState);
    const hasNavigatedRef = useRef(false);

    useEffect(() => { categoriesDataRef.current = categoriesData; }, [categoriesData]);
    useEffect(() => { playerStateRef.current = playerState; }, [playerState]);

    const handleBack = () => {
        if (hasNavigatedRef.current || window.history.length > 2) {
            window.history.back();
        } else {
            setCurrentView('home');
            window.history.pushState({}, '', '/');
            resetToHomeSEO();
        }
    };

    const loadTrending = async (page: number) => {
        if (page === 0) setTrendingLoading(true);
        else setSearchState(prev => ({ ...prev, loadingMore: true }));
        try {
            const response = await fetch(`https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/trending?page=${page}&perPage=18`);
            const data = await response.json();
            if (data.code === 0 && data.data?.subjectList) {
                const results = data.data.subjectList.map(normalizeTrendingItem);
                if (page === 0) setTrendingMovies(results);
                else setTrendingMovies(prev => [...prev, ...results]);
                setTrendingHasMore(data.data.pager?.hasMore || false);
            } else { setTrendingHasMore(false); }
        } catch (e) { console.error('Error loading trending:', e); setTrendingHasMore(false); }
        if (page === 0) setTrendingLoading(false);
        else setSearchState(prev => ({ ...prev, loadingMore: false }));
        setTrendingPage(page);
    };
    const handleSearch = useCallback(async (q: string, page: number = 1) => {
        hasNavigatedRef.current = true;
        const trimmed = q.trim();
        if (!trimmed) return;
        if (page === 1) {
            saveRecentSearch(trimmed);
            setSearchState(prev => ({ ...prev, loading: true, query: trimmed }));
        } else {
            setSearchState(prev => ({ ...prev, loadingMore: true }));
        }
        setCurrentView('search');
        if (page === 1) window.history.pushState({}, '', `/search?q=${encodeURIComponent(trimmed)}`);
        const res = await ApiService.search(trimmed, page);
        if (page === 1) setSearchState({ query: trimmed, results: res.results, loading: false, hasMore: res.hasMore, nextPage: res.nextPage, loadingMore: false });
        else setSearchState(prev => ({ ...prev, results: [...prev.results, ...res.results], loadingMore: false, hasMore: res.hasMore, nextPage: res.nextPage }));
    }, []);
    useEffect(() => {
        if (currentView !== 'search') return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && searchState.hasMore && !searchState.loading && !searchState.loadingMore) {
                handleSearch(searchState.query, searchState.nextPage);
            }
        }, { threshold: 0.1 });
        if (searchLoadMoreRef.current) observer.observe(searchLoadMoreRef.current);
        return () => observer.disconnect();
    }, [currentView, searchState.hasMore, searchState.loading, searchState.loadingMore, searchState.query, searchState.nextPage, handleSearch]);
    const handleMovieClick = async (m: MovieResult) => {
        setLoadingDetails(true);
        hasNavigatedRef.current = true;
        cacheRecentlyViewed(m);
        const prefix = m.type.includes('Series') ? '/tv/' : '/movie/';
        window.history.pushState({}, '', `${prefix}${m.subjectId || m.detailPath}`);
        setCurrentView('details');
        setSelectedMovie(m);
        window.scrollTo(0,0);
        updateMetaTags(m, false);
        try {
            const fullDetails = await ApiService.getDetails(m);
            setSelectedMovie(fullDetails);
            cacheRecentlyViewed(fullDetails);
            updateMetaTags(fullDetails, false);
        } catch { 
            // Fallback to recently viewed if offline
            setToast({ show: true, message: isOnline ? "Error loading details" : "Offline mode: loaded from cache", type: isOnline ? "error" : "info" });
        }
        finally { setLoadingDetails(false); }
    };
    const handleStaffClick = (id: string, name: string, avatar?: string) => {
        hasNavigatedRef.current = true;
        setSelectedStaff({ id, name, avatar });
        window.history.pushState({}, '', `/staff/${id}`);
        setCurrentView('staff');
        window.scrollTo(0, 0);
    };
    const handleToplistClick = (category?: string) => {
        hasNavigatedRef.current = true;
        if (category) setToplistCategory(category);
        setCurrentView('toplist');
        window.history.pushState({}, '', '/toplist');
        resetToHomeSEO();
    };
    useEffect(() => {
        const handlePopState = async () => {
            const path = window.location.pathname;
            const searchParams = new URLSearchParams(window.location.search);
            const q = searchParams.get('q');
            if (playerStateRef.current.isOpen && !path.includes('/watch')) { setPlayerState(p => ({ ...p, isOpen: false })); return; }
            if (path === '/' || path === '') { setCurrentView('home'); setSelectedMovie(null); resetToHomeSEO(); }
            else if (path === '/toplist') setCurrentView('toplist');
            else if (path === '/trending') setCurrentView('trending');
            else if (path === '/api-docs') setCurrentView('api-docs');
            else if (path === '/anime' || path.startsWith('/anime')) setCurrentView('anime');
            else if (path === '/novels' || path.startsWith('/novels')) setCurrentView('novels');
            else if (path.startsWith('/search') && q) {
                setSearchState(prev => ({ ...prev, query: q, loading: true }));
                setCurrentView('search');
                const res = await ApiService.search(q, 1);
                setSearchState(prev => ({ ...prev, query: q, results: res.results, loading: false, hasMore: res.hasMore, nextPage: res.nextPage, loadingMore: false }));
            } else if (path.startsWith('/staff/')) {
                const id = path.split('/').pop();
                if (id) {
                    setSelectedStaff({ id, name: "Staff Member" });
                    setCurrentView('staff');
                }
            } else if (path.startsWith('/movie/') || path.startsWith('/tv/')) {
                let id = path.split('/').pop();
                if (id === 'watch' || id === 'undefined' || id === 'null' || !id || id === 'movie' || id === 'tv') {
                    const parts = path.split('/').filter(Boolean);
                    id = parts[parts.length - 2] || '';
                }
                if (id && id.length > 5) {
                    let foundInCategories = false;
                    for (const cat of categoriesDataRef.current) { 
                        const found = cat.movies?.find(m => m.subjectId === id); 
                        if (found) { 
                            setSelectedMovie(found); 
                            setCurrentView('details'); 
                            updateMetaTags(found, false);
                            setLoadingDetails(true); 
                            try { 
                                const full = await ApiService.getDetails(found); 
                                setSelectedMovie(full); 
                                updateMetaTags(full, false);
                            } catch {} 
                            setLoadingDetails(false); 
                            foundInCategories = true; 
                            break; 
                        } 
                    }
                    if (!foundInCategories) { 
                        setLoadingDetails(true); 
                        setCurrentView('details'); 
                        const movie = await ApiService.getMovieById(id); 
                        setSelectedMovie(movie); 
                        updateMetaTags(movie, false);
                        const full = await ApiService.getDetails(movie); 
                        setSelectedMovie(full); 
                        updateMetaTags(full, false);
                        setLoadingDetails(false); 
                    }
                } else {
                    setCurrentView('home');
                    resetToHomeSEO();
                    window.history.replaceState({}, '', '/');
                }
            }
        };
        window.addEventListener('popstate', handlePopState);
        const initCheck = async () => {
            const path = window.location.pathname;
            const q = new URLSearchParams(window.location.search).get('q');
            const novelId = new URLSearchParams(window.location.search).get('novel');
            const roomParam = new URLSearchParams(window.location.search).get('room');
            if (novelId) {
                setSelectedNovelId(novelId);
                setCurrentView('novels');
            } else if (roomParam || path === '/watch-party') {
                setCurrentView('watch-party');
            } else if (path === '/novels' || path.startsWith('/novels')) {
                setCurrentView('novels');
            } else if (path === '/toplist') handleToplistClick();
            else if (path === '/trending') handleTrendingClick();
            else if (path === '/api-docs') setCurrentView('api-docs');
            else if (path === '/anime' || path.startsWith('/anime')) handleAnimeClick();
            else if (path.startsWith('/search') && q) handleSearch(q);
            else if (path.startsWith('/staff/')) { const id = path.split('/').pop(); if (id) { setSelectedStaff({ id, name: "Staff Member" }); setCurrentView('staff'); } }
            else if (path.startsWith('/movie/') || path.startsWith('/tv/')) { 
                const id = path.split('/').pop(); 
                if (id) { 
                    setLoadingDetails(true); 
                    setCurrentView('details'); 
                    const movie = await ApiService.getMovieById(id); 
                    setSelectedMovie(movie); 
                    updateMetaTags(movie, false);
                    const full = await ApiService.getDetails(movie); 
                    setSelectedMovie(full); 
                    updateMetaTags(full, false);
                    setLoadingDetails(false); 
                } 
            }
        };
        initCheck();
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);
    useEffect(() => {
        const init = async () => { 
            try {
                const trending = await ApiService.getTrendingSearches(); 
                setTrendingKeywords(trending); 
                // Auto run / prefetch main feeds in background so tabs are instantly ready and updating
                ApiService.getTrending?.(1).catch(() => {});
                ApiService.getTvChannels?.({ limit: 500 }).catch(() => {});
                ApiService.getAnimeHome?.().catch(() => {});
            } catch (e) {
                console.error('Error loading trending searches:', e);
            }
        };
        init();
    }, []);
    const handlePlayTrailer = () => { if (selectedMovie?.trailerUrl) { setPlayerState({ isOpen: true, title: `${selectedMovie.title} - Trailer`, sources: [{ quality: 720, stream: selectedMovie.trailerUrl, label: 'Trailer', type: 'mp4' }], subtitles: [], initialTime: 0, isTrailer: true, overlay: true }); window.history.pushState({}, '', window.location.pathname + '/trailer'); } };
    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => { if (toast.timeoutId) clearTimeout(toast.timeoutId); const timeoutId = setTimeout(() => { setToast({ show: false, message: '', type: 'info' }); }, 3000); setToast({ show: true, message, type, timeoutId }); };
    const handleFetchSources = async (title: string, season = 1, episode = 1, subjectId?: string, detailPath?: string) => {
        const movie = selectedMovie;
        if (!movie) return;
        const activeSubjectId = (subjectId || movie.subjectId || '').trim();
        const activeDetailPath = (detailPath || movie.detailPath || '').trim();
        if (!activeSubjectId || activeSubjectId === 'undefined' || activeSubjectId === 'null') { showToast("Missing video ID. Go back and open details again.", "error"); return; }
        let initialTime = 0;
        const progressKey = `slflix_progress_${activeSubjectId}`;
        const storedProgress = localStorage.getItem(progressKey);
        if (storedProgress) {
            try {
                const data = JSON.parse(storedProgress);
                const epKey = `S${season}E${episode}`;
                if (data[epKey] && data[epKey].time) {
                    initialTime = data[epKey].time;
                } else if (data['S1E1'] && data['S1E1'].time) {
                    initialTime = data['S1E1'].time;
                } else if (data.time) {
                    initialTime = data.time;
                }
            } catch (e) {}
        }
        if (movie.type === 'Live Sport' && movie.sourceUrl) { setPlayerState({ isOpen: true, title, sources: [{ quality: 720, stream: movie.sourceUrl, label: 'Live Stream', type: 'hls' }], subtitles: [], subjectId: movie.subjectId, initialTime: 0, isLive: true }); window.history.pushState({}, '', window.location.pathname + '/watch'); return; }
        setLoadingSources(true);
        try {
            const data = await ApiService.getSources(activeSubjectId, movie.type, season, episode, activeDetailPath, movie.title);
            if (data.videos && data.videos.length > 0) {
                setSourceModal({ isOpen: true, sources: data.videos, subtitles: data.subs || [], pendingContext: { title: movie.type.includes('Series') ? `${title} - S${season} E${episode}` : title, season, episode, initialTime, subjectId: activeSubjectId, detailPath: activeDetailPath } });
            } else { showToast("No sources found. Try another movie.", "error"); }
        } catch (e) { console.error('[App] Source error:', e); showToast("Error loading sources", "error"); }
        finally { setLoadingSources(false); }
    };
    const handleTrendingClick = () => { hasNavigatedRef.current = true; setCurrentView('trending'); window.history.pushState({}, '', '/trending'); resetToHomeSEO(); if (trendingMovies.length === 0) loadTrending(0); };
    const handleLiveTvClick = () => { hasNavigatedRef.current = true; setCurrentView('live-tv'); window.history.pushState({}, '', '/live-tv'); resetToHomeSEO(); };
    const handleAnimeClick = () => { hasNavigatedRef.current = true; setCurrentView('anime'); window.history.pushState({}, '', '/anime'); resetToHomeSEO(); };
    const handlePlayLiveChannel = (channel: any, channelList?: any[]) => {
        if (!channel) return;
        const rawUrl = channel.stream_url || channel.url || channel.streamUrl;
        if (!rawUrl) return;
        const streamUrl = rawUrl;
        const isMp4 = streamUrl.toLowerCase().includes('.mp4') || (channel.format === 'mp4');
        const streamType = isMp4 ? 'mp4' : 'hls';
        setActiveLiveChannel(channel);
        if (channelList && channelList.length > 0) {
            setAllLiveChannels(channelList);
        }
        setPlayerState({ 
            isOpen: true, 
            title: channel.name || channel.title || 'Live Stream', 
            sources: [{ quality: 720, stream: streamUrl, label: 'Live Stream', type: streamType }], 
            subtitles: [], 
            initialTime: 0, 
            isLive: true,
            subjectId: channel.id || 'live-channel'
        });
        if (!window.location.pathname.includes('/watch')) {
            window.history.pushState({}, '', window.location.pathname + '/watch');
        }
    };
    const handlePlayHighlight = (highlight: any) => {
        handlePlayLiveChannel({
            id: highlight.id,
            url: highlight.path,
            title: highlight.title
        });
    };
    const handlePlaySports = (match: any) => {
        handlePlayLiveChannel({
            id: match.id,
            url: match.playPath,
            title: match.team1.name + ' vs ' + match.team2.name
        });
    };
    const handleProgressUpdate = (time: number, duration: number) => {
        const { subjectId, season, episode, title } = playerStateRef.current;
        if (!subjectId) return;
        const activeSeason = season || 1;
        const activeEpisode = episode || 1;
        if (duration > 0 && time > 0) {
            const progress = (time / duration) * 100;
            const isCompleted = progress > 90;
            const key = `slflix_progress_${subjectId}`;
            const stored = localStorage.getItem(key);
            let data: Record<string, any> = {};
            try {
                data = stored ? JSON.parse(stored) : {};
            } catch (e) {
                data = {};
            }
            const epKey = `S${activeSeason}E${activeEpisode}`;
            data[epKey] = {
                progress,
                completed: isCompleted,
                time,
                duration,
                updatedAt: Date.now()
            };
            localStorage.setItem(key, JSON.stringify(data));
            localStorage.setItem('slflix_last_watched', JSON.stringify({
                subjectId,
                season: activeSeason,
                episode: activeEpisode,
                time,
                title: title
            }));
            window.dispatchEvent(new Event('slflix_progress_update'));
        }
    };
    return (
        <div className="bg-[#0a0a15] min-h-screen text-white font-sans overflow-x-hidden flex flex-col">
            <NetworkStatusNotifier />
            <Toast {...toast} />
            {(loadingSources) && <LoadingView />}
            <SourceSelector 
                isOpen={sourceModal.isOpen} 
                sources={sourceModal.sources} 
                subtitles={sourceModal.subtitles}
                onClose={() => setSourceModal({ isOpen: false, sources: [], subtitles: [] })} 
                onSelect={(s) => {
                    if (sourceModal.pendingContext) {
                        const { title, season, episode, initialTime, subjectId } = sourceModal.pendingContext;
                        let nextEp = undefined;
                        if (selectedMovie?.type.includes('Series')) { const currentSeason = selectedMovie.seasons?.find(s => s.seasonNumber === season); if (currentSeason && episode < currentSeason.episodeCount) nextEp = { season, episode: episode + 1, title: selectedMovie.title }; }
                        setPlayerState({ isOpen: true, title, sources: [s, ...sourceModal.sources.filter(x => x !== s)], subtitles: sourceModal.subtitles, subjectId, season, episode, initialTime, nextEpisode: nextEp });
                        if (!window.location.pathname.includes('/watch')) {
                            window.history.pushState({}, '', window.location.pathname + '/watch');
                        } else {
                            window.history.replaceState({}, '', window.location.pathname);
                        }
                    }
                    setSourceModal({ isOpen: false, sources: [], subtitles: [] });
                }}
                onToast={(m) => showToast(m, 'success')} 
            />
            {playerState.isOpen && (
                <Suspense fallback={<LoadingView />}>
                    {playerState.isLive ? (
                        <LiveTvStreamPlayer 
                            channel={activeLiveChannel || {
                                id: playerState.subjectId || 'live-channel',
                                name: playerState.title || 'Live Stream',
                                stream_url: playerState.sources[0]?.stream || '',
                                logo: ''
                            }}
                            allChannels={allLiveChannels}
                            onClose={() => {
                                const currentPath = window.location.pathname;
                                const newPath = currentPath.replace('/watch', '').replace('/trailer', '');
                                setPlayerState(p => ({ ...p, isOpen: false })); 
                                window.history.replaceState({}, '', newPath || '/');
                            }}
                            onChannelSelect={(selectedCh) => {
                                handlePlayLiveChannel(selectedCh, allLiveChannels);
                            }}
                        />
                    ) : (
                        <VideoPlayer 
                            {...playerState} 
                            onClose={() => { 
                                const currentPath = window.location.pathname;
                                const newPath = currentPath.replace('/watch', '').replace('/trailer', '');
                                setPlayerState(p => ({ ...p, isOpen: false })); 
                                window.history.replaceState({}, '', newPath);
                            }}
                            onProgressUpdate={handleProgressUpdate}
                            onPlayNext={() => { if (playerState.nextEpisode) { setPlayerState(p => ({ ...p, isOpen: false })); const currentPath = window.location.pathname.replace('/watch', '').replace('/trailer', ''); window.history.replaceState({}, '', currentPath); setTimeout(() => handleFetchSources(playerState.nextEpisode!.title, playerState.nextEpisode!.season, playerState.nextEpisode!.episode), 300); } }}
                        />
                    )}
                </Suspense>
            )}
            <div className={playerState.isOpen ? 'hidden' : 'block'}>
                {!isOnline && (
                    <div className="bg-amber-500 text-black font-extrabold text-xs py-2 px-4 text-center flex items-center justify-center gap-2 sticky top-0 z-[120] shadow-lg">
                        <i className="fa-solid fa-wifi-slash text-base"></i>
                        <span>Offline Mode Active — Viewing recently accessed movie pages & cached data</span>
                    </div>
                )}
                {currentView !== 'live-tv' && (
                    <Navbar 
                        onSearch={handleSearch} 
                        onHome={() => { setCurrentView('home'); window.history.pushState({}, '', '/'); resetToHomeSEO(); }} 
                        onToplist={() => handleToplistClick()} 
                        onLiveTv={handleLiveTvClick}
                        onNews={() => { hasNavigatedRef.current = true; setCurrentView('news'); window.history.pushState({}, '', '/news'); resetToHomeSEO(); }}
                        onAnime={handleAnimeClick}
                        onNovels={handleNovelsClick}
                        onWatchParty={() => handleWatchPartyClick()}
                        onAdult={() => { hasNavigatedRef.current = true; setCurrentView('adult'); window.history.pushState({}, '', '/adult'); resetToHomeSEO(); }}
                        isSearchOpen={isSearchOpen} 
                        setIsSearchOpen={setIsSearchOpen} 
                        trendingKeywords={trendingKeywords} 
                        recentSearches={recentSearches}
                        onClearRecentSearches={clearRecentSearches}
                        currentView={currentView}
                    />
                )}
                <WatchPartyAnnouncementBanner 
                    rooms={activeRooms} 
                    onJoinRoom={(roomId) => handleWatchPartyClick(roomId)} 
                    currentView={currentView} 
                    isSearchOpen={isSearchOpen} 
                />
                <main className="flex-1">
                    <Suspense fallback={<LoadingView />}>
                        {currentView === 'home' && (
                            <div className="pb-24">
                                <HomePage heroMovies={heroMovies} categoriesData={categoriesData} onMovieClick={handleMovieClick} onToplistClick={handleToplistClick} loading={homeLoading} />
                            </div>
                        )}
                        {currentView === 'search' && (
                            <SearchView 
                                query={searchState.query}
                                results={searchState.results}
                                loading={searchState.loading}
                                loadingMore={searchState.loadingMore}
                                hasMore={searchState.hasMore}
                                recentSearches={recentSearches}
                                onSearch={(q) => handleSearch(q, 1)}
                                onClearRecentSearches={clearRecentSearches}
                                onRemoveRecentSearch={removeRecentSearch}
                                onMovieClick={handleMovieClick}
                                onNovelClick={(novelId) => {
                                    setSelectedNovelId(novelId);
                                    setCurrentView('novels');
                                    window.history.pushState({}, '', `/?novel=${novelId}`);
                                }}
                                loadMoreRef={searchLoadMoreRef}
                            />
                        )}
                        {currentView === 'trending' && <TrendingView movies={trendingMovies} loading={trendingLoading} hasMore={trendingHasMore} onLoadMore={() => loadTrending(trendingPage + 1)} onMovieClick={handleMovieClick} />}
                        {currentView === 'toplist' && <ToplistView initialCategory={toplistCategory} onMovieClick={handleMovieClick} onBack={() => { setCurrentView('home'); window.history.pushState({}, '', '/'); }} />}
                        {currentView === 'live-tv' && <LiveTv onBack={() => { setCurrentView('home'); window.history.pushState({}, '', '/'); }} onPlay={handlePlayLiveChannel} />}
                        {currentView === 'news' && <NewsView onPlayMatch={handlePlaySports} onPlayHighlight={handlePlayHighlight} />}
                        {currentView === 'anime' && (
                            <AnimeView 
                                onBack={() => { 
                                    setCurrentView('home'); 
                                    window.history.pushState({}, '', '/'); 
                                    resetToHomeSEO(); 
                                }} 
                                onPlayStream={(title, sources, poster) => {
                                  setPlayerState({
                                    isOpen: true,
                                    title,
                                    poster,
                                    subjectId: 'anime-stream',
                                    sources: sources as any,
                                    subtitles: []
                                  });
                                }}
                            />
                        )}
                        {currentView === 'adult' && <AdultView onBack={() => { setCurrentView('home'); window.history.pushState({}, '', '/'); }} onPlayStream={(title, sources, poster) => {
                          setPlayerState({
                            isOpen: true,
                            title,
                            poster,
                            subjectId: 'adult-stream',
                            sources: sources as any,
                            subtitles: []
                          });
                        }} />}
                        {currentView === 'api-docs' && <ApiDocsView />}
                        {currentView === 'novels' && (
                            <NovelHubView 
                                initialNovelId={selectedNovelId}
                                onBack={() => { 
                                    setSelectedNovelId(null);
                                    setCurrentView('home'); 
                                    window.history.pushState({}, '', '/'); 
                                    resetToHomeSEO(); 
                                }} 
                            />
                        )}
                        {currentView === 'watch-party' && <WatchPartyView onBack={() => { setCurrentView('home'); window.history.pushState({}, '', '/'); resetToHomeSEO(); }} />}
                        {currentView === 'staff' && selectedStaff && <StaffView staffId={selectedStaff.id} staffName={selectedStaff.name} staffAvatar={selectedStaff.avatar} onBack={handleBack} onMovieClick={handleMovieClick} />}
                        {currentView === 'details' && (selectedMovie || loadingDetails) && (
                            <DetailsView 
                                movie={selectedMovie || { title: "Loading...", cover: "", thumbnail: "", type: "Movie", subjectId: "" }} 
                                onBack={handleBack} 
                                onFetchSources={handleFetchSources} 
                                onPlayTrailer={handlePlayTrailer} 
                                onMovieClick={handleMovieClick} 
                                onDubClick={(d) => handleMovieClick({ title: "...", cover: "", thumbnail: "", type: selectedMovie?.type || 'Movie', subjectId: d.subjectId, detailPath: d.detailPath })} 
                                onStaffClick={handleStaffClick} 
                                loading={loadingDetails} 
                            />
                        )}
                    </Suspense>
                </main>
                <Footer />
                <div className="fixed bottom-2 left-0 w-full flex justify-center z-50 pointer-events-none px-2">
                    <div className="pointer-events-auto">
                        <Dock magnification={50} distance={80} panelHeight={52} className="bg-[#121212]/95 border-white/15 shadow-[0_10px_35px_rgba(0,0,0,0.85)]">
                            <DockItem onClick={() => { setCurrentView("home"); window.history.pushState({}, "", "/"); resetToHomeSEO(); }}>
                                <DockLabel>Home</DockLabel>
                                <DockIcon><i className={`fa-solid fa-house text-xl ${currentView === "home" ? "text-primary drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]" : "text-gray-400"}`}></i></DockIcon>
                            </DockItem>
                            <DockItem onClick={() => handleLiveTvClick()}>
                                <DockLabel>Live TV</DockLabel>
                                <DockIcon><i className={`fa-solid fa-satellite-dish text-xl ${currentView === "live-tv" ? "text-primary drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]" : "text-gray-400"}`}></i></DockIcon>
                            </DockItem>
                            <DockItem onClick={() => { setCurrentView("news"); window.history.pushState({}, "", "/news"); }}>
                                <DockLabel>News</DockLabel>
                                <DockIcon><i className={`fa-solid fa-newspaper text-xl ${currentView === "news" ? "text-primary drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]" : "text-gray-400"}`}></i></DockIcon>
                            </DockItem>
                            <DockItem onClick={() => handleAnimeClick()}>
                                <DockLabel>Anime</DockLabel>
                                <DockIcon><i className={`fa-solid fa-tv text-xl ${currentView === "anime" ? "text-primary drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]" : "text-gray-400"}`}></i></DockIcon>
                            </DockItem>
                            <DockItem onClick={() => handleNovelsClick()}>
                                <DockLabel>Novels</DockLabel>
                                <DockIcon><i className={`fa-solid fa-book-open text-xl ${currentView === "novels" ? "text-cyan-400 drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]" : "text-gray-400"}`}></i></DockIcon>
                            </DockItem>
                            <DockItem onClick={() => handleWatchPartyClick()}>
                                <DockLabel>Watch Party</DockLabel>
                                <DockIcon><i className={`fa-solid fa-users-viewfinder text-xl ${currentView === "watch-party" ? "text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]" : "text-gray-400"}`}></i></DockIcon>
                            </DockItem>
                            <DockItem onClick={() => handleTrendingClick()}>
                                <DockLabel>Trending</DockLabel>
                                <DockIcon><i className={`fa-solid fa-fire text-xl ${currentView === "trending" ? "text-primary drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]" : "text-gray-400"}`}></i></DockIcon>
                            </DockItem>
                            <DockItem onClick={() => { setCurrentView("adult"); window.history.pushState({}, "", "/adult"); }}>
                                <DockLabel>+18 Hot</DockLabel>
                                <DockIcon><i className={`fa-solid fa-shield-cat text-xl ${currentView === "adult" ? "text-fuchsia-400 drop-shadow-[0_0_8px_rgba(244,10,240,0.8)]" : "text-fuchsia-500/60"}`}></i></DockIcon>
                            </DockItem>
                            <DockItem onClick={() => setIsSearchOpen(true)}>
                                <DockLabel>Search</DockLabel>
                                <DockIcon><i className="fa-solid fa-search text-xl text-gray-400"></i></DockIcon>
                            </DockItem>
                        </Dock>
                    </div>
                </div>
                <TelegramModal isOpen={showTelegramModal} onClose={handleCloseTelegramModal} />
            </div>
        </div>
    );
};
export default App;