import { Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import type { AnimeSummary } from '../types/anime';
import { GENRE_OPTIONS, translateGenre } from '../utils/formatters';

interface CatalogPageProps {
  mode: 'animes' | 'releases' | 'genres' | 'search';
  initialGenre?: string;
  initialQuery?: string;
  onOpenAnime: (id: number) => void;
  onWatchEpisode: (id: number, episode: number) => void;
}

export function CatalogPage({
  mode,
  initialGenre = '',
  initialQuery = '',
  onOpenAnime,
  onWatchEpisode,
}: CatalogPageProps) {
  const [search, setSearch] = useState(initialQuery);
  const [debouncedSearch, setDebouncedSearch] = useState(initialQuery);
  const [genre, setGenre] = useState(initialGenre);
  const [format, setFormat] = useState('');
  const [sort, setSort] = useState(
    mode === 'releases' ? 'TRENDING_DESC' : 'POPULARITY_DESC'
  );
  const [status, setStatus] = useState(mode === 'releases' ? 'RELEASING' : '');

  const [items, setItems] = useState<AnimeSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync mode switches from Navbar
  useEffect(() => {
    setSearch(initialQuery);
    setDebouncedSearch(initialQuery);
    setGenre(initialGenre);
    if (mode === 'releases') {
      setStatus('RELEASING');
      setSort('TRENDING_DESC');
    } else if (mode === 'animes') {
      setStatus('');
      setSort('POPULARITY_DESC');
    } else if (mode === 'genres') {
      setStatus('');
      if (!initialGenre) setGenre('Action');
    } else {
      setStatus('');
    }
  }, [mode, initialGenre, initialQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => clearTimeout(t);
  }, [search]);

  const fetchCatalog = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 14000);

      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          perPage: '24',
          sort,
        });
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (genre) params.set('genre', genre);
        if (format) params.set('format', format);
        if (status) params.set('status', status);

        const res = await fetch(`/api/anime/catalog?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Falha ao buscar catálogo');
        const data = (await res.json()) as {
          items: AnimeSummary[];
          hasNextPage: boolean;
          page: number;
        };

        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setHasNextPage(data.hasNextPage);
        setPage(data.page);
      } catch (err) {
        if (!append) {
          setError(
            err instanceof Error && err.name === 'AbortError'
              ? 'Tempo limite excedido ao carregar o catálogo.'
              : 'Não foi possível carregar o catálogo agora.'
          );
        }
      } finally {
        window.clearTimeout(timer);
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch, genre, format, sort, status]
  );

  useEffect(() => {
    fetchCatalog(1, false);
  }, [fetchCatalog]);

  useEffect(() => {
    if (mode !== 'releases') return;
    let active = true;
    let knownRevision = 0;

    const checkUpdates = async () => {
      try {
        const res = await fetch(
          `/api/anime/updates?sinceRevision=${encodeURIComponent(String(knownRevision))}`,
          { cache: 'no-store' }
        );
        if (!res.ok || !active) return;
        const data = (await res.json()) as { catalogRevision?: number; hasUpdates?: boolean };
        if (!active) return;
        const nextRev = data.catalogRevision || 0;
        if (knownRevision === 0) {
          knownRevision = nextRev;
          return;
        }
        if (data.hasUpdates || nextRev > knownRevision) {
          knownRevision = nextRev;
          fetchCatalog(1, false);
        }
      } catch {
        // Silent background check
      }
    };

    checkUpdates();
    const interval = window.setInterval(checkUpdates, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkUpdates();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [mode, fetchCatalog]);

  const heading =
    mode === 'releases'
      ? 'Lançamentos da temporada'
      : mode === 'genres'
        ? genre
          ? `Gênero: ${translateGenre(genre)}`
          : 'Explorar por gêneros'
        : mode === 'search'
          ? 'Buscar no catálogo'
          : 'Catálogo de animes';

  const subtitle =
    mode === 'releases'
      ? 'Séries em exibição semanal com novos episódios adicionados continuamente'
      : mode === 'genres'
        ? 'Descubra obras oficiais filtradas pelo seu gênero favorito'
        : 'Explore centenas de títulos oficiais em alta definição';

  return (
    <div className="min-h-screen bg-[#09090B] pt-24 pb-16">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8">
        {/* Header & Search Bar */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-white/[0.08]">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">
              {heading}
            </h1>
            <p className="text-sm text-zinc-400 mt-1.5">{subtitle}</p>
          </div>

          <div className="w-full lg:w-96 relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por título..."
              aria-label="Filtrar animes por título"
              className="w-full h-11 pl-10 pr-4 rounded-lg bg-zinc-900 border border-white/10 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF6B1A]"
            />
          </div>
        </div>

        {/* Genre Bar */}
        <div className="py-5 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setGenre('')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              genre === ''
                ? 'bg-[#FF6B1A] text-white'
                : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-white/[0.08]'
            }`}
          >
            Todos os gêneros
          </button>
          {GENRE_OPTIONS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGenre(g.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                genre === g.id
                  ? 'bg-[#FF6B1A] text-white'
                  : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-white/[0.08]'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Format & Sort Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <SlidersHorizontal className="w-4 h-4 text-zinc-500 mr-1 shrink-0" />
            {[
              { id: '', label: 'Todos formatos' },
              { id: 'TV', label: 'Séries TV' },
              { id: 'MOVIE', label: 'Filmes' },
              { id: 'OVA', label: 'OVAs' },
              { id: 'ONA', label: 'ONAs' },
            ].map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => setFormat(f.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  format === f.id
                    ? 'bg-zinc-800 text-white border border-white/20'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="catalog-status" className="sr-only">
              Status
            </label>
            <select
              id="catalog-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 px-3 rounded-lg bg-zinc-900 border border-white/10 text-xs font-medium text-zinc-200 focus:outline-none focus:border-[#FF6B1A]"
            >
              <option value="">Qualquer status</option>
              <option value="RELEASING">Em lançamento</option>
              <option value="FINISHED">Finalizados</option>
            </select>

            <label htmlFor="catalog-sort" className="sr-only">
              Ordenar por
            </label>
            <select
              id="catalog-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-9 px-3 rounded-lg bg-zinc-900 border border-white/10 text-xs font-medium text-zinc-200 focus:outline-none focus:border-[#FF6B1A]"
            >
              <option value="POPULARITY_DESC">Mais populares</option>
              <option value="TRENDING_DESC">Em alta agora</option>
              <option value="SCORE_DESC">Mais bem avaliados</option>
              <option value="START_DATE_DESC">Mais recentes</option>
            </select>
          </div>
        </div>

        {/* Grid Results */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-lg bg-zinc-900 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="py-20 text-center border border-white/[0.08] rounded-xl bg-zinc-900/30">
            <p className="text-base font-semibold text-white">Falha ao carregar catálogo</p>
            <p className="text-sm text-zinc-400 mt-1">{error}</p>
            <button
              type="button"
              onClick={() => fetchCatalog(1, false)}
              className="mt-5 px-5 py-2 rounded-lg bg-[#FF6B1A] hover:bg-[#FF7E38] text-white text-xs font-semibold transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center border border-white/[0.08] rounded-xl bg-zinc-900/30">
            <p className="text-base font-semibold text-white">Nenhum anime encontrado</p>
            <p className="text-sm text-zinc-400 mt-1">
              Tente alterar os filtros de gênero, formato ou termo de busca.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setGenre('');
                setFormat('');
                setStatus('');
              }}
              className="mt-5 px-4 py-2 rounded-lg bg-[#FF6B1A] text-white text-xs font-semibold"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-8">
              {items.map((anime) => (
                <div key={anime.id} className="flex justify-center">
                  <AnimeCard
                    anime={anime}
                    onSelect={onOpenAnime}
                    onQuickWatch={(id) => onWatchEpisode(id, 1)}
                    compact
                  />
                </div>
              ))}
            </div>

            {hasNextPage && (
              <div className="mt-12 flex justify-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => fetchCatalog(page + 1, true)}
                  className="h-11 px-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Carregando...' : 'Carregar mais animes'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
