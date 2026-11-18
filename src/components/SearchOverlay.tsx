import { ArrowRight, Search, Star, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AnimeSummary } from '../types/anime';
import { formatScore, getDisplayTitle, translateFormat, translateGenre } from '../utils/formatters';
import { SafeImage } from './SafeImage';

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  onSelectAnime: (id: number) => void;
  onViewAllResults: (query: string) => void;
}

export function SearchOverlay({
  open,
  onClose,
  onSelectAnime,
  onViewAllResults,
}: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) onClose();
      } else if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/anime/catalog?search=${encodeURIComponent(trimmed)}&perPage=8`
        );
        if (res.ok) {
          const data = (await res.json()) as { items: AnimeSummary[] };
          setResults(data.items);
        }
      } catch (err) {
        console.error('Erro na busca rápida:', err);
      } finally {
        setLoading(false);
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [query, open]);

  if (!open) return null;

  const quickTags = ['Solo Leveling', 'Frieren', 'Jujutsu Kaisen', 'One Piece', 'Attack on Titan', 'Chainsaw Man'];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start justify-center pt-16 sm:pt-24 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Buscar animes"
    >
      <div
        className="w-full max-w-2xl bg-[#111114] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) {
              onViewAllResults(query.trim());
              onClose();
            }
          }}
          className="flex items-center gap-3 px-4 sm:px-5 h-14 border-b border-white/[0.08]"
        >
          <Search className="w-5 h-5 text-[#FF6B1A] shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar animes por título original ou internacional..."
            className="w-full bg-transparent text-sm sm:text-base text-white placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar busca"
            className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </form>

        <div className="max-h-[65vh] overflow-y-auto p-4 sm:p-5">
          {query.trim().length < 2 ? (
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-3">Sugestões em destaque</p>
              <div className="flex flex-wrap gap-2">
                {quickTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setQuery(tag)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-xs font-medium text-zinc-200 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ) : loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-12 aspect-[2/3] rounded bg-zinc-800 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 bg-zinc-800 rounded" />
                    <div className="h-3 w-1/3 bg-zinc-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-zinc-400 py-6 text-center">
              Nenhum anime encontrado para "{query}".
            </p>
          ) : (
            <div className="space-y-2">
              {results.map((anime) => {
                const title = getDisplayTitle(anime);
                return (
                  <button
                    key={anime.id}
                    type="button"
                    onClick={() => {
                      onSelectAnime(anime.id);
                      onClose();
                    }}
                    className="w-full flex items-center gap-3.5 p-2 rounded-lg hover:bg-white/[0.05] text-left transition-colors group"
                  >
                    <div className="w-11 aspect-[2/3] rounded overflow-hidden bg-zinc-900 shrink-0">
                      <SafeImage
                        src={anime.coverImage.large || anime.coverImage.extraLarge}
                        alt={title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-100 group-hover:text-[#FF6B1A] truncate">
                        {title}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5 tabular-nums truncate">
                        {anime.averageScore ? (
                          <>
                            <span className="inline-flex items-center gap-1 text-zinc-200">
                              <Star className="w-3 h-3 fill-[#FF6B1A] text-[#FF6B1A]" />
                              {formatScore(anime.averageScore)}
                            </span>
                            <span aria-hidden="true">·</span>
                          </>
                        ) : null}
                        <span>{translateFormat(anime.format)}</span>
                        {anime.seasonYear ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{anime.seasonYear}</span>
                          </>
                        ) : null}
                        {anime.genres[0] ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{translateGenre(anime.genres[0])}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-[#FF6B1A] shrink-0" />
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  onViewAllResults(query.trim());
                  onClose();
                }}
                className="w-full mt-3 py-2.5 px-4 rounded-lg bg-[#FF6B1A]/15 hover:bg-[#FF6B1A]/25 text-[#FF6B1A] text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <span>Ver todos os resultados no catálogo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
