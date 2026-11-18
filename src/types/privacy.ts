export type PrivacyTab =
  | 'privacidade'
  | 'termos'
  | 'cookies'
  | 'seguranca'
  | 'direitos'
  | 'exclusao';

export interface PrivacyConsentState {
  accepted: boolean;
  essentialOnly: boolean;
  updatedAt: string;
}

export const PRIVACY_CONSENT_STORAGE_KEY = 'orvia_privacy_consent';

export function readPrivacyConsent(): PrivacyConsentState | null {
  try {
    const raw = localStorage.getItem(PRIVACY_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PrivacyConsentState>;
    if (typeof parsed.accepted === 'boolean' && typeof parsed.updatedAt === 'string') {
      return {
        accepted: parsed.accepted,
        essentialOnly: Boolean(parsed.essentialOnly),
        updatedAt: parsed.updatedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function savePrivacyConsent(essentialOnly: boolean): PrivacyConsentState {
  const next: PrivacyConsentState = {
    accepted: true,
    essentialOnly,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export function clearPrivacyConsent(): void {
  try {
    localStorage.removeItem(PRIVACY_CONSENT_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
