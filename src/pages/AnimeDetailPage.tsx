import {
  ArrowLeft,
  Check,
  Clock,
  Film,
  Play,
  Plus,
  Star,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { HorizontalRail } from '../components/HorizontalRail';
import { SafeImage } from '../components/SafeImage';
import { useAccount } from '../context/AccountContext';
import type { AnimeDetail } from '../types/anime';
import {
  cleanDescription,
  formatScore,
  formatTimeSeconds,
  getAgeRating,
  getBestBackdrop,
  getDisplayTitle,
  getOriginalTitle,
  translateFormat,
  translateGenre,
  translateSeason,
  translateStatus,
} from '../utils/formatters';

interface AnimeDetailPageProps {
  animeId: number;
  activeEpisode?: number | null;
  onBack: () => void;
  onOpenAnime: (id: number) => void;
  onWatchEpisode: (id: number, episode: number, preloadedAnime?: AnimeDetail) => void;
}

const EPISODES_PER_CHUNK = 24;

function EpisodeThumb({
  src,
  alt,
  episodeNumber,
}: {
  src?: string | null;
  alt: string;
  episodeNumber: number;
}) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setFailed(true);
    }
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-500 select-none px-3 text-center"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 35%, rgba(255,107,26,0.14), rgba(24,24,27,0.92) 68%, #09090B 100%)',
        }}
        role="img"
        aria-label={alt}
      >
        <Film className="w-5 h-5 text-zinc-400/80 mb-1.5" strokeWidth={1.5} />
        <span className="font-mono text-[10px] tracking-wider uppercase text-zinc-400">
          Episódio {String(episodeNumber).padStart(2, '0')}
        </span>
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover bg-zinc-900 transition-transform duration-300 group-hover:scale-[1.04]"
    />
  );
}

export function AnimeDetailPage({
  animeId,
  activeEpisode = null,
  onBack,
  onOpenAnime,
  onWatchEpisode,
}: AnimeDetailPageProps) {
  const { isFavorite, toggleFavorite, getAnimeProgress, getEpisodeProgress } = useAccount();
  const [anime, setAnime] = useState<AnimeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [episodeChunkIndex, setEpisodeChunkIndex] = useState(0);
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 14000);

    setLoading(true);
    setError(null);
    setEpisodeChunkIndex(0);
    setShowFullSynopsis(false);

    fetch(`/api/anime/${animeId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Anime não encontrado ou temporariamente indisponível');
        return (await res.json()) as AnimeDetail;
      })
      .then((data) => {
        if (active) setAnime(data);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof Error && err.name === 'AbortError') {
          setError('Tempo limite excedido ao carregar os detalhes do anime.');
        } else {
          setError(err instanceof Error ? err.message : 'Erro ao carregar perfil');
        }
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [animeId, reloadNonce]);

  const episodeChunks = useMemo(() => {
    if (!anime) return [];
    const list = anime.episodeList;
    const chunks: Array<{ label: string; start: number; end: number }> = [];
    for (let i = 0; i < list.length; i += EPISODES_PER_CHUNK) {
      const slice = list.slice(i, i + EPISODES_PER_CHUNK);
      chunks.push({
        label: `Ep. ${slice[0].number}–${slice[slice.length - 1].number}`,
        start: i,
        end: i + EPISODES_PER_CHUNK,
      });
    }
    return chunks;
  }, [anime]);

  useEffect(() => {
    if (!anime || activeEpisode === null) return;
    const epIndex = anime.episodeList.findIndex((e) => e.number === activeEpisode);
    if (epIndex >= 0) {
      setEpisodeChunkIndex(Math.floor(epIndex / EPISODES_PER_CHUNK));
    }
  }, [anime, activeEpisode]);

  const visibleEpisodes = useMemo(() => {
    if (!anime) return [];
    const chunk = episodeChunks[episodeChunkIndex];
    if (!chunk) return anime.episodeList;
    return anime.episodeList.slice(chunk.start, chunk.end);
  }, [anime, episodeChunks, episodeChunkIndex]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090B]">
        <div className="h-[48vh] bg-zinc-900/70 animate-pulse" />
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 -mt-28 flex flex-col md:flex-row gap-8">
          <div className="w-48 sm:w-56 aspect-[2/3] rounded-xl bg-zinc-800 animate-pulse shrink-0" />
          <div className="flex-1 pt-16 space-y-4">
            <div className="h-10 w-2/3 bg-zinc-800 rounded animate-pulse" />
            <div className="h-5 w-1/3 bg-zinc-800 rounded animate-pulse" />
            <div className="h-24 w-full max-w-2xl bg-zinc-900 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="min-h-screen bg-[#09090B] flex flex-col items-center justify-center px-6 text-center pt-20">
        <h1 className="font-display text-2xl font-bold text-white">Anime indisponível</h1>
        <p className="text-sm text-zinc-400 mt-2">{error || 'Não foi possível carregar este título.'}</p>
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="px-5 py-2.5 rounded-lg bg-[#FF6B1A] hover:bg-[#FF7E38] text-white text-sm font-semibold transition-colors"
          >
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={onBack}
            className="px-5 py-2.5 rounded-lg bg-zinc-900 border border-white/15 text-zinc-200 text-sm font-semibold hover:bg-zinc-800 transition-colors"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const title = getDisplayTitle(anime);
  const originalTitle = getOriginalTitle(anime);
  const backdrop = getBestBackdrop(anime);
  const saved = isFavorite(anime.id);
  const animeProgress = getAnimeProgress(anime.id);
  const synopsis = cleanDescription(anime.id, anime.description);
  const studioNames = anime.studios?.length ? anime.studios.join(', ') : 'Estúdio oficial';

  return (
    <div className="min-h-screen bg-[#09090B]">
      {/* Panoramic Official Banner */}
      <div className="relative h-[42vh] sm:h-[52vh] min-h-[340px] w-full overflow-hidden bg-zinc-950">
        {backdrop ? (
          <SafeImage
            src={backdrop}
            alt={`Banner panorâmico oficial de ${title}`}
            loading="eager"
            className="w-full h-full object-cover object-center"
          />
        ) : (
          <div className="w-full h-full relative overflow-hidden">
            <SafeImage
              src={anime.coverImage.extraLarge}
              alt=""
              loading="eager"
              className="w-full h-full object-cover scale-110 blur-2xl opacity-35"
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/55 to-black/45" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#09090B]/85 via-transparent to-transparent" />

        {/* Back Navigation */}
        <div className="absolute top-20 left-0 right-0 max-w-[1440px] mx-auto px-4 sm:px-8">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-black/55 hover:bg-black/80 border border-white/10 text-xs font-medium text-zinc-200 backdrop-blur-sm transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar</span>
          </button>
        </div>
      </div>

      {/* Main Profile Header: Official Poster + Title + Metadata + Synopsis */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 relative z-10 -mt-28 sm:-mt-36">
        <div className="flex flex-col md:flex-row gap-6 sm:gap-10 items-start">
          {/* Official 2:3 Poster */}
          <div className="w-40 sm:w-52 md:w-60 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 border border-white/15 shadow-2xl shrink-0">
            <SafeImage
              src={anime.coverImage.extraLarge || anime.coverImage.large}
              alt={`Pôster oficial de ${title}`}
              fallbackTitle={title}
              loading="eager"
              className="w-full h-full object-cover"
            />
          </div>

          {/* Editorial Title & Metadata */}
          <div className="flex-1 min-w-0 pt-2 md:pt-14">
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-[1.08] [text-wrap:balance]">
              {title}
            </h1>

            {originalTitle && (
              <p className="mt-1.5 text-sm sm:text-base text-zinc-400">
                {originalTitle}
              </p>
            )}

            {/* Unboxed Metadata Bar */}
            <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-zinc-300 tabular-nums">
              {anime.averageScore ? (
                <>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                    <Star className="w-4 h-4 fill-[#FF6B1A] text-[#FF6B1A]" />
                    {formatScore(anime.averageScore)}
                  </span>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                </>
              ) : null}
              <span>{anime.seasonYear || 'Ano N/D'}</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span className="font-semibold text-white">{getAgeRating(anime)}</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>{translateFormat(anime.format)}</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>{anime.episodeList.length} {anime.episodeList.length === 1 ? 'episódio' : 'episódios'}</span>
              {anime.duration ? (
                <>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span>{anime.duration} min</span>
                </>
              ) : null}
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span className="text-[#FF6B1A] font-medium">{translateStatus(anime.status)}</span>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  onWatchEpisode(
                    anime.id,
                    animeProgress ? animeProgress.episodeNumber : 1,
                    anime
                  )
                }
                className="h-11 px-6 rounded-lg bg-[#FF6B1A] hover:bg-[#FF7E38] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {animeProgress
                    ? `Continuar Episódio ${animeProgress.episodeNumber}`
                    : 'Assistir agora'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => toggleFavorite(anime)}
                className={`h-11 px-5 rounded-lg border text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                  saved
                    ? 'bg-zinc-900 border-[#FF6B1A] text-white'
                    : 'bg-zinc-900/80 border-white/15 text-zinc-200 hover:border-white/35'
                }`}
              >
                {saved ? <Check className="w-4 h-4 text-[#FF6B1A]" /> : <Plus className="w-4 h-4" />}
                <span>{saved ? 'Na minha lista' : 'Adicionar à minha lista'}</span>
              </button>
            </div>

            {/* Synopsis + Studio & Genres Breakdown */}
            <div className="mt-7 grid grid-cols-1 lg:grid-cols-12 gap-8 border-t border-white/[0.08] pt-6">
              <div className="lg:col-span-8">
                <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase mb-2">
                  Sinopse
                </h2>
                <p
                  className={`text-sm sm:text-[15px] text-zinc-200 leading-relaxed whitespace-pre-line max-w-[68ch] ${
                    !showFullSynopsis ? 'line-clamp-5' : ''
                  }`}
                >
                  {synopsis}
                </p>
                {synopsis.length > 280 && (
                  <button
                    type="button"
                    onClick={() => setShowFullSynopsis((v) => !v)}
                    className="mt-2 text-xs font-semibold text-[#FF6B1A] hover:underline"
                  >
                    {showFullSynopsis ? 'Mostrar menos' : 'Ler sinopse completa'}
                  </button>
                )}
              </div>

              <div className="lg:col-span-4 space-y-4 text-sm">
                <div>
                  <span className="block text-xs text-zinc-500 mb-1">Gêneros</span>
                  <span className="text-zinc-200 font-medium">
                    {anime.genres.map(translateGenre).join(' · ') || 'Animação'}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-zinc-500 mb-1">Estúdio responsável</span>
                  <span className="text-zinc-200 font-medium">{studioNames}</span>
                </div>
                {anime.season && anime.seasonYear ? (
                  <div>
                    <span className="block text-xs text-zinc-500 mb-1">Temporada de estreia</span>
                    <span className="text-zinc-200 font-medium">
                      {translateSeason(anime.season)} de {anime.seasonYear}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Season / Sequel Selector */}
        {anime.seasons.length > 1 && (
          <section className="mt-12 pt-8 border-t border-white/[0.08]">
            <h2 className="font-display text-xl font-bold text-white mb-4">
              Temporadas e obras relacionadas
            </h2>
            <div className="flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-2">
              {anime.seasons.map((season) => (
                <button
                  key={season.id}
                  type="button"
                  onClick={() => {
                    if (!season.isCurrent) onOpenAnime(season.id);
                  }}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border text-left shrink-0 w-[260px] transition-colors ${
                    season.isCurrent
                      ? 'bg-[#FF6B1A]/15 border-[#FF6B1A] text-white'
                      : 'bg-zinc-900/70 border-white/[0.08] text-zinc-300 hover:bg-zinc-900 hover:border-white/20'
                  }`}
                >
                  <div className="w-12 aspect-[2/3] rounded-md overflow-hidden bg-zinc-800 shrink-0">
                    <SafeImage
                      src={season.coverImage}
                      alt={season.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold line-clamp-2 leading-snug">
                      {season.title}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-1 tabular-nums">
                      {translateFormat(season.format)}
                      {season.seasonYear ? ` · ${season.seasonYear}` : ''}
                      {season.episodes ? ` · ${season.episodes} ep.` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Episode List with Official Thumbnails */}
        <section className="mt-12 pt-8 border-t border-white/[0.08]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                Episódios
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5 tabular-nums">
                {anime.episodeList.length} {anime.episodeList.length === 1 ? 'episódio disponível' : 'episódios disponíveis'}
              </p>
            </div>

            {episodeChunks.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {episodeChunks.map((chunk, idx) => (
                  <button
                    key={chunk.label}
                    type="button"
                    onClick={() => setEpisodeChunkIndex(idx)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 tabular-nums transition-colors ${
                      idx === episodeChunkIndex
                        ? 'bg-[#FF6B1A] text-white'
                        : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-white/[0.08]'
                    }`}
                  >
                    {chunk.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-3.5">
            {visibleEpisodes.map((ep) => {
              const epProg = getEpisodeProgress(anime.id, ep.number);
              const isPlayingNow = activeEpisode === ep.number;
              const percent = epProg
                ? Math.min(100, Math.max(4, Math.round((epProg.currentTime / epProg.duration) * 100)))
                : 0;
              const topQuality =
                ep.availableQualities?.[0] || ((anime.seasonYear ?? 2020) >= 2008 ? '1080p' : '720p');

              return (
                <button
                  key={ep.number}
                  type="button"
                  onClick={() => onWatchEpisode(anime.id, ep.number, anime)}
                  className={`group text-left flex flex-col rounded-lg border overflow-hidden transition-colors ${
                    isPlayingNow
                      ? 'bg-[#FF6B1A]/12 border-[#FF6B1A]'
                      : 'bg-zinc-900/50 hover:bg-zinc-900 border-white/[0.06] hover:border-[#FF6B1A]/60'
                  }`}
                >
                  <div className="relative aspect-video w-full bg-zinc-950 overflow-hidden">
                    <EpisodeThumb
                      src={
                        ep.thumbnail ||
                        (anime.episodeList.length === 1 ? anime.bannerImage : null)
                      }
                      alt={`${title} Episódio ${ep.number}`}
                      episodeNumber={ep.number}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />

                    <span
                      className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                        isPlayingNow ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#FF6B1A] text-white flex items-center justify-center shadow-lg">
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      </span>
                    </span>

                    <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between gap-1.5 tabular-nums">
                      <span className="font-mono text-[10px] sm:text-[11px] font-semibold text-white">
                        EP {String(ep.number).padStart(2, '0')}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-black/70 border border-white/10 font-mono text-[10px] font-medium text-zinc-200 leading-none">
                        {topQuality}
                      </span>
                    </div>

                    {epProg && (
                      <div className="absolute bottom-0 inset-x-0 h-[3px] bg-white/15">
                        <div className="h-full bg-[#FF6B1A]" style={{ width: `${percent}%` }} />
                      </div>
                    )}
                  </div>

                  <div className="p-2.5">
                    <h3
                      className={`text-xs sm:text-[13px] font-semibold leading-snug transition-colors line-clamp-1 ${
                        isPlayingNow ? 'text-[#FF6B1A]' : 'text-zinc-100 group-hover:text-[#FF6B1A]'
                      }`}
                    >
                      {ep.number}. {ep.title}
                    </h3>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-400 tabular-nums">
                      <span className="truncate">
                        {isPlayingNow
                          ? 'Reproduzindo'
                          : epProg?.completed
                            ? 'Assistido'
                            : epProg
                              ? `Parou em ${formatTimeSeconds(epProg.currentTime)}`
                              : ep.isFiller
                                ? 'Filler'
                                : ep.isRecap
                                  ? 'Recap'
                                  : ep.aired || 'Disponível'}
                      </span>
                      <span className="inline-flex items-center gap-1 shrink-0 text-zinc-300">
                        <Clock className="w-3 h-3 text-zinc-500" />
                        {ep.duration} min
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Voice Cast & Characters */}
        {anime.characters.length > 0 && (
          <section className="mt-12 pt-8 border-t border-white/[0.08]">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white mb-5">
              Elenco de dublagem e personagens
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {anime.characters.map((char) => (
                <div
                  key={char.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/50 border border-white/[0.06]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                      <SafeImage
                        src={char.image}
                        alt={char.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-100 truncate">{char.name}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{char.role}</p>
                    </div>
                  </div>

                  {char.voiceActor && (
                    <div className="flex items-center gap-3 min-w-0 text-right">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-zinc-200 truncate">
                          {char.voiceActor.name}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {char.voiceActor.language}
                        </p>
                      </div>
                      <div className="w-11 h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                        <SafeImage
                          src={char.voiceActor.image}
                          alt={char.voiceActor.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Similar Anime Recommendations */}
      {anime.recommendations.length > 0 && (
        <div className="mt-10 pt-6 border-t border-white/[0.06]">
          <HorizontalRail
            title="Recomendações semelhantes"
            subtitle={`Se você gostou de ${title}, também pode curtir`}
          >
            {anime.recommendations.map((rec) => (
              <AnimeCard
                key={rec.id}
                anime={rec}
                onSelect={onOpenAnime}
                onQuickWatch={(id) => onWatchEpisode(id, 1)}
              />
            ))}
          </HorizontalRail>
        </div>
      )}
    </div>
  );
}
