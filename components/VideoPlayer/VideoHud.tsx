import React from 'react';
import { VideoSource, MovieResult } from '../../types';
import { WatchPartyProps } from './VideoPlayerTypes';
import { formatTime } from './utils';
import SeasonSelector from '../SeasonSelector'; // Assuming it's in components/

interface VideoHudProps {
  title: string;
  subTitle?: string;
  playing: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  bufferedRanges?: Array<{ start: number; end: number }>;
  volume: number;
  isMuted: boolean;
  playbackSpeed: number;
  isForcedLandscape: boolean;
  isFullscreen: boolean;
  showControls: boolean;
  locked: boolean;
  showSettings: boolean;
  showSourceSelect: boolean;
  showAudioSubtitleModal: boolean;
  activeSubtitle: number;
  activeAudioTrack: number;
  isLive: boolean;
  watchPartyProps?: WatchPartyProps;
  movie?: MovieResult;
  currentSeason: number;
  currentEpisode: number;
  isSeries: boolean;
  minimized: boolean;
  
  onClose: () => void;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onToggleMute: () => void;
  onVolumeChange: (value: number) => void;
  onToggleFullscreen: () => void;
  onTogglePiP: () => void;
  onCycleSpeed: () => void;
  onToggleLandscape: () => void;
  onToggleSubtitles: () => void;
  onOpenSettings: () => void;
  onOpenSourceSelect: () => void;
  onOpenAudioSubtitle: () => void;
  onOpenEpisodes?: () => void;
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSeekStart: () => void;
  onSeekEnd: (e: any) => void;
  onSeekMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  
  hoverSeekTime: number;
  hoverSeekPercent: number;
  isHoveringSeek: boolean;
  setIsHoveringSeek: (val: boolean) => void;
  
  isHoveringControlsRef: React.MutableRefObject<boolean>;
  onSkipIntro?: () => void;
  onSkipRecap?: () => void;
  isRecapActive?: boolean;
  isIntroActive?: boolean;
}

export const VideoHud: React.FC<VideoHudProps> = ({
  title,
  subTitle,
  playing,
  isBuffering,
  currentTime,
  duration,
  buffered,
  bufferedRanges = [],
  volume,
  isMuted,
  playbackSpeed,
  isForcedLandscape,
  isFullscreen,
  showControls,
  locked,
  showSettings,
  showSourceSelect,
  showAudioSubtitleModal,
  activeSubtitle,
  activeAudioTrack,
  isLive,
  watchPartyProps,
  movie,
  currentSeason,
  currentEpisode,
  isSeries,
  minimized,
  
  onClose,
  onTogglePlay,
  onSkip,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  onTogglePiP,
  onCycleSpeed,
  onToggleLandscape,
  onToggleSubtitles,
  onOpenSettings,
  onOpenSourceSelect,
  onOpenAudioSubtitle,
  onOpenEpisodes,
  onSeek,
  onSeekStart,
  onSeekEnd,
  onSeekMouseMove,
  
  hoverSeekTime,
  hoverSeekPercent,
  isHoveringSeek,
  setIsHoveringSeek,
  
  isHoveringControlsRef,
  onSkipIntro,
  onSkipRecap,
  isRecapActive = false,
  isIntroActive = false,
}) => {
  const validDuration = typeof duration === 'number' && !isNaN(duration) && isFinite(duration) && duration > 0 ? duration : 0;
  const validCurrentTime = typeof currentTime === 'number' && !isNaN(currentTime) && isFinite(currentTime) && currentTime >= 0 ? currentTime : 0;
  const validBuffered = typeof buffered === 'number' && !isNaN(buffered) && isFinite(buffered) && buffered >= 0 ? buffered : 0;

  const bufferedPercent = validDuration > 0 ? Math.min(Math.max((validBuffered / validDuration) * 100, 0), 100) : 0;
  const playedPercent = validDuration > 0 ? Math.min(Math.max((validCurrentTime / validDuration) * 100, 0), 100) : 0;

  return (
    <div 
      className={`absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/80 transition-opacity flex flex-col justify-between z-30 ${showControls && !locked ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      onMouseEnter={() => { isHoveringControlsRef.current = true; }}
      onMouseLeave={() => { isHoveringControlsRef.current = false; }}
    >
      <div 
        className="p-4 flex justify-between items-start pointer-events-auto"
        onMouseEnter={() => { isHoveringControlsRef.current = true; }}
        onMouseLeave={() => { isHoveringControlsRef.current = false; }}
      >
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose} 
            className="w-9 h-9 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <i className="fa-solid fa-arrow-left"></i>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-bold text-sm truncate max-w-[200px]">{title}</h2>
              {watchPartyProps && (
                <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-primary/30 text-[11px] font-bold text-white">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <i className="fa-solid fa-eye text-primary text-[10px]"></i>
                  <span>{watchPartyProps.viewersCount}</span>
                  {watchPartyProps.isHost ? (
                    <span className="text-[9px] bg-amber-500/30 text-amber-300 px-1.5 py-0.2 rounded font-black ml-1 flex items-center gap-1">
                      <i className="fa-solid fa-crown text-[9px] text-amber-300"></i>
                      <span>HOST</span>
                    </span>
                  ) : (
                    <span className="text-[9px] bg-cyan-500/30 text-cyan-300 px-1.5 py-0.2 rounded font-black ml-1">
                      VIEWER
                    </span>
                  )}
                </div>
              )}
            </div>
            {subTitle && <p className="text-gray-400 text-xs">{subTitle}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              const url = window.location.href;
              const text = `Check out ${title} on SL-FLIX! Watch free HD online: ${url}`;
              window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
            }}
            className="w-9 h-9 flex items-center justify-center text-white hover:bg-[#25D366] rounded-full bg-white/10 transition-colors"
            title="Share on WhatsApp"
          >
            <i className="fa-brands fa-whatsapp"></i>
          </button>
          {isSeries && movie && (
            <button 
              onClick={onOpenEpisodes || onOpenSettings} 
              className="w-9 h-9 flex items-center justify-center text-white hover:bg-white/10 rounded-full bg-white/10 transition-colors"
              title="Episodes"
            >
              <i className="fa-solid fa-list-ul"></i>
            </button>
          )}
          <button 
            onClick={onOpenSourceSelect} 
            className="w-9 h-9 flex items-center justify-center text-white hover:bg-white/10 rounded-full bg-white/10"
            title="Quality"
          >
            <i className="fa-solid fa-list"></i>
          </button>
          <button 
            onClick={onOpenSettings} 
            className={`w-9 h-9 flex items-center justify-center rounded-full ${showSettings ? 'bg-primary text-black' : 'text-white hover:bg-white/10'}`}
            title="Settings"
          >
            <i className="fa-solid fa-gear"></i>
          </button>
        </div>
      </div>
      <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${playing || isBuffering ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
        <button 
          onClick={onTogglePlay} 
          className="w-14 h-14 md:w-20 md:h-20 bg-white/90 hover:bg-white rounded-full flex items-center justify-center text-black shadow-lg hover:scale-110 transition-all animate-pulse cursor-pointer"
        >
          <i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'} text-2xl md:text-3xl ml-1`}></i>
        </button>
      </div>
      {!minimized && (
        <div 
          className="p-4 space-y-3 pointer-events-auto"
          onMouseEnter={() => { isHoveringControlsRef.current = true; }}
          onMouseLeave={() => { isHoveringControlsRef.current = false; }}
        >
          {!isLive && (
            <div 
              className="relative w-full h-8 flex items-center group cursor-pointer"
              onMouseMove={onSeekMouseMove}
              onMouseEnter={() => setIsHoveringSeek(true)}
              onMouseLeave={() => setIsHoveringSeek(false)}
            >
              {isHoveringSeek && validDuration > 0 && typeof hoverSeekTime === 'number' && !isNaN(hoverSeekTime) && (
                <div 
                  className="absolute bottom-9 pointer-events-none z-50 flex flex-col items-center -translate-x-1/2 transition-all duration-75"
                  style={{ left: `clamp(45px, ${hoverSeekPercent}%, calc(100% - 45px))` }}
                >
                  <div className="px-3 py-1.5 bg-black/90 backdrop-blur-md rounded-lg border border-primary/40 shadow-2xl flex items-center gap-1.5">
                    <i className="fa-regular fa-clock text-primary text-[10px]"></i>
                    <span className="text-xs font-mono font-bold text-white tracking-wider">
                      {formatTime(hoverSeekTime)}
                    </span>
                  </div>
                  <div className="w-2 h-2 bg-black rotate-45 border-r border-b border-primary/40 -mt-1 shadow" />
                </div>
              )}

              <div className="absolute w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                {/* Advanced Light Red Buffered Segments (cached or pre-fetched ahead) */}
                {bufferedRanges && bufferedRanges.length > 0 ? (
                  bufferedRanges.map((range, idx) => {
                    const left = Math.max(0, Math.min(100, (range.start / validDuration) * 100));
                    const right = Math.max(0, Math.min(100, (range.end / validDuration) * 100));
                    const width = Math.max(0, right - left);
                    return (
                      <div 
                        key={idx}
                        className="absolute h-full bg-red-400/80 rounded-full transition-all duration-150 shadow-[0_0_8px_rgba(248,113,113,0.7)]" 
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    );
                  })
                ) : (
                  <div 
                    className="absolute h-full bg-red-400/80 rounded-full transition-all duration-150 shadow-[0_0_8px_rgba(248,113,113,0.7)]" 
                    style={{ width: `${bufferedPercent}%` }}
                  />
                )}
                {/* Distinct Playhead / Played progress in Cyan */}
                <div 
                  className="absolute h-full bg-primary rounded-full shadow-[0_0_10px_rgba(0,229,255,0.8)]" 
                  style={{ width: `${playedPercent}%` }}
                />
              </div>
              <input
                type="range"
                min="0"
                max={validDuration > 0 ? validDuration : 100}
                step="0.1"
                value={validCurrentTime}
                onChange={onSeek}
                onMouseDown={onSeekStart}
                onMouseUp={onSeekEnd}
                onTouchStart={onSeekStart}
                onTouchEnd={onSeekEnd}
                className="absolute w-full h-1.5 appearance-none bg-transparent cursor-pointer z-10 outline-none
                  [&::-webkit-slider-thumb]:appearance-none 
                  [&::-webkit-slider-thumb]:w-5 
                  [&::-webkit-slider-thumb]:h-5 
                  [&::-webkit-slider-thumb]:rounded-full 
                  [&::-webkit-slider-thumb]:bg-primary 
                  [&::-webkit-slider-thumb]:border-2 
                  [&::-webkit-slider-thumb]:border-white 
                  [&::-webkit-slider-thumb]:shadow-[0_0_15px_rgba(0,229,255,0.9)] 
                  [&::-webkit-slider-thumb]:scale-100 
                  [&::-webkit-slider-thumb]:transition-transform"
              />
            </div>
          )}
          <div className="flex justify-between items-center text-white text-xs">
            <div className="flex items-center gap-3">
              <button onClick={onTogglePlay} className="hover:text-primary transition-colors cursor-pointer">
                <i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`}></i>
              </button>
              {!isLive && (
                <>
                  <button onClick={() => onSkip(-10)} className="hover:text-primary transition-colors cursor-pointer" title="Rewind 10s"><i className="fa-solid fa-rotate-left"></i></button>
                  <button onClick={() => onSkip(10)} className="hover:text-primary transition-colors cursor-pointer" title="Forward 10s"><i className="fa-solid fa-rotate-right"></i></button>
                  {isRecapActive && onSkipRecap && (
                    <button
                      onClick={onSkipRecap}
                      className="px-2 py-0.5 bg-white/15 hover:bg-primary hover:text-black text-white rounded text-[11px] font-bold tracking-tight transition-all flex items-center gap-1 cursor-pointer"
                      title="Skip Recap"
                    >
                      <i className="fa-solid fa-angles-right text-[10px]"></i>
                      <span className="hidden sm:inline">Skip Recap</span>
                    </button>
                  )}
                  {isSeries && onSkipIntro && (
                    <button
                      onClick={onSkipIntro}
                      className="px-2 py-0.5 bg-white/15 hover:bg-primary hover:text-black text-white rounded text-[11px] font-bold tracking-tight transition-all flex items-center gap-1 cursor-pointer"
                      title="Skip Intro (+85s)"
                    >
                      <i className="fa-solid fa-forward-step text-[10px]"></i>
                      <span>Skip Intro</span>
                      <span className="text-[9px] opacity-75 font-semibold">+85s</span>
                    </button>
                  )}
                  <span className="font-mono">
                    {formatTime(validCurrentTime)} / {validDuration > 0 ? formatTime(validDuration) : '--:--'}
                  </span>
                </>
              )}
              {isLive && <span className="text-red-500 font-bold">LIVE</span>}
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSubtitles();
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  onToggleSubtitles();
                }}
                className={`w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer touch-manipulation select-none ${
                  activeSubtitle >= 0 
                    ? 'bg-primary text-black font-extrabold shadow-md shadow-primary/30' 
                    : 'text-gray-300 hover:text-white hover:bg-white/10 bg-black/40'
                }`}
                title="Toggle Subtitles (C)"
              >
                <span className="text-xs font-black tracking-tighter">CC</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAudioSubtitle();
                }}
                className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all ${
                  activeSubtitle >= 0 || activeAudioTrack >= 0
                    ? 'bg-white/15 text-white hover:bg-white/20' 
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
                title="Audio & Subtitles"
              >
                <i className="fa-solid fa-sliders text-xs"></i>
                <span className="hidden sm:inline">Audio & Subs</span>
              </button>

              <div className="relative flex items-center gap-2 group/vol">
                <button onClick={onToggleMute} className="hover:text-primary">
                  <i className={`fa-solid ${isMuted ? 'fa-volume-xmark' : volume > 0.5 ? 'fa-volume-high' : 'fa-volume-low'}`}></i>
                </button>
                <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-200">
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1" 
                    value={isMuted ? 0 : volume}
                    onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                    className="w-16 h-1 accent-primary cursor-pointer"
                  />
                </div>
              </div>
              <button 
                onClick={onCycleSpeed} 
                className="font-bold hover:text-primary"
              >
                {playbackSpeed}x
              </button>
              <button 
                onClick={onToggleLandscape} 
                className={`hover:text-primary transition-colors ${isForcedLandscape ? 'text-primary' : 'text-white/80'}`} 
                title="Toggle Landscape / Rotate Screen"
              >
                <i className="fa-solid fa-mobile-screen-button -rotate-90"></i>
              </button>
              <button onClick={onToggleFullscreen} className="hover:text-primary" title="Fullscreen (F)">
                <i className="fa-solid fa-expand"></i>
              </button>
              <button onClick={onTogglePiP} className="hover:text-primary" title="Picture in Picture / Mini Player">
                <i className="fa-solid fa-clone"></i>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
