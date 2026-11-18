import {
  Check,
  Cookie,
  Copy,
  Copyright,
  FileText,
  History,
  Laptop,
  Lock,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import React, { useState } from 'react';
import { AvatarPickerModal } from '../components/AvatarPickerModal';
import { SafeImage } from '../components/SafeImage';
import { useAccount } from '../context/AccountContext';
import type { UserProfile } from '../types/anime';
import { readPrivacyConsent, type PrivacyTab } from '../types/privacy';
import {
  DEFAULT_CHARACTER_AVATAR,
  formatTimeSeconds,
  resolveProfileAvatar,
} from '../utils/formatters';

interface ProfilePageProps {
  onOpenAnime: (id: number) => void;
  onWatchEpisode: (id: number, episode: number) => void;
  onOpenPrivacy: (tab?: PrivacyTab) => void;
}

export function ProfilePage({ onOpenAnime, onWatchEpisode, onOpenPrivacy }: ProfilePageProps) {
  const {
    workspace,
    activeProfile,
    profileData,
    syncCode,
    userEmail,
    selectProfile,
    saveProfile,
    deleteProfile,
    clearHistory,
    connectSyncCode,
    createNewSyncWorkspace,
    switchToWhoIsWatching,
    logout,
  } = useAccount();

  const [editingProfile, setEditingProfile] = useState<Partial<UserProfile> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [codeInput, setCodeInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleCopySyncLink = async () => {
    const shareUrl = `${window.location.origin}/?sync=${encodeURIComponent(syncCode)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setSyncMessage(`Código ativo: ${syncCode}`);
    }
  };

  const handleConnectCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInput.trim()) return;
    await connectSyncCode(codeInput.trim());
    setSyncMessage(`Dispositivo conectado ao código ${codeInput.trim().toUpperCase()}.`);
    setCodeInput('');
  };

  return (
    <div className="min-h-screen bg-[#09090B] pt-24 pb-16">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 space-y-12">
        {/* Header */}
        <div className="pb-6 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Configurações, perfis e continuidade
            </h1>
            <p className="text-sm text-zinc-400 mt-1.5">
              {userEmail ? `Conta: ${userEmail} · ` : ''}
              Gerencie perfis, sincronize dispositivos e acesse a Central de Privacidade e Segurança.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={switchToWhoIsWatching}
              className="h-10 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-xs font-semibold text-white inline-flex items-center gap-2 transition-colors"
            >
              <Users className="w-4 h-4 text-[#FF6B1A]" />
              <span>Quem está assistindo?</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="h-10 px-4 rounded-lg border border-white/10 hover:border-red-500/40 text-xs font-medium text-zinc-300 hover:text-red-300 inline-flex items-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair da conta</span>
            </button>
          </div>
        </div>

        {/* Profiles Grid */}
        <section>
          <div className="flex items-center justify-between gap-4 mb-5">
            <h2 className="font-display text-xl font-bold text-white">Perfis da conta</h2>
            {(workspace?.profiles.length || 0) < 6 && (
              <button
                type="button"
                onClick={() => {
                  setEditingProfile({
                    name: '',
                    avatar: DEFAULT_CHARACTER_AVATAR,
                    preferredAudio: 'SUB',
                    preferredQuality: '1080p',
                  });
                  setModalOpen(true);
                }}
                className="h-9 px-4 rounded-lg bg-[#FF6B1A] hover:bg-[#FF7E38] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Novo perfil</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspace?.profiles.map((profile) => {
              const isActive = profile.id === activeProfile?.id;
              return (
                <div
                  key={profile.id}
                  className={`p-4 rounded-xl border transition-colors flex items-center justify-between gap-4 ${
                    isActive
                      ? 'bg-[#FF6B1A]/10 border-[#FF6B1A]'
                      : 'bg-zinc-900/60 border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectProfile(profile.id)}
                    className="flex items-center gap-3.5 text-left min-w-0 flex-1"
                  >
                    <div
                      className={`w-14 h-14 rounded-full overflow-hidden bg-zinc-800 shrink-0 ${
                        isActive ? 'ring-2 ring-[#FF6B1A]' : 'ring-1 ring-white/15'
                      }`}
                    >
                      <SafeImage
                        src={resolveProfileAvatar(profile.avatar)}
                        alt={profile.name}
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {profile.name}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5 tabular-nums">
                        {profile.preferredAudio === 'SUB' ? 'Legendado' : 'Dublado'} ·{' '}
                        {profile.preferredQuality}
                      </p>
                      <p className="text-[11px] mt-1 font-medium text-[#FF6B1A]">
                        {isActive ? 'Perfil ativo' : 'Selecionar perfil'}
                      </p>
                    </div>
                  </button>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProfile(profile);
                        setModalOpen(true);
                      }}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] font-medium text-zinc-200"
                    >
                      Editar
                    </button>
                    {(workspace?.profiles.length || 0) > 1 && (
                      <button
                        type="button"
                        onClick={() => deleteProfile(profile.id)}
                        aria-label={`Excluir perfil ${profile.name}`}
                        className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-red-950/60 text-[11px] font-medium text-zinc-400 hover:text-red-300"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Cross-Device Continuity */}
        <section className="p-6 rounded-xl bg-zinc-900/50 border border-white/[0.08] grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 space-y-3">
            <div className="flex items-center gap-2 text-white">
              <Laptop className="w-5 h-5 text-[#FF6B1A]" />
              <h2 className="font-display text-xl font-bold">Continuidade entre dispositivos</h2>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Use o código de sincronização abaixo para acessar sua lista, perfis e o minuto exato dos episódios em outra Smart TV, celular, tablet ou computador.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <div className="h-11 px-4 rounded-lg bg-zinc-950 border border-white/15 flex items-center gap-3 font-mono text-sm font-semibold text-white tracking-wider">
                <span>{syncCode}</span>
              </div>
              <button
                type="button"
                onClick={handleCopySyncLink}
                className="h-11 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-[#FF6B1A]" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Link copiado' : 'Copiar link de sincronização'}</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const code = await createNewSyncWorkspace();
                  setSyncMessage(`Novo código gerado: ${code}`);
                }}
                className="h-11 px-3.5 rounded-lg border border-white/10 hover:border-white/25 text-zinc-300 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Novo código</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleConnectCode} className="lg:col-span-6 space-y-3">
            <label htmlFor="sync-connect" className="block text-sm font-semibold text-white">
              Conectar a outro dispositivo existente
            </label>
            <p className="text-xs text-zinc-400">
              Digite o código gerado no outro aparelho para importar seus perfis e histórico instantaneamente.
            </p>
            <div className="flex items-center gap-2">
              <input
                id="sync-connect"
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="Ex.: ORVIA-DEMO-BR"
                className="flex-1 h-11 px-3.5 rounded-lg bg-zinc-950 border border-white/15 text-sm font-mono uppercase text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF6B1A]"
              />
              <button
                type="submit"
                className="h-11 px-5 rounded-lg bg-[#FF6B1A] hover:bg-[#FF7E38] text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Sincronizar</span>
              </button>
            </div>
            {syncMessage && <p className="text-xs text-[#FF6B1A]">{syncMessage}</p>}
          </form>
        </section>

        {/* Watch History */}
        <section>
          <div className="flex items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-2.5">
              <History className="w-5 h-5 text-[#FF6B1A]" />
              <h2 className="font-display text-xl font-bold text-white">
                Histórico de reprodução ({profileData.history.length})
              </h2>
            </div>
            {profileData.history.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="text-xs font-medium text-zinc-400 hover:text-red-400 inline-flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar histórico</span>
              </button>
            )}
          </div>

          {profileData.history.length === 0 ? (
            <div className="p-8 rounded-xl border border-white/[0.08] bg-zinc-900/30 text-center">
              <p className="text-sm text-zinc-400">
                Nenhum episódio reproduzido neste perfil ainda. Ao iniciar um episódio, o progresso aparecerá aqui.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06] border border-white/[0.08] rounded-xl bg-zinc-900/30 overflow-hidden">
              {profileData.history.map((entry) => (
                <div
                  key={`${entry.id}-${entry.watchedAt}`}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <button
                      type="button"
                      onClick={() => onWatchEpisode(entry.animeId, entry.episodeNumber)}
                      className="w-28 aspect-video rounded-md overflow-hidden bg-zinc-800 shrink-0 relative group"
                    >
                      <SafeImage
                        src={entry.thumbnail || entry.coverImage}
                        alt={entry.animeTitle}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Play className="w-5 h-5 text-white fill-current" />
                      </span>
                    </button>

                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenAnime(entry.animeId)}
                        className="text-sm font-semibold text-white hover:text-[#FF6B1A] truncate block text-left"
                      >
                        {entry.animeTitle}
                      </button>
                      <p className="text-xs text-zinc-400 mt-0.5 truncate">
                        Episódio {entry.episodeNumber}: {entry.episodeTitle}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-1 font-mono tabular-nums">
                        {formatTimeSeconds(entry.watchedSeconds)} / {formatTimeSeconds(entry.durationSeconds)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onWatchEpisode(entry.animeId, entry.episodeNumber)}
                    className="h-9 px-3.5 rounded-lg bg-zinc-800 hover:bg-[#FF6B1A] text-xs font-semibold text-white shrink-0 transition-colors"
                  >
                    Retomar
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Privacy & Security Center in Settings */}
        <section className="p-6 rounded-xl bg-zinc-900/50 border border-white/[0.08] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-white">
                <ShieldCheck className="w-5 h-5 text-[#FF6B1A]" />
                <h2 className="font-display text-xl font-bold">
                  Privacidade e Segurança (LGPD)
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400">
                Consulte documentos legais, gerencie cookies/armazenamento local ou solicite a exclusão da conta.
                {(() => {
                  const currentConsent = readPrivacyConsent();
                  return currentConsent
                    ? ` Consentimento registrado (${currentConsent.essentialOnly ? 'Apenas essenciais' : 'Completo'}).`
                    : '';
                })()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => onOpenPrivacy('privacidade')}
              className="p-4 rounded-xl bg-zinc-950/70 hover:bg-zinc-900 border border-white/[0.08] hover:border-white/20 text-left transition-colors space-y-1"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="w-4 h-4 text-[#FF6B1A]" />
                <span>Política de Privacidade (LGPD)</span>
              </div>
              <p className="text-xs text-zinc-400">
                Como tratamos dados, bases legais e direitos do titular.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenPrivacy('termos')}
              className="p-4 rounded-xl bg-zinc-950/70 hover:bg-zinc-900 border border-white/[0.08] hover:border-white/20 text-left transition-colors space-y-1"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <FileText className="w-4 h-4 text-[#FF6B1A]" />
                <span>Termos de Uso</span>
              </div>
              <p className="text-xs text-zinc-400">
                Uso gratuito da plataforma, sem assinaturas ou cobranças.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenPrivacy('cookies')}
              className="p-4 rounded-xl bg-zinc-950/70 hover:bg-zinc-900 border border-white/[0.08] hover:border-white/20 text-left transition-colors space-y-1"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Cookie className="w-4 h-4 text-[#FF6B1A]" />
                <span>Política de Cookies e Consentimento</span>
              </div>
              <p className="text-xs text-zinc-400">
                Chaves essenciais do navegador e gerenciamento do aceite.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenPrivacy('seguranca')}
              className="p-4 rounded-xl bg-zinc-950/70 hover:bg-zinc-900 border border-white/[0.08] hover:border-white/20 text-left transition-colors space-y-1"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Lock className="w-4 h-4 text-[#FF6B1A]" />
                <span>Proteção de Dados</span>
              </div>
              <p className="text-xs text-zinc-400">
                Criptografia scrypt de senhas, sanitização de proxy e segurança.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenPrivacy('direitos')}
              className="p-4 rounded-xl bg-zinc-950/70 hover:bg-zinc-900 border border-white/[0.08] hover:border-white/20 text-left transition-colors space-y-1"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Copyright className="w-4 h-4 text-[#FF6B1A]" />
                <span>Direitos Autorais e Suporte</span>
              </div>
              <p className="text-xs text-zinc-400">
                Créditos das fontes, remoções e orientações de suporte.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenPrivacy('exclusao')}
              className="p-4 rounded-xl bg-red-950/20 hover:bg-red-950/35 border border-red-500/25 hover:border-red-500/45 text-left transition-colors space-y-1"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-red-300">
                <Trash2 className="w-4 h-4 text-red-400" />
                <span>Excluir Conta e Dados</span>
              </div>
              <p className="text-xs text-zinc-400">
                Solicitar remoção definitiva da conta, perfis e histórico.
              </p>
            </button>
          </div>
        </section>
      </div>

      <AvatarPickerModal
        open={modalOpen}
        initialProfile={editingProfile}
        canDelete={(workspace?.profiles.length || 0) > 1}
        onSave={saveProfile}
        onDelete={deleteProfile}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
