import { ShieldCheck } from 'lucide-react';
import { type PrivacyTab } from '../types/privacy';

interface PrivacyConsentBannerProps {
  visible: boolean;
  onAcceptAll: () => void;
  onAcceptEssential: () => void;
  onOpenPrivacyCenter: (tab?: PrivacyTab) => void;
}

export function PrivacyConsentBanner({
  visible,
  onAcceptAll,
  onAcceptEssential,
  onOpenPrivacyCenter,
}: PrivacyConsentBannerProps) {
  if (!visible) return null;

  return (
    <aside
      role="region"
      aria-label="Aviso de Privacidade e Armazenamento Local"
      className="fixed bottom-16 md:bottom-4 inset-x-3 sm:inset-x-6 z-50 max-w-4xl mx-auto rounded-xl bg-[#111114]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-4 sm:p-5"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#FF6B1A]/15 border border-[#FF6B1A]/30 text-[#FF6B1A] flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-sm font-bold text-white">
              Privacidade e transparência no ORVIA (LGPD)
            </h2>
            <p className="text-xs text-zinc-300 leading-relaxed">
              O ORVIA é totalmente gratuito e utiliza apenas armazenamento local essencial para manter sua conta, perfis, preferências de player e progresso de episódios. Não usamos cookies publicitários nem vendemos dados.{' '}
              <button
                type="button"
                onClick={() => onOpenPrivacyCenter('privacidade')}
                className="text-[#FF6B1A] hover:underline font-medium inline"
              >
                Política de Privacidade
              </button>
              {' · '}
              <button
                type="button"
                onClick={() => onOpenPrivacyCenter('cookies')}
                className="text-[#FF6B1A] hover:underline font-medium inline"
              >
                Política de Cookies
              </button>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onAcceptEssential}
            className="h-10 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-xs font-medium text-zinc-200 whitespace-nowrap transition-colors"
          >
            Apenas essenciais
          </button>
          <button
            type="button"
            onClick={onAcceptAll}
            className="h-10 px-4 rounded-lg bg-[#FF6B1A] hover:bg-[#FF7E38] text-xs font-semibold text-white whitespace-nowrap transition-colors"
          >
            Aceitar e continuar
          </button>
        </div>
      </div>
    </aside>
  );
}
