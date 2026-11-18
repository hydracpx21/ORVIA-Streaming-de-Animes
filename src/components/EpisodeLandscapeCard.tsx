import { Play, X } from 'lucide-react';
import { formatTimeSeconds } from '../utils/formatters';
import { SafeImage } from './SafeImage';

interface EpisodeLandscapeCardProps {
  animeTitle: string;
  episodeNumber: number;
  episodeTitle: string;
  thumbnail?: string | null;
  fallbackBackdrop?: string | null;
  subtitleRight?: string;
  progressSeconds?: number;
  durationSeconds?: number;
  onPlay: () => void;
  onOpenAnime?: () => void;
  onRemove?: () => void;
}

export function EpisodeLandscapeCard({
  animeTitle,
  episodeNumber,
  episodeTitle,
  thumbnail,
  fallbackBackdrop,
  subtitleRight,
  progressSeconds,
  durationSeconds,
  onPlay,
  onOpenAnime,
  onRemove,
}: EpisodeLandscapeCardProps) {
  const hasProgress =
    typeof progressSeconds === 'number' &&
    typeof durationSeconds === 'number' &&
    durationSeconds > 0 &&
    progressSeconds > 0;

  const percent = hasProgress
    ? Math.min(100, Math.max(3, Math.round((progressSeconds! / durationSeconds!) * 100)))
    : 0;

  return (
    <article className="group relative flex flex-col shrink-0 w-[264px] sm:w-[296px] md:w-[316px]">
      <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-zinc-900 border border-white/[0.06] group-hover:border-[#FF6B1A]/60 transition-colors duration-200">
        <button
          type="button"
          onClick={onPlay}
          className="block w-full h-full text-left focus-visible:outline-none"
          aria-label={`Reproduzir ${animeTitle} Episódio ${episodeNumber}`}
        >
          <SafeImage
            src={thumbnail || fallbackBackdrop}
            alt={`${animeTitle} - Episódio ${episodeNumber}`}
            fallbackTitle={animeTitle}
            className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

          {/* Centered Play Affordance on Hover */}
          <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
            <span className="w-12 h-12 rounded-full bg-[#FF6B1A] text-white flex items-center justify-center shadow-xl">
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </span>
          </span>

          {/* Bottom Episode Indicator */}
          <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-xs font-medium text-zinc-100 tabular-nums">
            <span>Episódio {String(episodeNumber).padStart(2, '0')}</span>
            {hasProgress ? (
              <span className="text-zinc-300 font-mono text-[11px]">
                {formatTimeSeconds(progressSeconds!)} / {formatTimeSeconds(durationSeconds!)}
              </span>
            ) : subtitleRight ? (
              <span className="text-zinc-300">{subtitleRight}</span>
            ) : null}
          </div>
        </button>

        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`Remover ${animeTitle} de Continuar assistindo`}
            className="absolute top-2 right-2 w-7 h-7 rounded-md bg-black/75 hover:bg-black text-zinc-300 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Episode Progress Bar */}
        {hasProgress && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/15">
            <div
              className="h-full bg-[#FF6B1A]"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>

      <div className="mt-2.5 flex flex-col">
        <button
          type="button"
          onClick={onOpenAnime || onPlay}
          className="text-left focus-visible:outline-none"
        >
          <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-[#FF6B1A] transition-colors line-clamp-1">
            {animeTitle}
          </h3>
        </button>
        <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">{episodeTitle}</p>
      </div>
    </article>
  );
}
