import type { AppRoute } from './Navbar';
import { OrviaLogo } from './OrviaLogo';

interface FooterProps {
  onNavigate: (route: AppRoute) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="border-t border-white/[0.08] bg-[#09090B] mt-16 pb-20 md:pb-10">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div>
          <OrviaLogo size="sm" />
          <p className="text-xs text-zinc-500 mt-2 max-w-md leading-relaxed">
            Streaming de animes com artes oficiais em alta definição, sincronização de progresso entre dispositivos e catálogo atualizado por temporada.
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-zinc-400">
          <button
            type="button"
            onClick={() => onNavigate({ name: 'home' })}
            className="hover:text-white transition-colors"
          >
            Início
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'animes' })}
            className="hover:text-white transition-colors"
          >
            Catálogo
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'releases' })}
            className="hover:text-white transition-colors"
          >
            Lançamentos
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'genres' })}
            className="hover:text-white transition-colors"
          >
            Gêneros
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'mylist' })}
            className="hover:text-white transition-colors"
          >
            Minha Lista
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'profile' })}
            className="hover:text-white transition-colors"
          >
            Configurações e Perfis
          </button>
        </nav>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-[11px] text-zinc-500">
          ORVIA · Acesso 100% gratuito, sem assinaturas ou cobranças.
        </p>

        <nav
          aria-label="Privacidade, Segurança e Termos"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-medium text-zinc-400"
        >
          <button
            type="button"
            onClick={() => onNavigate({ name: 'privacy', tab: 'privacidade' })}
            className="hover:text-[#FF6B1A] transition-colors"
          >
            Privacidade (LGPD)
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'privacy', tab: 'termos' })}
            className="hover:text-[#FF6B1A] transition-colors"
          >
            Termos de Uso
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'privacy', tab: 'cookies' })}
            className="hover:text-[#FF6B1A] transition-colors"
          >
            Política de Cookies
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'privacy', tab: 'seguranca' })}
            className="hover:text-[#FF6B1A] transition-colors"
          >
            Proteção de Dados
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'privacy', tab: 'direitos' })}
            className="hover:text-[#FF6B1A] transition-colors"
          >
            Direitos Autorais e Suporte
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'privacy', tab: 'exclusao' })}
            className="hover:text-red-400 transition-colors"
          >
            Excluir Conta e Dados
          </button>
        </nav>
      </div>
    </footer>
  );
}
