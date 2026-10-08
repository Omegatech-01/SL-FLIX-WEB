import React, { useState, useEffect, useRef } from 'react';
import { ApiService } from '../services/api';
import { AnimeItem, AnimeDetail, AnimeDownloadServer } from '../types';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { 
  ArrowLeft, Play, Pause, Download, Volume2, VolumeX, Maximize2, 
  Tv, Radio, Sparkles, Check, AlertCircle, RefreshCw, Film, ShieldCheck, MonitorPlay 
} from 'lucide-react';
import { motion } from 'motion/react';
import AnimeThreeCanvas from './AnimeThreeCanvas';

interface AnimeDetailViewProps {
  animeItem: AnimeItem;
  onBack: () => void;
  onPlayStream?: (title: string, sources: any[], poster: string) => void;
  onSelectOtherAnime: (item: AnimeItem) => void;
  otherAnime: AnimeItem[];
}

export const AnimeDetailView: React.FC<AnimeDetailViewProps> = ({
  animeItem,
  onBack,
  onPlayStream,
  onSelectOtherAnime,
  otherAnime
}) => {
  const [detail, setDetail] = useState<AnimeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeServerIndex, setActiveServerIndex] = useState(0);
  const [resolvedStream, setResolvedStream] = useState<{
    directUrl?: string;
    streamProxyUrl?: string;
    embedUrl?: string;
    type?: 'mp4' | 'embed';
  } | null>(null);
  const [resolvingStream, setResolvingStream] = useState(false);
  const [playerMode, setPlayerMode] = useState<'video' | 'embed'>('video');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadAnimeDetail();
  }, [animeItem.link]);

  const loadAnimeDetail = async () => {
    setLoading(true);
    setResolvedStream(null);
    setActiveServerIndex(0);
    try {
      const data = await ApiService.getAnimeDetail(animeItem.link);
      if (data) {
        setDetail(data);
        // Automatically resolve the first server stream
        if (data.downloads && data.downloads.length > 0) {
          resolveServer(data.downloads[0]);
        } else if (data.video) {
          setPlayerMode('embed');
        }
      } else {
        setDetail({
          title: animeItem.title,
          image: animeItem.image,
          link: animeItem.link,
          downloads: []
        });
      }
    } catch (e) {
      console.error('Failed to load anime detail:', e);
    } finally {
      setLoading(false);
    }
  };

  const resolveServer = async (server: AnimeDownloadServer) => {
    setResolvingStream(true);
    try {
      const res = await ApiService.resolveAnimeStream(server.url, server.server);
      if (res && res.success) {
        setResolvedStream(res);
        if (res.type === 'embed' && res.embedUrl) {
          setPlayerMode('embed');
        } else {
          setPlayerMode('video');
        }
      } else {
        // Fallback: check if server url is direct or embed
        if (server.url.toLowerCase().endsWith('.mp4')) {
          setResolvedStream({
            directUrl: server.url,
            streamProxyUrl: `/api/anime/stream-proxy?url=${encodeURIComponent(server.url)}`,
            type: 'mp4'
          });
          setPlayerMode('video');
        } else {
          setResolvedStream({
            directUrl: server.url,
            embedUrl: server.url,
            type: 'embed'
          });
          setPlayerMode('embed');
        }
      }
    } catch (err) {
      console.error('Error resolving anime stream:', err);
    } finally {
      setResolvingStream(false);
    }
  };

  const handleServerSelect = (index: number, server: AnimeDownloadServer) => {
    setActiveServerIndex(index);
    resolveServer(server);
  };

  const handleTogglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleToggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const handlePlayInCinemaMode = () => {
    if (!onPlayStream) return;
    const currentServer = detail?.downloads?.[activeServerIndex];
    const streamUrl = resolvedStream?.streamProxyUrl || resolvedStream?.directUrl || currentServer?.url;
    if (!streamUrl) return;

    onPlayStream(
      detail?.title || animeItem.title,
      [{
        quality: 720,
        stream: streamUrl,
        label: currentServer?.server || 'Anime Server',
        type: 'mp4'
      }],
      animeItem.image
    );
  };

  const handleDirectDownload = async () => {
    const currentServer = detail?.downloads?.[activeServerIndex];
    const targetUrl = resolvedStream?.directUrl || currentServer?.url;
    if (!targetUrl) return;

    setDownloadToast(`Preparing download via ${currentServer?.server || 'Server'}...`);
    
    // Create an invisible download link to download without redirecting the page
    const link = document.createElement('a');
    link.href = targetUrl;
    link.setAttribute('download', `${animeItem.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloadToast(null);
    }, 4000);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const currentServer = detail?.downloads?.[activeServerIndex];
  const streamSourceUrl = resolvedStream?.streamProxyUrl || resolvedStream?.directUrl;

  return (
    <div className="min-h-screen bg-[#070817] text-white pb-36 animate-fade-in relative">
      {/* Top Floating Navigation Bar */}
      <div className="sticky top-0 z-40 bg-[#070817]/90 backdrop-blur-xl border-b border-white/10 px-4 md:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-primary hover:text-black border border-white/15 flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
            title="Back to Anime Hub"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-gray-400 font-bold uppercase tracking-wider">
              <span>Anime Hub</span>
              <span>/</span>
              <span className="text-primary truncate">Nimegami Archive</span>
            </div>
            <h1 className="text-sm md:text-base font-black text-white truncate max-w-xl">
              {detail?.title || animeItem.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
            <ShieldCheck size={14} />
            <span>Direct SL-FLIX Stream</span>
          </div>

          {onPlayStream && (
            <button
              onClick={handlePlayInCinemaMode}
              className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-white text-black font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(0,229,255,0.4)] cursor-pointer"
            >
              <MonitorPlay size={14} />
              <span className="hidden sm:inline">Cinema Mode</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Stage */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-6 space-y-8">
        {/* Cinematic In-Page Player Section */}
        <div className="bg-[#0b0c20] rounded-3xl border border-white/15 overflow-hidden shadow-2xl relative">
          <div className="aspect-video w-full bg-black relative flex items-center justify-center overflow-hidden">
            {loading ? (
              <div className="w-full h-full p-6 flex flex-col justify-between skeleton-shimmer bg-[#080918]">
                <div className="flex items-center justify-between">
                  <div className="h-6 w-36 rounded-lg bg-white/10 animate-pulse" />
                  <div className="h-6 w-20 rounded-lg bg-white/10 animate-pulse" />
                </div>
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center animate-pulse">
                    <Play size={24} className="text-primary/40 ml-1 fill-primary/30" />
                  </div>
                  <p className="text-gray-300 text-xs font-bold uppercase tracking-wider animate-pulse">
                    Loading Anime Streams & Mirrors...
                  </p>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full w-1/3 bg-primary/40 rounded-full animate-pulse" />
                </div>
              </div>
            ) : resolvingStream ? (
              <div className="w-full h-full p-6 flex flex-col justify-between skeleton-shimmer bg-[#080918]">
                <div className="h-5 w-28 rounded bg-white/10 animate-pulse" />
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="w-12 h-12 rounded-full border border-primary/30 flex items-center justify-center animate-pulse">
                    <Radio size={20} className="text-primary/70 animate-pulse" />
                  </div>
                  <p className="text-xs text-primary font-mono tracking-wider animate-pulse">
                    Connecting to server mirror: {currentServer?.server || 'Stream CDN'}...
                  </p>
                </div>
                <div className="h-1 w-full bg-white/5" />
              </div>
            ) : playerMode === 'video' && streamSourceUrl ? (
              <div className="relative w-full h-full group bg-black flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={streamSourceUrl}
                  playsInline
                  crossOrigin="anonymous"
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      setCurrentTime(videoRef.current.currentTime);
                      setDuration(videoRef.current.duration || 0);
                    }
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  className="w-full h-full object-contain"
                />

                {/* Over-Video Controls Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-4 pointer-events-none">
                  <div className="flex items-center justify-between pointer-events-auto">
                    <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-[11px] font-mono text-primary font-bold border border-white/10">
                      {currentServer?.server || 'SL-FLIX Direct Stream'}
                    </span>
                    <button
                      onClick={handlePlayInCinemaMode}
                      className="px-3 py-1 rounded-lg bg-primary/20 hover:bg-primary hover:text-black border border-primary/40 text-primary text-xs font-bold flex items-center gap-1.5 transition-all backdrop-blur-md"
                    >
                      <MonitorPlay size={13} />
                      <span>Cinema Overlay</span>
                    </button>
                  </div>

                  {/* Bottom Controls Bar */}
                  <div className="space-y-2 pointer-events-auto">
                    {/* Scrubber */}
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={duration || 100}
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleTogglePlay}
                          className="w-9 h-9 rounded-xl bg-primary text-black flex items-center justify-center hover:scale-105 transition-transform"
                        >
                          {isPlaying ? <Pause size={16} /> : <Play size={16} className="translate-x-0.5" />}
                        </button>

                        <button
                          onClick={handleToggleMute}
                          className="text-gray-300 hover:text-white p-1 transition-colors"
                        >
                          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>

                        <span className="text-[11px] font-mono text-gray-300">
                          {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleDirectDownload}
                          className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center gap-1.5 transition-all"
                          title="Download stream file"
                        >
                          <Download size={13} />
                          <span className="hidden sm:inline">Download</span>
                        </button>

                        <button
                          onClick={handleFullscreen}
                          className="p-2 text-gray-300 hover:text-white transition-colors"
                          title="Fullscreen"
                        >
                          <Maximize2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (playerMode === 'embed' && (resolvedStream?.embedUrl || detail?.video)) ? (
              <div className="w-full h-full relative bg-black">
                <iframe
                  src={resolvedStream?.embedUrl || detail?.video}
                  title={detail?.title || animeItem.title}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="p-8 text-center max-w-md space-y-4">
                <AlertCircle size={36} className="text-amber-400 mx-auto" />
                <h3 className="text-lg font-bold text-white">Select a Mirror Server to Stream</h3>
                <p className="text-xs text-gray-400">
                  Choose one of the mirror servers below to stream directly on this page without leaving SL-FLIX.
                </p>
                {detail?.downloads && detail.downloads.length > 0 && (
                  <button
                    onClick={() => handleServerSelect(0, detail.downloads[0])}
                    className="px-6 py-2.5 rounded-xl bg-primary text-black font-extrabold text-xs hover:bg-white transition-all shadow-[0_0_20px_rgba(0,229,255,0.4)]"
                  >
                    Start Stream on {detail.downloads[0].server}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Player Mode Switcher & Server Header */}
          <div className="p-4 bg-black/40 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Stream Mode:</span>
              <button
                onClick={() => setPlayerMode('video')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  playerMode === 'video' ? 'bg-primary text-black' : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                Direct MP4 Stream
              </button>
              {(detail?.video || resolvedStream?.embedUrl) && (
                <button
                  onClick={() => setPlayerMode('embed')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    playerMode === 'embed' ? 'bg-primary text-black' : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  Embed / Trailer
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDirectDownload}
                className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-primary hover:text-black border border-white/15 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Download size={14} />
                <span>Download MP4</span>
              </button>

              {onPlayStream && (
                <button
                  onClick={handlePlayInCinemaMode}
                  className="px-4 py-1.5 rounded-xl bg-primary hover:bg-white text-black text-xs font-black flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] cursor-pointer"
                >
                  <Play size={14} className="fill-black" />
                  <span>SL-FLIX Cinema</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Server Mirrors Grid */}
        {detail?.downloads && detail.downloads.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-6 bg-primary rounded-full" />
                <h3 className="text-lg md:text-xl font-black text-white flex items-center gap-2">
                  <Radio size={18} className="text-primary" />
                  <span>Stream & Download Server Mirrors ({detail.downloads.length})</span>
                </h3>
              </div>
              <span className="text-xs text-gray-400 font-mono">Stream directly inside SL-FLIX</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {detail.downloads.map((srv, idx) => {
                const isSelected = activeServerIndex === idx;
                const resMatch = srv.url.match(/(360p|480p|720p|1080p)/i);
                const resolution = resMatch ? resMatch[1].toUpperCase() : 'HD';

                return (
                  <div
                    key={`${srv.server}-${idx}`}
                    onClick={() => handleServerSelect(idx, srv)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                      isSelected
                        ? 'bg-primary/20 border-primary shadow-[0_0_20px_rgba(0,229,255,0.25)]'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0 transition-colors ${
                        isSelected ? 'bg-primary text-black' : 'bg-white/10 text-white group-hover:bg-primary/30'
                      }`}>
                        {isSelected ? <Play size={14} className="fill-current" /> : idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-white truncate flex items-center gap-1.5">
                          <span>{srv.server}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-primary font-mono font-bold">
                            {resolution}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate">
                          {isSelected ? 'Currently Streaming' : 'Click to stream in SL-FLIX'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveServerIndex(idx);
                        resolveServer(srv);
                        handleDirectDownload();
                      }}
                      title="Download from this mirror"
                      className="w-8 h-8 rounded-xl bg-white/10 hover:bg-primary hover:text-black flex items-center justify-center text-gray-300 transition-colors flex-shrink-0 ml-2"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Detailed Anime Overview & Metadata Card */}
        <div className="bg-[#0e1022] border border-white/15 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-6 shadow-xl relative overflow-hidden">
          <div className="w-32 md:w-44 aspect-[3/4] rounded-2xl overflow-hidden flex-shrink-0 shadow-2xl border border-white/15 bg-black/40">
            <LazyLoadImage
              src={animeItem.image}
              alt={animeItem.title}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex-1 space-y-4 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-black uppercase tracking-wider">
                Sub Indo
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/10 text-gray-300 text-xs font-bold">
                Nimegami Archive
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                Verified Stream
              </span>
            </div>

            <h2 className="text-xl md:text-3xl font-black text-white leading-tight">
              {detail?.title || animeItem.title}
            </h2>

            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">Synopsis:</h4>
              <p className="text-xs md:text-sm text-gray-300 leading-relaxed max-w-4xl">
                {detail?.synopsis || 'Stream high-definition anime episodes with subtitle and multi-mirror support directly within SL-FLIX Pro.'}
              </p>
            </div>
          </div>
        </div>

        {/* More Anime from Library */}
        {otherAnime.length > 0 && (
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-6 bg-primary rounded-full" />
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Film size={20} className="text-primary" />
                <span>More Anime Titles</span>
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {otherAnime.slice(0, 12).map((item, idx) => (
                <div
                  key={`${item.link}-${idx}`}
                  onClick={() => onSelectOtherAnime(item)}
                  className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary/50 rounded-2xl overflow-hidden cursor-pointer flex flex-col transition-all shadow-xl hover:-translate-y-1.5"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-black/40">
                    <LazyLoadImage
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <div className="w-8 h-8 rounded-full bg-primary text-black flex items-center justify-center font-bold">
                        <Play size={14} className="fill-black translate-x-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <h4 className="text-xs font-bold text-white line-clamp-2 group-hover:text-primary transition-colors">
                      {item.title}
                    </h4>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Download Toast Notification */}
      {downloadToast && (
        <div className="fixed bottom-6 right-6 z-[160] bg-emerald-500 text-black px-5 py-3 rounded-2xl shadow-2xl font-black text-xs flex items-center gap-2 animate-bounce">
          <Check size={16} />
          <span>{downloadToast}</span>
        </div>
      )}
    </div>
  );
};

export default AnimeDetailView;
