import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useRef } from 'react';

interface HorizontalRailProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}

export function HorizontalRail({
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
}: HorizontalRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollByAmount = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = Math.max(320, el.clientWidth * 0.78);
    el.scrollBy({ left: direction * distance, behavior: 'smooth' });
  };

  return (
    <section className="relative py-5">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 flex items-end justify-between gap-4 mb-4">
        <div>
          <h2 className="font-display text-lg sm:text-2xl font-bold tracking-tight text-white">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="text-xs sm:text-sm font-medium text-zinc-400 hover:text-[#FF6B1A] transition-colors whitespace-nowrap mr-2"
            >
              {actionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => scrollByAmount(-1)}
            aria-label={`Rolar ${title} para a esquerda`}
            className="hidden sm:flex w-9 h-9 rounded-lg border border-white/[0.08] bg-zinc-900/80 hover:bg-zinc-800 hover:border-white/20 items-center justify-center text-zinc-300 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByAmount(1)}
            aria-label={`Rolar ${title} para a direita`}
            className="hidden sm:flex w-9 h-9 rounded-lg border border-white/[0.08] bg-zinc-900/80 hover:bg-zinc-800 hover:border-white/20 items-center justify-center text-zinc-300 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="max-w-[1440px] mx-auto px-4 sm:px-8 flex items-stretch gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2"
      >
        {children}
      </div>
    </section>
  );
}
