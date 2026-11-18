import { ArrowRight, Eye, EyeOff, Laptop, Lock, Mail, User } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { OrviaLogo } from '../components/OrviaLogo';
import { SafeImage } from '../components/SafeImage';
import { useAccount } from '../context/AccountContext';
import type { AvatarGroup } from '../types/anime';
import type { PrivacyTab } from '../types/privacy';
import { DEFAULT_CHARACTER_AVATAR } from '../utils/formatters';

interface LoginPageProps {
  onOpenPrivacy: (tab?: PrivacyTab) => void;
}

export function LoginPage({ onOpenPrivacy }: LoginPageProps) {
  const { loginWithEmail, registerWithEmail, enterDemoMode, enterWithSyncCode } = useAccount();

  const [tab, setTab] = useState<'login' | 'register' | 'sync'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profileName, setProfileName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(DEFAULT_CHARACTER_AVATAR);
  const [syncInput, setSyncInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [avatarPreviewList, setAvatarPreviewList] = useState<Array<{ name: string; image: string; anime: string }>>([]);
  const [backdropUrl, setBackdropUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load crisp official anime backdrop & quick character avatars for registration
  useEffect(() => {
    fetch('/api/anime/home')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { hero?: Array<{ bannerImage?: string | null }> } | null) => {
        const banner = data?.hero?.find((h) => Boolean(h.bannerImage))?.bannerImage;
        if (banner) setBackdropUrl(banner);
      })
      .catch(() => {});

    fetch('/api/avatars')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { groups?: AvatarGroup[] } | null) => {
        if (data?.groups?.length) {
          const picks = data.groups
            .slice(0, 8)
            .map((g) => ({
              name: g.characters[0]?.name || g.animeTitle,
              image: g.characters[0]?.image || DEFAULT_CHARACTER_AVATAR,
              anime: g.animeTitle,
            }))
            .filter((p) => Boolean(p.image));
          setAvatarPreviewList(picks);
          if (picks[0]?.image) setSelectedAvatar(picks[0].image);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (tab === 'login') {
        await loginWithEmail(email, password);
      } else if (tab === 'register') {
        await registerWithEmail(email, password, profileName, selectedAvatar);
      } else {
        await enterWithSyncCode(syncInput);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 relative flex flex-col justify-between overflow-hidden">
      {/* Subtle Panoramic Anime Backdrop */}
      {backdropUrl && (
        <div className="absolute inset-0 pointer-events-none">
          <SafeImage
            src={backdropUrl}
            alt=""
            loading="eager"
            className="w-full h-full object-cover opacity-20 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#09090B] via-[#09090B]/85 to-[#09090B]" />
        </div>
      )}

      {/* Top Brand Header */}
      <header className="relative z-10 max-w-[1440px] w-full mx-auto px-6 sm:px-10 h-20 flex items-center justify-between">
        <OrviaLogo size="lg" />

        <button
          type="button"
          onClick={enterDemoMode}
          className="text-xs sm:text-sm font-medium text-zinc-300 hover:text-[#FF6B1A] transition-colors"
        >
          Entrar como visitante
        </button>
      </header>

      {/* Centered Crunchyroll-Inspired Auth Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[440px] bg-[#111114]/95 backdrop-blur-xl border border-white/[0.1] rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {tab === 'login'
                ? 'Entrar na sua conta'
                : tab === 'register'
                  ? 'Criar conta ORVIA'
                  : 'Conectar dispositivo'}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1.5">
              {tab === 'login'
                ? 'Continue assistindo seus animes de onde parou'
                : tab === 'register'
                  ? 'Crie seus perfis e sincronize sua lista em qualquer tela'
                  : 'Informe o código gerado em outro aparelho para sincronizar'}
            </p>
          </div>

          {/* Auth Mode Switcher */}
          <div
            role="tablist"
            className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-950 border border-white/[0.08] mb-6"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'login'}
              onClick={() => {
                setTab('login');
                setError(null);
              }}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'login' ? 'bg-[#FF6B1A] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'register'}
              onClick={() => {
                setTab('register');
                setError(null);
              }}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'register' ? 'bg-[#FF6B1A] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Criar conta
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'sync'}
              onClick={() => {
                setTab('sync');
                setError(null);
              }}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'sync' ? 'bg-[#FF6B1A] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Código TV
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'sync' ? (
              <div>
                <label htmlFor="auth-sync-code" className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Código de sincronização
                </label>
                <div className="relative">
                  <Laptop className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-sync-code"
                    type="text"
                    required
                    value={syncInput}
                    onChange={(e) => setSyncInput(e.target.value)}
                    placeholder="Ex.: ORVIA-DEMO-BR"
                    className="w-full h-11 pl-10 pr-4 rounded-lg bg-zinc-950 border border-white/15 text-sm font-mono uppercase text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF6B1A]"
                  />
                </div>
              </div>
            ) : (
              <>
                {tab === 'register' && (
                  <>
                    <div>
                      <label htmlFor="auth-profile-name" className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Nome do perfil principal
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="auth-profile-name"
                          type="text"
                          maxLength={28}
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          placeholder="Como devemos te chamar?"
                          className="w-full h-11 pl-10 pr-4 rounded-lg bg-zinc-950 border border-white/15 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF6B1A]"
                        />
                      </div>
                    </div>

                    {avatarPreviewList.length > 0 && (
                      <div>
                        <span className="block text-xs font-medium text-zinc-300 mb-2">
                          Escolha seu personagem inicial
                        </span>
                        <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1">
                          {avatarPreviewList.map((item) => {
                            const active = selectedAvatar === item.image;
                            return (
                              <button
                                key={item.name}
                                type="button"
                                onClick={() => setSelectedAvatar(item.image)}
                                title={`${item.name} · ${item.anime}`}
                                className={`w-12 h-12 rounded-full overflow-hidden shrink-0 transition-all ${
                                  active
                                    ? 'ring-2 ring-[#FF6B1A] ring-offset-2 ring-offset-[#111114] scale-105'
                                    : 'opacity-70 hover:opacity-100 ring-1 ring-white/15'
                                }`}
                              >
                                <SafeImage
                                  src={item.image}
                                  alt={item.name}
                                  className="w-full h-full object-cover object-top"
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div>
                  <label htmlFor="auth-email" className="block text-xs font-medium text-zinc-300 mb-1.5">
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="voce@exemplo.com"
                      className="w-full h-11 pl-10 pr-4 rounded-lg bg-zinc-950 border border-white/15 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF6B1A]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-password" className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo de 6 caracteres"
                      className="w-full h-11 pl-10 pr-11 rounded-lg bg-zinc-950 border border-white/15 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF6B1A]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && (
              <p role="alert" className="text-xs font-medium text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-lg bg-[#FF6B1A] hover:bg-[#FF7E38] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <span>
                {submitting
                  ? 'Conectando...'
                  : tab === 'login'
                    ? 'Entrar'
                    : tab === 'register'
                      ? 'Criar conta'
                      : 'Sincronizar aparelho'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/[0.08] text-center">
            <button
              type="button"
              onClick={enterDemoMode}
              className="w-full h-10 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-medium text-zinc-200 transition-colors"
            >
              Acessar catálogo agora sem cadastro
            </button>
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-5 px-4 text-center text-xs text-zinc-500 space-y-2">
        <p>ORVIA Streaming · Acesso gratuito em alta definição</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
          <button
            type="button"
            onClick={() => onOpenPrivacy('privacidade')}
            className="hover:text-[#FF6B1A] transition-colors"
          >
            Privacidade (LGPD)
          </button>
          <button
            type="button"
            onClick={() => onOpenPrivacy('termos')}
            className="hover:text-[#FF6B1A] transition-colors"
          >
            Termos de Uso
          </button>
          <button
            type="button"
            onClick={() => onOpenPrivacy('cookies')}
            className="hover:text-[#FF6B1A] transition-colors"
          >
            Cookies
          </button>
          <button
            type="button"
            onClick={() => onOpenPrivacy('direitos')}
            className="hover:text-[#FF6B1A] transition-colors"
          >
            Direitos Autorais e Suporte
          </button>
        </div>
      </footer>
    </div>
  );
}
