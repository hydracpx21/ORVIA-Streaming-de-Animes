import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type {
  AccountWorkspace,
  AnimeSummary,
  ProfileData,
  UserProfile,
  WatchProgressItem,
} from '../types/anime';
import { DEFAULT_CHARACTER_AVATAR } from '../utils/formatters';

interface AccountContextValue {
  workspace: AccountWorkspace | null;
  activeProfile: UserProfile | null;
  profileData: ProfileData;
  syncCode: string;
  userEmail: string | null;
  isAuthenticated: boolean;
  profileSelected: boolean;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (
    email: string,
    password: string,
    profileName?: string,
    avatar?: string
  ) => Promise<void>;
  enterDemoMode: () => Promise<void>;
  enterWithSyncCode: (code: string) => Promise<void>;
  chooseProfile: (profileId: string) => Promise<void>;
  switchToWhoIsWatching: () => void;
  logout: () => void;
  isFavorite: (animeId: number) => boolean;
  toggleFavorite: (anime: AnimeSummary) => Promise<void>;
  getAnimeProgress: (animeId: number) => WatchProgressItem | null;
  getEpisodeProgress: (
    animeId: number,
    episodeNumber: number
  ) => { currentTime: number; duration: number; completed: boolean } | null;
  saveProgress: (payload: {
    animeId: number;
    animeTitle: string;
    coverImage: string;
    bannerImage?: string | null;
    episodeNumber: number;
    episodeTitle: string;
    thumbnail: string;
    currentTime: number;
    duration: number;
    genres?: string[];
  }) => Promise<void>;
  removeContinueWatching: (animeId: number) => Promise<void>;
  clearHistory: () => Promise<void>;
  selectProfile: (profileId: string) => Promise<void>;
  saveProfile: (profile: Partial<UserProfile> & { name: string }) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
  connectSyncCode: (code: string) => Promise<void>;
  createNewSyncWorkspace: () => Promise<string>;
  deleteAccountAndData: (payload: { password?: string; confirmText: string }) => Promise<void>;
}

const EMPTY_PROFILE_DATA: ProfileData = {
  favorites: [],
  progressByAnime: {},
  episodeProgress: {},
  history: [],
};

const STORAGE_CODE_KEY = 'akari_sync_code';
const STORAGE_AUTH_KEY = 'akari_authenticated';
const STORAGE_EMAIL_KEY = 'akari_user_email';
const STORAGE_PROFILE_SEL_KEY = 'akari_profile_selected';
const STORAGE_WS_CACHE_PREFIX = 'orvia_workspace_cache:';

async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 7000
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function readCachedWorkspace(code: string): AccountWorkspace | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_WS_CACHE_PREFIX}${code.toUpperCase()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccountWorkspace;
    if (parsed && parsed.syncCode && Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedWorkspace(ws: AccountWorkspace): void {
  try {
    localStorage.setItem(
      `${STORAGE_WS_CACHE_PREFIX}${ws.syncCode.toUpperCase()}`,
      JSON.stringify(ws)
    );
  } catch {
    // Ignore quota/private-mode storage limits
  }
}

function buildLocalFallbackWorkspace(
  code: string,
  profileName = 'Lucas',
  avatar = DEFAULT_CHARACTER_AVATAR
): AccountWorkspace {
  const normalizedCode = (code || 'ORVIA-DEMO-BR').trim().toUpperCase();
  const defaultProfileId = 'perfil-principal';
  return {
    syncCode: normalizedCode,
    activeProfileId: defaultProfileId,
    profiles: [
      {
        id: defaultProfileId,
        name: profileName,
        avatar,
        preferredAudio: 'SUB',
        preferredQuality: '1080p',
        kidsMode: false,
        createdAt: new Date().toISOString(),
      },
    ],
    dataByProfile: {
      [defaultProfileId]: {
        favorites: [],
        progressByAnime: {},
        episodeProgress: {},
        history: [],
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

function getInitialSyncCode(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('sync');
    if (fromUrl && fromUrl.trim().length >= 4) {
      const normalized = fromUrl.trim().toUpperCase();
      localStorage.setItem(STORAGE_CODE_KEY, normalized);
      localStorage.setItem(STORAGE_AUTH_KEY, 'true');
      return normalized;
    }
    const stored = localStorage.getItem(STORAGE_CODE_KEY);
    if (stored && stored.trim().length >= 4) {
      return stored.trim().toUpperCase();
    }
    return 'ORVIA-DEMO-BR';
  } catch {
    return 'ORVIA-DEMO-BR';
  }
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [syncCode, setSyncCode] = useState<string>(getInitialSyncCode);
  const [userEmail, setUserEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_EMAIL_KEY);
    } catch {
      return null;
    }
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('sync')) return true;
      return localStorage.getItem(STORAGE_AUTH_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [profileSelected, setProfileSelected] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_PROFILE_SEL_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [workspace, setWorkspace] = useState<AccountWorkspace | null>(() => {
    const initialCode = getInitialSyncCode();
    return readCachedWorkspace(initialCode);
  });
  const [loading, setLoading] = useState<boolean>(() => {
    try {
      const auth =
        localStorage.getItem(STORAGE_AUTH_KEY) === 'true' ||
        Boolean(new URLSearchParams(window.location.search).get('sync'));
      if (!auth) return false;
      const initialCode = getInitialSyncCode();
      return !readCachedWorkspace(initialCode);
    } catch {
      return false;
    }
  });

  const commitWorkspace = useCallback((ws: AccountWorkspace) => {
    setWorkspace(ws);
    writeCachedWorkspace(ws);
  }, []);

  const loadWorkspace = useCallback(
    async (code: string) => {
      const cached = readCachedWorkspace(code);
      if (!cached) setLoading(true);
      try {
        const res = await fetchWithTimeout(`/api/account/${encodeURIComponent(code)}`, {}, 6500);
        if (res.ok) {
          const ws = await safeJson<AccountWorkspace>(res);
          if (ws && ws.syncCode && Array.isArray(ws.profiles) && ws.profiles.length > 0) {
            // Merge local cached progress/favorites if stateless edge returned empty defaults
            const hasLocalData =
              cached &&
              Object.values(cached.dataByProfile).some(
                (d) => d.favorites.length > 0 || d.history.length > 0 || Object.keys(d.progressByAnime).length > 0
              );
            const remoteIsEmpty = Object.values(ws.dataByProfile).every(
              (d) => d.favorites.length === 0 && d.history.length === 0 && Object.keys(d.progressByAnime).length === 0
            );
            const finalWs = hasLocalData && remoteIsEmpty ? cached : ws;
            commitWorkspace(finalWs);
            setSyncCode(finalWs.syncCode);
            localStorage.setItem(STORAGE_CODE_KEY, finalWs.syncCode);
            return;
          }
        }
        // Fallback when offline or backend returns non-JSON
        commitWorkspace(cached || buildLocalFallbackWorkspace(code));
      } catch (err) {
        console.warn('Sincronização local ativa (modo resiliente):', err);
        commitWorkspace(cached || buildLocalFallbackWorkspace(code));
      } finally {
        setLoading(false);
      }
    },
    [commitWorkspace]
  );

  useEffect(() => {
    if (isAuthenticated) {
      loadWorkspace(syncCode);
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, loadWorkspace, syncCode]);

  const applyAuthResult = (email: string, code: string, ws: AccountWorkspace) => {
    localStorage.setItem(STORAGE_AUTH_KEY, 'true');
    localStorage.setItem(STORAGE_EMAIL_KEY, email);
    localStorage.setItem(STORAGE_CODE_KEY, code);
    localStorage.setItem(STORAGE_PROFILE_SEL_KEY, 'false');
    setUserEmail(email);
    setSyncCode(code);
    commitWorkspace(ws);
    setIsAuthenticated(true);
    setProfileSelected(false);
    setLoading(false);
  };

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      const res = await fetchWithTimeout(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        },
        8000
      );
      const data = await safeJson<{
        email?: string;
        syncCode?: string;
        workspace?: AccountWorkspace;
        error?: string;
      }>(res);
      if (!res.ok || !data?.workspace || !data.syncCode || !data.email) {
        throw new Error(data?.error || 'Não foi possível entrar. Verifique seus dados ou tente novamente.');
      }
      applyAuthResult(data.email, data.syncCode, data.workspace);
    },
    [commitWorkspace]
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string, profileName?: string, avatar?: string) => {
      const res = await fetchWithTimeout(
        '/api/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, profileName, avatar }),
        },
        8000
      );
      const data = await safeJson<{
        email?: string;
        syncCode?: string;
        workspace?: AccountWorkspace;
        error?: string;
      }>(res);
      if (!res.ok || !data?.workspace || !data.syncCode || !data.email) {
        throw new Error(data?.error || 'Não foi possível criar a conta.');
      }
      applyAuthResult(data.email, data.syncCode, data.workspace);
    },
    [commitWorkspace]
  );

  const enterDemoMode = useCallback(async () => {
    try {
      const res = await fetchWithTimeout('/api/auth/demo', { method: 'POST' }, 6500);
      const data = await safeJson<{
        email?: string;
        syncCode?: string;
        workspace?: AccountWorkspace;
      }>(res);
      if (res.ok && data?.workspace && data.syncCode) {
        const cached = readCachedWorkspace(data.syncCode);
        applyAuthResult(
          data.email || 'visitante@orvia.tv',
          data.syncCode,
          cached || data.workspace
        );
        return;
      }
    } catch {
      // Fallback seamlessly to local demo workspace if network fails
    }
    const fallbackCode = 'ORVIA-DEMO-BR';
    const fallbackWs = readCachedWorkspace(fallbackCode) || buildLocalFallbackWorkspace(fallbackCode);
    applyAuthResult('visitante@orvia.tv', fallbackCode, fallbackWs);
  }, [commitWorkspace]);

  const enterWithSyncCode = useCallback(
    async (code: string) => {
      const cleaned = code.trim().toUpperCase();
      if (!cleaned) throw new Error('Informe um código de sincronização.');
      const res = await fetchWithTimeout(`/api/account/${encodeURIComponent(cleaned)}`, {}, 7000);
      if (!res.ok) throw new Error('Código inválido.');
      const ws = await safeJson<AccountWorkspace>(res);
      if (!ws || !ws.syncCode) throw new Error('Resposta inválida ao carregar código.');
      applyAuthResult('dispositivo@orvia.tv', ws.syncCode, ws);
    },
    [commitWorkspace]
  );

  const activeProfile = useMemo(() => {
    if (!workspace) return null;
    return (
      workspace.profiles.find((p) => p.id === workspace.activeProfileId) ||
      workspace.profiles[0] ||
      null
    );
  }, [workspace]);

  const profileData = useMemo(() => {
    if (!workspace || !activeProfile) return EMPTY_PROFILE_DATA;
    return workspace.dataByProfile[activeProfile.id] || EMPTY_PROFILE_DATA;
  }, [workspace, activeProfile]);

  const selectProfile = useCallback(
    async (profileId: string) => {
      setWorkspace((prev) => {
        if (!prev) return prev;
        const next = { ...prev, activeProfileId: profileId, updatedAt: new Date().toISOString() };
        writeCachedWorkspace(next);
        return next;
      });
      try {
        const res = await fetchWithTimeout(
          `/api/account/${encodeURIComponent(syncCode)}/profile/select`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId }),
          },
          5000
        );
        if (res.ok) {
          const updated = await safeJson<AccountWorkspace>(res);
          if (updated && updated.syncCode) {
            setWorkspace((prev) => {
              const merged = prev
                ? { ...prev, activeProfileId: profileId, updatedAt: updated.updatedAt }
                : updated;
              writeCachedWorkspace(merged);
              return merged;
            });
          }
        }
      } catch (err) {
        console.warn('Erro ao sincronizar alternância de perfil:', err);
      }
    },
    [syncCode]
  );

  const chooseProfile = useCallback(
    async (profileId: string) => {
      await selectProfile(profileId);
      localStorage.setItem(STORAGE_PROFILE_SEL_KEY, 'true');
      setProfileSelected(true);
    },
    [selectProfile]
  );

  const switchToWhoIsWatching = useCallback(() => {
    localStorage.setItem(STORAGE_PROFILE_SEL_KEY, 'false');
    setProfileSelected(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_AUTH_KEY);
    localStorage.removeItem(STORAGE_EMAIL_KEY);
    localStorage.removeItem(STORAGE_PROFILE_SEL_KEY);
    setIsAuthenticated(false);
    setProfileSelected(false);
    setUserEmail(null);
    setWorkspace(null);
  }, []);

  const isFavorite = useCallback(
    (animeId: number) => profileData.favorites.some((a) => a.id === animeId),
    [profileData.favorites]
  );

  const toggleFavorite = useCallback(
    async (anime: AnimeSummary) => {
      setWorkspace((prev) => {
        if (!prev) return prev;
        const pid = prev.activeProfileId;
        const cur = prev.dataByProfile[pid] || EMPTY_PROFILE_DATA;
        const exists = cur.favorites.some((f) => f.id === anime.id);
        const nextFavs = exists
          ? cur.favorites.filter((f) => f.id !== anime.id)
          : [anime, ...cur.favorites];
        const next: AccountWorkspace = {
          ...prev,
          dataByProfile: {
            ...prev.dataByProfile,
            [pid]: { ...cur, favorites: nextFavs },
          },
          updatedAt: new Date().toISOString(),
        };
        writeCachedWorkspace(next);
        return next;
      });

      try {
        await fetchWithTimeout(
          `/api/account/${encodeURIComponent(syncCode)}/mylist`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ anime }),
          },
          5000
        );
      } catch (err) {
        console.warn('Minha Lista mantida localmente:', err);
      }
    },
    [syncCode]
  );

  const getAnimeProgress = useCallback(
    (animeId: number) => profileData.progressByAnime[String(animeId)] || null,
    [profileData.progressByAnime]
  );

  const getEpisodeProgress = useCallback(
    (animeId: number, episodeNumber: number) =>
      profileData.episodeProgress[`${animeId}:${episodeNumber}`] || null,
    [profileData.episodeProgress]
  );

  const saveProgress = useCallback(
    async (payload: {
      animeId: number;
      animeTitle: string;
      coverImage: string;
      bannerImage?: string | null;
      episodeNumber: number;
      episodeTitle: string;
      thumbnail: string;
      currentTime: number;
      duration: number;
      genres?: string[];
    }) => {
      const duration = Math.max(60, payload.duration || 1440);
      const currentTime = Math.min(duration, Math.max(0, payload.currentTime));
      const completed = currentTime / duration >= 0.92;
      const now = new Date().toISOString();

      setWorkspace((prev) => {
        if (!prev) return prev;
        const pid = prev.activeProfileId;
        const cur = prev.dataByProfile[pid] || EMPTY_PROFILE_DATA;
        const nextProgressByAnime = {
          ...cur.progressByAnime,
          [String(payload.animeId)]: {
            animeId: payload.animeId,
            animeTitle: payload.animeTitle,
            coverImage: payload.coverImage,
            bannerImage: payload.bannerImage ?? null,
            episodeNumber: payload.episodeNumber,
            episodeTitle: payload.episodeTitle,
            thumbnail: payload.thumbnail,
            currentTime,
            duration,
            completed,
            genres: payload.genres ?? [],
            updatedAt: now,
          },
        };
        const nextEpProgress = {
          ...cur.episodeProgress,
          [`${payload.animeId}:${payload.episodeNumber}`]: {
            currentTime,
            duration,
            completed,
            updatedAt: now,
          },
        };
        const nextHistory = [
          {
            id: `${payload.animeId}-${payload.episodeNumber}`,
            animeId: payload.animeId,
            animeTitle: payload.animeTitle,
            coverImage: payload.coverImage,
            episodeNumber: payload.episodeNumber,
            episodeTitle: payload.episodeTitle,
            thumbnail: payload.thumbnail,
            watchedSeconds: currentTime,
            durationSeconds: duration,
            watchedAt: now,
          },
          ...cur.history.filter(
            (h) => !(h.animeId === payload.animeId && h.episodeNumber === payload.episodeNumber)
          ),
        ].slice(0, 60);

        const next: AccountWorkspace = {
          ...prev,
          dataByProfile: {
            ...prev.dataByProfile,
            [pid]: {
              ...cur,
              progressByAnime: nextProgressByAnime,
              episodeProgress: nextEpProgress,
              history: nextHistory,
            },
          },
          updatedAt: now,
        };
        writeCachedWorkspace(next);
        return next;
      });

      try {
        await fetchWithTimeout(
          `/api/account/${encodeURIComponent(syncCode)}/progress`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          5000
        );
      } catch (err) {
        console.warn('Progresso salvo localmente:', err);
      }
    },
    [syncCode]
  );

  const removeContinueWatching = useCallback(
    async (animeId: number) => {
      setWorkspace((prev) => {
        if (!prev) return prev;
        const pid = prev.activeProfileId;
        const cur = prev.dataByProfile[pid] || EMPTY_PROFILE_DATA;
        const nextProg = { ...cur.progressByAnime };
        delete nextProg[String(animeId)];
        const next: AccountWorkspace = {
          ...prev,
          dataByProfile: {
            ...prev.dataByProfile,
            [pid]: { ...cur, progressByAnime: nextProg },
          },
          updatedAt: new Date().toISOString(),
        };
        writeCachedWorkspace(next);
        return next;
      });

      try {
        await fetchWithTimeout(
          `/api/account/${encodeURIComponent(syncCode)}/progress/${animeId}`,
          { method: 'DELETE' },
          5000
        );
      } catch (err) {
        console.warn('Erro ao remover progresso remoto:', err);
      }
    },
    [syncCode]
  );

  const clearHistory = useCallback(async () => {
    setWorkspace((prev) => {
      if (!prev) return prev;
      const pid = prev.activeProfileId;
      const cur = prev.dataByProfile[pid] || EMPTY_PROFILE_DATA;
      const next: AccountWorkspace = {
        ...prev,
        dataByProfile: {
          ...prev.dataByProfile,
          [pid]: { ...cur, history: [] },
        },
        updatedAt: new Date().toISOString(),
      };
      writeCachedWorkspace(next);
      return next;
    });

    try {
      await fetchWithTimeout(
        `/api/account/${encodeURIComponent(syncCode)}/history`,
        { method: 'DELETE' },
        5000
      );
    } catch (err) {
      console.warn('Erro ao limpar histórico remoto:', err);
    }
  }, [syncCode]);

  const saveProfile = useCallback(
    async (profile: Partial<UserProfile> & { name: string }) => {
      const cleanName = profile.name.trim().slice(0, 28);
      if (!cleanName) throw new Error('Informe um nome para o perfil.');

      setWorkspace((prev) => {
        if (!prev) return prev;
        const profiles = [...prev.profiles];
        const dataByProfile = { ...prev.dataByProfile };
        let activeProfileId = prev.activeProfileId;

        if (profile.id) {
          const idx = profiles.findIndex((p) => p.id === profile.id);
          if (idx >= 0) {
            profiles[idx] = {
              ...profiles[idx],
              name: cleanName,
              avatar: profile.avatar || profiles[idx].avatar,
              preferredAudio:
                profile.preferredAudio === 'DUB' || profile.preferredAudio === 'SUB'
                  ? profile.preferredAudio
                  : profiles[idx].preferredAudio,
              preferredQuality:
                profile.preferredQuality === '4K' ||
                profile.preferredQuality === '1080p' ||
                profile.preferredQuality === '720p'
                  ? profile.preferredQuality
                  : profiles[idx].preferredQuality,
              kidsMode:
                typeof profile.kidsMode === 'boolean'
                  ? profile.kidsMode
                  : profiles[idx].kidsMode,
            };
          }
        } else if (profiles.length < 6) {
          const id = `perfil-${Date.now().toString(36)}`;
          profiles.push({
            id,
            name: cleanName,
            avatar: profile.avatar || DEFAULT_CHARACTER_AVATAR,
            preferredAudio: profile.preferredAudio === 'DUB' ? 'DUB' : 'SUB',
            preferredQuality:
              profile.preferredQuality === '4K' || profile.preferredQuality === '720p'
                ? profile.preferredQuality
                : '1080p',
            kidsMode: Boolean(profile.kidsMode),
            createdAt: new Date().toISOString(),
          });
          dataByProfile[id] = EMPTY_PROFILE_DATA;
          activeProfileId = id;
        }

        const next: AccountWorkspace = {
          ...prev,
          activeProfileId,
          profiles,
          dataByProfile,
          updatedAt: new Date().toISOString(),
        };
        writeCachedWorkspace(next);
        return next;
      });

      try {
        const res = await fetchWithTimeout(
          `/api/account/${encodeURIComponent(syncCode)}/profile`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile),
          },
          6000
        );
        if (!res.ok) {
          const errData = await safeJson<{ error?: string }>(res);
          if (errData?.error) throw new Error(errData.error);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('Limite')) {
          throw err;
        }
      }
    },
    [syncCode]
  );

  const deleteProfile = useCallback(
    async (profileId: string) => {
      setWorkspace((prev) => {
        if (!prev || prev.profiles.length <= 1) return prev;
        const profiles = prev.profiles.filter((p) => p.id !== profileId);
        const dataByProfile = { ...prev.dataByProfile };
        delete dataByProfile[profileId];
        const next: AccountWorkspace = {
          ...prev,
          activeProfileId:
            prev.activeProfileId === profileId ? profiles[0].id : prev.activeProfileId,
          profiles,
          dataByProfile,
          updatedAt: new Date().toISOString(),
        };
        writeCachedWorkspace(next);
        return next;
      });

      try {
        await fetchWithTimeout(
          `/api/account/${encodeURIComponent(syncCode)}/profile/${encodeURIComponent(profileId)}`,
          { method: 'DELETE' },
          5000
        );
      } catch {
        // Already updated locally
      }
    },
    [syncCode]
  );

  const connectSyncCode = useCallback(
    async (code: string) => {
      const cleaned = code.trim().toUpperCase();
      if (!cleaned) return;
      localStorage.setItem(STORAGE_CODE_KEY, cleaned);
      setSyncCode(cleaned);
      await loadWorkspace(cleaned);
    },
    [loadWorkspace]
  );

  const createNewSyncWorkspace = useCallback(async () => {
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    const nextCode = `ORVIA-${randomPart}-BR`;
    localStorage.setItem(STORAGE_CODE_KEY, nextCode);
    setSyncCode(nextCode);
    await loadWorkspace(nextCode);
    return nextCode;
  }, [loadWorkspace]);

  const deleteAccountAndData = useCallback(
    async (payload: { password?: string; confirmText: string }) => {
      const res = await fetchWithTimeout(
        '/api/account/delete',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            syncCode,
            email: userEmail || undefined,
            password: payload.password,
            confirmText: payload.confirmText,
          }),
        },
        8000
      );
      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.error || 'Não foi possível excluir a conta e os dados.');
      }

      try {
        localStorage.removeItem(`${STORAGE_WS_CACHE_PREFIX}${syncCode.toUpperCase()}`);
        localStorage.removeItem(STORAGE_CODE_KEY);
        localStorage.removeItem(STORAGE_AUTH_KEY);
        localStorage.removeItem(STORAGE_EMAIL_KEY);
        localStorage.removeItem(STORAGE_PROFILE_SEL_KEY);
      } catch {
        // Ignore storage restrictions
      }
      setWorkspace(null);
      setUserEmail(null);
      setIsAuthenticated(false);
      setProfileSelected(false);
      setSyncCode('ORVIA-DEMO-BR');
    },
    [syncCode, userEmail]
  );

  const value: AccountContextValue = {
    workspace,
    activeProfile,
    profileData,
    syncCode,
    userEmail,
    isAuthenticated,
    profileSelected,
    loading,
    loginWithEmail,
    registerWithEmail,
    enterDemoMode,
    enterWithSyncCode,
    chooseProfile,
    switchToWhoIsWatching,
    logout,
    isFavorite,
    toggleFavorite,
    getAnimeProgress,
    getEpisodeProgress,
    saveProgress,
    removeContinueWatching,
    clearHistory,
    selectProfile,
    saveProfile,
    deleteProfile,
    connectSyncCode,
    createNewSyncWorkspace,
    deleteAccountAndData,
  };

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error('useAccount deve ser usado dentro de AccountProvider');
  }
  return ctx;
}
