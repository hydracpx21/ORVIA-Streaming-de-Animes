import { Check, ChevronLeft, ChevronRight, Info, Play, Plus, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { EpisodeLandscapeCard } from '../components/EpisodeLandscapeCard';
import { HorizontalRail } from '../components/HorizontalRail';
import { SafeImage } from '../components/SafeImage';
import { useAccount } from '../context/AccountContext';
import type { AnimeSummary, CatalogUpdatesResponse, HomeFeed } from '../types/anime';
import {
  cleanDescription,
  formatScore,
  GENRE_OPTIONS,
  getAgeRating,
  getBestBackdrop,
  getDisplayTitle,
  getOriginalTitle,
  translateFormat,
  translateGenre,
} from '../utils/formatters';

interface HomePageProps {
  onOpenAnime: (id: number) => void;
  onWatchEpisode: (id: number, episode: number) => void;
  onBrowseSection: (section: 'animes' | 'releases' | 'genres' | 'mylist', genre?: string) => void;
}

export function HomePage({ onOpenAnime, onWatchEpisode, onBrowseSection }: HomePageProps) {
  const {
    profileData,
    isFavorite,
    toggleFavorite,
    getAnimeProgress,
    removeContinueWatching,
  } = useAccount();

  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Interactive Genre Strip state
  const [selectedGenre, setSelectedGenre] = useState<string>('Action');
  const [genreAnimes, setGenreAnimes] = useState<AnimeSummary[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);

  // Personalized recommendations based on user's top genres
  const [recommendedAnimes, setRecommendedAnimes] = useState<AnimeSummary[]>([]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 14000);

    setLoading(true);
    setError(null);
    fetch('/api/anime/home', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Falha ao carregar catálogo');
        return (await res.json()) as HomeFeed;
      })
      .then((data) => {
        if (active) setFeed(data);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof Error && err.name === 'AbortError') {
          setError('O servidor demorou para responder. Tente novamente em instantes.');
        } else {
          setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
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
  }, [reloadNonce]);

  // Silent live detector sync for newly released episodes and newly premiered animes
  useEffect(() => {
    if (!feed) return;
    let active = true;
    const currentRevision = feed.catalogRevision ?? 0;

    const checkCatalogUpdates = async () => {
      try {
        const res = await fetch(
          `/api/anime/updates?sinceRevision=${encodeURIComponent(String(currentRevision))}`,
          { cache: 'no-store' }
        );
        if (!res.ok || !active) return;
        const data = (await res.json()) as CatalogUpdatesResponse;
        if (!active) return;

        if (data.hasUpdates || data.catalogRevision > currentRevision) {
          setFeed((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              recentEpisodes: data.recentEpisodes ?? prev.recentEpisodes,
              newAnimes: data.newAnimes ?? prev.newAnimes,
              catalogRevision: data.catalogRevision,
              lastCatalogSyncAt: data.lastCatalogSyncAt,
            };
          });
        }
      } catch {
        // Silent background check
      }
    };

    const interval = window.setInterval(checkCatalogUpdates, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkCatalogUpdates();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [feed?.catalogRevision]);

  // Auto-rotate hero every 9 seconds
  useEffect(() => {
    if (!feed?.hero.length) return;
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % feed.hero.length);
    }, 9000);
    return () => clearInterval(timer);
  }, [feed?.hero.length]);

  // Fetch interactive genre rail
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 11000);
    setGenreLoading(true);
    fetch(`/api/anime/catalog?genre=${encodeURIComponent(selectedGenre)}&sort=POPULARITY_DESC&perPage=16`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { items: AnimeSummary[] }) => {
        if (active) setGenreAnimes(data.items);
      })
      .catch(() => {
        if (active) setGenreAnimes([]);
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (active) setGenreLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selectedGenre]);

  // Continue watching sorted by most recent
  const continueWatchingList = useMemo(() => {
    return Object.values(profileData.progressByAnime)
      .filter((item) => !item.completed)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [profileData.progressByAnime]);

  // Top user genre for personalized recommendations
  const topUserGenre = useMemo(() => {
    const counts = new Map<string, number>();
    for (const fav of profileData.favorites) {
      for (const g of fav.genres || []) {
        counts.set(g, (counts.get(g) || 0) + 2);
      }
    }
    for (const prog of Object.values(profileData.progressByAnime)) {
      for (const g of prog.genres || []) {
        counts.set(g, (counts.get(g) || 0) + 1);
      }
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [g, count] of counts.entries()) {
      if (count > bestCount) {
        best = g;
        bestCount = count;
      }
    }
    return best;
  }, [profileData.favorites, profileData.progressByAnime]);

  useEffect(() => {
    if (!topUserGenre) {
      setRecommendedAnimes([]);
      return;
    }
    let active = true;
    fetch(`/api/anime/catalog?genre=${encodeURIComponent(topUserGenre)}&sort=SCORE_DESC&perPage=16`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { items: AnimeSummary[] }) => {
        if (active) {
          const favIds = new Set(profileData.favorites.map((f) => f.id));
          setRecommendedAnimes(data.items.filter((a) => !favIds.has(a.id)));
        }
      })
      .catch(() => {
        if (active) setRecommendedAnimes([]);
      });
    return () => {
      active = false;
    };
  }, [topUserGenre, profileData.favorites]);

  const heroAnime = feed?.hero[heroIndex] || feed?.hero[0] || null;
  const heroProgress = heroAnime ? getAnimeProgress(heroAnime.id) : null;
  const heroSaved = heroAnime ? isFavorite(heroAnime.id) : false;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090B]">
        <div className="h-[74vh] bg-zinc-900/60 animate-pulse" />
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-10 space-y-10">
          {[1, 2, 3].map((row) => (
            <div key={row} className="space-y-4">
              <div className="h-7 w-56 bg-zinc-800 rounded animate-pulse" />
              <div className="flex gap-4 overflow-hidden">
                {[1, 2, 3, 4, 5, 6].map((c) => (
                  <div key={c} className="w-[188px] aspect-[2/3] bg-zinc-900 rounded-lg animate-pulse shrink-0" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !feed) {
    return (
      <div className="min-h-screen bg-[#09090B] flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl font-bold text-white">Não foi possível carregar o catálogo</h1>
        <p className="text-sm text-zinc-400 mt-2 max-w-md">{error || 'Verifique sua conexão e tente novamente.'}</p>
        <button
          type="button"
          onClick={() => setReloadNonce((n) => n + 1)}
          className="mt-6 px-5 py-2.5 rounded-lg bg-[#FF6B1A] hover:bg-[#FF7E38] text-white text-sm font-semibold transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B]">
      {/* Featured Panoramic Hero Showcase */}
      {heroAnime && (
        <section className="relative h-[76vh] min-h-[540px] max-h-[820px] w-full overflow-hidden">
          <SafeImage
            src={getBestBackdrop(heroAnime) || heroAnime.coverImage.extraLarge}
            alt={`Banner oficial de ${getDisplayTitle(heroAnime)}`}
            loading="eager"
            className="w-full h-full object-cover object-center transition-opacity duration-500"
          />

          {/* Measured Contrast Scrims for >= 4.5:1 text legibility */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#09090B] via-[#09090B]/75 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/25 to-[#09090B]/55" />

          <div className="absolute inset-0 flex items-end pb-14 sm:pb-20">
            <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 flex flex-col md:flex-row md:items-end justify-between gap-8">
              <div className="max-w-2xl">
                {/* Clean unboxed metadata line */}
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-zinc-300 font-medium tabular-nums mb-3">
                  <span className="text-[#FF6B1A] font-semibold">Em Destaque</span>
                  <span aria-hidden="true">·</span>
                  <span>{translateFormat(heroAnime.format)}</span>
                  {heroAnime.seasonYear ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{heroAnime.seasonYear}</span>
                    </>
                  ) : null}
                  {heroAnime.averageScore ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 text-white">
                        <Star className="w-3.5 h-3.5 fill-[#FF6B1A] text-[#FF6B1A]" />
                        {formatScore(heroAnime.averageScore)}
                      </span>
                    </>
                  ) : null}
                  <span aria-hidden="true">·</span>
                  <span>{getAgeRating(heroAnime)}</span>
                  {heroAnime.genres.length > 0 ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{heroAnime.genres.slice(0, 3).map(translateGenre).join(', ')}</span>
                    </>
                  ) : null}
                </div>

                <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.06] [text-wrap:balance]">
                  {getDisplayTitle(heroAnime)}
                </h1>

                {getOriginalTitle(heroAnime) && (
                  <p className="mt-1.5 text-xs sm:text-sm text-zinc-400 truncate">
                    {getOriginalTitle(heroAnime)}
                  </p>
                )}

                <p className="mt-4 text-sm sm:text-base text-zinc-300 leading-relaxed line-clamp-3 max-w-xl">
                  {cleanDescription(heroAnime.id, heroAnime.description)}
                </p>

                {/* Primary & Secondary CTAs */}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onWatchEpisode(heroAnime.id, heroProgress ? heroProgress.episodeNumber : 1)
                    }
                    className="h-11 px-6 rounded-lg bg-[#FF6B1A] hover:bg-[#FF7E38] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {heroProgress
                        ? `Continuar Ep. ${heroProgress.episodeNumber}`
                        : 'Assistir agora'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenAnime(heroAnime.id)}
                    className="h-11 px-5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-white/15 text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Info className="w-4 h-4" />
                    <span>Detalhes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleFavorite(heroAnime)}
                    aria-label={heroSaved ? 'Remover da Minha Lista' : 'Adicionar à Minha Lista'}
                    className={`h-11 px-4 rounded-lg border text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                      heroSaved
                        ? 'bg-white/10 border-[#FF6B1A] text-white'
                        : 'bg-zinc-950/75 border-white/15 text-zinc-200 hover:border-white/35'
                    }`}
                  >
                    {heroSaved ? <Check className="w-4 h-4 text-[#FF6B1A]" /> : <Plus className="w-4 h-4" />}
                    <span>{heroSaved ? 'Na Minha Lista' : 'Minha Lista'}</span>
                  </button>
                </div>
              </div>

              {/* Hero Slide Controls */}
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setHeroIndex((prev) => (prev - 1 + feed.hero.length) % feed.hero.length)
                  }
                  aria-label="Destaque anterior"
                  className="w-9 h-9 rounded-lg border border-white/15 bg-black/50 hover:bg-black/80 text-zinc-200 flex items-center justify-center transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1.5" role="tablist" aria-label="Destaques">
                  {feed.hero.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={idx === heroIndex}
                      aria-label={`Ver destaque ${getDisplayTitle(item)}`}
                      onClick={() => setHeroIndex(idx)}
                      className={`h-1.5 rounded-full transition-all duration-200 ${
                        idx === heroIndex ? 'w-7 bg-[#FF6B1A]' : 'w-2 bg-white/30 hover:bg-white/60'
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setHeroIndex((prev) => (prev + 1) % feed.hero.length)}
                  aria-label="Próximo destaque"
                  className="w-9 h-9 rounded-lg border border-white/15 bg-black/50 hover:bg-black/80 text-zinc-200 flex items-center justify-center transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Content Rails */}
      <div className="space-y-4 -mt-4 relative z-10">
        {/* Continuar Assistindo */}
        {continueWatchingList.length > 0 && (
          <HorizontalRail
            title="Continuar assistindo"
            subtitle="Retome exatamente do segundo em que você parou"
            actionLabel="Ver histórico"
            onAction={() => onBrowseSection('mylist')}
          >
            {continueWatchingList.map((item) => (
              <EpisodeLandscapeCard
                key={`${item.animeId}-${item.episodeNumber}`}
                animeTitle={item.animeTitle}
                episodeNumber={item.episodeNumber}
                episodeTitle={item.episodeTitle}
                thumbnail={item.thumbnail}
                fallbackBackdrop={item.bannerImage || item.coverImage}
                progressSeconds={item.currentTime}
                durationSeconds={item.duration}
                onPlay={() => onWatchEpisode(item.animeId, item.episodeNumber)}
                onOpenAnime={() => onOpenAnime(item.animeId)}
                onRemove={() => removeContinueWatching(item.animeId)}
              />
            ))}
          </HorizontalRail>
        )}

        {/* Minha Lista on Home */}
        {profileData.favorites.length > 0 && (
          <HorizontalRail
            title="Minha lista"
            subtitle="Séries e filmes salvos no seu perfil"
            actionLabel="Gerenciar lista"
            onAction={() => onBrowseSection('mylist')}
          >
            {profileData.favorites.map((anime) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                onSelect={onOpenAnime}
                onQuickWatch={(id) => onWatchEpisode(id, 1)}
              />
            ))}
          </HorizontalRail>
        )}

        {/* Episódios Recém-Adicionados */}
        {feed.recentEpisodes.length > 0 && (
          <HorizontalRail
            title="Episódios recém-adicionados"
            subtitle="Novos episódios detectados automaticamente e prontos para assistir"
            actionLabel="Ver lançamentos"
            onAction={() => onBrowseSection('releases')}
          >
            {feed.recentEpisodes.map((drop) => (
              <EpisodeLandscapeCard
                key={`${drop.anime.id}-${drop.episodeNumber}`}
                animeTitle={getDisplayTitle(drop.anime)}
                episodeNumber={drop.episodeNumber}
                episodeTitle={drop.episodeTitle}
                thumbnail={drop.thumbnail}
                fallbackBackdrop={drop.anime.bannerImage}
                subtitleRight={drop.airedLabel}
                onPlay={() => onWatchEpisode(drop.anime.id, drop.episodeNumber)}
                onOpenAnime={() => onOpenAnime(drop.anime.id)}
              />
            ))}
          </HorizontalRail>
        )}

        {/* Animes Novos e Recém-Estreados */}
        {feed.newAnimes && feed.newAnimes.length > 0 && (
          <HorizontalRail
            title="Animes novos e recém-estreados"
            subtitle="Estreias detectadas recentemente já disponíveis no catálogo"
            actionLabel="Ver lançamentos"
            onAction={() => onBrowseSection('releases')}
          >
            {feed.newAnimes.map((anime) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                onSelect={onOpenAnime}
                onQuickWatch={(id) => onWatchEpisode(id, 1)}
              />
            ))}
          </HorizontalRail>
        )}

        {/* Animes em Alta */}
        <HorizontalRail
          title="Animes em alta"
          subtitle="Os títulos mais assistidos e comentados da semana"
          actionLabel="Ver catálogo"
          onAction={() => onBrowseSection('animes')}
        >
          {feed.trending.map((anime, index) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              rank={index + 1}
              onSelect={onOpenAnime}
              onQuickWatch={(id) => onWatchEpisode(id, 1)}
            />
          ))}
        </HorizontalRail>

        {/* Recomendados para você (personalized or curated popular) */}
        <HorizontalRail
          title={
            topUserGenre
              ? `Recomendado para você em ${translateGenre(topUserGenre)}`
              : 'Populares e recomendados'
          }
          subtitle={
            topUserGenre
              ? 'Selecionado com base nos seus favoritos e histórico de reprodução'
              : 'Seleção editorial com as maiores produções do catálogo'
          }
          actionLabel="Explorar"
          onAction={() => onBrowseSection('animes')}
        >
          {(recommendedAnimes.length > 0 ? recommendedAnimes : feed.popular).map((anime) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              onSelect={onOpenAnime}
              onQuickWatch={(id) => onWatchEpisode(id, 1)}
            />
          ))}
        </HorizontalRail>

        {/* Lançamentos da Temporada */}
        <HorizontalRail
          title="Lançamentos da temporada"
          subtitle="Novos episódios em exibição semanal simultânea"
          actionLabel="Todos os lançamentos"
          onAction={() => onBrowseSection('releases')}
        >
          {feed.seasonal.map((anime) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              onSelect={onOpenAnime}
              onQuickWatch={(id) => onWatchEpisode(id, 1)}
            />
          ))}
        </HorizontalRail>

        {/* Mais Bem Avaliados */}
        <HorizontalRail
          title="Mais populares e bem avaliados"
          subtitle="Obras aclamadas pela crítica e pela comunidade"
          actionLabel="Ver ranking"
          onAction={() => onBrowseSection('animes')}
        >
          {feed.topRated.map((anime) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              onSelect={onOpenAnime}
              onQuickWatch={(id) => onWatchEpisode(id, 1)}
            />
          ))}
        </HorizontalRail>

        {/* Organização por Categorias e Gêneros */}
        <section className="py-6">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
              <div>
                <h2 className="font-display text-lg sm:text-2xl font-bold tracking-tight text-white">
                  Explorar por gêneros
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                  Filtre rapidamente por estilo e encontre sua próxima maratona
                </p>
              </div>
              <button
                type="button"
                onClick={() => onBrowseSection('genres', selectedGenre)}
                className="text-xs sm:text-sm font-medium text-[#FF6B1A] hover:underline self-start sm:self-auto whitespace-nowrap"
              >
                Abrir catálogo de {translateGenre(selectedGenre)}
              </button>
            </div>

            {/* Interactive Genre Filter Tabs */}
            <div
              role="tablist"
              aria-label="Filtrar por gênero"
              className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-4"
            >
              {GENRE_OPTIONS.slice(0, 11).map((genre) => {
                const active = selectedGenre === genre.id;
                return (
                  <button
                    key={genre.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedGenre(genre.id)}
                    className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-[#FF6B1A] text-white'
                        : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-white/[0.08]'
                    }`}
                  >
                    {genre.label}
                  </button>
                );
              })}
            </div>

            {/* Genre Results Rail */}
            {genreLoading ? (
              <div className="flex gap-4 overflow-hidden py-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="w-[164px] sm:w-[188px] aspect-[2/3] rounded-lg bg-zinc-900 animate-pulse shrink-0"
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-stretch gap-4 overflow-x-auto no-scrollbar pb-2">
                {genreAnimes.map((anime) => (
                  <AnimeCard
                    key={anime.id}
                    anime={anime}
                    onSelect={onOpenAnime}
                    onQuickWatch={(id) => onWatchEpisode(id, 1)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
