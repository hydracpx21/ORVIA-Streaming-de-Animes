/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AnimePlayer } from './components/AnimePlayer';
import { Footer } from './components/Footer';
import { Navbar, type AppRoute } from './components/Navbar';
import { PrivacyConsentBanner } from './components/PrivacyConsentBanner';
import { SearchOverlay } from './components/SearchOverlay';
import { AccountProvider, useAccount } from './context/AccountContext';
import { useSilentUpdates } from './hooks/useSilentUpdates';
import { AnimeDetailPage } from './pages/AnimeDetailPage';
import { CatalogPage } from './pages/CatalogPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { MyListPage } from './pages/MyListPage';
import { PrivacyCenterPage } from './pages/PrivacyCenterPage';
import { ProfilePage } from './pages/ProfilePage';
import { WhoIsWatchingPage } from './pages/WhoIsWatchingPage';
import type { AnimeDetail } from './types/anime';
import {
  clearPrivacyConsent,
  readPrivacyConsent,
  savePrivacyConsent,
  type PrivacyTab,
} from './types/privacy';

const animeDetailCache = new Map<number, AnimeDetail>();

interface PlaybackTarget {
  animeId: number;
  episodeNumber: number;
}

function enterMobileLandscapeFullscreen() {
  try {
    const isMobile =
      window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 1024;
    if (!isMobile) return;

    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const orientation = screen.orientation as {
      lock?: (mode: string) => Promise<void>;
    };

    const req = root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.();
    if (req && typeof req.then === 'function') {
      req
        .then(() => orientation?.lock?.('landscape')?.catch(() => {}))
        .catch(() => {});
    } else {
      orientation?.lock?.('landscape')?.catch(() => {});
    }
  } catch {
    // Graceful fallback if browser restricts fullscreen/orientation lock
  }
}

function exitFullscreenAndOrientation() {
  try {
    const orientation = screen.orientation as { unlock?: () => void };
    orientation?.unlock?.();
  } catch {
    // Ignore on unsupported browsers
  }
  try {
    const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
    if (document.fullscreenElement) {
      doc.exitFullscreen?.().catch(() => {});
    } else {
      doc.webkitExitFullscreen?.()?.catch(() => {});
    }
  } catch {
    // Ignore
  }
}

function parseRouteFromUrl(): AppRoute {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  const animeMatch = path.match(/^\/anime\/(\d+)/);
  if (animeMatch) {
    const epParam = params.get('ep');
    return {
      name: 'anime',
      id: Number(animeMatch[1]),
      episode: epParam ? Number(epParam) : null,
    };
  }

  if (path === '/animes') return { name: 'animes' };
  if (path === '/lancamentos') return { name: 'releases' };
  if (path === '/generos') return { name: 'genres', genre: params.get('g') || undefined };
  if (path === '/busca') return { name: 'search', query: params.get('q') || undefined };
  if (path === '/minha-lista') return { name: 'mylist' };
  if (path === '/perfil') return { name: 'profile' };
  if (path === '/privacidade') {
    const sec = params.get('sec') as PrivacyTab | null;
    const allowed: PrivacyTab[] = ['privacidade', 'termos', 'cookies', 'seguranca', 'direitos', 'exclusao'];
    return { name: 'privacy', tab: sec && allowed.includes(sec) ? sec : 'privacidade' };
  }
  return { name: 'home' };
}

function parsePlaybackFromUrl(): PlaybackTarget | null {
  const parsed = parseRouteFromUrl();
  if (parsed.name === 'anime' && parsed.episode) {
    return { animeId: parsed.id, episodeNumber: parsed.episode };
  }
  return null;
}

function buildUrlForRoute(route: AppRoute): string {
  switch (route.name) {
    case 'home':
      return '/';
    case 'animes':
      return '/animes';
    case 'releases':
      return '/lancamentos';
    case 'genres':
      return route.genre ? `/generos?g=${encodeURIComponent(route.genre)}` : '/generos';
    case 'search':
      return route.query ? `/busca?q=${encodeURIComponent(route.query)}` : '/busca';
    case 'mylist':
      return '/minha-lista';
    case 'profile':
      return '/perfil';
    case 'privacy':
      return route.tab && route.tab !== 'privacidade'
        ? `/privacidade?sec=${encodeURIComponent(route.tab)}`
        : '/privacidade';
    case 'anime':
      return route.episode ? `/anime/${route.id}?ep=${route.episode}` : `/anime/${route.id}`;
  }
}

function AppShell() {
  const { isAuthenticated, profileSelected, loading } = useAccount();
  const [route, setRoute] = useState<AppRoute>(() => {
    const initial = parseRouteFromUrl();
    if (initial.name === 'anime' && initial.episode) {
      return { name: 'anime', id: initial.id, episode: null };
    }
    return initial;
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [playbackTarget, setPlaybackTarget] = useState<PlaybackTarget | null>(parsePlaybackFromUrl);
  const [playbackAnime, setPlaybackAnime] = useState<AnimeDetail | null>(() => {
    const initial = parsePlaybackFromUrl();
    return initial ? animeDetailCache.get(initial.animeId) ?? null : null;
  });
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [consentBannerVisible, setConsentBannerVisible] = useState<boolean>(
    () => !readPrivacyConsent()
  );
  const [guestPrivacyTab, setGuestPrivacyTab] = useState<PrivacyTab | null>(null);

  useSilentUpdates(Boolean(playbackTarget));

  const navigate = useCallback((nextRoute: AppRoute, replace = false) => {
    setRoute(nextRoute);
    const targetUrl = buildUrlForRoute(nextRoute);
    if (window.location.pathname + window.location.search !== targetUrl) {
      if (replace) {
        window.history.replaceState({}, '', targetUrl);
      } else {
        window.history.pushState({}, '', targetUrl);
      }
    }
    if (!replace) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const nextPlayback = parsePlaybackFromUrl();
      if (nextPlayback) {
        setPlaybackTarget(nextPlayback);
        return;
      }
      setPlaybackTarget(null);
      exitFullscreenAndOrientation();
      setRoute(parseRouteFromUrl());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Load AnimeDetail for active global fullscreen playback if not preloaded/cached
  useEffect(() => {
    if (!playbackTarget) {
      setPlaybackAnime(null);
      setPlaybackError(null);
      return;
    }

    const cached = animeDetailCache.get(playbackTarget.animeId);
    if (cached) {
      setPlaybackAnime(cached);
      setPlaybackError(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 14000);
    setPlaybackAnime(null);
    setPlaybackError(null);

    fetch(`/api/anime/${playbackTarget.animeId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Não foi possível carregar este episódio.');
        return (await res.json()) as AnimeDetail;
      })
      .then((data) => {
        animeDetailCache.set(playbackTarget.animeId, data);
        if (active) setPlaybackAnime(data);
      })
      .catch((err) => {
        if (active) {
          setPlaybackError(
            err instanceof Error && err.name === 'AbortError'
              ? 'Tempo limite excedido ao abrir a reprodução.'
              : err instanceof Error
                ? err.message
                : 'Erro ao abrir reprodução.'
          );
        }
      })
      .finally(() => {
        window.clearTimeout(timer);
      });

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [playbackTarget?.animeId]);

  const openAnime = useCallback((id: number) => {
    setPlaybackTarget(null);
    exitFullscreenAndOrientation();
    navigate({ name: 'anime', id, episode: null });
  }, [navigate]);

  const watchEpisode = useCallback(
    (id: number, episode: number, preloadedAnime?: AnimeDetail) => {
      enterMobileLandscapeFullscreen();
      if (preloadedAnime) {
        animeDetailCache.set(id, preloadedAnime);
        setPlaybackAnime(preloadedAnime);
      }
      setPlaybackError(null);
      setPlaybackTarget({ animeId: id, episodeNumber: episode });

      const targetUrl = `/anime/${id}?ep=${episode}`;
      if (window.location.pathname + window.location.search !== targetUrl) {
        window.history.pushState({}, '', targetUrl);
      }
    },
    []
  );

  const selectPlaybackEpisode = useCallback((episode: number) => {
    setPlaybackTarget((prev) => {
      if (!prev) return null;
      const targetUrl = `/anime/${prev.animeId}?ep=${episode}`;
      if (window.location.pathname + window.location.search !== targetUrl) {
        window.history.replaceState({}, '', targetUrl);
      }
      return { ...prev, episodeNumber: episode };
    });
  }, []);

  const backToAnimeFromPlayer = useCallback(
    (animeId: number) => {
      exitFullscreenAndOrientation();
      setPlaybackTarget(null);
      navigate({ name: 'anime', id: animeId, episode: null }, true);
    },
    [navigate]
  );

  const handleAcceptConsent = useCallback((essentialOnly: boolean) => {
    savePrivacyConsent(essentialOnly);
    setConsentBannerVisible(false);
  }, []);

  const handleResetConsentBanner = useCallback(() => {
    clearPrivacyConsent();
    setConsentBannerVisible(true);
  }, []);

  const openPrivacyCenter = useCallback(
    (tab: PrivacyTab = 'privacidade') => {
      if (!isAuthenticated || !profileSelected) {
        setGuestPrivacyTab(tab);
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      } else {
        setPlaybackTarget(null);
        exitFullscreenAndOrientation();
        navigate({ name: 'privacy', tab });
      }
    },
    [isAuthenticated, profileSelected, navigate]
  );

  if (!isAuthenticated) {
    return (
      <>
        {guestPrivacyTab ? (
          <PrivacyCenterPage
            standalone
            initialTab={guestPrivacyTab}
            onSelectTab={(t) => setGuestPrivacyTab(t)}
            onBack={() => setGuestPrivacyTab(null)}
            onResetConsentBanner={handleResetConsentBanner}
          />
        ) : (
          <LoginPage onOpenPrivacy={openPrivacyCenter} />
        )}
        <PrivacyConsentBanner
          visible={consentBannerVisible}
          onAcceptAll={() => handleAcceptConsent(false)}
          onAcceptEssential={() => handleAcceptConsent(true)}
          onOpenPrivacyCenter={openPrivacyCenter}
        />
      </>
    );
  }

  if (loading && !profileSelected) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-[#FF6B1A] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!profileSelected) {
    return (
      <>
        {guestPrivacyTab ? (
          <PrivacyCenterPage
            standalone
            initialTab={guestPrivacyTab}
            onSelectTab={(t) => setGuestPrivacyTab(t)}
            onBack={() => setGuestPrivacyTab(null)}
            onResetConsentBanner={handleResetConsentBanner}
          />
        ) : (
          <WhoIsWatchingPage />
        )}
        <PrivacyConsentBanner
          visible={consentBannerVisible}
          onAcceptAll={() => handleAcceptConsent(false)}
          onAcceptEssential={() => handleAcceptConsent(true)}
          onOpenPrivacyCenter={openPrivacyCenter}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col">
      <Navbar
        route={route}
        onNavigate={(r) => {
          setPlaybackTarget(null);
          exitFullscreenAndOrientation();
          navigate(r);
        }}
        onOpenSearch={() => setSearchOpen(true)}
      />

      <main className="flex-1">
        {route.name === 'home' && (
          <HomePage
            onOpenAnime={openAnime}
            onWatchEpisode={watchEpisode}
            onBrowseSection={(section, genre) => {
              if (section === 'genres') navigate({ name: 'genres', genre });
              else if (section === 'releases') navigate({ name: 'releases' });
              else if (section === 'mylist') navigate({ name: 'mylist' });
              else navigate({ name: 'animes' });
            }}
          />
        )}

        {(route.name === 'animes' ||
          route.name === 'releases' ||
          route.name === 'genres' ||
          route.name === 'search') && (
          <CatalogPage
            mode={route.name}
            initialGenre={route.name === 'genres' ? route.genre || 'Action' : ''}
            initialQuery={route.name === 'search' ? route.query || '' : ''}
            onOpenAnime={openAnime}
            onWatchEpisode={watchEpisode}
          />
        )}

        {route.name === 'mylist' && (
          <MyListPage
            onOpenAnime={openAnime}
            onWatchEpisode={watchEpisode}
            onExploreCatalog={() => navigate({ name: 'animes' })}
          />
        )}

        {route.name === 'profile' && (
          <ProfilePage
            onOpenAnime={openAnime}
            onWatchEpisode={watchEpisode}
            onOpenPrivacy={(tab) => navigate({ name: 'privacy', tab })}
          />
        )}

        {route.name === 'privacy' && (
          <PrivacyCenterPage
            initialTab={route.tab || 'privacidade'}
            onSelectTab={(tab) => navigate({ name: 'privacy', tab }, true)}
            onBack={() => navigate({ name: 'profile' })}
            onResetConsentBanner={handleResetConsentBanner}
          />
        )}

        {route.name === 'anime' && (
          <AnimeDetailPage
            animeId={route.id}
            activeEpisode={
              playbackTarget?.animeId === route.id ? playbackTarget.episodeNumber : null
            }
            onBack={() => {
              if (window.history.length > 1) window.history.back();
              else navigate({ name: 'home' });
            }}
            onOpenAnime={openAnime}
            onWatchEpisode={watchEpisode}
          />
        )}
      </main>

      <Footer
        onNavigate={(r) => {
          setPlaybackTarget(null);
          exitFullscreenAndOrientation();
          navigate(r);
        }}
      />

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectAnime={openAnime}
        onViewAllResults={(q) => navigate({ name: 'search', query: q })}
      />

      <PrivacyConsentBanner
        visible={consentBannerVisible && !playbackTarget}
        onAcceptAll={() => handleAcceptConsent(false)}
        onAcceptEssential={() => handleAcceptConsent(true)}
        onOpenPrivacyCenter={openPrivacyCenter}
      />

      {/* Direct Fullscreen Native Player Overlay */}
      {playbackTarget && (
        playbackAnime && playbackAnime.id === playbackTarget.animeId ? (
          <AnimePlayer
            anime={playbackAnime}
            episodeNumber={playbackTarget.episodeNumber}
            onSelectEpisode={selectPlaybackEpisode}
            onClose={() => backToAnimeFromPlayer(playbackTarget.animeId)}
          />
        ) : (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Carregando reprodução"
            className="fixed inset-0 z-[100] w-screen h-[100dvh] bg-black flex flex-col items-center justify-center px-6"
          >
            <div className="absolute top-4 left-4 sm:top-5 sm:left-7">
              <button
                type="button"
                onClick={() => backToAnimeFromPlayer(playbackTarget.animeId)}
                className="h-9 px-3 rounded-lg bg-black/70 hover:bg-zinc-900 border border-white/15 text-zinc-100 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar ao anime</span>
              </button>
            </div>

            {playbackError ? (
              <div className="text-center max-w-md">
                <p className="text-sm text-zinc-300">{playbackError}</p>
                <button
                  type="button"
                  onClick={() => backToAnimeFromPlayer(playbackTarget.animeId)}
                  className="mt-4 px-5 py-2.5 rounded-lg bg-[#FF6B1A] text-white text-sm font-semibold"
                >
                  Ir para a página do anime
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full border-2 border-[#FF6B1A] border-t-transparent animate-spin" />
                <p className="text-xs sm:text-sm text-zinc-400">
                  Iniciando episódio {playbackTarget.episodeNumber}...
                </p>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default function App() {
  return (
    <AccountProvider>
      <AppShell />
    </AccountProvider>
  );
}
