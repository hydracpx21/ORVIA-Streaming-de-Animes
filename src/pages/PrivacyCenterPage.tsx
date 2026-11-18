import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cookie,
  Copyright,
  FileText,
  Lock,
  Shield,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAccount } from '../context/AccountContext';
import {
  readPrivacyConsent,
  savePrivacyConsent,
  type PrivacyConsentState,
  type PrivacyTab,
} from '../types/privacy';

interface PrivacyCenterPageProps {
  initialTab?: PrivacyTab;
  onSelectTab?: (tab: PrivacyTab) => void;
  onBack?: () => void;
  onResetConsentBanner?: () => void;
  standalone?: boolean;
}

const TABS: Array<{ id: PrivacyTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'privacidade', label: 'Privacidade (LGPD)', icon: Shield },
  { id: 'termos', label: 'Termos de Uso', icon: FileText },
  { id: 'cookies', label: 'Cookies', icon: Cookie },
  { id: 'seguranca', label: 'Proteção de Dados', icon: Lock },
  { id: 'direitos', label: 'Direitos Autorais e Suporte', icon: Copyright },
  { id: 'exclusao', label: 'Excluir Conta e Dados', icon: Trash2 },
];

export function PrivacyCenterPage({
  initialTab = 'privacidade',
  onSelectTab,
  onBack,
  onResetConsentBanner,
  standalone = false,
}: PrivacyCenterPageProps) {
  const {
    isAuthenticated,
    userEmail,
    syncCode,
    deleteAccountAndData,
    clearHistory,
  } = useAccount();

  const [activeTab, setActiveTab] = useState<PrivacyTab>(initialTab);
  const [consent, setConsent] = useState<PrivacyConsentState | null>(() => readPrivacyConsent());
  const [consentFeedback, setConsentFeedback] = useState<string | null>(null);

  // Account & data deletion form state
  const [password, setPassword] = useState('');
  const [confirmWord, setConfirmWord] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleTabChange = (next: PrivacyTab) => {
    setActiveTab(next);
    onSelectTab?.(next);
  };

  const hasRegisteredEmail = Boolean(
    userEmail &&
      !userEmail.endsWith('@orvia.tv') &&
      !userEmail.endsWith('@akari.tv')
  );

  const handleUpdateConsent = (essentialOnly: boolean) => {
    const saved = savePrivacyConsent(essentialOnly);
    setConsent(saved);
    setConsentFeedback(
      essentialOnly
        ? 'Preferência atualizada: apenas armazenamento essencial ativo.'
        : 'Preferência atualizada: armazenamento de sessão, perfis e continuidade confirmado.'
    );
  };

  const handleRequestDeletion = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);
    setDeleteSuccess(null);

    if (confirmWord.trim().toUpperCase() !== 'EXCLUIR') {
      setDeleteError('Digite exatamente a palavra EXCLUIR para confirmar a solicitação.');
      return;
    }

    if (hasRegisteredEmail && !password) {
      setDeleteError('Informe a senha atual da sua conta para validar a exclusão.');
      return;
    }

    setDeleting(true);
    try {
      await deleteAccountAndData({
        password: password || undefined,
        confirmText: confirmWord.trim().toUpperCase(),
      });
      setDeleteSuccess(
        'Sua conta, perfis, lista de favoritos e histórico foram excluídos permanentemente.'
      );
      setPassword('');
      setConfirmWord('');
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Não foi possível concluir a exclusão dos dados.'
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`min-h-screen bg-[#09090B] text-zinc-100 ${standalone ? 'pt-8 pb-16' : 'pt-24 pb-16'}`}>
      <div className="max-w-[1160px] mx-auto px-4 sm:px-8 space-y-8">
        {/* Header */}
        <div className="pb-6 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="h-9 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 transition-colors mb-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-6 h-6 text-[#FF6B1A]" />
              <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white">
                Central de Privacidade e Segurança
              </h1>
            </div>
            <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Transparência sobre tratamento de dados pessoais (LGPD), uso de cookies e armazenamento local, segurança técnica, direitos autorais e exclusão de conta. O ORVIA é gratuito e não possui assinaturas ou cobranças.
            </p>
          </div>
          <p className="text-xs text-zinc-500 shrink-0">
            Última atualização: novembro de 2026
          </p>
        </div>

        {/* Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Seções de Privacidade e Segurança"
          className="flex flex-wrap gap-2 pb-2 border-b border-white/[0.08]"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleTabChange(t.id)}
                className={`h-10 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-[#FF6B1A] text-white'
                    : 'bg-zinc-900/70 hover:bg-zinc-800 border border-white/[0.08] text-zinc-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <section className="rounded-xl bg-zinc-900/35 border border-white/[0.08] p-6 sm:p-8 space-y-6">
          {activeTab === 'privacidade' && (
            <div className="space-y-6 text-sm text-zinc-300 leading-relaxed">
              <div>
                <h2 className="font-display text-xl font-bold text-white">
                  Política de Privacidade (LGPD — Lei nº 13.709/2018)
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Aplicável ao uso do aplicativo ORVIA em navegador web e dispositivos conectados.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-base font-semibold text-white">
                  1. Dados tratados pelo aplicativo
                </h3>
                <p>
                  O ORVIA coleta exclusivamente os dados necessários para o funcionamento das contas, perfis e continuidade de reprodução solicitados por você:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-zinc-300">
                  <li>
                    <strong className="text-white">Cadastro opcional por e-mail:</strong> endereço de e-mail e senha protegida por hash criptográfico (nunca armazenada em texto puro).
                  </li>
                  <li>
                    <strong className="text-white">Perfis e preferências:</strong> nome do perfil, avatar selecionado, preferência de áudio (legendado ou dublado) e resolução padrão.
                  </li>
                  <li>
                    <strong className="text-white">Continuidade e biblioteca:</strong> animes adicionados à Minha Lista, episódio em andamento, tempo assistido e histórico recente vinculado ao seu código de sincronização.
                  </li>
                  <li>
                    <strong className="text-white">Consentimento de privacidade:</strong> registro local no navegador com a data e o tipo de aceite escolhido por você.
                  </li>
                </ul>
                <p className="text-zinc-400">
                  O ORVIA é 100% gratuito e <strong className="text-zinc-200">não solicita nem armazena</strong> dados financeiros, cartão de crédito, CPF ou localização GPS.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-base font-semibold text-white">
                  2. Finalidade e base legal do tratamento
                </h3>
                <p>
                  Os dados são utilizados exclusivamente para executar as funcionalidades escolhidas pelo usuário (art. 7º, inciso V da LGPD) e mediante consentimento informado quando aplicável (art. 7º, inciso I da LGPD). Não realizamos venda de dados pessoais, publicidade segmentada ou envio de mensagens promocionais.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-base font-semibold text-white">
                  3. Integrações e consultas externas
                </h3>
                <p>
                  Para exibir sinopses, capas, episódios e fontes de reprodução, o servidor do ORVIA consulta APIs públicas de metadados (como AniList, Jikan/MyAnimeList, Kitsu e AniZip) e provedores compatíveis com a Blitz Anime API. Seu e-mail, senha, perfis e histórico pessoal <strong className="text-white">não são enviados</strong> para esses serviços externos.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-base font-semibold text-white">
                  4. Seus direitos como titular (art. 18 da LGPD)
                </h3>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Confirmar a existência de tratamento e visualizar seus perfis e histórico diretamente na área de Configurações.</li>
                  <li>Corrigir ou editar nomes de perfil, avatares e preferências de reprodução a qualquer momento.</li>
                  <li>Limpar o histórico de reprodução, remover perfis secundários ou revogar seu consentimento local.</li>
                  <li>Solicitar a eliminação definitiva da conta e de todos os registros associados na aba <strong className="text-white">Excluir Conta e Dados</strong>.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'termos' && (
            <div className="space-y-6 text-sm text-zinc-300 leading-relaxed">
              <div>
                <h2 className="font-display text-xl font-bold text-white">
                  Termos de Uso do ORVIA
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Condições transparentes para uso gratuito da plataforma.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-base font-semibold text-white">
                  1. Serviço gratuito e sem assinaturas
                </h3>
                <p>
                  O ORVIA é disponibilizado gratuitamente, sem planos pagos, assinaturas recorrentes, períodos de teste ou cobranças de qualquer natureza. Caso o aplicativo esteja hospedado em uma instância própria, o acesso não exige pagamento para o usuário final.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-base font-semibold text-white">
                  2. Uso pessoal e responsabilidade pela conta
                </h3>
                <p>
                  O acesso destina-se exclusivamente ao uso pessoal e não comercial. Ao criar uma conta ou compartilhar seu código de sincronização entre dispositivos próprios, você é responsável por manter a confidencialidade da sua senha e do código gerado.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-base font-semibold text-white">
                  3. Conduta proibida
                </h3>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Realizar requisições automatizadas abusivas contra os endpoints de busca, catálogo ou proxy de mídia.</li>
                  <li>Tentar acessar, alterar ou excluir códigos de sincronização ou contas pertencentes a terceiros.</li>
                  <li>Utilizar a plataforma para redistribuição comercial não autorizada de fluxos de vídeo ou metadados.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-base font-semibold text-white">
                  4. Disponibilidade do catálogo e fontes
                </h3>
                <p>
                  O catálogo de metadados e os links de transmissão dependem da disponibilidade técnica de serviços externos e provedores integrados pela Blitz Anime API, podendo sofrer alterações ou indisponibilidades temporárias sem aviso prévio.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'cookies' && (
            <div className="space-y-6 text-sm text-zinc-300 leading-relaxed">
              <div>
                <h2 className="font-display text-xl font-bold text-white">
                  Política de Cookies e Armazenamento Local
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Explicação fiel sobre o que é armazenado no seu navegador.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-base font-semibold text-white">
                  1. O que o ORVIA armazena no navegador
                </h3>
                <p>
                  Em vez de cookies invasivos de rastreamento, o ORVIA utiliza exclusivamente o armazenamento local (<code className="font-mono text-xs text-[#FF6B1A]">localStorage</code>) estritamente necessário para o aplicativo funcionar:
                </p>
                <div className="overflow-x-auto border border-white/[0.08] rounded-lg mt-2">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-950/80 text-zinc-300 border-b border-white/[0.08]">
                      <tr>
                        <th className="py-2.5 px-3.5 font-semibold">Chave</th>
                        <th className="py-2.5 px-3.5 font-semibold">Finalidade</th>
                        <th className="py-2.5 px-3.5 font-semibold">Categoria</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] text-zinc-400">
                      <tr>
                        <td className="py-2.5 px-3.5 font-mono text-zinc-200">orvia_privacy_consent</td>
                        <td className="py-2.5 px-3.5">Guarda sua escolha de consentimento no primeiro acesso</td>
                        <td className="py-2.5 px-3.5">Essencial</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3.5 font-mono text-zinc-200">akari_sync_code</td>
                        <td className="py-2.5 px-3.5">Identifica o código de sincronização dos perfis e lista</td>
                        <td className="py-2.5 px-3.5">Essencial</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3.5 font-mono text-zinc-200">akari_authenticated / akari_user_email</td>
                        <td className="py-2.5 px-3.5">Mantém a sessão conectada entre recarregamentos</td>
                        <td className="py-2.5 px-3.5">Essencial</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3.5 font-mono text-zinc-200">akari_profile_selected</td>
                        <td className="py-2.5 px-3.5">Lembra se o perfil ativo já foi escolhido na sessão</td>
                        <td className="py-2.5 px-3.5">Essencial</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-base font-semibold text-white">
                  2. Sem cookies de anúncios ou terceiros
                </h3>
                <p>
                  Não carregamos scripts de redes publicitárias, pixels de remarketing ou ferramentas de venda comportamental.
                </p>
              </div>

              {/* Interactive Consent Management */}
              <div className="p-4 rounded-xl bg-zinc-950/70 border border-white/[0.08] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">Sua preferência atual</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {consent
                        ? `Confirmado (${consent.essentialOnly ? 'Apenas essenciais' : 'Essenciais + continuidade'}) em ${new Date(consent.updatedAt).toLocaleDateString('pt-BR')}.`
                        : 'Nenhuma escolha gravada ainda neste navegador.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateConsent(true)}
                      className="h-9 px-3.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-xs font-medium text-zinc-200 transition-colors"
                    >
                      Apenas essenciais
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateConsent(false)}
                      className="h-9 px-3.5 rounded-lg bg-[#FF6B1A] hover:bg-[#FF7E38] text-xs font-semibold text-white transition-colors"
                    >
                      Aceitar tudo essencial
                    </button>
                    {onResetConsentBanner && (
                      <button
                        type="button"
                        onClick={() => {
                          onResetConsentBanner();
                          setConsent(null);
                          setConsentFeedback('Aviso de primeiro acesso reexibido.');
                        }}
                        className="h-9 px-3.5 rounded-lg border border-white/10 hover:border-white/25 text-xs font-medium text-zinc-300 transition-colors"
                      >
                        Reabrir aviso
                      </button>
                    )}
                  </div>
                </div>
                {consentFeedback && (
                  <p className="text-xs text-[#FF6B1A] font-medium">{consentFeedback}</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'seguranca' && (
            <div className="space-y-6 text-sm text-zinc-300 leading-relaxed">
              <div>
                <h2 className="font-display text-xl font-bold text-white">
                  Proteção de Dados e Segurança Técnica
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Controles técnicos realmente implementados na arquitetura do ORVIA.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-zinc-950/60 border border-white/[0.08] space-y-1.5">
                  <h3 className="font-display text-sm font-bold text-white">
                    Criptografia de senhas (scrypt + salt)
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Todas as senhas cadastradas passam por derivação criptográfica <code className="font-mono text-zinc-200">crypto.scryptSync</code> com salt aleatório de 16 bytes por usuário e comparação em tempo constante (<code className="font-mono text-zinc-200">timingSafeEqual</code>).
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950/60 border border-white/[0.08] space-y-1.5">
                  <h3 className="font-display text-sm font-bold text-white">
                    Sanitização no proxy de mídia
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Ao encaminhar fluxos HLS ou legendas WebVTT pelo endpoint <code className="font-mono text-zinc-200">/api/v1/proxy</code>, o servidor valida o protocolo HTTP(S) e remove cabeçalhos sensíveis como <code className="font-mono text-zinc-200">Authorization</code> e <code className="font-mono text-zinc-200">Cookie</code>.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950/60 border border-white/[0.08] space-y-1.5">
                  <h3 className="font-display text-sm font-bold text-white">
                    Prevenção de cache em rotas sensíveis
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Respostas de autenticação, perfis e URLs temporárias de stream utilizam <code className="font-mono text-zinc-200">Cache-Control: no-store</code> para que CDNs ou proxies intermediários não armazenem sessões nem links assinados.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950/60 border border-white/[0.08] space-y-1.5">
                  <h3 className="font-display text-sm font-bold text-white">
                    Minimização de dados
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Não coletamos documentos civis, telefone, biometria ou informações bancárias. Você também pode usar o modo visitante sem e-mail e apagar o histórico ou a conta inteira quando desejar.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'direitos' && (
            <div className="space-y-6 text-sm text-zinc-300 leading-relaxed">
              <div>
                <h2 className="font-display text-xl font-bold text-white">
                  Direitos Autorais e Suporte
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Informações transparentes sobre origem de conteúdos, propriedade intelectual e atendimento.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-base font-semibold text-white">
                  1. Propriedade intelectual e fontes externas
                </h3>
                <p>
                  Todas as marcas, títulos, artes promocionais, sinopses e obras audiovisuais exibidas pertencem aos seus respectivos estúdios, licenciadores e detentores de direitos autorais.
                </p>
                <p>
                  O ORVIA atua como interface de catálogo e reprodução: metadados oficiais e imagens públicas são consultados via AniList, Jikan (MyAnimeList), Kitsu e AniZip, enquanto fontes de reprodução são resolvidas dinamicamente por meio dos provedores configurados na Blitz Anime API, sem armazenamento permanente de arquivos de vídeo no servidor do ORVIA.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-base font-semibold text-white">
                  2. Notificações de direitos autorais e remoção
                </h3>
                <p>
                  Caso você seja titular de direitos autorais ou representante autorizado e identifique qualquer conteúdo que necessite de ajuste de atribuição ou desativação nesta instância, utilize os canais administrativos do domínio onde o aplicativo está hospedado (<span className="font-mono text-xs text-zinc-200">{typeof window !== 'undefined' ? window.location.host : 'domínio ativo'}</span>) para atendimento prioritário.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-base font-semibold text-white">
                  3. Suporte ao usuário e direitos LGPD
                </h3>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>
                    <strong className="text-white">Problemas de reprodução:</strong> no próprio player em tela cheia, use os botões <strong className="text-white">Tentar novamente</strong> ou <strong className="text-white">Testar Dublado / Legendado</strong> quando uma fonte externa estiver temporariamente indisponível.
                  </li>
                  <li>
                    <strong className="text-white">Gestão de perfis, histórico e sincronização:</strong> disponível diretamente na página de Configurações / Perfil.
                  </li>
                  <li>
                    <strong className="text-white">Exclusão de conta e dados pessoais:</strong> execute a remoção imediata diretamente na aba <strong className="text-white">Excluir Conta e Dados</strong> desta central, sem burocracia ou atendimento pago.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'exclusao' && (
            <div className="space-y-6 text-sm text-zinc-300 leading-relaxed">
              <div>
                <h2 className="font-display text-xl font-bold text-white">
                  Solicitar Exclusão da Conta e dos Dados
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Exerça seu direito previsto no art. 18, inciso VI da LGPD de forma imediata e definitiva.
                </p>
              </div>

              {deleteSuccess ? (
                <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-white">{deleteSuccess}</p>
                    <p className="text-xs text-zinc-300">
                      Todos os dados vinculados no servidor e no navegador foram removidos.
                    </p>
                  </div>
                </div>
              ) : !isAuthenticated ? (
                <div className="p-5 rounded-xl bg-zinc-950/70 border border-white/[0.08] space-y-2">
                  <p className="text-sm font-semibold text-white">
                    Nenhuma conta conectada neste momento
                  </p>
                  <p className="text-xs text-zinc-400">
                    Para excluir sua conta e todos os dados armazenados no servidor, faça login primeiro com seu e-mail ou código de sincronização e acesse Configurações &gt; Privacidade e Segurança &gt; Excluir Conta e Dados.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-zinc-200 space-y-1">
                      <p className="font-semibold text-white">
                        Atenção: esta ação é permanente e irreversível.
                      </p>
                      <p>
                        Ao confirmar, serão removidos do servidor e deste navegador: seu cadastro ({userEmail || 'sessão atual'}), o código de sincronização (<span className="font-mono text-[#FF6B1A]">{syncCode}</span>), todos os perfis, lista de favoritos e histórico de episódios.
                      </p>
                    </div>
                  </div>

                  {isAuthenticated && (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-zinc-950/60 border border-white/[0.08]">
                      <div>
                        <p className="text-xs font-semibold text-white">
                          Quer apenas limpar o histórico sem apagar a conta?
                        </p>
                        <p className="text-xs text-zinc-400">
                          Você pode apagar somente o histórico de reprodução do perfil ativo.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={clearHistory}
                        className="h-9 px-3.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-xs font-medium text-zinc-200 transition-colors"
                      >
                        Limpar apenas histórico
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleRequestDeletion} className="space-y-4 max-w-md">
                    {hasRegisteredEmail && (
                      <div>
                        <label
                          htmlFor="delete-account-password"
                          className="block text-xs font-medium text-zinc-300 mb-1.5"
                        >
                          Confirme sua senha atual ({userEmail})
                        </label>
                        <input
                          id="delete-account-password"
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Digite sua senha"
                          className="w-full h-11 px-3.5 rounded-lg bg-zinc-950 border border-white/15 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF6B1A]"
                        />
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="delete-confirm-word"
                        className="block text-xs font-medium text-zinc-300 mb-1.5"
                      >
                        Digite <span className="font-mono text-white">EXCLUIR</span> para confirmar
                      </label>
                      <input
                        id="delete-confirm-word"
                        type="text"
                        required
                        value={confirmWord}
                        onChange={(e) => setConfirmWord(e.target.value)}
                        placeholder="EXCLUIR"
                        className="w-full h-11 px-3.5 rounded-lg bg-zinc-950 border border-white/15 text-sm font-mono uppercase text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                      />
                    </div>

                    {deleteError && (
                      <p role="alert" className="text-xs font-medium text-red-400">
                        {deleteError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={deleting}
                      className="h-11 px-5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{deleting ? 'Excluindo dados...' : 'Excluir minha conta e todos os dados'}</span>
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
