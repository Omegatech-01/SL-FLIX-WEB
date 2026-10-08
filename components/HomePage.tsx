import React, { Suspense } from 'react';
import { CategoryData, MovieResult } from '../types';
import { ApiService } from '../services/api';
import MovieCard from './MovieCard';
import Loader from './Loader';
import { ChevronRightIcon } from './Icons';
import { getOptimizedImageUrl, DEFAULT_FAVICON_FALLBACK } from '../utils/image';
const HeroSkeleton = () => (
  <div className="h-[50vh] md:h-[70vh] relative flex items-center bg-[#0a0a15]">
    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a15] via-[#0a0a15]/30 to-transparent"></div>
    <div className="relative z-10 px-[4%] w-full max-w-4xl mt-20">
      <div className="h-6 w-24 bg-white/10 rounded-full mb-4 animate-pulse"></div>
      <div className="h-12 md:h-16 w-4/5 bg-white/10 rounded-lg mb-4 animate-pulse"></div>
      <div className="h-6 w-3/5 bg-white/10 rounded-lg mb-6 animate-pulse"></div>
      <div className="h-12 w-40 bg-white/10 rounded-full animate-pulse"></div>
    </div>
  </div>
);
const CategorySkeleton = () => (
  <div className="my-8 px-[4%]">
    <div className="h-8 w-48 bg-white/10 rounded mb-4 animate-pulse"></div>
    <div className="flex gap-4 overflow-hidden">
      {[1, 2, 3, 4, 5, 6].map((j) => (
        <div key={j} className="flex-none w-[140px] md:w-[180px]">
          <div className="w-full aspect-[2/3] bg-white/10 rounded-lg animate-pulse"></div>
          <div className="h-4 w-3/4 mt-2 bg-white/10 rounded animate-pulse"></div>
        </div>
      ))}
    </div>
  </div>
);
const Hero: React.FC<{ movies: MovieResult[], onPlay: (m: MovieResult) => void, onDetails: (m: MovieResult) => void }> = ({ movies, onPlay, onDetails }) => {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  React.useEffect(() => {
    if (movies.length <= 1) return;
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => { 
        setCurrentIndex((prev) => (prev + 1) % movies.length); 
        setIsTransitioning(false); 
      }, 500);
    }, 8000);
    return () => clearInterval(interval);
  }, [movies.length]);
  if (!movies.length) return <HeroSkeleton />;
  const m = movies[currentIndex];
  const goToSlide = (idx: number) => { 
    if (idx === currentIndex) return; 
    setIsTransitioning(true); 
    setTimeout(() => { 
      setCurrentIndex(idx); 
      setIsTransitioning(false); 
    }, 300); 
  };
  const rating = m.imdbRating && m.imdbRating !== '0' && m.imdbRating !== 'null' ? m.imdbRating : null;
  return (
    <div className="h-[75vh] md:h-[80vh] relative flex items-center bg-[#0a0a15] overflow-hidden group mt-16 md:mt-0">
      <div className="absolute inset-0">
        {movies.map((movie, idx) => {
          const bgImg = movie.cover || movie.thumbnail || (movie as any).posterUrl;
          return (
            <div 
              key={idx} 
              className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-in-out ${idx === currentIndex ? 'opacity-40 scale-100' : 'opacity-0 scale-95'}`} 
              style={{ backgroundImage: `url(${getOptimizedImageUrl(bgImg, 1200)})`, filter: 'blur(2px)' }} 
            />
          );
        })}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a15] via-[#0a0a15]/90 to-transparent"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a15] via-[#0a0a15]/95 to-transparent/30"></div>
      <div className="relative z-10 px-[4%] md:px-[6%] w-full max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 md:gap-16 mt-8 md:mt-0">
        <div className={`flex-1 transition-all duration-700 w-full ${isTransitioning ? 'opacity-0 -translate-x-4' : 'opacity-100 translate-x-0'}`}>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-white font-bold text-[10px] md:text-xs tracking-[0.2em] uppercase px-3 py-1 bg-white/10 backdrop-blur-md rounded-sm border border-white/10">
              {m.type === 'Movie' ? 'Feature Film' : (m.type || 'Trending')}
            </span>
            {rating && (
              <span className="text-yellow-400 font-bold text-[10px] md:text-xs flex items-center gap-1 bg-black/50 backdrop-blur-md px-2 py-1 rounded-sm border border-white/5">
                <i className="fa-solid fa-star"></i> {rating}
              </span>
            )}
            {m.releaseDate && <span className="text-gray-300 text-[10px] md:text-xs font-medium bg-white/5 px-2 py-1 rounded-sm">{m.releaseDate.substring(0, 4)}</span>}
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-white mb-4 leading-[1.1] tracking-tighter drop-shadow-2xl line-clamp-3">
            {m.title}
          </h1>
          {m.genre && (
            <div className="flex items-center gap-2 text-sm text-gray-300 mb-6 font-medium">
              <span className="text-primary">•</span>
              <span>{m.genre}</span>
            </div>
          )}
          <p className="text-gray-300 text-sm sm:text-base md:text-lg mb-8 max-w-2xl line-clamp-2 sm:line-clamp-3 md:line-clamp-4 drop-shadow-lg font-medium leading-relaxed">
            {m.description || "Watch this and more trending content in ultra high definition. Stream anywhere, anytime on SLFLIX."}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button 
              onClick={() => onPlay(m)} 
              className="bg-primary text-black font-bold text-base md:text-lg py-3 md:py-4 px-8 md:px-10 rounded hover:bg-white transition-all duration-300 flex items-center gap-3 shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:scale-105 hover:shadow-[0_0_30px_rgba(0,229,255,0.5)]"
            >
              <i className="fa-solid fa-play"></i>
              <span>Play Now</span>
            </button>
            <button 
              onClick={() => onDetails(m)} 
              className="bg-white/10 hover:bg-white/20 text-white backdrop-blur-md font-bold text-base md:text-lg py-3 md:py-4 px-8 rounded transition-all duration-300 flex items-center gap-3 border border-white/10"
            >
              <i className="fa-solid fa-circle-info"></i>
              <span>Details</span>
            </button>
          </div>
        </div>
        <div className={`hidden md:block w-[280px] lg:w-[340px] flex-shrink-0 transition-all duration-700 delay-100 ${isTransitioning ? 'opacity-0 translate-x-8 scale-95' : 'opacity-100 translate-x-0 scale-100'}`}>
           <div 
             className="w-full aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 relative cursor-pointer group"
             onClick={() => onPlay(m)}
           >
              <img 
                src={getOptimizedImageUrl(m.cover || m.thumbnail || (m as any).posterUrl, 600)} 
                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_FAVICON_FALLBACK; }} 
                alt={m.title} 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
              />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500"></div>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-full bg-primary/90 text-black flex items-center justify-center shadow-[0_0_30px_rgba(0,229,255,0.5)] transform scale-50 group-hover:scale-100 transition-transform duration-500 delay-100">
                      <i className="fa-solid fa-play ml-1 text-xl sm:text-2xl"></i>
                  </div>
              </div>
           </div>
        </div>
      </div>
      {movies.length > 1 && (
        <div className="absolute bottom-6 left-[4%] md:left-auto right-auto md:right-[6%] z-20 flex items-center gap-2 md:gap-3 bg-black/40 backdrop-blur-md p-1.5 rounded-xl border border-white/5 max-w-[92%] md:max-w-[70%] overflow-x-auto scrollbar-hide">
          {movies.map((movie, idx) => (
            <button 
              key={idx} 
              onClick={() => goToSlide(idx)} 
              className={`relative w-12 md:w-14 h-16 md:h-20 rounded-lg overflow-hidden transition-all duration-300 border flex-shrink-0 cursor-pointer ${idx === currentIndex ? 'border-primary scale-110 shadow-[0_0_15px_rgba(0,229,255,0.4)]' : 'border-white/10 opacity-60 hover:opacity-100 hover:scale-105'}`} 
            >
              <img src={getOptimizedImageUrl(movie.cover || movie.thumbnail || (movie as any).posterUrl, 100)} onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_FAVICON_FALLBACK; }} alt={movie.title} className="w-full h-full object-cover" />
              {idx === currentIndex && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"><i className="fa-solid fa-play text-[10px] text-black ml-0.5"></i></div>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
const CategoryRow: React.FC<{ data: CategoryData, onMovieClick: (m: MovieResult) => void, onSeeMore?: () => void }> = ({ data, onMovieClick, onSeeMore }) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = React.useState(false);
  const [showRightArrow, setShowRightArrow] = React.useState(true);
  const [isHovered, setIsHovered] = React.useState(false);
  const [movies, setMovies] = React.useState(data.movies);
  const [page, setPage] = React.useState(1);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);
  React.useEffect(() => {
    setMovies(data.movies);
    setPage(1);
    setHasMore(true);
  }, [data.movies]);
  if (!movies || movies.length === 0) return <CategorySkeleton />;
  const gridLoadMoreRef = React.useRef<HTMLDivElement>(null);
  const loadMore = React.useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await ApiService.getRankingList(data.title, nextPage);
      if (res.results && res.results.length > 0) {
        const newMovies = res.results.filter((nm: MovieResult) => !movies.some(m => m.subjectId === nm.subjectId));
        if (newMovies.length > 0) {
          setMovies(prev => [...prev, ...newMovies]);
          setPage(nextPage);
          setHasMore(res.hasMore);
        } else {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error(e);
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, page, data.title, movies]);
  React.useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
        loadMore();
      }
    }, { threshold: 0.1 });
    if (gridLoadMoreRef.current) observer.observe(gridLoadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);
  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
      if (scrollLeft + clientWidth >= scrollWidth - 400 && !isLoadingMore && hasMore) {
        loadMore();
      }
    }
  };
  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -400 : 400;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };
  React.useEffect(() => {
    if (isHovered || movies.length <= 4 || movies.length > 15) return;
    const interval = setInterval(() => {
      if (scrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        if (scrollLeft >= scrollWidth - clientWidth - 10) {
          scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          scrollRef.current.scrollBy({ left: 200, behavior: 'smooth' });
        }
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [isHovered, movies.length]);
  return (
    <div className="my-8 px-[4%]" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full"></span>
          {data.title}
          {data.isLive && (
            <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase animate-pulse">
              Live
            </span>
          )}
        </h2>
        {onSeeMore && (
          <button 
            onClick={onSeeMore} 
            className="text-primary hover:text-white text-xs md:text-sm font-black uppercase tracking-wider flex items-center gap-1 transition-colors group cursor-pointer bg-transparent border-none"
          >
            See More
            <i className="fa-solid fa-chevron-right text-[10px] transition-transform group-hover:translate-x-1"></i>
          </button>
        )}
      </div>
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6 md:gap-x-5 md:gap-y-6">
          {movies.map((m, i) => (
            <div key={`${m.subjectId}-${i}`} className="w-full">
              <MovieCard movie={m} onClick={onMovieClick} />
            </div>
          ))}
        </div>
        <div ref={gridLoadMoreRef} className="w-full flex justify-center py-6">
          {isLoadingMore && <Loader type="circle" inline />}
          {!hasMore && movies.length > 0 && (
            <p className="text-gray-500 text-xs uppercase tracking-wider font-bold">No more content</p>
          )}
        </div>
      </div>
    </div>
  );
};
const GENRES = [
  { id: 'All', name: 'All Genres', icon: 'fa-border-all' },
  { id: 'Action', name: 'Action', icon: 'fa-fire-flame-curved' },
  { id: 'Adventure', name: 'Adventure', icon: 'fa-compass' },
  { id: 'Comedy', name: 'Comedy', icon: 'fa-face-laugh-beam' },
  { id: 'Drama', name: 'Drama', icon: 'fa-masks-theater' },
  { id: 'Sci-Fi', name: 'Sci-Fi', icon: 'fa-rocket' },
  { id: 'Romance', name: 'Romance', icon: 'fa-heart' },
  { id: 'Horror', name: 'Horror', icon: 'fa-ghost' },
  { id: 'Anime', name: 'Anime', icon: 'fa-dragon' },
  { id: 'K-Drama', name: 'K-Drama', icon: 'fa-star' },
  { id: 'Animation', name: 'Animation', icon: 'fa-film' },
  { id: 'Thriller', name: 'Thriller', icon: 'fa-skull' },
  { id: 'Crime', name: 'Crime', icon: 'fa-handcuffs' },
  { id: 'Fantasy', name: 'Fantasy', icon: 'fa-wand-magic-sparkles' },
  { id: 'Documentary', name: 'Documentary', icon: 'fa-video' },
];

const HomePage: React.FC<{
  heroMovies: MovieResult[];
  categoriesData: CategoryData[];
  onMovieClick: (m: MovieResult) => void;
  onToplistClick: (category?: string) => void;
  loading: boolean;
}> = ({ heroMovies, categoriesData, onMovieClick, onToplistClick, loading }) => {
  const [selectedGenre, setSelectedGenre] = React.useState<string>('All');
  const genreNavRef = React.useRef<HTMLDivElement>(null);

  const availableGenrePills = React.useMemo(() => {
    const basePillIds = new Set(GENRES.map(g => g.id.toLowerCase()));
    const extraPills: Array<{ id: string; name: string; icon: string }> = [];

    categoriesData.forEach(cat => {
      const cleanTitle = cat.title.replace(/Movies|Series|TV|List|Top/gi, '').trim();
      if (cleanTitle && cleanTitle.length > 2 && !basePillIds.has(cleanTitle.toLowerCase()) && !basePillIds.has(cat.title.toLowerCase())) {
        basePillIds.add(cleanTitle.toLowerCase());
        extraPills.push({
          id: cleanTitle,
          name: cat.title,
          icon: 'fa-tag'
        });
      }
    });

    return [...GENRES, ...extraPills];
  }, [categoriesData]);

  const filteredCategories = React.useMemo(() => {
    if (selectedGenre === 'All') return categoriesData;

    const target = selectedGenre.toLowerCase();

    const filtered = categoriesData.map(cat => {
      const catTitleMatches = cat.title.toLowerCase().includes(target);
      if (catTitleMatches) {
        return cat;
      }

      const matchingMovies = cat.movies.filter(m => {
        const g = (m.genre || '').toLowerCase();
        const t = (m.type || '').toLowerCase();
        const title = (m.title || '').toLowerCase();
        return g.includes(target) || t.includes(target) || title.includes(target);
      });

      if (matchingMovies.length > 0) {
        return { ...cat, movies: matchingMovies };
      }
      return null;
    }).filter(Boolean) as CategoryData[];

    if (filtered.length > 0) return filtered;

    const allMovies: MovieResult[] = [];
    const seenIds = new Set<string>();

    [...heroMovies, ...categoriesData.flatMap(c => c.movies)].forEach(m => {
      const id = m.subjectId || m.detailPath || m.title;
      if (id && !seenIds.has(id)) {
        const g = (m.genre || '').toLowerCase();
        const t = (m.type || '').toLowerCase();
        const title = (m.title || '').toLowerCase();
        if (g.includes(target) || t.includes(target) || title.includes(target)) {
          seenIds.add(id);
          allMovies.push(m);
        }
      }
    });

    if (allMovies.length > 0) {
      return [{
        title: `${selectedGenre} Titles`,
        query: selectedGenre,
        movies: allMovies
      }];
    }

    return [];
  }, [selectedGenre, categoriesData, heroMovies]);

  const effectiveHeroMovies = React.useMemo(() => {
    if (heroMovies && heroMovies.length > 0) return heroMovies;
    if (categoriesData && categoriesData.length > 0) {
      for (const cat of categoriesData) {
        if (cat.movies && cat.movies.length > 0) {
          return cat.movies.slice(0, 6);
        }
      }
    }
    return [];
  }, [heroMovies, categoriesData]);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <HeroSkeleton />
        {[1, 2, 3, 4].map((i) => <CategorySkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="pb-24">
      <Suspense fallback={<HeroSkeleton />}>
        <Hero movies={effectiveHeroMovies} onPlay={onMovieClick} onDetails={onMovieClick} />
      </Suspense>

      {/* Genre Navigation Bar */}
      <div ref={genreNavRef} className="sticky top-[58px] z-30 bg-[#0a0a15]/90 backdrop-blur-xl border-y border-white/10 py-3.5 px-[4%] shadow-2xl transition-all">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 bg-primary rounded-full"></span>
              <h3 className="text-xs md:text-sm font-black uppercase tracking-wider text-gray-300">Browse by Genre</h3>
            </div>
            {selectedGenre !== 'All' && (
              <button
                onClick={() => setSelectedGenre('All')}
                className="text-xs text-primary hover:text-white font-bold flex items-center gap-1.5 transition-colors bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-full border border-primary/30"
              >
                <span>Reset filter</span>
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            )}
          </div>

          <div className="relative group">
            <div className="flex items-center gap-2 md:gap-3 overflow-x-auto scrollbar-hide py-1 scroll-smooth">
              {availableGenrePills.map((genre) => {
                const isActive = selectedGenre.toLowerCase() === genre.id.toLowerCase();
                return (
                  <button
                    key={genre.id}
                    onClick={() => {
                      setSelectedGenre(genre.id);
                      if (genreNavRef.current) {
                        const yOffset = -70;
                        const element = genreNavRef.current;
                        const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
                        window.scrollTo({ top: y, behavior: 'smooth' });
                      }
                    }}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold whitespace-nowrap transition-all duration-300 cursor-pointer flex-shrink-0 ${
                      isActive
                        ? 'bg-primary text-black shadow-[0_0_20px_rgba(0,229,255,0.4)] scale-105'
                        : 'bg-white/5 hover:bg-white/15 text-gray-300 border border-white/10 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    <i className={`fa-solid ${genre.icon} text-xs ${isActive ? 'text-black' : 'text-primary'}`}></i>
                    <span>{genre.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Content Categories or Empty State */}
      <div className="mt-4">
        {selectedGenre !== 'All' && (
          <div className="px-[4%] max-w-7xl mx-auto my-4 flex items-center justify-between bg-primary/10 border border-primary/20 rounded-xl p-3">
            <div className="flex items-center gap-2 text-sm text-white font-medium">
              <span className="text-gray-400">Filtering:</span>
              <span className="font-bold text-primary">{selectedGenre}</span>
              <span className="text-xs text-gray-400">({filteredCategories.reduce((acc, c) => acc + c.movies.length, 0)} items found)</span>
            </div>
            <button
              onClick={() => setSelectedGenre('All')}
              className="text-xs text-gray-400 hover:text-white underline font-bold"
            >
              Show all
            </button>
          </div>
        )}

        {filteredCategories.length > 0 ? (
          filteredCategories.map((cat, i) => (
            <Suspense key={`${selectedGenre}-${i}-${cat.title}`} fallback={<CategorySkeleton />}>
              <CategoryRow data={cat} onMovieClick={onMovieClick} onSeeMore={() => onToplistClick(cat.title)} />
            </Suspense>
          ))
        ) : (
          <div className="my-16 px-[4%] text-center max-w-md mx-auto py-12 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto mb-4 text-2xl">
              <i className="fa-solid fa-film"></i>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">No Content Found</h3>
            <p className="text-gray-400 text-sm mb-6">We couldn't find any titles under "{selectedGenre}". Try selecting a different genre or browse all categories.</p>
            <button
              onClick={() => setSelectedGenre('All')}
              className="bg-primary text-black font-bold px-6 py-2.5 rounded-xl hover:bg-white transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] text-sm"
            >
              Browse All Genres
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
export default HomePage;