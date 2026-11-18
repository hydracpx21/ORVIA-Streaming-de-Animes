import { Check, Play, Plus, Star } from 'lucide-react';
import { useAccount } from '../context/AccountContext';
import type { AnimeSummary } from '../types/anime';
import { formatScore, getDisplayTitle, translateFormat, translateGenre } from '../utils/formatters';
import { SafeImage } from './SafeImage';

interface AnimeCardProps {
  anime: AnimeSummary;
  onSelect: (animeId: number) => void;
  onQuickWatch?: (animeId: number) => void;
  rank?: number;
  compact?: boolean;
}

export function AnimeCard({ anime, onSelect, onQuickWatch, rank, compact = false }: AnimeCardProps) {
  const { isFavorite, toggleFavorite } = useAccount();
  const saved = isFavorite(anime.id);
  const title = getDisplayTitle(anime);
  const score = formatScore(anime.averageScore);
  const primaryGenre = anime.genres[0] ? translateGenre(anime.genres[0]) : translateFormat(anime.format);

  return (
    <article
      className={`group relative flex flex-col shrink-0 ${
        compact ? 'w-[152px] sm:w-[172px]' : 'w-[164px] sm:w-[188px] md:w-[204px]'
      }`}
    >
      {/* Official 2:3 Poster Frame */}
      <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-zinc-900 border border-white/[0.06] group-hover:border-[#FF6B1A]/60 transition-colors duration-200">
        <button
          type="button"
          onClick={() => onSelect(anime.id)}
          className="block w-full h-full text-left focus-visible:outline-none"
          aria-label={`Ver detalhes de ${title}`}
        >
          <SafeImage
            src={anime.coverImage.extraLarge || anime.coverImage.large}
            alt={`Capa oficial de ${title}`}
            fallbackTitle={title}
            accentColor={anime.coverImage.color}
            className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        </button>

        {/* Optional Editorial Rank Index */}
        {typeof rank === 'number' && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-2 left-2.5 font-display font-extrabold text-2xl leading-none tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] tabular-nums"
          >
            {String(rank).padStart(2, '0')}
          </span>
        )}

        {/* Quick Hover Actions (Play & Bookmark) */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-200">
          {onQuickWatch && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickWatch(anime.id);
              }}
              aria-label={`Assistir ${title}`}
              className="h-9 px-3 rounded-md bg-[#FF6B1A] hover:bg-[#FF7E38] text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Assistir</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(anime);
            }}
            aria-label={saved ? `Remover ${title} da Minha Lista` : `Adicionar ${title} à Minha Lista`}
            className={`w-9 h-9 rounded-md flex items-center justify-center border transition-colors ml-auto ${
              saved
                ? 'bg-[#FF6B1A] border-[#FF6B1A] text-white'
                : 'bg-zinc-950/85 border-white/15 text-zinc-200 hover:border-white/40'
            }`}
          >
            {saved ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Clean Title + Unboxed Metadata */}
      <button
        type="button"
        onClick={() => onSelect(anime.id)}
        className="mt-2.5 text-left focus-visible:outline-none"
      >
        <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-[#FF6B1A] transition-colors line-clamp-1">
          {title}
        </h3>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400 tabular-nums truncate">
          {anime.averageScore ? (
            <>
              <span className="inline-flex items-center gap-1 text-zinc-200 font-medium">
                <Star className="w-3 h-3 fill-[#FF6B1A] text-[#FF6B1A]" />
                {score}
              </span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span className="truncate">{primaryGenre}</span>
          {anime.seasonYear ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{anime.seasonYear}</span>
            </>
          ) : null}
        </div>
      </button>
    </article>
  );
}
