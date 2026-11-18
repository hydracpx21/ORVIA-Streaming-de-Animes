import { Bookmark, Compass } from 'lucide-react';
import { useMemo } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { EpisodeLandscapeCard } from '../components/EpisodeLandscapeCard';
import { useAccount } from '../context/AccountContext';

interface MyListPageProps {
  onOpenAnime: (id: number) => void;
  onWatchEpisode: (id: number, episode: number) => void;
  onExploreCatalog: () => void;
}

export function MyListPage({
  onOpenAnime,
  onWatchEpisode,
  onExploreCatalog,
}: MyListPageProps) {
  const { activeProfile, profileData, removeContinueWatching } = useAccount();

  const continueItems = useMemo(() => {
    return Object.values(profileData.progressByAnime)
      .filter((p) => !p.completed)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [profileData.progressByAnime]);

  return (
    <div className="min-h-screen bg-[#09090B] pt-24 pb-16">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 space-y-12">
        <div className="pb-6 border-b border-white/[0.08]">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Minha lista
          </h1>
          <p className="text-sm text-zinc-400 mt-1.5">
            Animes salvos e episódios em andamento no perfil de{' '}
            <span className="text-white font-medium">{activeProfile?.name || 'Usuário'}</span>
          </p>
        </div>

        {/* Continue Watching Section */}
        {continueItems.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold text-white mb-4">
              Continuar assistindo ({continueItems.length})
            </h2>
            <div className="flex items-stretch gap-4 overflow-x-auto no-scrollbar pb-2">
              {continueItems.map((item) => (
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
            </div>
          </section>
        )}

        {/* Saved Favorites */}
        <section>
          <h2 className="font-display text-xl font-bold text-white mb-5">
            Favoritos salvos ({profileData.favorites.length})
          </h2>

          {profileData.favorites.length === 0 ? (
            <div className="py-16 px-6 rounded-xl border border-white/[0.08] bg-zinc-900/30 text-center max-w-xl">
              <Bookmark className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-white">Sua lista ainda está vazia</h3>
              <p className="text-sm text-zinc-400 mt-1.5">
                Adicione animes clicando no botão "+" nos cards ou na página de detalhes para acessá-los rapidamente em qualquer dispositivo.
              </p>
              <button
                type="button"
                onClick={onExploreCatalog}
                className="mt-5 h-10 px-5 rounded-lg bg-[#FF6B1A] hover:bg-[#FF7E38] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <Compass className="w-4 h-4" />
                <span>Explorar catálogo</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-8">
              {profileData.favorites.map((anime) => (
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
          )}
        </section>
      </div>
    </div>
  );
}
