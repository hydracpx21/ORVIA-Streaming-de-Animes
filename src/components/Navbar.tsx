import { Bookmark, Compass, Flame, Home, Search, Sparkles, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAccount } from '../context/AccountContext';
import { resolveProfileAvatar } from '../utils/formatters';
import type { PrivacyTab } from '../types/privacy';
import { OrviaLogo } from './OrviaLogo';
import { SafeImage } from './SafeImage';

export type AppRoute =
  | { name: 'home' }
  | { name: 'animes' }
  | { name: 'releases' }
  | { name: 'genres'; genre?: string }
  | { name: 'search'; query?: string }
  | { name: 'mylist' }
  | { name: 'profile' }
  | { name: 'privacy'; tab?: PrivacyTab }
  | { name: 'anime'; id: number; episode?: number | null };

interface NavbarProps {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onOpenSearch: () => void;
}

export function Navbar({ route, onNavigate, onOpenSearch }: NavbarProps) {
  const { activeProfile } = useAccount();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navItems: Array<{ label: string; active: boolean; target: AppRoute }> = [
    { label: 'Início', active: route.name === 'home', target: { name: 'home' } },
    { label: 'Animes', active: route.name === 'animes', target: { name: 'animes' } },
    { label: 'Lançamentos', active: route.name === 'releases', target: { name: 'releases' } },
    { label: 'Gêneros', active: route.name === 'genres', target: { name: 'genres' } },
    { label: 'Minha Lista', active: route.name === 'mylist', target: { name: 'mylist' } },
  ];

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-colors duration-200 ${
          scrolled
            ? 'bg-[#09090B]/92 backdrop-blur-md border-b border-white/[0.08]'
            : 'bg-gradient-to-b from-[#09090B]/90 via-[#09090B]/50 to-transparent'
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate({ name: 'home' })}
            className="whitespace-nowrap shrink-0 flex items-center hover:opacity-90 transition-opacity"
            aria-label="ORVIA Início"
          >
            <OrviaLogo size="md" />
          </button>

          {/* Zone 2: Clean single-line text navigation links */}
          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onNavigate(item.target)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors duration-150 ${
                  item.active
                    ? 'text-white'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {item.label}
                {item.active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 right-0 -bottom-0.5 h-0.5 bg-[#FF6B1A]"
                  />
                )}
              </button>
            ))}
          </nav>

          {/* Zone 3: Search + Profile Trigger */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label="Buscar animes"
              className={`h-10 px-3 flex items-center gap-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                route.name === 'search'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Search className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Buscar</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate({ name: 'profile' })}
              aria-label="Perfil do usuário"
              className={`h-10 pl-1.5 pr-3 flex items-center gap-2.5 rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                route.name === 'profile'
                  ? 'border-[#FF6B1A] bg-zinc-900 text-white'
                  : 'border-white/[0.08] bg-zinc-900/70 text-zinc-200 hover:border-white/20'
              }`}
            >
              <div className="w-7 h-7 rounded-full overflow-hidden bg-zinc-800 shrink-0 ring-1 ring-white/20">
                <SafeImage
                  src={resolveProfileAvatar(activeProfile?.avatar)}
                  alt={activeProfile?.name || 'Perfil'}
                  className="w-full h-full object-cover object-top"
                  loading="eager"
                />
              </div>
              <span className="text-xs font-medium max-w-[96px] truncate hidden sm:inline">
                {activeProfile?.name || 'Perfil'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Bar (<= 10% viewport height, clean touch targets >= 44px) */}
      <nav
        aria-label="Navegação móvel"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-[#09090B]/95 backdrop-blur-md border-t border-white/[0.08] flex items-center justify-around px-2"
      >
        <button
          type="button"
          onClick={() => onNavigate({ name: 'home' })}
          className={`flex flex-col items-center justify-center min-w-[48px] h-11 text-[11px] font-medium ${
            route.name === 'home' ? 'text-[#FF6B1A]' : 'text-zinc-400'
          }`}
        >
          <Home className="w-4 h-4 mb-0.5" />
          <span>Início</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'animes' })}
          className={`flex flex-col items-center justify-center min-w-[48px] h-11 text-[11px] font-medium ${
            route.name === 'animes' || route.name === 'genres' ? 'text-[#FF6B1A]' : 'text-zinc-400'
          }`}
        >
          <Compass className="w-4 h-4 mb-0.5" />
          <span>Animes</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'releases' })}
          className={`flex flex-col items-center justify-center min-w-[48px] h-11 text-[11px] font-medium ${
            route.name === 'releases' ? 'text-[#FF6B1A]' : 'text-zinc-400'
          }`}
        >
          <Flame className="w-4 h-4 mb-0.5" />
          <span>Estreias</span>
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className={`flex flex-col items-center justify-center min-w-[48px] h-11 text-[11px] font-medium ${
            route.name === 'search' ? 'text-[#FF6B1A]' : 'text-zinc-400'
          }`}
        >
          <Sparkles className="w-4 h-4 mb-0.5 hidden" />
          <Search className="w-4 h-4 mb-0.5" />
          <span>Buscar</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'mylist' })}
          className={`flex flex-col items-center justify-center min-w-[48px] h-11 text-[11px] font-medium ${
            route.name === 'mylist' ? 'text-[#FF6B1A]' : 'text-zinc-400'
          }`}
        >
          <Bookmark className="w-4 h-4 mb-0.5" />
          <span>Lista</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'profile' })}
          className={`flex flex-col items-center justify-center min-w-[48px] h-11 text-[11px] font-medium ${
            route.name === 'profile' ? 'text-[#FF6B1A]' : 'text-zinc-400'
          }`}
        >
          <User className="w-4 h-4 mb-0.5" />
          <span>Perfil</span>
        </button>
      </nav>
    </>
  );
}
