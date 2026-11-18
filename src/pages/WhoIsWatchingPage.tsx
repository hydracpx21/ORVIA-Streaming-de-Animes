import { LogOut, Pencil, Plus, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { AvatarPickerModal } from '../components/AvatarPickerModal';
import { OrviaLogo } from '../components/OrviaLogo';
import { SafeImage } from '../components/SafeImage';
import { useAccount } from '../context/AccountContext';
import type { UserProfile } from '../types/anime';
import { DEFAULT_CHARACTER_AVATAR, resolveProfileAvatar } from '../utils/formatters';

export function WhoIsWatchingPage() {
  const {
    workspace,
    userEmail,
    chooseProfile,
    saveProfile,
    deleteProfile,
    logout,
  } = useAccount();

  const [manageMode, setManageMode] = useState(false);
  const [modalProfile, setModalProfile] = useState<Partial<UserProfile> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const profiles = workspace?.profiles || [];

  const openCreateModal = () => {
    setModalProfile({
      name: '',
      avatar: DEFAULT_CHARACTER_AVATAR,
      preferredAudio: 'SUB',
      preferredQuality: '1080p',
    });
    setModalOpen(true);
  };

  const openEditModal = (profile: UserProfile) => {
    setModalProfile(profile);
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col">
      {/* Minimal Top Bar */}
      <header className="max-w-[1440px] w-full mx-auto px-6 sm:px-10 h-20 flex items-center justify-between">
        <OrviaLogo size="lg" />

        <div className="flex items-center gap-4">
          {userEmail && (
            <span className="hidden sm:inline text-xs text-zinc-400">{userEmail}</span>
          )}
          <button
            type="button"
            onClick={logout}
            className="h-9 px-3.5 rounded-lg border border-white/10 hover:border-white/25 text-xs font-medium text-zinc-300 hover:text-white inline-flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {/* Main Centered Who's Watching Selector */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="text-center max-w-2xl mb-10 sm:mb-12">
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white">
            {manageMode ? 'Gerenciar perfis' : 'Quem está assistindo?'}
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            {manageMode
              ? 'Clique em um perfil para trocar o avatar do personagem ou editar o nome'
              : 'Selecione um perfil para acessar sua lista, histórico e recomendações'}
          </p>
        </div>

        <div className="flex flex-wrap items-start justify-center gap-7 sm:gap-10 max-w-4xl">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => {
                if (manageMode) openEditModal(profile);
                else chooseProfile(profile.id);
              }}
              className="group flex flex-col items-center w-28 sm:w-36 focus-visible:outline-none"
            >
              <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden bg-zinc-900 ring-2 ring-white/15 group-hover:ring-[3px] group-hover:ring-[#FF6B1A] group-focus-visible:ring-[#FF6B1A] transition-all duration-200 group-hover:scale-105">
                <SafeImage
                  src={resolveProfileAvatar(profile.avatar)}
                  alt={profile.name}
                  loading="eager"
                  className="w-full h-full object-cover object-top"
                />

                {manageMode && (
                  <span className="absolute inset-0 bg-black/55 flex items-center justify-center">
                    <span className="w-10 h-10 rounded-full bg-[#FF6B1A] text-white flex items-center justify-center shadow-lg">
                      <Pencil className="w-4 h-4" />
                    </span>
                  </span>
                )}
              </div>

              <span className="mt-3.5 text-sm sm:text-base font-semibold text-zinc-200 group-hover:text-white truncate max-w-full">
                {profile.name}
              </span>
              <span className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                {profile.preferredAudio === 'SUB' ? 'Legendado' : 'Dublado'} · {profile.preferredQuality}
              </span>
            </button>
          ))}

          {/* Add New Profile Circular Button */}
          {profiles.length < 6 && (
            <button
              type="button"
              onClick={openCreateModal}
              className="group flex flex-col items-center w-28 sm:w-36 focus-visible:outline-none"
            >
              <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full border-2 border-dashed border-white/20 group-hover:border-[#FF6B1A] bg-zinc-900/40 group-hover:bg-zinc-900 flex items-center justify-center text-zinc-400 group-hover:text-[#FF6B1A] transition-all duration-200 group-hover:scale-105">
                <Plus className="w-9 h-9" />
              </div>
              <span className="mt-3.5 text-sm sm:text-base font-medium text-zinc-400 group-hover:text-white">
                Adicionar perfil
              </span>
            </button>
          )}
        </div>

        {/* Toggle Manage Mode */}
        <div className="mt-12">
          <button
            type="button"
            onClick={() => setManageMode((m) => !m)}
            className={`h-11 px-6 rounded-lg border text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
              manageMode
                ? 'bg-[#FF6B1A] border-[#FF6B1A] text-white'
                : 'bg-zinc-900/80 hover:bg-zinc-800 border-white/15 text-zinc-200'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            <span>{manageMode ? 'Concluir edição' : 'Gerenciar perfis'}</span>
          </button>
        </div>
      </main>

      <AvatarPickerModal
        open={modalOpen}
        initialProfile={modalProfile}
        canDelete={profiles.length > 1}
        onSave={saveProfile}
        onDelete={deleteProfile}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
