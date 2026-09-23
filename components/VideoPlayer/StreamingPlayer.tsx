import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
import SubtitleManager, { findBestSubtitle } from '../SubtitleManager';
import SeasonSelector from '../SeasonSelector';
import { RetroTvError } from '../RetroTvError';
import { fetchAndParseSrt, SrtCue } from '../../utils/srtParser';
import { AudioSubtitleModal, AudioTrackItem } from '../AudioSubtitleModal';
import { 
  CaptionSettings, 
  getStoredCaptionSettings, 
  getCaptionFontFamilyCss, 
  getCaptionBgCss, 
  getCaptionTextShadowCss 
} from '../../utils/captionSettings';
import { VideoPlayerProps, WatchPartyProps, ChapterMarker } from './VideoPlayerTypes';
import { formatTime, convertSrtUrlToVttBlob, triggerHaptic } from './utils';
import { FastStreamLoader } from './FastStreamLoader';
import { VideoHud } from './VideoHud';
import { VideoSource } from '../../types';

// Module-level persistent cache across movie switches so leaving and coming back preserves position
interface MoviePlaybackSession {
  currentTime: number;
  duration: number;
  sourceIndex: number;
  timestamp: number;
}
const moviePlaybackSessionCache = new Map<string, MoviePlaybackSession>();

export const StreamingPlayer: React.FC<VideoPlayerProps> = ({ 
  title, 
  subTitle, 
  sources, 
  subtitles = [], 
  onClose, 
  minimized = false, 
  embedded = false,
  watchPartyProps,
  onToggleMinimize,
  initialTime = 0, 
  onProgressUpdate, 
  nextEpisode, 
  onPlayNext, 
  isLive = false,
  isTrailer = false,
  subjectId,
  movie,
  currentSeason = 1,
  currentEpisode = 1,
  onSeasonChange,
  onEpisodeChange
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);

  // Restore saved playback position from session cache or local storage if not provided
  const effectiveInitialTime = useMemo(() => {
    if (initialTime && initialTime > 0) return initialTime;
    const movieKey = subjectId || movie?.subjectId || title;
    if (movieKey) {
      const cached = moviePlaybackSessionCache.get(movieKey);
      if (cached && cached.currentTime > 5 && (!cached.duration || cached.currentTime < cached.duration - 15)) {
        return cached.currentTime;
      }
      try {
        const stored = localStorage.getItem(`slflix_progress_${movieKey}`);
        if (stored) {
          const data = JSON.parse(stored);
          const epKey = `S${currentSeason || 1}E${currentEpisode || 1}`;
          if (data[epKey]?.time && data[epKey].time > 5) return data[epKey].time;
          if (data['S1E1']?.time && data['S1E1'].time > 5) return data['S1E1'].time;
          if (data.time && data.time > 5) return data.time;
        }
      } catch (e) {}
    }
    return 0;
  }, [initialTime, subjectId, movie?.subjectId, title, currentSeason, currentEpisode]);

  const [currentTime, setCurrentTime] = useState(effectiveInitialTime);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [bufferedRanges, setBufferedRanges] = useState<Array<{ start: number; end: number }>>([]);
  const [showControls, setShowControls] = useState(true);
  const [locked, setLocked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSourceSelect, setShowSourceSelect] = useState(false);
  const [showSeasonSelector, setShowSeasonSelector] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [resizeMode, setResizeMode] = useState<'contain' | 'cover'>('contain');
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [preferredQuality, setPreferredQuality] = useState(() => {
    return localStorage.getItem('slflix_preferred_quality') || 'Auto';
  });
  const [activeSubtitle, setActiveSubtitle] = useState<number>(-1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [convertedSubUrls, setConvertedSubUrls] = useState<Record<number, string>>({});
  const [isConvertingSubs, setIsConvertingSubs] = useState(false);
  const [networkState, setNetworkState] = useState<'good' | 'unstable' | 'offline'>('good');
  const [showNextCountdown, setShowNextCountdown] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [showReconnected, setShowReconnected] = useState(false);
  const [autoPlayNext, setAutoPlayNext] = useState(() => {
    return localStorage.getItem('slflix_autoplay_next') !== 'false';
  });
  const [needsUserGesture, setNeedsUserGesture] = useState(false);
  const hasTriggeredAutoPlayRef = useRef(false);
  const savedTimeRef = useRef<number>(effectiveInitialTime || 0);
  const [isDragging, setIsDragging] = useState(false);
  const wantsToPlayRef = useRef(true);

  // Subtitle Overlay Engine
  const [activeCues, setActiveCues] = useState<SrtCue[]>([]);
  const [activeSubtitleCue, setActiveSubtitleCue] = useState<string | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0);
  const [subtitleFontSize, setSubtitleFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [showAudioSubtitleModal, setShowAudioSubtitleModal] = useState(false);
  const [captionSettings, setCaptionSettings] = useState<CaptionSettings>(getStoredCaptionSettings);

  // Audio Tracks
  const [audioTracks, setAudioTracks] = useState<AudioTrackItem[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState<number>(-1);

  // Seekbar Preview
  const [isHoveringSeek, setIsHoveringSeek] = useState(false);
  const [hoverSeekPercent, setHoverSeekPercent] = useState(0);
  const [hoverSeekTime, setHoverSeekTime] = useState(0);
  const [isForcedLandscape, setIsForcedLandscape] = useState(false);

  // HUD Toast
  const [hudToast, setHudToast] = useState<{ message: string; icon?: string } | null>(null);
  const hudToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringControlsRef = useRef(false);

  const showHudToast = useCallback((message: string, icon?: string) => {
    setHudToast({ message, icon });
    if (hudToastTimerRef.current) clearTimeout(hudToastTimerRef.current);
    hudToastTimerRef.current = setTimeout(() => setHudToast(null), 1400);
  }, []);

  const attemptPlay = useCallback(() => { 
    const video = videoRef.current; 
    if (!video || !wantsToPlayRef.current) return; 
    video.play().catch((error) => {
      if (error.name === 'NotAllowedError') {
        setNeedsUserGesture(true);
      }
      setPlaying(false);
    });
  }, []);

  // SRT Direct Overlay Engine
  useEffect(() => {
    if (subtitles.length === 0 || activeSubtitle < 0) {
      setActiveCues([]);
      setActiveSubtitleCue(null);
      return;
    }
    const sub = subtitles[activeSubtitle];
    if (!sub || !sub.url) return;

    let isMounted = true;
    fetchAndParseSrt(sub.url).then((cues: SrtCue[]) => {
      if (isMounted) setActiveCues(cues);
    }).catch((err: Error) => console.warn('[StreamingPlayer] SRT parse failed:', err));

    return () => { isMounted = false; };
  }, [activeSubtitle, subtitles]);

  useEffect(() => {
    if (activeSubtitle < 0 || activeCues.length === 0) {
      if (activeSubtitleCue !== null) setActiveSubtitleCue(null);
      return;
    }
    const effectiveTime = currentTime + subtitleOffset;
    const cue = activeCues.find(c => effectiveTime >= c.start && effectiveTime <= c.end);
    const text = cue ? cue.text : null;
    if (text !== activeSubtitleCue) setActiveSubtitleCue(text);
  }, [currentTime, subtitleOffset, activeCues, activeSubtitle, activeSubtitleCue]);

  useEffect(() => {
    const handleOffline = () => setNetworkState('offline');
    const handleOnline = () => {
      setNetworkState('good');
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
      if (hlsRef.current) hlsRef.current.startLoad();
      if (videoRef.current && !playing) attemptPlay();
    };

    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    const checkConnection = () => {
      if (!navigator.onLine) setNetworkState('offline');
      else if (conn) {
        if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g' || conn.downlink < 0.8) setNetworkState('unstable');
        else setNetworkState('good');
      }
    };

    checkConnection();
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    if (conn) conn.addEventListener('change', checkConnection);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (conn) conn.removeEventListener('change', checkConnection);
    };
  }, [playing, attemptPlay]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showNextCountdown && countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    } else if (showNextCountdown && countdown === 0) {
      setShowNextCountdown(false);
      onPlayNext?.();
    }
    return () => clearTimeout(timer);
  }, [showNextCountdown, countdown, onPlayNext]);

  useEffect(() => {
    if (subtitles.length === 0 || activeSubtitle === -1) return;
    const convertActiveSubtitle = async () => {
      const sub = subtitles[activeSubtitle];
      if (sub && sub.url && !convertedSubUrls[activeSubtitle]) {
        setIsConvertingSubs(true);
        try {
          const vttUrl = await convertSrtUrlToVttBlob(sub.url);
          if (vttUrl !== sub.url) setConvertedSubUrls(prev => ({ ...prev, [activeSubtitle]: vttUrl }));
        } catch (e) {}
        setIsConvertingSubs(false);
      }
    };
    convertActiveSubtitle();
  }, [subtitles, activeSubtitle, convertedSubUrls]);

  const toggleSubtitles = useCallback(() => {
    if (activeSubtitle >= 0) {
      setActiveSubtitle(-1);
      showHudToast('Subtitles Off', 'fa-solid fa-closed-captioning');
    } else if (subtitles.length > 0) {
      const best = findBestSubtitle(subtitles);
      const target = best >= 0 ? best : 0;
      setActiveSubtitle(target);
      const name = subtitles[target]?.name || 'English';
      showHudToast(`Subtitles: ${name}`, 'fa-solid fa-closed-captioning');
    } else {
      showHudToast('No subtitles available', 'fa-solid fa-circle-exclamation');
    }
  }, [activeSubtitle, subtitles, showHudToast]);

  const handleSubtitleChange = useCallback((index: number) => {
    setActiveSubtitle(index);
    if (index >= 0 && subtitles[index]) {
      const name = subtitles[index].name || subtitles[index].language || 'Subtitles On';
      showHudToast(`Subtitles: ${name}`, 'fa-solid fa-closed-captioning');
    } else {
      showHudToast('Subtitles Off', 'fa-solid fa-closed-captioning');
    }
  }, [subtitles, showHudToast]);

  const isCurrentTimeBuffered = useCallback((targetTime?: number) => {
    const video = videoRef.current;
    if (!video || !video.buffered || video.buffered.length === 0) return false;
    const time = targetTime !== undefined ? targetTime : video.currentTime;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= (time + 0.3) && video.buffered.end(i) >= (time - 0.3)) {
        return true;
      }
    }
    return false;
  }, []);

  const handleAudioTrackChange = useCallback((trackIndex: number) => {
    setActiveAudioTrack(trackIndex);
    const video = videoRef.current;
    if (trackIndex >= 0) {
      // Capture current playback position to ensure dub switch does NOT restart from 0
      const currentPos = (video && video.currentTime > 0) ? video.currentTime : (currentTime > 0 ? currentTime : savedTimeRef.current);
      savedTimeRef.current = currentPos;

      // Switch HLS audio rendition if HLS is active
      if (hlsRef.current && hlsRef.current.audioTracks && hlsRef.current.audioTracks.length > trackIndex) {
        hlsRef.current.audioTrack = trackIndex;
      }

      // Switch HTML5 video native audio track if supported
      if (video && (video as any).audioTracks && (video as any).audioTracks.length > trackIndex) {
        try {
          for (let i = 0; i < (video as any).audioTracks.length; i++) {
            (video as any).audioTracks[i].enabled = (i === trackIndex);
          }
        } catch (e) {}
      }

      // Prevent player reset: ensure position continues exactly where user was watching
      if (video && currentPos > 0) {
        if (Math.abs(video.currentTime - currentPos) > 0.8) {
          video.currentTime = currentPos;
        }
        setTimeout(() => {
          if (video && currentPos > 0 && Math.abs(video.currentTime - currentPos) > 0.8) {
            video.currentTime = currentPos;
          }
          if (wantsToPlayRef.current) {
            video.play().catch(() => {});
          }
        }, 50);
        setTimeout(() => {
          if (video && currentPos > 0 && Math.abs(video.currentTime - currentPos) > 0.8) {
            video.currentTime = currentPos;
          }
        }, 200);
      }

      const trackName = audioTracks[trackIndex]?.name || `Track ${trackIndex + 1}`;
      showHudToast(`Audio / Dub: ${trackName}`, 'fa-solid fa-volume-high');
    }
  }, [audioTracks, showHudToast, currentTime]);

  const toggleLandscape = useCallback(async () => {
    try {
      if (!isForcedLandscape) {
        setIsForcedLandscape(true);
        if (screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock('landscape').catch(() => {});
        }
        if (!document.fullscreenElement && containerRef.current) {
          await containerRef.current.requestFullscreen().catch(() => {});
        }
        showHudToast('Landscape Mode', 'fa-solid fa-mobile-screen-button');
      } else {
        setIsForcedLandscape(false);
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
        showHudToast('Portrait Mode', 'fa-solid fa-mobile-screen-button');
      }
    } catch {
      setIsForcedLandscape(prev => !prev);
    }
  }, [isForcedLandscape, showHudToast]);

  const toggleFullscreen = useCallback(() => {
    if (locked) return;
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, [locked]);

  const lastHapticScrubRef = useRef<number>(0);

  const togglePlay = useCallback(() => { 
    if (locked) return; 
    const video = videoRef.current;
    if (video) {
      const willPlay = video.paused;
      triggerHaptic(willPlay ? 'light' : 'medium');
      if (willPlay) {
        wantsToPlayRef.current = true;
        attemptPlay();
      } else {
        wantsToPlayRef.current = false;
        video.pause();
      }
      if (watchPartyProps?.onHostAction) {
        watchPartyProps.onHostAction(willPlay ? 'play' : 'pause', video.currentTime || 0);
      }
    }
  }, [locked, attemptPlay, watchPartyProps]);

  const skip = useCallback((seconds: number) => { 
    const video = videoRef.current;
    if (video && !locked && !isLive) {
      triggerHaptic('medium');
      const maxDuration = (duration > 0 && isFinite(duration)) ? duration : Infinity;
      const newTime = Math.max(0, Math.min(video.currentTime + seconds, maxDuration));
      video.currentTime = newTime;
      setCurrentTime(newTime);
      if (watchPartyProps?.onHostAction) {
        watchPartyProps.onHostAction('seek', newTime);
      }
    } 
  }, [locked, isLive, duration, watchPartyProps]);

  useEffect(() => {
    if (!watchPartyProps) return;
    const video = videoRef.current;
    if (!video) return;

    if (watchPartyProps.syncPaused !== undefined) {
      if (watchPartyProps.syncPaused) {
        wantsToPlayRef.current = false;
        if (!video.paused) video.pause();
        setPlaying(false);
        setIsBuffering(false);
      } else {
        wantsToPlayRef.current = true;
        if (video.paused) attemptPlay();
      }
    }

    if (typeof watchPartyProps.syncTime === 'number' && watchPartyProps.syncTime >= 0) {
      const diff = Math.abs(video.currentTime - watchPartyProps.syncTime);
      if (diff > 2.5) {
        video.currentTime = watchPartyProps.syncTime;
        setCurrentTime(watchPartyProps.syncTime);
      }
    }
  }, [watchPartyProps?.syncPaused, watchPartyProps?.syncTime, watchPartyProps?.syncTimestamp, attemptPlay]);

  const resetControlsTimeout = useCallback(() => {
    if (minimized) return;
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (!locked && playing && !isHoveringControlsRef.current && !showSettings && !showSourceSelect && !showSeasonSelector && !showAudioSubtitleModal) {
      controlsTimeoutRef.current = setTimeout(() => { 
        if (!isHoveringControlsRef.current && !showSettings && !showSourceSelect && !showSeasonSelector && !showAudioSubtitleModal && !isDragging) {
          setShowControls(false); 
        }
      }, 3500);
    }
  }, [minimized, locked, playing, showSettings, showSourceSelect, showSeasonSelector, showAudioSubtitleModal, isDragging]);

  const handleMouseMove = useCallback(() => resetControlsTimeout(), [resetControlsTimeout]);

  const updateBuffered = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.buffered && video.buffered.length > 0) {
      try {
        const ranges: Array<{ start: number; end: number }> = [];
        let end = 0;
        for (let i = 0; i < video.buffered.length; i++) {
          const s = video.buffered.start(i);
          const e = video.buffered.end(i);
          if (isFinite(s) && isFinite(e)) {
            ranges.push({ start: s, end: e });
          }
          if (s <= video.currentTime && e >= video.currentTime) {
            end = e;
          }
        }
        if (end === 0) {
          end = video.buffered.end(video.buffered.length - 1);
        }
        if (end > 0 && isFinite(end)) {
          setBuffered(end);
        }
        setBufferedRanges(ranges);
      } catch (e) {}
    }
  }, []);

  const initHls = useCallback(() => {
    if (!hlsRef.current && Hls.isSupported()) {
      const hls = new Hls({
        capLevelToPlayerSize: true,
        maxBufferLength: 600,        // Buffers up to 10 minutes into the future
        maxMaxBufferLength: 1200,    // Allows up to 20 minutes forward buffer
        maxBufferSize: 500 * 1024 * 1024, // 500 MB in-memory buffer cache
        backBufferLength: 3600,      // Keep 1 hour of backward played video in memory cache
        enableWorker: true,
        fragLoadingMaxRetry: 12,
        fragLoadingRetryDelay: 400,
        fragLoadingMaxRetryTimeout: 64000,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 1,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 8,
        progressive: true,
        testBandwidth: false,
        fpsDroppedMonitoringPeriod: 0,
        fpsDroppedMonitoringThreshold: 0.2,
      });
      hlsRef.current = hls;

      const syncAudioTracks = () => {
        if (hls.audioTracks && hls.audioTracks.length > 0) {
          setAudioTracks(hls.audioTracks.map((t, idx) => ({ 
            id: idx, 
            name: t.name || (t.lang ? `Audio / Dub (${t.lang.toUpperCase()})` : `Audio Track ${idx + 1}`), 
            lang: t.lang 
          })));
          setActiveAudioTrack(hls.audioTrack);
        }
      };

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        syncAudioTracks();
        if (videoRef.current) {
          if (savedTimeRef.current > 0) videoRef.current.currentTime = savedTimeRef.current;
          videoRef.current.playbackRate = playbackSpeed;
          if (wantsToPlayRef.current) attemptPlay();
        }
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        updateBuffered();
      });

      hls.on(Hls.Events.BUFFER_APPENDED, () => {
        updateBuffered();
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        syncAudioTracks();
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
        if (videoRef.current && savedTimeRef.current > 0) {
          if (Math.abs(videoRef.current.currentTime - savedTimeRef.current) > 1.2) {
            videoRef.current.currentTime = savedTimeRef.current;
          }
        }
      });
      
      hls.on(Hls.Events.ERROR, (_, data) => { 
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else setVideoError('Fatal playback error. Please try another source.');
        }
      });
    }
    const hls = hlsRef.current;
    if (hls && videoRef.current && hls.media !== videoRef.current) hls.attachMedia(videoRef.current);
    return hls;
  }, [playbackSpeed, attemptPlay, updateBuffered]);

  const loadSource = useCallback((source: VideoSource, sourceIndex: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    setIsBuffering(true);
    setVideoError(null);
    setActiveSourceIndex(sourceIndex);
    
    const currentPos = (video.currentTime && video.currentTime > 0) ? video.currentTime : (currentTime > 0 ? currentTime : savedTimeRef.current);
    savedTimeRef.current = currentPos;
    wantsToPlayRef.current = true;
    
    if (source.quality) {
      setPreferredQuality(String(source.quality));
      localStorage.setItem('slflix_preferred_quality', String(source.quality));
    }
    
    const url = source.stream || source.direct || source.download;
    if (!url) return;
    
    const isHlsStream = source.type === 'hls' || url.includes('.m3u8');
    
    const restoreTimeAndPlay = () => {
      if (video) {
        if (savedTimeRef.current > 0) video.currentTime = savedTimeRef.current;
        video.playbackRate = playbackSpeed;
      }
      if (wantsToPlayRef.current) attemptPlay();
    };

    if (isHlsStream && video.canPlayType('application/vnd.apple.mpegurl')) {
      if (hlsRef.current) hlsRef.current.detachMedia();
      video.onloadedmetadata = restoreTimeAndPlay;
      video.src = url;
    } else if (Hls.isSupported() && isHlsStream) {
      const hls = initHls();
      if (hls) {
        if (video.src && !video.src.startsWith('blob:')) {
          video.removeAttribute('src');
          video.load();
        }
        hls.loadSource(url);
        hls.startLoad(savedTimeRef.current > 0 ? savedTimeRef.current : -1);
      }
    } else {
      if (hlsRef.current) hlsRef.current.detachMedia();
      video.onloadedmetadata = restoreTimeAndPlay;
      video.src = url;
    }
  }, [playbackSpeed, attemptPlay, initHls, currentTime]);

  useEffect(() => {
    if (sources.length > 0) {
      let targetIndex = 0;
      if (preferredQuality && preferredQuality !== 'Auto') {
        const index = sources.findIndex(s => String(s.quality) === preferredQuality);
        if (index !== -1) targetIndex = index;
      }
      loadSource(sources[targetIndex], targetIndex); 
    }
  }, [sources, subjectId, currentSeason, currentEpisode, isLive]);

  const handleSeekStart = useCallback(() => {
    setIsDragging(true);
    triggerHaptic('selection');
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (locked) return;
    const time = parseFloat(e.target.value);
    if (!isNaN(time) && isFinite(time)) {
      setCurrentTime(time);
      const now = Date.now();
      if (now - lastHapticScrubRef.current > 120) {
        triggerHaptic('selection');
        lastHapticScrubRef.current = now;
      }
    }
  }, [locked]);

  const handleSeekEnd = useCallback((e: any) => {
    setIsDragging(false);
    triggerHaptic('light');
    const video = videoRef.current;
    if (video && e.target) {
      const time = parseFloat(e.target.value);
      if (!isNaN(time) && isFinite(time)) {
        video.currentTime = time;
        savedTimeRef.current = time;
        if (wantsToPlayRef.current) attemptPlay();
        if (watchPartyProps?.onHostAction) watchPartyProps.onHostAction('seek', time);
      }
    }
  }, [attemptPlay, watchPartyProps]);

  // Super-fast background buffering engine: continues pre-fetching segments even when paused
  useEffect(() => {
    if (!hlsRef.current) return;
    const hls = hlsRef.current;
    
    if (!playing) {
      try {
        hls.startLoad(-1);
      } catch (e) {}

      const bgInterval = setInterval(() => {
        if (!hlsRef.current || !videoRef.current) return;
        const video = videoRef.current;
        const cur = video.currentTime;
        let bufEnd = cur;
        if (video.buffered && video.buffered.length > 0) {
          for (let i = 0; i < video.buffered.length; i++) {
            if (video.buffered.start(i) <= cur + 2 && video.buffered.end(i) >= cur) {
              bufEnd = Math.max(bufEnd, video.buffered.end(i));
            }
          }
        }
        // If forward buffer is under 10 minutes (600s), keep pre-fetching at full speed
        if (bufEnd - cur < 600) {
          try {
            hls.startLoad();
          } catch (e) {}
        }
        updateBuffered();
      }, 2000);

      return () => clearInterval(bgInterval);
    }
  }, [playing, updateBuffered]);

  // Synchronize playback session cache so switching movies and returning restores position instantly
  useEffect(() => {
    const movieKey = subjectId || movie?.subjectId || title;
    if (movieKey && currentTime > 0) {
      moviePlaybackSessionCache.set(movieKey, {
        currentTime,
        duration,
        sourceIndex: activeSourceIndex,
        timestamp: Date.now()
      });
    }
  }, [currentTime, duration, activeSourceIndex, subjectId, movie?.subjectId, title]);

  useEffect(() => {
    return () => {
      const video = videoRef.current;
      const movieKey = subjectId || movie?.subjectId || title;
      if (video && movieKey && video.currentTime > 0) {
        moviePlaybackSessionCache.set(movieKey, {
          currentTime: video.currentTime,
          duration: video.duration || 0,
          sourceIndex: activeSourceIndex,
          timestamp: Date.now()
        });
      }
    };
  }, [subjectId, movie?.subjectId, title, activeSourceIndex]);

  const [chapters, setChapters] = useState<ChapterMarker[]>([]);
  const [skipToast, setSkipToast] = useState<string | null>(null);
  const [hasSkippedRecap, setHasSkippedRecap] = useState(false);
  const [hasSkippedIntro, setHasSkippedIntro] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setSkipToast(msg);
    toastTimeoutRef.current = setTimeout(() => setSkipToast(null), 2000);
  }, []);

  // Reset skip states when episode or title changes
  useEffect(() => {
    setHasSkippedRecap(false);
    setHasSkippedIntro(false);
  }, [title, currentSeason, currentEpisode, subjectId]);

  const scanChapters = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;
    const found: ChapterMarker[] = [];
    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      const cues = track.cues;
      if (cues && cues.length > 0) {
        for (let j = 0; j < cues.length; j++) {
          const cue = cues[j] as VTTCue;
          const rawText = (cue.text || '').trim();
          const lower = rawText.toLowerCase();
          let type: ChapterMarker['type'] = 'chapter';
          if (/recap|previously/i.test(lower)) {
            type = 'recap';
          } else if (/intro|opening|theme/i.test(lower)) {
            type = 'intro';
          } else if (/credit|outro|ending/i.test(lower)) {
            type = 'credits';
          }
          if (type !== 'chapter' || track.kind === 'chapters') {
            found.push({
              title: rawText || (type === 'intro' ? 'Intro' : type === 'recap' ? 'Recap' : 'Chapter'),
              startTime: cue.startTime,
              endTime: cue.endTime,
              type
            });
          }
        }
      }
    }
    if (found.length > 0) {
      setChapters(found);
    }
  }, []);

  const activeRecapChapter = useMemo(() => {
    return chapters.find(c => c.type === 'recap' && currentTime >= c.startTime && currentTime < c.endTime) || null;
  }, [chapters, currentTime]);

  const activeIntroChapter = useMemo(() => {
    return chapters.find(c => c.type === 'intro' && currentTime >= c.startTime && currentTime < c.endTime) || null;
  }, [chapters, currentTime]);

  const isSeries = useMemo(() => {
    const rawMovieType = String(movie?.type || '').toLowerCase();
    const isExplicitMovie = rawMovieType === 'movie' || rawMovieType.includes('feature');
    return !isExplicitMovie && Boolean(
      (currentSeason && currentSeason > 0) ||
      (currentEpisode && currentEpisode > 0) ||
      Boolean(nextEpisode) ||
      rawMovieType.includes('series') || 
      rawMovieType.includes('tv') || 
      rawMovieType.includes('anime') || 
      (movie?.seasons && movie.seasons.length > 0) ||
      Boolean(title && /S\d+\s*E\d+/i.test(title)) ||
      Boolean(subTitle && /Season|Episode/i.test(subTitle))
    );
  }, [movie, currentSeason, currentEpisode, nextEpisode, title, subTitle]);

  const isRecapActive = useMemo(() => {
    if (isLive || isTrailer || hasSkippedRecap) return false;
    if (activeRecapChapter && currentTime < activeRecapChapter.endTime) return true;
    return isSeries && currentTime >= 0 && currentTime < 35 && (duration === 0 || duration > 120);
  }, [isLive, isTrailer, hasSkippedRecap, activeRecapChapter, isSeries, currentTime, duration]);

  const isIntroActive = useMemo(() => {
    if (isLive || isTrailer || hasSkippedIntro) return false;
    if (activeIntroChapter && currentTime < activeIntroChapter.endTime) return true;
    if (isRecapActive && currentTime < 20) return false;
    return isSeries && currentTime >= 10 && currentTime <= 95 && (duration === 0 || duration > 240);
  }, [isLive, isTrailer, hasSkippedIntro, activeIntroChapter, isRecapActive, isSeries, currentTime, duration]);

  const handleSkipRecap = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setHasSkippedRecap(true);
    triggerHaptic('medium');
    let targetTime = 35;
    if (activeRecapChapter) {
      targetTime = activeRecapChapter.endTime;
    } else {
      targetTime = Math.min(video.currentTime + 35, duration > 0 ? duration : 35);
    }
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
    showToast('Skipped Recap');
    if (wantsToPlayRef.current) attemptPlay();
    if (watchPartyProps?.onHostAction) watchPartyProps.onHostAction('seek', targetTime);
  }, [activeRecapChapter, duration, attemptPlay, watchPartyProps, showToast]);

  const handleSkipIntro = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setHasSkippedIntro(true);
    triggerHaptic('medium');
    let targetTime = video.currentTime + 85;
    if (activeIntroChapter) {
      targetTime = activeIntroChapter.endTime;
    } else {
      const maxDuration = (duration > 0 && isFinite(duration)) ? duration : Infinity;
      targetTime = Math.min(video.currentTime + 85, maxDuration);
    }
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
    showToast('Skipped Intro (+85s)');
    if (wantsToPlayRef.current) attemptPlay();
    if (watchPartyProps?.onHostAction) watchPartyProps.onHostAction('seek', targetTime);
  }, [activeIntroChapter, duration, attemptPlay, watchPartyProps, showToast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        skip(-10);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        skip(10);
      } else if (e.key === 's' || e.key === 'S' || e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        if (isRecapActive) {
          handleSkipRecap();
        } else {
          handleSkipIntro();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setIsMuted(prev => !prev);
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        toggleSubtitles();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skip, isRecapActive, handleSkipRecap, handleSkipIntro, toggleFullscreen, toggleSubtitles]);

  return (
    <div 
      ref={containerRef} 
      onMouseMove={handleMouseMove}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.video-hud-controls') || target.closest('button') || target.closest('input') || target.closest('div[role="dialog"]') || target.closest('.modal-content')) {
          return;
        }
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) {
          setShowControls(prev => !prev);
          return;
        }
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const width = rect.width;
        const height = rect.height;
        const isCenter = x >= width * 0.3 && x <= width * 0.7 && y >= height * 0.3 && y <= height * 0.7;
        if (isCenter) {
          togglePlay();
        } else {
          setShowControls(prev => !prev);
        }
      }}
      style={isForcedLandscape && typeof window !== 'undefined' && window.innerHeight > window.innerWidth ? {
        width: '100vh',
        height: '100vw',
        transform: 'rotate(90deg)',
        transformOrigin: 'top left',
        position: 'fixed',
        top: '0',
        left: '100vw',
        zIndex: 2000
      } : undefined}
      className={minimized 
        ? "fixed bottom-4 right-4 w-[320px] aspect-video z-[2000] bg-black shadow-2xl rounded-xl overflow-hidden" 
        : (embedded && !isFullscreen)
          ? "relative w-full aspect-video bg-black rounded-2xl overflow-hidden group shadow-2xl border border-white/10"
          : "fixed inset-0 z-[2000] bg-black group overflow-hidden"
      } 
    >
      <style>{`
        video::cue {
          background-color: rgba(255, 255, 255, 0.95) !important;
          color: #000000 !important;
          font-weight: 700 !important;
          font-size: 1.15rem !important;
          font-family: system-ui, -apple-system, sans-serif !important;
          padding: 6px 12px !important;
          border-radius: 6px !important;
        }
      `}</style>
      <video
        ref={videoRef}
        className={`w-full h-full ${resizeMode === 'cover' ? 'object-cover' : 'object-contain'}`}
        onTimeUpdate={() => {
          if (!isDragging && videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
            onProgressUpdate?.(videoRef.current.currentTime, videoRef.current.duration);
          }
          updateBuffered();
          scanChapters();
        }}
        onProgress={updateBuffered}
        onLoadedMetadata={() => {
          if (videoRef.current && videoRef.current.duration > 0 && isFinite(videoRef.current.duration)) {
            setDuration(videoRef.current.duration);
          }
          scanChapters();
        }}
        onDurationChange={() => {
          if (videoRef.current && videoRef.current.duration > 0 && isFinite(videoRef.current.duration)) {
            setDuration(videoRef.current.duration);
          }
        }}
        onWaiting={() => {
          if (!isCurrentTimeBuffered()) {
            setIsBuffering(true);
          }
        }}
        onSeeked={() => {
          setIsBuffering(false);
          updateBuffered();
        }}
        onPlaying={() => { setIsBuffering(false); setPlaying(true); }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          if (autoPlayNext && nextEpisode) setShowNextCountdown(true);
        }}
      />
      
      {/* Toast Notification */}
      {skipToast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 bg-black/90 border border-primary/50 text-white px-4 py-2 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs md:text-sm font-bold tracking-wide pointer-events-none transition-all">
          <i className="fa-solid fa-check text-primary"></i>
          <span>{skipToast}</span>
        </div>
      )}


      
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-xs z-20">
          <FastStreamLoader buffered={duration > 0 && isFinite(duration) && buffered > 0 && isFinite(buffered) ? (buffered / duration) : undefined} />
        </div>
      )}

      {/* Render active subtitle cue text on screen */}
      {activeSubtitleCue && (
        <div className="absolute bottom-16 md:bottom-24 left-4 right-4 z-20 pointer-events-none flex justify-center text-center">
          <span 
            className="px-4 py-2 rounded-xl max-w-[90%] text-base md:text-xl font-semibold leading-relaxed tracking-wide select-none"
            style={{
              fontFamily: getCaptionFontFamilyCss(captionSettings.fontFamily),
              backgroundColor: getCaptionBgCss(captionSettings.bgColor, captionSettings.bgOpacity),
              color: captionSettings.textColor || '#ffffff',
              textShadow: getCaptionTextShadowCss(captionSettings.textShadow),
              fontSize: subtitleFontSize === 'small' ? '0.95rem' : subtitleFontSize === 'large' ? '1.45rem' : '1.2rem'
            }}
            dangerouslySetInnerHTML={{ __html: activeSubtitleCue }}
          />
        </div>
      )}

      {/* Quick HUD toast notification */}
      {hudToast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 bg-black/90 backdrop-blur-xl border border-white/20 px-4 py-2 rounded-full text-white text-xs font-bold flex items-center gap-2 shadow-2xl pointer-events-none animate-fade-in">
          {hudToast.icon && <i className={`${hudToast.icon} text-primary text-xs`}></i>}
          <span>{hudToast.message}</span>
        </div>
      )}

      {/* Next Episode Countdown Overlay */}
      {showNextCountdown && nextEpisode && (
        <div className="absolute bottom-20 right-6 z-40 bg-black/90 border border-white/20 rounded-2xl p-4 shadow-2xl backdrop-blur-md max-w-xs animate-fade-in flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-primary text-[10px] uppercase font-bold tracking-wider">Up Next</span>
            <button 
              onClick={() => setShowNextCountdown(false)}
              className="text-gray-400 hover:text-white text-xs"
            >
              <i className="fa-solid fa-times"></i>
            </button>
          </div>
          <p className="text-white text-xs font-bold truncate">
            {nextEpisode.title || `Season ${nextEpisode.season} Episode ${nextEpisode.episode}`}
          </p>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                setShowNextCountdown(false);
                onPlayNext?.();
              }}
              className="flex-1 py-1.5 rounded-xl bg-primary text-black font-extrabold text-xs flex items-center justify-center gap-1.5"
            >
              <i className="fa-solid fa-forward-step"></i>
              <span>Play Now ({countdown}s)</span>
            </button>
            <button 
              onClick={() => setShowNextCountdown(false)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      <VideoHud
        title={title}
        subTitle={subTitle}
        playing={playing}
        isBuffering={isBuffering}
        currentTime={currentTime}
        duration={duration}
        buffered={buffered}
        bufferedRanges={bufferedRanges}
        volume={volume}
        isMuted={isMuted}
        playbackSpeed={playbackSpeed}
        isForcedLandscape={isForcedLandscape}
        isFullscreen={isFullscreen}
        showControls={showControls}
        locked={locked}
        showSettings={showSettings}
        showSourceSelect={showSourceSelect}
        showAudioSubtitleModal={showAudioSubtitleModal}
        activeSubtitle={activeSubtitle}
        activeAudioTrack={activeAudioTrack}
        isLive={isLive}
        watchPartyProps={watchPartyProps}
        movie={movie}
        currentSeason={currentSeason}
        currentEpisode={currentEpisode}
        isSeries={isSeries}
        minimized={minimized}
        onClose={onClose}
        onTogglePlay={togglePlay}
        onSkip={skip}
        onToggleMute={() => setIsMuted(!isMuted)}
        onVolumeChange={setVolume}
        onToggleFullscreen={toggleFullscreen}
        onTogglePiP={() => {}}
        onCycleSpeed={() => {}}
        onToggleLandscape={toggleLandscape}
        onToggleSubtitles={toggleSubtitles}
        onOpenSettings={() => setShowSettings(!showSettings)}
        onOpenSourceSelect={() => setShowSourceSelect(!showSourceSelect)}
        onOpenAudioSubtitle={() => setShowAudioSubtitleModal(true)}
        onOpenEpisodes={() => setShowSeasonSelector(true)}
        onSeek={handleSeek}
        onSeekStart={handleSeekStart}
        onSeekEnd={handleSeekEnd}
        onSeekMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = ((e.clientX - rect.left) / rect.width) * 100;
          setHoverSeekPercent(percent);
          setHoverSeekTime((percent / 100) * duration);
        }}
        hoverSeekTime={hoverSeekTime}
        hoverSeekPercent={hoverSeekPercent}
        isHoveringSeek={isHoveringSeek}
        setIsHoveringSeek={setIsHoveringSeek}
        isHoveringControlsRef={isHoveringControlsRef}
        onSkipIntro={handleSkipIntro}
        onSkipRecap={handleSkipRecap}
        isRecapActive={isRecapActive}
        isIntroActive={isIntroActive}
      />

      {/* Audio & Subtitles Modal */}
      <AudioSubtitleModal
        isOpen={showAudioSubtitleModal}
        onClose={() => setShowAudioSubtitleModal(false)}
        subtitles={subtitles}
        activeSubtitle={activeSubtitle}
        onSubtitleChange={handleSubtitleChange}
        subtitleOffset={subtitleOffset}
        onSubtitleOffsetChange={setSubtitleOffset}
        subtitleFontSize={subtitleFontSize}
        onSubtitleFontSizeChange={setSubtitleFontSize}
        audioTracks={audioTracks}
        activeAudioTrack={activeAudioTrack}
        onAudioTrackChange={handleAudioTrackChange}
      />

      {/* Quality / Source Selection Modal */}
      {showSourceSelect && (
        <div 
          className="fixed inset-0 z-[2500] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowSourceSelect(false)}
        >
          <div 
            className="bg-[#12121a] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <i className="fa-solid fa-sliders text-xs"></i>
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Stream Quality</h3>
                  <p className="text-[11px] text-gray-400">Select preferred video stream / server</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSourceSelect(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <i className="fa-solid fa-times text-xs"></i>
              </button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto max-h-[60vh]">
              {sources.length > 0 ? (
                sources.map((src, idx) => {
                  const isSelected = activeSourceIndex === idx;
                  const qualityLabel = src.quality ? `${src.quality}p` : `Server Stream ${idx + 1}`;
                  const badge = (src.quality && Number(src.quality) >= 1080) ? 'FHD' : (src.quality && Number(src.quality) >= 720) ? 'HD' : src.quality ? 'SD' : 'AUTO';
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        loadSource(src, idx);
                        setShowSourceSelect(false);
                        showHudToast(`Quality: ${qualityLabel}`, 'fa-solid fa-check');
                      }}
                      className={`w-full p-3 rounded-2xl text-left flex items-center justify-between text-xs font-bold transition-all border cursor-pointer ${
                        isSelected 
                          ? 'bg-primary text-black border-primary shadow-lg shadow-primary/20 font-extrabold' 
                          : 'bg-white/5 border-white/5 text-white hover:bg-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black font-mono ${
                          isSelected ? 'bg-black/20 text-black' : 'bg-primary/20 text-primary border border-primary/30'
                        }`}>
                          {badge}
                        </span>
                        <div>
                          <div className="font-bold">{qualityLabel}</div>
                          {src.type && (
                            <div className={`text-[10px] ${isSelected ? 'text-black/70' : 'text-gray-400'}`}>
                              {src.type.toUpperCase()} • Direct Stream
                            </div>
                          )}
                        </div>
                      </div>
                      {isSelected && <i className="fa-solid fa-check text-xs"></i>}
                    </button>
                  );
                })
              ) : (
                <div className="text-center py-6 text-gray-400 text-xs">
                  Auto adaptive streaming active
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Playback Settings Modal */}
      {showSettings && (
        <div 
          className="fixed inset-0 z-[2500] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowSettings(false)}
        >
          <div 
            className="bg-[#12121a] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <i className="fa-solid fa-gear text-xs"></i>
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Playback Settings</h3>
                  <p className="text-[11px] text-gray-400">Speed, aspect fit, and auto-play</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSettings(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <i className="fa-solid fa-times text-xs"></i>
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
              {/* Playback Speed */}
              <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
                <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-2 flex items-center justify-between">
                  <span>Playback Speed</span>
                  <span className="text-primary font-mono">{playbackSpeed}x</span>
                </p>
                <div className="grid grid-cols-6 gap-1">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                    <button
                      key={speed}
                      onClick={() => {
                        setPlaybackSpeed(speed);
                        if (videoRef.current) videoRef.current.playbackRate = speed;
                        showHudToast(`Speed: ${speed}x`, 'fa-solid fa-forward');
                      }}
                      className={`py-1.5 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                        playbackSpeed === speed
                          ? 'bg-primary text-black border-primary shadow-md shadow-primary/20 font-extrabold'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {speed === 1 ? '1x' : `${speed}x`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Video Aspect Ratio Mode */}
              <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
                <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-2">Display Aspect</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setResizeMode('contain');
                      showHudToast('Aspect: Fit Screen', 'fa-solid fa-expand');
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      resizeMode === 'contain'
                        ? 'bg-primary text-black border-primary shadow-md shadow-primary/20 font-extrabold'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <i className="fa-solid fa-compress text-xs"></i>
                    <span>Fit (Original)</span>
                  </button>
                  <button
                    onClick={() => {
                      setResizeMode('cover');
                      showHudToast('Aspect: Fill / Zoom', 'fa-solid fa-maximize');
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      resizeMode === 'cover'
                        ? 'bg-primary text-black border-primary shadow-md shadow-primary/20 font-extrabold'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <i className="fa-solid fa-expand text-xs"></i>
                    <span>Fill (Zoom)</span>
                  </button>
                </div>
              </div>

              {/* Auto Play Next */}
              <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Auto-Play Next Episode</div>
                  <div className="text-[10px] text-gray-400">Play next episode automatically</div>
                </div>
                <button
                  onClick={() => {
                    const newVal = !autoPlayNext;
                    setAutoPlayNext(newVal);
                    localStorage.setItem('slflix_autoplay_next', String(newVal));
                    showHudToast(`Auto-Play: ${newVal ? 'ON' : 'OFF'}`, 'fa-solid fa-play');
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    autoPlayNext ? 'bg-primary text-black font-extrabold' : 'bg-white/10 text-gray-400 hover:bg-white/20'
                  }`}
                >
                  {autoPlayNext ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Quick link to Audio & Subtitles */}
              <button
                onClick={() => {
                  setShowSettings(false);
                  setShowAudioSubtitleModal(true);
                }}
                className="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-xs font-bold text-white transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <i className="fa-solid fa-sliders text-primary"></i>
                  <span>Audio Tracks & Dubs / Subtitles</span>
                </div>
                <i className="fa-solid fa-chevron-right text-gray-400 text-xs"></i>
              </button>

              {/* Quick link to Quality Selection */}
              <button
                onClick={() => {
                  setShowSettings(false);
                  setShowSourceSelect(true);
                }}
                className="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-xs font-bold text-white transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <i className="fa-solid fa-list text-primary"></i>
                  <span>Switch Stream Quality</span>
                </div>
                <i className="fa-solid fa-chevron-right text-gray-400 text-xs"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Episodes Selector Modal for TV Series */}
      {showSeasonSelector && movie && (
        <div 
          className="fixed inset-0 z-[2500] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowSeasonSelector(false)}
        >
          <div 
            className="bg-[#12121a] border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <i className="fa-solid fa-list-ul text-xs"></i>
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Episodes</h3>
                  <p className="text-[11px] text-gray-400">{title} • Season {currentSeason}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSeasonSelector(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <i className="fa-solid fa-times text-xs"></i>
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              <SeasonSelector
                movie={movie}
                currentSeason={currentSeason}
                currentEpisode={currentEpisode}
                onSeasonChange={(s) => onSeasonChange?.(s)}
                onEpisodeSelect={(s, e) => {
                  onEpisodeChange?.(s, e);
                  setShowSeasonSelector(false);
                  showHudToast(`Playing S${s} E${e}`, 'fa-solid fa-play');
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
