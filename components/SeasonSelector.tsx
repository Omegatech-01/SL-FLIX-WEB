import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { Season, MovieResult } from '../types';
import { cacheService } from '../services/cache';
import { getOptimizedImageUrl } from '../utils/image';
interface SeasonSelectorProps {
  movie: MovieResult;
  currentSeason: number;
  currentEpisode: number;
  onSeasonChange: (season: number) => void;
  onEpisodeSelect: (season: number, episode: number) => void;
  className?: string;
}
const SeasonSkeleton: React.FC = () => (
  <div className="flex gap-2 animate-pulse">
    {[1, 2, 3].map(i => (
      <div key={i} className="w-16 h-8 bg-white/10 rounded-lg" />
    ))}
  </div>
);
const EpisodeSkeleton: React.FC = () => (
  <div className="flex gap-3 p-3 animate-pulse">
    <div className="w-16 h-12 bg-white/10 rounded-lg flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="w-3/4 h-4 bg-white/10 rounded" />
      <div className="w-1/2 h-3 bg-white/10 rounded" />
    </div>
  </div>
);
const SeasonSelector: React.FC<SeasonSelectorProps> = ({
  movie,
  currentSeason,
  currentEpisode,
  onSeasonChange,
  onEpisodeSelect,
  className = ''
}) => {
  const [seasons, setSeasons] = useState<Season[]>(movie.seasons || []);
  const [expandedSeason, setExpandedSeason] = useState<number>(currentSeason);
  const [isLoading, setIsLoading] = useState(false);
  const [episodes, setEpisodes] = useState<number[]>([]);
  const [isEpisodesLoading, setIsEpisodesLoading] = useState(false);
  const [isDropdownView, setIsDropdownView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const [watchedProgress, setWatchedProgress] = useState<Record<string, any>>({});
  const loadProgress = () => {
    if (movie.subjectId || movie.detailPath) {
      const key = `slflix_progress_${movie.subjectId || movie.detailPath}`;
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
  }, [movie.subjectId, movie.detailPath]);
  useEffect(() => {
    if (movie.seasons && movie.seasons.length > 0) {
      setSeasons(movie.seasons);
      if (!expandedSeason || !movie.seasons.find(s => s.seasonNumber === expandedSeason)) {
        setExpandedSeason(movie.seasons[0].seasonNumber);
      }
    }
  }, [movie.seasons]);
  useEffect(() => {
    const seasonData = seasons.find(s => s.seasonNumber === expandedSeason);
    if (seasonData) {
      const epCount = seasonData.episodeCount || 12;
      setEpisodes(Array.from({ length: epCount }, (_, i) => i + 1));
    }
  }, [expandedSeason, seasons]);
  const handleSeasonClick = useCallback((seasonNumber: number) => {
    setExpandedSeason(prev => prev === seasonNumber ? prev : seasonNumber);
    onSeasonChange(seasonNumber);
  }, [onSeasonChange]);
  const handleEpisodeClick = useCallback((episodeNumber: number) => {
    onEpisodeSelect(expandedSeason, episodeNumber);
  }, [expandedSeason, onEpisodeSelect]);

  const scrollHorizontally = (direction: 'left' | 'right') => {
    if (horizontalScrollRef.current) {
      const scrollAmount = direction === 'left' ? -350 : 350;
      horizontalScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  if (!seasons || seasons.length === 0) {
    return null;
  }
  return (
    <div 
      ref={containerRef}
      className={`bg-[#1a1a2e] rounded-xl overflow-hidden ${className}`}
    >
      {}
      <div className="p-4 border-b border-white/10 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Seasons & Episodes
          </h3>
          {}
          <button
            onClick={() => setIsDropdownView(!isDropdownView)}
            className="text-xs text-primary hover:text-white flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 transition-all cursor-pointer font-medium"
            title="Toggle between slide view and full dropdown list"
          >
            <i className={`fa-solid ${isDropdownView ? 'fa-horizontal-rule' : 'fa-list-ul'} text-xs`} />
            <span>{isDropdownView ? 'Slide View' : 'Drop Down List'}</span>
          </button>
        </div>
        {isLoading ? (
          <SeasonSkeleton />
        ) : (
          <div className="flex flex-wrap gap-2">
            {seasons.map((season) => (
              <button
                key={season.seasonNumber}
                onClick={() => handleSeasonClick(season.seasonNumber)}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer
                  ${expandedSeason === season.seasonNumber
                    ? 'bg-primary text-black shadow-lg shadow-primary/30 font-bold'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
                  }
                `}
              >
                Season {season.seasonNumber}
                <span className="ml-1.5 text-xs opacity-70">
                  ({season.episodeCount} eps)
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {}
      {isDropdownView ? (
        <div className="max-h-80 overflow-y-auto scrollbar-hide p-2 space-y-1.5">
          {isEpisodesLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <EpisodeSkeleton key={i} />
              ))}
            </div>
          ) : (
            episodes.map((episodeNumber) => {
              const epKey = `S${expandedSeason}E${episodeNumber}`;
              const progressData = watchedProgress[epKey];
              const isWatched = progressData?.completed || false;
              return (
                <EpisodeItem
                  key={episodeNumber}
                  seasonNumber={expandedSeason}
                  episodeNumber={episodeNumber}
                  isActive={expandedSeason === currentSeason && episodeNumber === currentEpisode}
                  isWatched={isWatched}
                  coverImage={movie.cover || movie.thumbnail}
                  onClick={() => handleEpisodeClick(episodeNumber)}
                />
              );
            })
          )}
        </div>
      ) : (
        <div className="p-4 relative group">
          {}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
              Season {expandedSeason} Episodes (Slide to browse)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => scrollHorizontally('left')}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white transition-colors cursor-pointer"
                title="Scroll Left"
              >
                <i className="fa-solid fa-chevron-left text-xs" />
              </button>
              <button
                onClick={() => scrollHorizontally('right')}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white transition-colors cursor-pointer"
                title="Scroll Right"
              >
                <i className="fa-solid fa-chevron-right text-xs" />
              </button>
            </div>
          </div>

          {}
          <div
            ref={horizontalScrollRef}
            className="flex gap-3 overflow-x-auto scrollbar-hide py-1 pb-2 scroll-smooth"
          >
            {isEpisodesLoading ? (
              <div className="flex gap-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-44 h-36 bg-white/10 rounded-xl animate-pulse flex-shrink-0" />
                ))}
              </div>
            ) : (
              episodes.map((episodeNumber) => {
                const epKey = `S${expandedSeason}E${episodeNumber}`;
                const progressData = watchedProgress[epKey];
                const isWatched = progressData?.completed || false;
                const isActive = expandedSeason === currentSeason && episodeNumber === currentEpisode;
                return (
                  <EpisodeCardHorizontal
                    key={episodeNumber}
                    seasonNumber={expandedSeason}
                    episodeNumber={episodeNumber}
                    isActive={isActive}
                    isWatched={isWatched}
                    coverImage={movie.cover || movie.thumbnail}
                    onClick={() => handleEpisodeClick(episodeNumber)}
                  />
                );
              })
            )}
          </div>
        </div>
      )}

      {}
      {seasons.length > 1 && (
        <div className="p-3 border-t border-white/10 flex justify-between bg-white/[0.01]">
          <button
            onClick={() => {
              const currentIndex = seasons.findIndex(s => s.seasonNumber === expandedSeason);
              if (currentIndex > 0) {
                handleSeasonClick(seasons[currentIndex - 1].seasonNumber);
              }
            }}
            disabled={seasons.findIndex(s => s.seasonNumber === expandedSeason) === 0}
            className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
          >
            ← Previous Season
          </button>
          <button
            onClick={() => {
              const currentIndex = seasons.findIndex(s => s.seasonNumber === expandedSeason);
              if (currentIndex < seasons.length - 1) {
                handleSeasonClick(seasons[currentIndex + 1].seasonNumber);
              }
            }}
            disabled={seasons.findIndex(s => s.seasonNumber === expandedSeason) === seasons.length - 1}
            className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
          >
            Next Season →
          </button>
        </div>
      )}
    </div>
  );
};

const EpisodeCardHorizontal: React.FC<EpisodeItemProps> = ({
  seasonNumber,
  episodeNumber,
  isActive,
  isWatched,
  coverImage,
  onClick
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isActive && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [isActive]);
  return (
    <button
      ref={cardRef}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        flex-shrink-0 w-44 rounded-xl overflow-hidden text-left transition-all duration-300 border flex flex-col cursor-pointer group
        ${isActive 
          ? 'bg-primary/20 border-primary shadow-[0_0_15px_rgba(0,229,255,0.4)] ring-2 ring-primary' 
          : isWatched
            ? 'bg-white/5 border-emerald-500/50 opacity-90'
            : isHovered 
              ? 'bg-white/10 border-white/20 translate-y-[-2px]' 
              : 'bg-white/[0.03] border-white/10 hover:bg-white/5'
        }
      `}
    >
      <div className="relative w-full h-24 bg-black/40 overflow-hidden flex items-center justify-center">
        {coverImage ? (
          <LazyLoadImage
            src={getOptimizedImageUrl(coverImage, 300)}
            alt={`Episode ${episodeNumber}`}
            effect="blur"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            wrapperClassName="w-full h-full"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#1e2038]">
            <span className="text-sm font-mono font-bold text-cyan-400">EP {episodeNumber}</span>
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono font-bold text-white border border-white/10">
          EP {episodeNumber}
        </div>
        {isWatched && (
          <div className="absolute top-1.5 right-1.5 bg-emerald-500 text-black px-1.5 py-0.5 rounded text-[10px] font-extrabold flex items-center gap-1 shadow-md">
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
            Watched
          </div>
        )}
        <div className={`
          absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-200
          ${isHovered || isActive ? 'opacity-100' : 'opacity-0'}
        `}>
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isActive ? 'bg-primary text-black' : 'bg-white text-black'}`}>
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
      <div className="p-2.5 flex flex-col justify-between flex-1 bg-white/[0.01]">
        <div className={`text-xs font-bold truncate ${isActive ? 'text-primary' : isWatched ? 'text-emerald-400' : 'text-white'}`}>
          Episode {episodeNumber}
        </div>
        <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
          <span>Season {seasonNumber}</span>
          {isActive && <span className="text-primary font-bold">Playing</span>}
        </div>
      </div>
    </button>
  );
};
interface EpisodeItemProps {
  seasonNumber: number;
  episodeNumber: number;
  isActive: boolean;
  isWatched?: boolean;
  coverImage?: string;
  onClick: () => void;
}
const EpisodeItem: React.FC<EpisodeItemProps> = ({
  seasonNumber,
  episodeNumber,
  isActive,
  isWatched,
  coverImage,
  onClick
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const itemRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isActive && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActive]);
  return (
    <button
      ref={itemRef}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        w-full flex gap-3 p-2 rounded-lg transition-all duration-200
        ${isActive 
          ? 'bg-primary/20 border-2 border-primary shadow-[0_0_10px_rgba(0,229,255,0.3)]' 
          : isWatched
            ? 'bg-white/5 border border-emerald-500/50 opacity-80'
            : isHovered 
              ? 'bg-white/10' 
              : 'hover:bg-white/5 border border-transparent'
        }
      `}
    >
      {/* Thumbnail or Sleek Icon badge */}
      <div className="relative w-20 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/10 flex items-center justify-center">
        {coverImage ? (
          <LazyLoadImage
            src={getOptimizedImageUrl(coverImage, 150)}
            alt={`Episode ${episodeNumber}`}
            effect="blur"
            className="w-full h-full object-cover"
            wrapperClassName="w-full h-full"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#1e2038]">
            <span className="text-xs font-mono font-bold text-cyan-400">EP {episodeNumber}</span>
          </div>
        )}
        <div className={`
          absolute inset-0 flex items-center justify-center bg-black/40
          transition-opacity duration-200
          ${isHovered || isActive ? 'opacity-100' : 'opacity-0'}
        `}>
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center
            ${isActive ? 'bg-primary text-black' : 'bg-white text-black'}
          `}>
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className={`
          text-sm font-medium truncate
          ${isActive ? 'text-primary' : isWatched ? 'text-emerald-400' : 'text-white'}
        `}>
          Episode {episodeNumber}
        </div>
        <div className="text-xs text-gray-500 truncate flex items-center gap-2 mt-1">
          <span>Season {seasonNumber}</span>
          {isActive && (
            <span className="text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded text-[10px]">
              Now Playing
            </span>
          )}
          {isWatched && !isActive && (
            <span className="text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-0.5">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Watched
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center">
        {isActive ? (
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_5px_rgba(0,229,255,0.8)]" />
        ) : isWatched ? (
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
        ) : null}
      </div>
    </button>
  );
};
export { EpisodeItem };
export default SeasonSelector;