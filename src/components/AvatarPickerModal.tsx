import { Check, Trash2, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import type { AvatarGroup, UserProfile } from '../types/anime';
import { DEFAULT_CHARACTER_AVATAR, resolveProfileAvatar } from '../utils/formatters';
import { SafeImage } from './SafeImage';

interface AvatarPickerModalProps {
  open: boolean;
  initialProfile?: Partial<UserProfile> | null;
  canDelete?: boolean;
  onSave: (data: Partial<UserProfile> & { name: string }) => Promise<void>;
  onDelete?: (profileId: string) => Promise<void>;
  onClose: () => void;
}

export function AvatarPickerModal({
  open,
  initialProfile,
  canDelete = false,
  onSave,
  onDelete,
  onClose,
}: AvatarPickerModalProps) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(DEFAULT_CHARACTER_AVATAR);
  const [preferredAudio, setPreferredAudio] = useState<'SUB' | 'DUB'>('SUB');
  const [preferredQuality, setPreferredQuality] = useState<'4K' | '1080p' | '720p'>('1080p');
  const [groups, setGroups] = useState<AvatarGroup[]>([]);
  const [selectedAnimeFilter, setSelectedAnimeFilter] = useState<number | 'ALL'>('ALL');
  const [loadingAvatars, setLoadingAvatars] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialProfile?.name || '');
    setAvatar(resolveProfileAvatar(initialProfile?.avatar));
    setPreferredAudio(initialProfile?.preferredAudio || 'SUB');
    setPreferredQuality(initialProfile?.preferredQuality || '1080p');
    setSelectedAnimeFilter('ALL');
    setError(null);
  }, [open, initialProfile]);

  useEffect(() => {
    if (!open || groups.length > 0) return;
    let active = true;
    setLoadingAvatars(true);
    fetch('/api/avatars')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { groups: AvatarGroup[] }) => {
        if (active) setGroups(data.groups);
      })
      .catch(() => {
        if (active) setGroups([]);
      })
      .finally(() => {
        if (active) setLoadingAvatars(false);
      });
    return () => {
      active = false;
    };
  }, [open, groups.length]);

  const visibleGroups = useMemo(() => {
    if (selectedAnimeFilter === 'ALL') return groups;
    return groups.filter((g) => g.animeId === selectedAnimeFilter);
  }, [groups, selectedAnimeFilter]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Informe um nome para o perfil.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: initialProfile?.id,
        name: name.trim(),
        avatar,
        preferredAudio,
        preferredQuality,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={initialProfile?.id ? 'Editar perfil' : 'Criar novo perfil'}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-[#111114] border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              {initialProfile?.id ? 'Editar perfil' : 'Criar novo perfil'}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Escolha um avatar oficial de personagem e personalize suas preferências
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="w-9 h-9 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-7">
          {/* Top Preview + Profile Details */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-white/[0.08]">
            <div className="relative shrink-0">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-[#FF6B1A] bg-zinc-900 shadow-xl">
                <SafeImage
                  src={avatar}
                  alt="Avatar selecionado"
                  loading="eager"
                  className="w-full h-full object-cover object-top"
                />
              </div>
            </div>

            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="modal-profile-name" className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Nome do perfil
                </label>
                <input
                  id="modal-profile-name"
                  type="text"
                  maxLength={28}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Lucas, Mariana, Sala TV..."
                  className="w-full h-11 px-4 rounded-lg bg-zinc-950 border border-white/15 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF6B1A]"
                />
              </div>

              <div>
                <label htmlFor="modal-audio" className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Áudio preferido
                </label>
                <select
                  id="modal-audio"
                  value={preferredAudio}
                  onChange={(e) => setPreferredAudio(e.target.value as 'SUB' | 'DUB')}
                  className="w-full h-10 px-3 rounded-lg bg-zinc-950 border border-white/15 text-xs sm:text-sm text-white focus:outline-none focus:border-[#FF6B1A]"
                >
                  <option value="SUB">Japonês (Legendado PT-BR)</option>
                  <option value="DUB">Português (Dublado)</option>
                </select>
              </div>

              <div>
                <label htmlFor="modal-quality" className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Qualidade padrão
                </label>
                <select
                  id="modal-quality"
                  value={preferredQuality}
                  onChange={(e) =>
                    setPreferredQuality(e.target.value as '4K' | '1080p' | '720p')
                  }
                  className="w-full h-10 px-3 rounded-lg bg-zinc-950 border border-white/15 text-xs sm:text-sm text-white focus:outline-none focus:border-[#FF6B1A]"
                >
                  <option value="4K">4K Ultra HD</option>
                  <option value="1080p">Full HD 1080p</option>
                  <option value="720p">HD 720p</option>
                </select>
              </div>
            </div>
          </div>

          {/* Character Avatars Grouped by Anime Title */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h3 className="font-display text-base font-bold text-white">
                Escolha um personagem por anime
              </h3>

              {/* Anime Title Filter Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedAnimeFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    selectedAnimeFilter === 'ALL'
                      ? 'bg-[#FF6B1A] text-white'
                      : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-white/[0.08]'
                  }`}
                >
                  Todos os animes
                </button>
                {groups.map((g) => (
                  <button
                    key={g.animeId}
                    type="button"
                    onClick={() => setSelectedAnimeFilter(g.animeId)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      selectedAnimeFilter === g.animeId
                        ? 'bg-[#FF6B1A] text-white'
                        : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-white/[0.08]'
                    }`}
                  >
                    {g.animeTitle}
                  </button>
                ))}
              </div>
            </div>

            {loadingAvatars ? (
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4 py-4">
                {Array.from({ length: 16 }).map((_, idx) => (
                  <div key={idx} className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-zinc-800 animate-pulse mx-auto" />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {visibleGroups.map((group) => (
                  <div key={group.animeId}>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
                      {group.animeTitle}
                    </h4>
                    <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-4">
                      {group.characters.map((char) => {
                        const selected = avatar === char.image;
                        return (
                          <button
                            key={char.id}
                            type="button"
                            onClick={() => setAvatar(char.image)}
                            className="group flex flex-col items-center text-center focus-visible:outline-none"
                          >
                            <div
                              className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-zinc-900 transition-all duration-150 ${
                                selected
                                  ? 'ring-[3px] ring-[#FF6B1A] ring-offset-2 ring-offset-[#111114] scale-105'
                                  : 'ring-1 ring-white/15 group-hover:ring-white/60 group-hover:scale-105'
                              }`}
                            >
                              <SafeImage
                                src={char.image}
                                alt={`${char.name} (${group.animeTitle})`}
                                className="w-full h-full object-cover object-top"
                              />
                              {selected && (
                                <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-[#FF6B1A] text-white flex items-center justify-center shadow">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </span>
                              )}
                            </div>
                            <span
                              className={`mt-1.5 text-[11px] line-clamp-1 max-w-full ${
                                selected ? 'text-[#FF6B1A] font-semibold' : 'text-zinc-400 group-hover:text-zinc-200'
                              }`}
                            >
                              {char.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
            <div>
              {initialProfile?.id && canDelete && onDelete && (
                <button
                  type="button"
                  onClick={async () => {
                    await onDelete(initialProfile.id!);
                    onClose();
                  }}
                  className="h-10 px-4 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-950/40 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir perfil</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 text-xs font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-10 px-6 rounded-lg bg-[#FF6B1A] hover:bg-[#FF7E38] text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar perfil'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
