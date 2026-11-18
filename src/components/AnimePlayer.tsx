import Hls from 'hls.js';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  FastForward,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  Subtitles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from '../context/AccountContext';
import type { AnimeDetail, BlitzStreamResponse, BlitzSubtitleTrack, BlitzVideoStream } from '../types/anime';
import {
  formatTimeSeconds,
  getBestBackdrop,
  getDisplayTitle,
} from '../utils/formatters';

interface AnimePlayerProps {
  anime: AnimeDetail;
  episodeNumber: number;
  onSelectEpisode: (episode: number) => void;
  onClose: () => void;
}

export function AnimePlayer({
  anime,
  episodeNumber,
  onSelectEpisode,
  onClose,
}: AnimePlayerProps) {
  const { activeProfile, getEpisodeProgress, saveProgress } = useAccount();

  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [subtitlesOn, setSubtitlesOn] = useState(true);
  const [audioTrack, setAudioTrack] = useState<'SUB' | 'DUB'>(
    activeProfile?.preferredAudio || 'SUB'
  );
  const [quality, setQuality] = useState<string>(
    activeProfile?.preferredQuality || '1080p'
  );
  const [speed, setSpeed] = useState<1 | 1.25 | 1.5>(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Blitz Stream State
  const [streamLoading, setStreamLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streams, setStreams] = useState<BlitzVideoStream[]>([]);
  const [streamIndex, setStreamIndex] = useState(0);
  const [hlsLevels, setHlsLevels] = useState<Array<{ index: number; label: string }>>([]);
  const [selectedSubtitleUrl, setSelectedSubtitleUrl] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const latestTimeRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);

  const currentEpisode = useMemo(() => {
    return (
      anime.episodeList.find((e) => e.number === episodeNumber) ||
      anime.episodeList[0]
    );
  }, [anime.episodeList, episodeNumber]);

  const durationSeconds = useMemo(() => {
    if (videoDuration && Number.isFinite(videoDuration) && videoDuration > 10) {
      return Math.floor(videoDuration);
    }
    const mins = currentEpisode?.duration || anime.duration || 24;
    return Math.max(120, mins * 60);
  }, [videoDuration, currentEpisode, anime.duration]);

  const nextEpisode = useMemo(() => {
    if (!currentEpisode) return null;
    return anime.episodeList.find((e) => e.number === currentEpisode.number + 1) || null;
  }, [anime.episodeList, currentEpisode]);

  const activeStream = useMemo(() => {
    if (streams.length === 0) return null;
    return streams[streamIndex] || streams[0];
  }, [streams, streamIndex]);

  const availableSubtitles: BlitzSubtitleTrack[] = useMemo(() => {
    return activeStream?.subtitles ?? [];
  }, [activeStream]);

  // Reset saved position when episode changes
  useEffect(() => {
    if (!currentEpisode) return;
    const saved = getEpisodeProgress(anime.id, currentEpisode.number);
    const startAt = saved && !saved.completed ? saved.currentTime : 0;
    setCurrentTime(startAt);
    setVideoDuration(null);
    latestTimeRef.current = startAt;
    pendingSeekRef.current = startAt > 0 ? startAt : null;
    setPlaying(true);
  }, [anime.id, currentEpisode, getEpisodeProgress]);

  // Fetch Blitz stream sources whenever anime, episode, audio language, or retry changes
  useEffect(() => {
    if (!currentEpisode) return;
    let active = true;
    const controller = new AbortController();

    setStreamLoading(true);
    setBuffering(false);
    setStreamError(null);
    setStreams([]);
    setStreamIndex(0);
    setHlsLevels([]);
    setSelectedSubtitleUrl(null);

    const lang = audioTrack.toLowerCase();
    fetch(
      `/api/v1/meta/stream?id=${encodeURIComponent(`anilist:${anime.id}`)}&episode=${currentEpisode.number}&language=${lang}`,
      { signal: controller.signal }
    )
      .then(async (res) => {
        const data = (await res.json()) as BlitzStreamResponse;
        if (!active) return;

        if (!res.ok) {
          setStreamError(data.message || 'Erro ao consultar fonte de reprodução.');
          return;
        }

        if (data.streams && data.streams.length > 0) {
          const prefIndex = data.streams.findIndex(
            (s) => s.quality.toLowerCase() === quality.toLowerCase()
          );
          const resolvedIdx = prefIndex >= 0 ? prefIndex : 0;
          setStreams(data.streams);
          setStreamIndex(resolvedIdx);
          const firstSubs = data.streams[resolvedIdx]?.subtitles;
          if (firstSubs && firstSubs.length > 0) {
            const ptSub =
              firstSubs.find((sub) => /pt|por|br/i.test(sub.language) || /portugu/i.test(sub.label)) ||
              firstSubs.find((sub) => /^en|eng/i.test(sub.language) || /english/i.test(sub.label)) ||
              firstSubs[0];
            setSelectedSubtitleUrl(ptSub.url);
          }
        } else {
          setStreamError(
            data.message || 'Nenhuma fonte de vídeo disponível para este episódio no momento.'
          );
        }
      })
      .catch((err) => {
        if (!active || (err instanceof Error && err.name === 'AbortError')) return;
        setStreamError('Falha de conexão com a Blitz Anime API ao buscar a fonte de vídeo.');
      })
      .finally(() => {
        if (active) setStreamLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [anime.id, currentEpisode, audioTrack, retryNonce]);

  // Attach HLS.js or direct MP4 URL to <video>
  const tryFallbackStream = useCallback(
    (reason: string) => {
      if (streamIndex + 1 < streams.length) {
        pendingSeekRef.current = latestTimeRef.current;
        setStreamError(`Alternando para fonte alternativa (${streamIndex + 2}/${streams.length})...`);
        setStreamIndex((prev) => prev + 1);
      } else {
        setStreamError(reason);
      }
    },
    [streamIndex, streams.length]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeStream) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setHlsLevels([]);
    const src = activeStream.sourceUrl;
    const isHlsSource = activeStream.isHLS || /\.m3u8(\?|$)/i.test(src);

    if (isHlsSource && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setStreamError(null);
        const levels = data.levels.map((lvl, idx) => ({
          index: idx,
          label: lvl.height ? `${lvl.height}p` : `Faixa ${idx + 1}`,
        }));
        setHlsLevels(levels);
        const matchedLevel = levels.find(
          (l) => l.label.toLowerCase() === quality.toLowerCase()
        );
        if (matchedLevel) {
          hls.currentLevel = matchedLevel.index;
          setQuality(matchedLevel.label);
        } else {
          hls.currentLevel = -1;
          setQuality('Auto');
        }

        if (pendingSeekRef.current && pendingSeekRef.current > 1) {
          video.currentTime = pendingSeekRef.current;
          pendingSeekRef.current = null;
        }
        if (playing) {
          video.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          hls.destroy();
          hlsRef.current = null;
          tryFallbackStream('Erro na reprodução do fluxo HLS.');
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    // Native HLS (Safari/iOS) or Direct MP4
    video.src = src;
    if (pendingSeekRef.current && pendingSeekRef.current > 1) {
      const targetSeek = pendingSeekRef.current;
      const onLoaded = () => {
        video.currentTime = targetSeek;
        pendingSeekRef.current = null;
      };
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
    }
    if (playing) {
      video.play().catch(() => {});
    }
  }, [activeStream, tryFallbackStream]);

  // Sync play/pause, volume, muted, speed with native <video>
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeStream) return;
    if (playing) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [playing, activeStream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = volume;
  }, [muted, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
  }, [speed]);

  // Sync native <video> textTracks visibility
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (!subtitlesOn) {
        track.mode = 'disabled';
      } else if (!selectedSubtitleUrl || track.label === selectedSubtitleUrl || i === 0) {
        track.mode = 'showing';
      } else {
        track.mode = 'hidden';
      }
    }
  }, [subtitlesOn, selectedSubtitleUrl, availableSubtitles]);

  const persistNow = useCallback(
    (timeToSave: number) => {
      if (!currentEpisode || !activeStream || timeToSave <= 0) return;
      const backdrop = getBestBackdrop(anime);
      const thumb = currentEpisode.thumbnail || backdrop || anime.coverImage.extraLarge;
      saveProgress({
        animeId: anime.id,
        animeTitle: getDisplayTitle(anime),
        coverImage: anime.coverImage.extraLarge || anime.coverImage.large,
        bannerImage: backdrop,
        episodeNumber: currentEpisode.number,
        episodeTitle: currentEpisode.title,
        thumbnail: thumb,
        currentTime: timeToSave,
        duration: durationSeconds,
        genres: anime.genres,
      });
    },
    [anime, currentEpisode, activeStream, durationSeconds, saveProgress]
  );

  // Auto-save real playback progress every 5 seconds and on unmount/episode change
  useEffect(() => {
    if (!currentEpisode || !activeStream) return;
    const saver = window.setInterval(() => {
      if (latestTimeRef.current > 2) {
        persistNow(latestTimeRef.current);
      }
    }, 5000);
    return () => {
      clearInterval(saver);
      if (latestTimeRef.current > 2) {
        persistNow(latestTimeRef.current);
      }
    };
  }, [currentEpisode, activeStream, persistNow]);

  const seekTo = useCallback(
    (targetSeconds: number) => {
      const clamped = Math.min(durationSeconds, Math.max(0, targetSeconds));
      setCurrentTime(clamped);
      latestTimeRef.current = clamped;
      if (videoRef.current && activeStream) {
        videoRef.current.currentTime = clamped;
      }
    },
    [durationSeconds, activeStream]
  );

  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current || document.documentElement;
    if (!el) return;
    const orientation = screen.orientation as {
      lock?: (mode: string) => Promise<void>;
      unlock?: () => void;
    };

    if (!document.fullscreenElement) {
      el.requestFullscreen?.()
        .then(() => {
          setIsFullscreen(true);
          orientation?.lock?.('landscape')?.catch(() => {});
        })
        .catch(() => {});
    } else {
      try {
        orientation?.unlock?.();
      } catch {
        // Ignore on unsupported browsers
      }
      document.exitFullscreen?.()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  }, []);

  // Lock background scroll & sync native fullscreen state
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setIsFullscreen(Boolean(document.fullscreenElement));

    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  // Keyboard controls while player is open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' && activeStream) {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowRight' && activeStream) {
        seekTo(latestTimeRef.current + 10);
      } else if (e.key === 'ArrowLeft' && activeStream) {
        seekTo(latestTimeRef.current - 10);
      } else if (e.key.toLowerCase() === 'm' && activeStream) {
        setMuted((m) => !m);
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      } else if (e.key === 'Escape' && !document.fullscreenElement) {
        persistNow(latestTimeRef.current);
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeStream, seekTo, toggleFullscreen, persistNow, onClose]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (playing && !settingsOpen) setShowControls(false);
    }, 3200);
  }, [playing, settingsOpen]);

  useEffect(() => {
    revealControls();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [episodeNumber, revealControls]);

  const handleQualitySelect = (qLabel: string, hlsIdx?: number) => {
    setQuality(qLabel);
    if (typeof hlsIdx === 'number' && hlsRef.current) {
      hlsRef.current.currentLevel = hlsIdx;
      return;
    }
    const matchingIdx = streams.findIndex(
      (s) => s.quality.toLowerCase() === qLabel.toLowerCase()
    );
    if (matchingIdx >= 0 && matchingIdx !== streamIndex) {
      pendingSeekRef.current = latestTimeRef.current;
      setStreamIndex(matchingIdx);
    }
  };

  const qualityOptions = useMemo(() => {
    if (hlsLevels.length > 0) {
      return [
        { label: 'Auto', hlsIndex: -1 },
        ...hlsLevels.map((l) => ({ label: l.label, hlsIndex: l.index })),
      ];
    }
    if (streams.length > 1) {
      const unique = Array.from(new Set(streams.map((s) => s.quality)));
      return unique.map((q) => ({ label: q, hlsIndex: undefined }));
    }
    return [
      { label: 'Auto', hlsIndex: undefined },
      { label: '1080p', hlsIndex: undefined },
      { label: '720p', hlsIndex: undefined },
    ];
  }, [hlsLevels, streams]);

  if (!currentEpisode) return null;

  const title = getDisplayTitle(anime);
  const backdrop =
    currentEpisode.thumbnail || getBestBackdrop(anime) || anime.coverImage.extraLarge;
  const isIntroWindow = Boolean(activeStream) && currentTime >= 15 && currentTime <= 85;
  const progressPercent = Math.min(100, (currentTime / durationSeconds) * 100);

  return (
    <div
      ref={stageRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Player de ${title} Episódio ${currentEpisode.number}`}
      onMouseMove={revealControls}
      onTouchStart={revealControls}
      onClick={() => {
        revealControls();
        if (activeStream) setPlaying((p) => !p);
      }}
      className="fixed inset-0 z-[100] w-screen h-[100dvh] bg-black overflow-hidden select-none flex items-center justify-center cursor-pointer"
    >
      {activeStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          poster={backdrop}
          crossOrigin="anonymous"
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            setCurrentTime(t);
            latestTimeRef.current = t;
          }}
          onLoadedMetadata={(e) => {
            const dur = e.currentTarget.duration;
            if (Number.isFinite(dur) && dur > 0) {
              setVideoDuration(dur);
            }
          }}
          onEnded={() => {
            if (nextEpisode) {
              persistNow(durationSeconds);
              onSelectEpisode(nextEpisode.number);
            } else {
              setPlaying(false);
            }
          }}
          onError={() => {
            setBuffering(false);
            tryFallbackStream('Falha ao carregar o vídeo MP4/HLS desta fonte.');
          }}
          className="w-full h-full object-contain bg-black"
        >
          {availableSubtitles.map((sub, idx) => (
            <track
              key={`${sub.url}-${idx}`}
              kind="subtitles"
              src={sub.url}
              srcLang={sub.language}
              label={sub.label}
              default={sub.url === selectedSubtitleUrl || idx === 0}
            />
          ))}
        </video>
      ) : streamLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 text-center cursor-default">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF6B1A]" />
          <p className="text-sm sm:text-base font-medium text-white">
            Carregando Episódio {currentEpisode.number}...
          </p>
          <p className="text-xs text-zinc-400">
            Resolvendo fonte de vídeo na Blitz Anime API ({audioTrack === 'SUB' ? 'Legendado' : 'Dublado'})
          </p>
        </div>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className="max-w-md mx-auto px-6 py-7 rounded-2xl bg-zinc-950/90 border border-white/10 text-center space-y-4 cursor-default"
        >
          <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-display text-base sm:text-lg font-bold text-white">
              Fonte indisponível neste episódio
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
              {streamError ||
                'Nenhuma fonte HLS ou MP4 reproduzível foi retornada para este episódio no momento.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setRetryNonce((n) => n + 1)}
              className="px-4 py-2 rounded-lg bg-[#FF6B1A] hover:bg-[#ff7d36] text-white text-xs font-semibold transition-colors"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => setAudioTrack((prev) => (prev === 'SUB' ? 'DUB' : 'SUB'))}
              className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 text-xs font-medium transition-colors"
            >
              Testar {audioTrack === 'SUB' ? 'Dublado' : 'Legendado'}
            </button>
            {nextEpisode && (
              <button
                type="button"
                onClick={() => onSelectEpisode(nextEpisode.number)}
                className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 text-xs font-medium transition-colors"
              >
                Próximo: Ep. {nextEpisode.number}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-transparent hover:bg-white/5 border border-white/10 text-zinc-300 text-xs font-medium transition-colors"
            >
              Voltar ao anime
            </button>
          </div>
        </div>
      )}

      {activeStream && buffering && playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF6B1A]" />
        </div>
      )}

      {activeStream && !playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35 pointer-events-none">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#FF6B1A] text-white flex items-center justify-center shadow-2xl">
            <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-1" />
          </div>
        </div>
      )}

      {/* Top Fullscreen Bar: Back to Anime + Episode Info + Stream Status */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-x-0 top-0 z-20 px-4 sm:px-7 pt-4 sm:pt-5 pb-12 bg-gradient-to-b from-black/90 via-black/55 to-transparent flex items-start justify-between gap-3 transition-opacity duration-200 cursor-default ${
          showControls || !playing || !activeStream ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              persistNow(latestTimeRef.current);
              onClose();
            }}
            aria-label="Voltar à página do anime"
            className="h-9 px-3 rounded-lg bg-black/65 hover:bg-zinc-900 border border-white/15 text-zinc-100 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 backdrop-blur-sm transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao anime</span>
          </button>

          <div className="min-w-0">
            <h2 className="font-display text-sm sm:text-lg font-bold text-white truncate">
              {title} — Ep. {currentEpisode.number}: {currentEpisode.title}
            </h2>
            <div className="text-[11px] sm:text-xs text-zinc-300 font-medium truncate">
              <span className="text-[#FF6B1A] font-semibold">
                {audioTrack === 'SUB' ? 'Japonês · Legendas' : 'Áudio Dublado'}
              </span>
              {activeStream && (
                <>
                  <span className="mx-1.5 text-zinc-500">·</span>
                  <span className="font-mono">
                    {activeStream.isHLS ? 'HLS' : 'MP4'} · {quality}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {streamLoading && (
            <div className="flex items-center gap-2 text-xs text-zinc-200 bg-black/70 px-3 py-1.5 rounded-lg border border-white/10">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF6B1A]" />
              <span className="hidden sm:inline">Conectando Blitz...</span>
            </div>
          )}

          {activeStream && streamError && (
            <div className="inline-flex items-center gap-1.5 text-xs text-amber-300 bg-black/75 px-3 py-1.5 rounded-lg border border-amber-500/30">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="max-w-[200px] sm:max-w-xs truncate">{streamError}</span>
            </div>
          )}
        </div>
      </div>

          {/* Contextual Skip Intro */}
          {isIntroWindow && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                seekTo(88);
                persistNow(88);
              }}
              className="absolute bottom-24 right-5 px-4 py-2 rounded-lg bg-zinc-950/90 hover:bg-[#FF6B1A] border border-white/25 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors shadow-xl"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>Pular abertura</span>
            </button>
          )}

          {/* Bottom Controls (rendered when an active stream is playing) */}
          {activeStream && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute inset-x-0 bottom-0 p-4 sm:p-5 bg-gradient-to-t from-black via-black/80 to-transparent transition-opacity duration-200 cursor-default ${
              showControls || !playing ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="mb-3 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={durationSeconds}
                value={currentTime}
                aria-label="Linha do tempo do episódio"
                onChange={(e) => seekTo(Number(e.target.value))}
                onMouseUp={() => persistNow(latestTimeRef.current)}
                onTouchEnd={() => persistNow(latestTimeRef.current)}
                className="w-full h-1.5 accent-[#FF6B1A] cursor-pointer bg-white/25 rounded-lg"
                style={{
                  background: `linear-gradient(to right, #FF6B1A ${progressPercent}%, rgba(255,255,255,0.22) ${progressPercent}%)`,
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (playing) persistNow(latestTimeRef.current);
                    setPlaying((p) => !p);
                  }}
                  aria-label={playing ? 'Pausar' : 'Reproduzir'}
                  className="w-9 h-9 rounded-lg hover:bg-white/10 text-white flex items-center justify-center"
                >
                  {playing ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => seekTo(latestTimeRef.current - 10)}
                  aria-label="Voltar 10 segundos"
                  className="w-9 h-9 rounded-lg hover:bg-white/10 text-zinc-200 flex items-center justify-center"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => seekTo(latestTimeRef.current + 10)}
                  aria-label="Avançar 10 segundos"
                  className="w-9 h-9 rounded-lg hover:bg-white/10 text-zinc-200 flex items-center justify-center"
                >
                  <RotateCw className="w-4 h-4" />
                </button>

                <div className="hidden sm:flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    aria-label={muted ? 'Ativar som' : 'Silenciar'}
                    className="w-9 h-9 rounded-lg hover:bg-white/10 text-zinc-200 flex items-center justify-center"
                  >
                    {muted || volume === 0 ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    aria-label="Volume"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVolume(v);
                      setMuted(v === 0);
                    }}
                    className="w-16 accent-[#FF6B1A] h-1 cursor-pointer"
                  />
                </div>

                <span className="text-xs font-mono text-zinc-300 tabular-nums ml-1">
                  {formatTimeSeconds(currentTime)} / {formatTimeSeconds(durationSeconds)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 relative">
                {nextEpisode && (
                  <button
                    type="button"
                    onClick={() => {
                      persistNow(durationSeconds);
                      onSelectEpisode(nextEpisode.number);
                    }}
                    aria-label={`Avançar para o episódio ${nextEpisode.number}`}
                    className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg bg-white/15 hover:bg-[#FF6B1A] text-white text-xs font-semibold transition-colors shrink-0"
                  >
                    <span className="sm:hidden">Ep. {nextEpisode.number}</span>
                    <span className="hidden sm:inline">Próximo: Ep. {nextEpisode.number}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSubtitlesOn((s) => !s)}
                  aria-label="Alternar legendas"
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    subtitlesOn
                      ? 'bg-[#FF6B1A]/20 text-[#FF6B1A]'
                      : 'hover:bg-white/10 text-zinc-400'
                  }`}
                >
                  <Subtitles className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setSettingsOpen((o) => !o)}
                  aria-label="Qualidade e idioma"
                  className="w-9 h-9 rounded-lg hover:bg-white/10 text-zinc-200 flex items-center justify-center"
                >
                  <Settings className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                  className="w-9 h-9 rounded-lg hover:bg-white/10 text-zinc-200 flex items-center justify-center"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>

                {settingsOpen && (
                  <div className="absolute bottom-12 right-0 w-64 rounded-xl bg-[#111114] border border-white/15 p-3.5 shadow-2xl space-y-3 text-xs z-30">
                    <div>
                      <p className="text-zinc-400 font-medium mb-1.5">Áudio</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(['SUB', 'DUB'] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              pendingSeekRef.current = latestTimeRef.current;
                              setAudioTrack(opt);
                            }}
                            className={`py-1.5 px-2 rounded-md font-medium flex items-center justify-center gap-1 ${
                              audioTrack === opt
                                ? 'bg-[#FF6B1A] text-white'
                                : 'bg-zinc-900 text-zinc-300'
                            }`}
                          >
                            {audioTrack === opt && <Check className="w-3 h-3" />}
                            <span>{opt === 'SUB' ? 'Legendado' : 'Dublado'}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-zinc-400 font-medium mb-1.5">Resolução</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {qualityOptions.slice(0, 6).map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => handleQualitySelect(opt.label, opt.hlsIndex)}
                            className={`py-1.5 rounded-md font-mono font-medium ${
                              quality === opt.label
                                ? 'bg-[#FF6B1A] text-white'
                                : 'bg-zinc-900 text-zinc-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {availableSubtitles.length > 0 && (
                      <div>
                        <p className="text-zinc-400 font-medium mb-1.5">Legenda</p>
                        <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                          {availableSubtitles.map((sub) => (
                            <button
                              key={sub.url}
                              type="button"
                              onClick={() => {
                                setSelectedSubtitleUrl(sub.url);
                                setSubtitlesOn(true);
                              }}
                              className={`py-1 px-2 rounded text-left truncate ${
                                subtitlesOn && selectedSubtitleUrl === sub.url
                                  ? 'bg-[#FF6B1A] text-white'
                                  : 'bg-zinc-900 text-zinc-300'
                              }`}
                            >
                              {sub.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-zinc-400 font-medium mb-1.5">Velocidade</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([1, 1.25, 1.5] as const).map((sp) => (
                          <button
                            key={sp}
                            type="button"
                            onClick={() => setSpeed(sp)}
                            className={`py-1.5 rounded-md font-mono font-medium ${
                              speed === sp
                                ? 'bg-[#FF6B1A] text-white'
                                : 'bg-zinc-900 text-zinc-300'
                            }`}
                          >
                            {sp}x
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
    </div>
  );
}
