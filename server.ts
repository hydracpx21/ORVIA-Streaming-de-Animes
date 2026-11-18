import {
  AnilistMeta,
  type ContentLanguage,
  HttpClient,
  KitsuMeta,
  MalMeta,
  MappingClient,
  type BrowseKind,
  type IMediaMetadata,
  type MediaSeason,
} from 'anime-sdk';
import { AkariBlitzProvider } from './src/providers/AkariBlitzProvider.js';
import { OFFICIAL_BLITZ_ANIME_PROVIDERS, startBlitzServer } from './blitz-api.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import type {
  AccountWorkspace,
  AnimeCharacter,
  AnimeDetail,
  AnimeEpisode,
  AnimeSeasonRelation,
  AnimeSummary,
  AvatarGroup,
  BlitzStreamResponse,
  BlitzSubtitleTrack,
  BlitzVideoStream,
  HomeFeed,
  ProfileData,
  RecentEpisodeDrop,
  UserProfile,
} from './src/types/anime.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const RAW_BLITZ_API_URL = (process.env.BLITZ_API_URL || '')
  .trim()
  .replace(/\/api\/v1\/?$/i, '')
  .replace(/\/+$/, '');
const BLITZ_API_URL = RAW_BLITZ_API_URL || 'http://127.0.0.1:3001';
const BLITZ_AUTH_TOKEN = (process.env.BLITZ_AUTH_TOKEN || '').trim();
const BLITZ_DEFAULT_PROVIDER = (
  process.env.BLITZ_DEFAULT_PROVIDER || 'animeparadise'
)
  .trim()
  .toLowerCase();
const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'akari-db.json');
const USERS_FILE = path.join(DATA_DIR, 'akari-users.json');
const AUTHORIZED_STREAMS_FILE = path.join(DATA_DIR, 'authorized-streams.json');
const APP_RELEASE_FILE = path.join(DATA_DIR, 'app-release.json');
const CATALOG_DETECTOR_FILE = path.join(DATA_DIR, 'catalog-detector.json');
const HOME_FEED_SNAPSHOT_FILE = path.join(DATA_DIR, 'home-feed-cache.json');
const ORVIA_PUBLISH_TOKEN = (process.env.ORVIA_PUBLISH_TOKEN || '').trim();
const SERVER_BOOT_NONCE = crypto.randomBytes(6).toString('hex');
const DEFAULT_CHARACTER_AVATAR =
  'https://s4.anilist.co/file/anilistcdn/character/large/b40-MNypXsxSRb1R.png';
const ONE_PIECE_ID = 21;
const ONE_PIECE_ELBAPH_COVER = '/src/assets/images/one_piece_elbaph_2026.jpg';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 15 * 60 * 1000;
const DETECTOR_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let lastCatalogSyncAt: string | null = null;

interface StoredReleaseManifest {
  version: string;
  releaseId: string;
  publishedAt: string;
  notes?: string;
  channel: 'official';
}

interface CatalogDetectorState {
  catalogRevision: number;
  lastScanAt: string | null;
  knownLatestEpisodeByAnime: Record<string, number>;
  knownNewAnimeIds: number[];
}

let releaseManifest: StoredReleaseManifest = {
  version: '1.0.0',
  releaseId: SERVER_BOOT_NONCE,
  publishedAt: new Date().toISOString(),
  channel: 'official',
};

let detectorState: CatalogDetectorState = {
  catalogRevision: 1,
  lastScanAt: null,
  knownLatestEpisodeByAnime: {},
  knownNewAnimeIds: [],
};

const resolvedStreamCache = new Map<string, { payload: BlitzStreamResponse; expiresAt: number }>();
const readyEpisodeKeys = new Set<string>();
const staleDetailCache = new Map<number, AnimeDetail>();
const staleCatalogCache = new Map<string, { items: AnimeSummary[]; hasNextPage: boolean; page: number; total: number }>();
let staleAvatarsCache: { groups: AvatarGroup[] } | null = null;
let prewarmInProgress = false;
let lastGoodHomeFeed: HomeFeed | null = null;
let inFlightHomeFeedPromise: Promise<HomeFeed> | null = null;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttlMs = CACHE_TTL_MS): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

const sdkHttp = new HttpClient({ timeoutMs: 12000 });
const sdkMapping = new MappingClient(sdkHttp, {
  disableAnify: true,
  disableMalsync: true,
  disableArmServer: true,
});
const anilistMeta = new AnilistMeta(sdkHttp, { mappingClient: sdkMapping });
const malMeta = new MalMeta(sdkHttp, { mappingClient: sdkMapping });
const kitsuMeta = new KitsuMeta(sdkHttp, { mappingClient: sdkMapping });
const metaProviders = {
  anilist: anilistMeta,
  mal: malMeta,
  kitsu: kitsuMeta,
} as const;

const akariProvider = new AkariBlitzProvider(sdkHttp, AUTHORIZED_STREAMS_FILE);
const localContentProviders = {
  akari: akariProvider,
} as const;

function resolveLocalContentProvider(raw?: string) {
  const key = (raw || 'akari').trim().toLowerCase();
  if (key === 'akari') return localContentProviders.akari;
  return null;
}

function ensureAuthorizedStreamsFile() {
  try {
    ensureDataDir();
    if (!fs.existsSync(AUTHORIZED_STREAMS_FILE)) {
      fs.writeFileSync(AUTHORIZED_STREAMS_FILE, '[]\n', 'utf-8');
    }
  } catch (err) {
    console.warn('Não foi possível inicializar authorized-streams.json:', err);
  }
}

async function queryAniList<T>(
  query: string,
  variables: Record<string, unknown> = {},
  attempt = 0
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9500);
  try {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if ((res.status === 429 || res.status === 503) && attempt < 1) {
      const retryAfterSec = Number(res.headers.get('retry-after')) || 1;
      const waitMs = Math.min(1600, Math.max(450, retryAfterSec * 1000));
      clearTimeout(timer);
      await new Promise((r) => setTimeout(r, waitMs));
      return queryAniList<T>(query, variables, attempt + 1);
    }

    if (!res.ok) {
      throw new Error(`AniList HTTP ${res.status}`);
    }
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      throw new Error(json.errors[0].message);
    }
    if (!json.data) {
      throw new Error('Resposta vazia da API de animes');
    }
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

interface RawAniListMedia {
  id: number;
  idMal?: number | null;
  title: { romaji: string; english?: string | null; native?: string | null };
  coverImage: { extraLarge?: string; large?: string; color?: string | null };
  bannerImage?: string | null;
  description?: string | null;
  genres?: string[];
  averageScore?: number | null;
  popularity?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  episodes?: number | null;
  duration?: number | null;
  format?: string | null;
  status?: string | null;
  isAdult?: boolean;
  countryOfOrigin?: string | null;
  studios?: { nodes?: Array<{ name: string }> };
  trailer?: { id: string; site: string; thumbnail?: string | null } | null;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  streamingEpisodes?: Array<{ title: string; thumbnail: string; site?: string }>;
}

function mapMediaToSummary(m: RawAniListMedia): AnimeSummary {
  return {
    id: m.id,
    idMal: m.idMal ?? null,
    title: {
      romaji: m.title.romaji,
      english: m.title.english ?? null,
      native: m.title.native ?? null,
    },
    coverImage: {
      extraLarge:
        m.id === ONE_PIECE_ID
          ? ONE_PIECE_ELBAPH_COVER
          : m.coverImage.extraLarge || m.coverImage.large || '',
      large:
        m.id === ONE_PIECE_ID
          ? ONE_PIECE_ELBAPH_COVER
          : m.coverImage.large || m.coverImage.extraLarge || '',
      color: m.coverImage.color ?? null,
    },
    bannerImage: m.bannerImage ?? null,
    description: m.description ?? null,
    genres: m.genres ?? [],
    averageScore: m.averageScore ?? null,
    popularity: m.popularity ?? null,
    season: m.season ?? null,
    seasonYear: m.seasonYear ?? null,
    episodes: m.episodes ?? null,
    duration: m.duration ?? null,
    format: m.format ?? null,
    status: m.status ?? null,
    isAdult: Boolean(m.isAdult),
    studios: (m.studios?.nodes ?? []).map((s) => s.name),
    trailer: m.trailer ?? null,
    nextAiringEpisode: m.nextAiringEpisode ?? null,
    streamingEpisodesCount: m.streamingEpisodes?.length ?? 0,
  };
}

const SUMMARY_FIELDS = `
  id
  idMal
  title { romaji english native }
  coverImage { extraLarge large color }
  bannerImage
  description(asHtml: false)
  genres
  averageScore
  popularity
  season
  seasonYear
  episodes
  duration
  format
  status
  isAdult
  countryOfOrigin
  studios(isMain: true) { nodes { name } }
  trailer { id site thumbnail }
  nextAiringEpisode { episode airingAt }
`;

function extractEpisodeNumber(title: string, fallbackIndex: number): number {
  const match = title.match(/(?:Episode|Ep\.?|Episódio)\s*(\d+)/i);
  if (match) return Number(match[1]);
  return fallbackIndex;
}

function cleanEpisodeTitle(raw: string, epNumber: number): string {
  const cleaned = raw
    .replace(/^(?:Episode|Ep\.?|Episódio)\s*\d+\s*[-–:]\s*/i, '')
    .trim();
  return cleaned || `Episódio ${epNumber}`;
}

interface EpisodeEnrichment {
  title?: string;
  thumbnail?: string;
  duration?: number;
  aired?: string;
  synopsis?: string;
  filler?: boolean;
  recap?: boolean;
}

interface AniZipResult {
  episodes: Map<number, EpisodeEnrichment>;
  kitsuId?: number;
}

async function fetchAniZipEpisodes(anilistId: number): Promise<AniZipResult> {
  const cacheKey = `anizip_eps_v2:${anilistId}`;
  const cached = getCached<{ entries: Array<[number, EpisodeEnrichment]>; kitsuId?: number }>(cacheKey);
  if (cached) {
    return {
      episodes: new Map(cached.entries),
      kitsuId: cached.kitsuId,
    };
  }

  const episodes = new Map<number, EpisodeEnrichment>();
  let kitsuId: number | undefined;
  if (!anilistId) return { episodes };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return { episodes };
    const json = (await res.json()) as {
      mappings?: { kitsu_id?: number | string };
      episodes?: Record<
        string,
        {
          title?: Record<string, string>;
          image?: string;
          runtime?: number;
          length?: number;
          airDate?: string;
          airdate?: string;
          overview?: string;
          summary?: string;
        }
      >;
    };

    const rawKitsu = Number(json.mappings?.kitsu_id);
    if (Number.isFinite(rawKitsu) && rawKitsu > 0) {
      kitsuId = rawKitsu;
    }

    for (const [key, ep] of Object.entries(json.episodes ?? {})) {
      if (!/^\d+$/.test(key)) continue;
      const num = Number(key);
      if (!Number.isFinite(num) || num <= 0) continue;

      const rawThumb = ep.image && /^https?:\/\//i.test(ep.image) ? ep.image : undefined;
      const title = ep.title?.['pt-BR'] || ep.title?.en || ep.title?.['x-jat'] || undefined;
      const durCandidate = ep.runtime || ep.length;
      const duration =
        typeof durCandidate === 'number' && Number.isFinite(durCandidate) && durCandidate > 0 && durCandidate < 300
          ? Math.round(durCandidate)
          : undefined;
      const airedRaw = ep.airDate || ep.airdate;
      const aired = airedRaw ? String(airedRaw).slice(0, 10) : undefined;
      const synopsisRaw = ep.overview || ep.summary;
      const synopsis = synopsisRaw ? synopsisRaw.replace(/\nSource:.*$/i, '').trim() : undefined;

      episodes.set(num, {
        title,
        thumbnail: rawThumb,
        duration,
        aired,
        synopsis,
      });
    }

    setCached(cacheKey, { entries: Array.from(episodes.entries()), kitsuId });
  } catch {
    // Graceful enrichment fallback
  }

  return { episodes, kitsuId };
}

async function fetchKitsuEpisodes(kitsuId?: number): Promise<Map<number, EpisodeEnrichment>> {
  const result = new Map<number, EpisodeEnrichment>();
  if (!kitsuId || kitsuId <= 0) return result;

  const cacheKey = `kitsu_eps:${kitsuId}`;
  const cached = getCached<Array<[number, EpisodeEnrichment]>>(cacheKey);
  if (cached) return new Map(cached);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(
      `https://kitsu.io/api/edge/anime/${kitsuId}/episodes?page%5Blimit%5D=20&page%5Boffset%5D=0`,
      {
        headers: { Accept: 'application/vnd.api+json' },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (!res.ok) return result;
    const json = (await res.json()) as {
      data?: Array<{
        attributes?: {
          number?: number;
          canonicalTitle?: string;
          synopsis?: string;
          airdate?: string;
          length?: number;
          thumbnail?: { original?: string; large?: string; medium?: string } | null;
        };
      }>;
    };

    for (const item of json.data ?? []) {
      const attrs = item.attributes;
      if (!attrs || typeof attrs.number !== 'number' || attrs.number <= 0) continue;
      const thumb =
        attrs.thumbnail?.original || attrs.thumbnail?.large || attrs.thumbnail?.medium || undefined;
      result.set(attrs.number, {
        title: attrs.canonicalTitle || undefined,
        thumbnail: thumb && /^https?:\/\//i.test(thumb) ? thumb : undefined,
        aired: attrs.airdate ? String(attrs.airdate).slice(0, 10) : undefined,
        duration:
          typeof attrs.length === 'number' && attrs.length > 0 && attrs.length < 300
            ? Math.round(attrs.length)
            : undefined,
        synopsis: attrs.synopsis || undefined,
      });
    }

    setCached(cacheKey, Array.from(result.entries()));
  } catch {
    // Graceful enrichment fallback
  }
  return result;
}

async function fetchJikanEpisodes(malId: number): Promise<Map<number, EpisodeEnrichment>> {
  const result = new Map<number, EpisodeEnrichment>();
  if (!malId) return result;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const [videosRes, epsRes] = await Promise.allSettled([
      fetch(`https://api.jikan.moe/v4/anime/${malId}/videos/episodes`, { signal: controller.signal }),
      fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=1`, { signal: controller.signal }),
    ]);
    clearTimeout(timer);

    if (videosRes.status === 'fulfilled' && videosRes.value.ok) {
      const vJson = (await videosRes.value.json()) as {
        data?: Array<{ mal_id?: number; episode?: string; title?: string; images?: { jpg?: { image_url?: string } } }>;
      };
      for (const item of vJson.data ?? []) {
        const epNum = item.mal_id || extractEpisodeNumber(item.episode || '', 0);
        if (epNum > 0) {
          result.set(epNum, {
            title: item.title || undefined,
            thumbnail: item.images?.jpg?.image_url || undefined,
          });
        }
      }
    }

    if (epsRes.status === 'fulfilled' && epsRes.value.ok) {
      const eJson = (await epsRes.value.json()) as {
        data?: Array<{ mal_id: number; title?: string; aired?: string; filler?: boolean; recap?: boolean }>;
      };
      for (const ep of eJson.data ?? []) {
        const prev = result.get(ep.mal_id) ?? {};
        result.set(ep.mal_id, {
          title: prev.title || ep.title || undefined,
          thumbnail: prev.thumbnail,
          aired: ep.aired ? ep.aired.slice(0, 10) : undefined,
          filler: Boolean(ep.filler),
          recap: Boolean(ep.recap),
        });
      }
    }
  } catch {
    // Graceful enrichment fallback
  }
  return result;
}

// ---------- Persistent User Workspace Store ----------
const workspaces = new Map<string, AccountWorkspace>();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

interface StoredUser {
  email: string;
  passwordHash: string;
  syncCode: string;
  createdAt: string;
}

const usersByEmail = new Map<string, StoredUser>();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const keyBuf = Buffer.from(key, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function loadDbFromDisk() {
  try {
    ensureDataDir();
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, AccountWorkspace>;
      for (const [code, ws] of Object.entries(parsed)) {
        for (const p of ws.profiles) {
          if (!p.avatar || p.avatar.startsWith('/src/assets/images/avatar_')) {
            p.avatar = DEFAULT_CHARACTER_AVATAR;
          }
        }
        for (const pData of Object.values(ws.dataByProfile)) {
          for (const fav of pData.favorites) {
            if (fav.id === ONE_PIECE_ID) {
              fav.coverImage.extraLarge = ONE_PIECE_ELBAPH_COVER;
              fav.coverImage.large = ONE_PIECE_ELBAPH_COVER;
            }
          }
          const opProg = pData.progressByAnime[String(ONE_PIECE_ID)];
          if (opProg) {
            opProg.coverImage = ONE_PIECE_ELBAPH_COVER;
          }
          for (const h of pData.history) {
            if (h.animeId === ONE_PIECE_ID) {
              h.coverImage = ONE_PIECE_ELBAPH_COVER;
            }
          }
        }
        workspaces.set(code, ws);
      }
    }
    if (fs.existsSync(USERS_FILE)) {
      const rawUsers = fs.readFileSync(USERS_FILE, 'utf-8');
      const parsedUsers = JSON.parse(rawUsers) as Record<string, StoredUser>;
      for (const [email, user] of Object.entries(parsedUsers)) {
        usersByEmail.set(email, user);
      }
    }
  } catch (err) {
    console.error('Erro ao carregar banco local:', err);
  }
}

function writeDbSnapshotToDisk() {
  try {
    ensureDataDir();
    const obj: Record<string, AccountWorkspace> = {};
    for (const [code, ws] of workspaces.entries()) {
      obj[code] = ws;
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(obj, null, 2), 'utf-8');

    const usersObj: Record<string, StoredUser> = {};
    for (const [email, u] of usersByEmail.entries()) {
      usersObj[email] = u;
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersObj, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar banco local:', err);
  }
}

let savePending = false;
function persistDbToDisk() {
  if (savePending) return;
  savePending = true;
  setTimeout(() => {
    savePending = false;
    writeDbSnapshotToDisk();
  }, 200);
}

function createEmptyProfileData(): ProfileData {
  return {
    favorites: [],
    progressByAnime: {},
    episodeProgress: {},
    history: [],
  };
}

function createDefaultWorkspace(syncCode: string, initialName = 'Lucas', initialAvatar = DEFAULT_CHARACTER_AVATAR): AccountWorkspace {
  const defaultProfileId = 'perfil-principal';
  const defaultProfile: UserProfile = {
    id: defaultProfileId,
    name: initialName,
    avatar: initialAvatar,
    preferredAudio: 'SUB',
    preferredQuality: '1080p',
    kidsMode: false,
    createdAt: new Date().toISOString(),
  };

  return {
    syncCode,
    activeProfileId: defaultProfileId,
    profiles: [defaultProfile],
    dataByProfile: {
      [defaultProfileId]: createEmptyProfileData(),
    },
    updatedAt: new Date().toISOString(),
  };
}

function getOrCreateWorkspace(rawCode: string): AccountWorkspace {
  const code = rawCode.trim().toUpperCase() || 'AKARI-DEMO-BR';
  let ws = workspaces.get(code);
  if (!ws) {
    ws = createDefaultWorkspace(code);
    workspaces.set(code, ws);
    persistDbToDisk();
  }
  return ws;
}

loadDbFromDisk();

function loadReleaseAndDetectorState() {
  try {
    ensureDataDir();
    if (fs.existsSync(APP_RELEASE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(APP_RELEASE_FILE, 'utf-8')) as Partial<StoredReleaseManifest>;
      releaseManifest = {
        version: parsed.version || '1.0.0',
        releaseId: parsed.releaseId || SERVER_BOOT_NONCE,
        publishedAt: parsed.publishedAt || new Date().toISOString(),
        notes: parsed.notes,
        channel: 'official',
      };
    } else {
      fs.writeFileSync(APP_RELEASE_FILE, JSON.stringify(releaseManifest, null, 2) + '\n', 'utf-8');
    }
  } catch (err) {
    console.warn('Não foi possível carregar app-release.json:', err);
  }

  try {
    ensureDataDir();
    if (fs.existsSync(CATALOG_DETECTOR_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CATALOG_DETECTOR_FILE, 'utf-8')) as Partial<CatalogDetectorState>;
      detectorState = {
        catalogRevision: typeof parsed.catalogRevision === 'number' && parsed.catalogRevision > 0 ? parsed.catalogRevision : 1,
        lastScanAt: parsed.lastScanAt || null,
        knownLatestEpisodeByAnime: parsed.knownLatestEpisodeByAnime || {},
        knownNewAnimeIds: Array.isArray(parsed.knownNewAnimeIds) ? parsed.knownNewAnimeIds : [],
      };
      if (detectorState.lastScanAt) {
        lastCatalogSyncAt = detectorState.lastScanAt;
      }
    }
  } catch (err) {
    console.warn('Não foi possível carregar catalog-detector.json:', err);
  }

  try {
    ensureDataDir();
    if (fs.existsSync(HOME_FEED_SNAPSHOT_FILE)) {
      const parsedFeed = JSON.parse(fs.readFileSync(HOME_FEED_SNAPSHOT_FILE, 'utf-8')) as HomeFeed;
      if (parsedFeed && Array.isArray(parsedFeed.trending) && parsedFeed.trending.length > 0) {
        lastGoodHomeFeed = parsedFeed;
        if (parsedFeed.lastCatalogSyncAt) {
          const ageMs = Date.now() - Date.parse(parsedFeed.lastCatalogSyncAt);
          if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < DETECTOR_SYNC_INTERVAL_MS) {
            setCached('home_feed', parsedFeed, DETECTOR_SYNC_INTERVAL_MS - ageMs);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Não foi possível carregar home-feed-cache.json:', err);
  }
}

function saveReleaseManifestToDisk() {
  try {
    ensureDataDir();
    fs.writeFileSync(APP_RELEASE_FILE, JSON.stringify(releaseManifest, null, 2) + '\n', 'utf-8');
    const distReleaseFile = path.resolve(__dirname, 'dist/release.json');
    if (fs.existsSync(path.dirname(distReleaseFile))) {
      const effective = getEffectiveReleaseManifest();
      fs.writeFileSync(distReleaseFile, JSON.stringify(effective, null, 2) + '\n', 'utf-8');
    }
  } catch (err) {
    console.warn('Erro ao salvar app-release.json:', err);
  }
}

function saveDetectorStateToDisk() {
  try {
    ensureDataDir();
    fs.writeFileSync(CATALOG_DETECTOR_FILE, JSON.stringify(detectorState, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.warn('Erro ao salvar catalog-detector.json:', err);
  }
}

function getEffectiveReleaseManifest() {
  let distBuildId = '';
  const distReleaseFile = path.resolve(__dirname, 'dist/release.json');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distReleaseFile)) {
    try {
      const distParsed = JSON.parse(fs.readFileSync(distReleaseFile, 'utf-8')) as { buildId?: string };
      distBuildId = distParsed.buildId || '';
    } catch {
      // Ignore malformed dist release
    }
  }

  const hash = crypto.createHash('sha256');
  hash.update(releaseManifest.version);
  hash.update(releaseManifest.releaseId);
  hash.update(distBuildId || SERVER_BOOT_NONCE);

  return {
    version: releaseManifest.version,
    buildId: hash.digest('hex').slice(0, 16),
    publishedAt: releaseManifest.publishedAt,
    channel: 'official' as const,
    catalogRevision: detectorState.catalogRevision,
  };
}

function bumpPatchVersion(version: string): string {
  const parts = version.split('.').map((n) => Number(n));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
  return '1.0.1';
}

loadReleaseAndDetectorState();

function toAniListFuzzyDateInt(date: Date): number {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return Number(`${y}${m}${d}`);
}

function formatAiredRelativePt(airingAtSec: number): string {
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - airingAtSec);
  if (diffSec < 60 * 15) return 'Saiu agora';
  if (diffSec < 3600) return `Há ${Math.max(1, Math.floor(diffSec / 60))} min`;
  if (diffSec < 3600 * 24) return `Há ${Math.floor(diffSec / 3600)}h`;
  const days = Math.floor(diffSec / (3600 * 24));
  if (days === 1) return 'Ontem';
  return `Há ${days} dias`;
}

async function resolveMetaStreamWithFallback(
  id: string,
  episode: number,
  language: ContentLanguage,
  requestedProvider: string,
  meta: string,
  useCache = true,
  options?: { providerTimeoutMs?: number; maxProviders?: number }
): Promise<BlitzStreamResponse> {
  const cacheKey = `${id}:${episode}:${language}:${requestedProvider}:${meta}`;
  if (useCache) {
    const hit = resolvedStreamCache.get(cacheKey);
    if (hit && Date.now() < hit.expiresAt && hit.payload.streams.length > 0) {
      return hit.payload;
    }
  }

  // 1. Check optional local registered streams override first (data/authorized-streams.json)
  const metaProvider = resolveMetaProvider(meta) || anilistMeta;
  try {
    const localResolved = await metaProvider.resolveStream(id, episode, akariProvider, language);
    const localRaw = localResolved.type === 'video' ? localResolved.streams : [];
    const localStreams = normalizeAndSortStreams(localRaw);
    if (localStreams.length > 0) {
      const okPayload: BlitzStreamResponse = {
        authorized: true,
        status: 'OK',
        provider: akariProvider.id,
        streams: localStreams,
      };
      resolvedStreamCache.set(cacheKey, { payload: okPayload, expiresAt: Date.now() + 8 * 60 * 1000 });
      return okPayload;
    }
  } catch {
    // No local override for this title/episode; proceed to Blitz Anime API providers
  }

  // 2. Query Blitz Anime API instance with automatic fallback across official providers
  const rawChain = Array.from(
    new Set([
      requestedProvider,
      ...OFFICIAL_BLITZ_ANIME_PROVIDERS,
    ])
  ).filter((p) => p && p !== akariProvider.id);
  const providerChain =
    options?.maxProviders && options.maxProviders > 0
      ? rawChain.slice(0, options.maxProviders)
      : rawChain;

  for (const candidateProvider of providerChain) {
    try {
      const sp = new URLSearchParams({
        id,
        episode: String(episode),
        language,
        provider: candidateProvider,
        meta,
      });
      const providerTimeout =
        options?.providerTimeoutMs ?? (candidateProvider === requestedProvider ? 25000 : 10000);
      const upstream = (await fetchAuthorizedBlitzEndpoint('/api/v1/meta/stream', sp, providerTimeout)) as {
        stream?: { type?: string; streams?: unknown[] };
        streams?: unknown[];
      };
      const rawStreams = upstream.stream?.streams ?? upstream.streams ?? [];
      const streams = normalizeAndSortStreams(rawStreams);
      if (streams.length > 0) {
        const okPayload: BlitzStreamResponse = {
          authorized: true,
          status: 'OK',
          provider: candidateProvider,
          streams,
        };
        resolvedStreamCache.set(cacheKey, { payload: okPayload, expiresAt: Date.now() + 8 * 60 * 1000 });
        return okPayload;
      }
    } catch (err) {
      if (!options?.providerTimeoutMs) {
        console.warn(
          `Provedor Blitz "${candidateProvider}" indisponível para ${id} ep.${episode}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  return {
    authorized: false,
    status: 'UNAVAILABLE',
    provider: requestedProvider,
    message: 'Nenhuma fonte de vídeo disponível para este episódio no momento.',
    streams: [],
  };
}

async function prewarmDetectedEpisodes(drops: RecentEpisodeDrop[]): Promise<void> {
  if (prewarmInProgress || drops.length === 0) return;
  prewarmInProgress = true;
  try {
    // Probe up to 3 top popular drops sequentially with gentle spacing to respect upstream rate limits
    const candidates = [...drops]
      .sort((a, b) => (b.anime.popularity ?? 0) - (a.anime.popularity ?? 0))
      .slice(0, 3);

    for (const drop of candidates) {
      const key = `${drop.anime.id}:${drop.episodeNumber}`;
      try {
        const result = await resolveMetaStreamWithFallback(
          `anilist:${drop.anime.id}`,
          drop.episodeNumber,
          'sub',
          BLITZ_DEFAULT_PROVIDER,
          'anilist',
          true,
          { providerTimeoutMs: 6500, maxProviders: 1 }
        );
        if (result.streams.length > 0) {
          readyEpisodeKeys.add(key);
          drop.readyToWatch = true;
        }
      } catch {
        // Ignore unavailable pre-warm candidate
      }
      await new Promise((r) => setTimeout(r, 650));
    }

    const cachedFeed = getCached<HomeFeed>('home_feed');
    if (cachedFeed) {
      for (const item of cachedFeed.recentEpisodes) {
        if (readyEpisodeKeys.has(`${item.anime.id}:${item.episodeNumber}`)) {
          item.readyToWatch = true;
          if (!item.airedLabel.includes('Pronto')) {
            item.airedLabel = `${item.airedLabel} · Pronto`;
          }
        }
      }
      cachedFeed.recentEpisodes.sort((a, b) => {
        if (Boolean(a.readyToWatch) !== Boolean(b.readyToWatch)) {
          return a.readyToWatch ? -1 : 1;
        }
        return (b.airingAt ?? 0) - (a.airingAt ?? 0);
      });
    }
  } finally {
    prewarmInProgress = false;
  }
}

async function buildAndCacheHomeFeed(forceRefresh = false): Promise<HomeFeed> {
  if (!forceRefresh) {
    const cached = getCached<HomeFeed>('home_feed');
    if (cached) return cached;
  }

  if (inFlightHomeFeedPromise) {
    return inFlightHomeFeedPromise;
  }

  inFlightHomeFeedPromise = (async () => {
    try {
      const feed = await executeHomeFeedScan();
      lastGoodHomeFeed = feed;
      try {
        ensureDataDir();
        fs.writeFileSync(HOME_FEED_SNAPSHOT_FILE, JSON.stringify(feed), 'utf-8');
      } catch {
        // Ignore snapshot write warning
      }
      return feed;
    } catch (err) {
      if (lastGoodHomeFeed) {
        console.warn(
          'Usando snapshot local do catálogo após limite/falha temporária da AniList:',
          err instanceof Error ? err.message : err
        );
        setCached('home_feed', lastGoodHomeFeed, 60 * 1000);
        return lastGoodHomeFeed;
      }
      throw err;
    } finally {
      inFlightHomeFeedPromise = null;
    }
  })();

  return inFlightHomeFeedPromise;
}

async function executeHomeFeedScan(): Promise<HomeFeed> {

  const nowSec = Math.floor(Date.now() / 1000);
  const windowStartSec = nowSec - 72 * 3600;
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const tomorrowInt = toAniListFuzzyDateInt(tomorrow);
  const lookbackDateInt = toAniListFuzzyDateInt(ninetyDaysAgo);

  const query = `
    query HomeFeed($nowSec: Int, $windowStartSec: Int, $tomorrowInt: FuzzyDateInt, $lookbackDateInt: FuzzyDateInt) {
      heroCandidates: Page(page: 1, perPage: 20) {
        media(type: ANIME, sort: [TRENDING_DESC, POPULARITY_DESC], isAdult: false) {
          ${SUMMARY_FIELDS}
          streamingEpisodes { title thumbnail site }
        }
      }
      trending: Page(page: 1, perPage: 18) {
        media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
          ${SUMMARY_FIELDS}
        }
      }
      seasonal: Page(page: 1, perPage: 18) {
        media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false, format_in: [TV, ONA]) {
          ${SUMMARY_FIELDS}
          streamingEpisodes { title thumbnail site }
        }
      }
      popular: Page(page: 1, perPage: 18) {
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          ${SUMMARY_FIELDS}
        }
      }
      topRated: Page(page: 1, perPage: 18) {
        media(type: ANIME, sort: SCORE_DESC, isAdult: false, format_in: [TV, MOVIE]) {
          ${SUMMARY_FIELDS}
        }
      }
      recentDrops: Page(page: 1, perPage: 24) {
        media(type: ANIME, status: RELEASING, sort: [TRENDING_DESC], isAdult: false, format: TV) {
          ${SUMMARY_FIELDS}
          streamingEpisodes { title thumbnail site }
        }
      }
      recentAiringSchedules: Page(page: 1, perPage: 50) {
        airingSchedules(airingAt_lesser: $nowSec, airingAt_greater: $windowStartSec, sort: TIME_DESC) {
          id
          episode
          airingAt
          media {
            type
            ${SUMMARY_FIELDS}
            streamingEpisodes { title thumbnail site }
          }
        }
      }
      newPremieres: Page(page: 1, perPage: 24) {
        media(
          type: ANIME,
          format_in: [TV, MOVIE, ONA],
          isAdult: false,
          status_in: [RELEASING, FINISHED],
          startDate_lesser: $tomorrowInt,
          startDate_greater: $lookbackDateInt,
          sort: [START_DATE_DESC, POPULARITY_DESC]
        ) {
          ${SUMMARY_FIELDS}
        }
      }
    }
  `;

  interface RawAiringScheduleItem {
    id: number;
    episode: number;
    airingAt: number;
    media?: (RawAniListMedia & { type?: string }) | null;
  }

  interface HomeQueryRes {
    heroCandidates: { media: RawAniListMedia[] };
    trending: { media: RawAniListMedia[] };
    seasonal: { media: RawAniListMedia[] };
    popular: { media: RawAniListMedia[] };
    topRated: { media: RawAniListMedia[] };
    recentDrops: { media: RawAniListMedia[] };
    recentAiringSchedules: { airingSchedules: RawAiringScheduleItem[] };
    newPremieres: { media: RawAniListMedia[] };
  }

  const data = await queryAniList<HomeQueryRes>(query, {
    nowSec,
    windowStartSec,
    tomorrowInt,
    lookbackDateInt,
  });

  const heroWithBanner = data.heroCandidates.media
    .filter((m) => Boolean(m.bannerImage) && Boolean(m.coverImage?.extraLarge))
    .slice(0, 6)
    .map(mapMediaToSummary);

  const hero =
    heroWithBanner.length > 0
      ? heroWithBanner
      : data.heroCandidates.media.slice(0, 6).map(mapMediaToSummary);

  let detectedNewStuff = false;
  const recentEpisodes: RecentEpisodeDrop[] = [];
  const seenEpisodeDropKeys = new Set<string>();
  const newPremiereFromSchedules: AnimeSummary[] = [];
  const seenNewAnimeIds = new Set<number>();

  // 1. Prioritize exact newly aired Japanese anime episodes from AiringSchedules
  for (const sched of data.recentAiringSchedules?.airingSchedules ?? []) {
    const m = sched.media;
    if (
      !m ||
      m.isAdult ||
      (m.type && m.type !== 'ANIME') ||
      (m.countryOfOrigin && m.countryOfOrigin !== 'JP') ||
      (m.popularity ?? 0) < 300
    ) {
      continue;
    }
    const summary = mapMediaToSummary(m);

    if (sched.episode === 1 && !seenNewAnimeIds.has(m.id)) {
      seenNewAnimeIds.add(m.id);
      newPremiereFromSchedules.push(summary);
    }

    const epNum = Math.max(1, sched.episode);
    const dropKey = `${m.id}:${epNum}`;
    if (seenEpisodeDropKeys.has(dropKey)) continue;

    const prevKnown = detectorState.knownLatestEpisodeByAnime[String(m.id)] || 0;
    const isNewlyDetected = epNum > prevKnown;
    if (isNewlyDetected) {
      detectorState.knownLatestEpisodeByAnime[String(m.id)] = epNum;
      cache.delete(`anime_detail_v2:${m.id}`);
      detectedNewStuff = true;
    }

    const matchedStreamEp = (m.streamingEpisodes ?? []).find(
      (se, idx) => extractEpisodeNumber(se.title, idx + 1) === epNum
    );
    const thumb =
      matchedStreamEp?.thumbnail ||
      m.bannerImage ||
      (m.trailer?.site === 'youtube' ? `https://i.ytimg.com/vi/${m.trailer.id}/maxresdefault.jpg` : '') ||
      m.coverImage.extraLarge ||
      m.coverImage.large ||
      '';

    if (!thumb) continue;

    seenEpisodeDropKeys.add(dropKey);
    const isReady = readyEpisodeKeys.has(dropKey);
    const relativeLabel = formatAiredRelativePt(sched.airingAt);

    recentEpisodes.push({
      anime: summary,
      episodeNumber: epNum,
      episodeTitle: matchedStreamEp
        ? cleanEpisodeTitle(matchedStreamEp.title, epNum)
        : `Episódio ${epNum}`,
      thumbnail: thumb,
      airedLabel: isReady ? `${relativeLabel} · Pronto` : relativeLabel,
      airingAt: sched.airingAt,
      readyToWatch: isReady,
      isNewDrop: isNewlyDetected || nowSec - sched.airingAt < 24 * 3600,
    });

    if (recentEpisodes.length >= 12) break;
  }

  // 2. Supplement with streaming episodes of currently releasing top series
  for (const m of data.recentDrops.media) {
    if (recentEpisodes.length >= 18) break;
    const summary = mapMediaToSummary(m);
    const eps = m.streamingEpisodes ?? [];
    if (eps.length > 0) {
      let latest = eps[0];
      let highestNum = extractEpisodeNumber(eps[0].title, 1);
      for (let i = 0; i < eps.length; i++) {
        const num = extractEpisodeNumber(eps[i].title, i + 1);
        if (num >= highestNum) {
          highestNum = num;
          latest = eps[i];
        }
      }
      const dropKey = `${m.id}:${highestNum}`;
      if (!seenEpisodeDropKeys.has(dropKey) && latest.thumbnail) {
        const prevKnown = detectorState.knownLatestEpisodeByAnime[String(m.id)] || 0;
        if (highestNum > prevKnown) {
          detectorState.knownLatestEpisodeByAnime[String(m.id)] = highestNum;
          cache.delete(`anime_detail_v2:${m.id}`);
          detectedNewStuff = true;
        }
        seenEpisodeDropKeys.add(dropKey);
        const isReady = readyEpisodeKeys.has(dropKey);
        const baseLabel = m.nextAiringEpisode ? `Ep. ${highestNum} disponível` : 'Recém-adicionado';
        recentEpisodes.push({
          anime: summary,
          episodeNumber: highestNum,
          episodeTitle: cleanEpisodeTitle(latest.title, highestNum),
          thumbnail: latest.thumbnail,
          airedLabel: isReady ? `${baseLabel} · Pronto` : baseLabel,
          readyToWatch: isReady,
          isNewDrop: false,
        });
      }
    } else if (m.bannerImage || m.trailer?.id) {
      const epNum = m.nextAiringEpisode ? Math.max(1, m.nextAiringEpisode.episode - 1) : 1;
      const dropKey = `${m.id}:${epNum}`;
      if (!seenEpisodeDropKeys.has(dropKey)) {
        const thumb =
          m.bannerImage ||
          (m.trailer?.site === 'youtube' ? `https://i.ytimg.com/vi/${m.trailer.id}/maxresdefault.jpg` : '');
        if (thumb) {
          seenEpisodeDropKeys.add(dropKey);
          const isReady = readyEpisodeKeys.has(dropKey);
          recentEpisodes.push({
            anime: summary,
            episodeNumber: epNum,
            episodeTitle: `Episódio ${epNum}`,
            thumbnail: thumb,
            airedLabel: isReady ? 'Temporada atual · Pronto' : 'Temporada atual',
            readyToWatch: isReady,
            isNewDrop: false,
          });
        }
      }
    }
  }

  // 3. Build Newly Premiered / New Animes Detector list
  const newAnimes: AnimeSummary[] = [...newPremiereFromSchedules];
  for (const m of data.newPremieres?.media ?? []) {
    if (!m || m.isAdult || seenNewAnimeIds.has(m.id)) continue;
    if (m.countryOfOrigin && m.countryOfOrigin !== 'JP') continue;
    if (!m.coverImage?.extraLarge && !m.coverImage?.large) continue;
    if ((m.popularity ?? 0) < 300) continue;
    seenNewAnimeIds.add(m.id);
    newAnimes.push(mapMediaToSummary(m));
    if (newAnimes.length >= 18) break;
  }

  const prevKnownSet = new Set(detectorState.knownNewAnimeIds);
  const currentNewIds = newAnimes.map((a) => a.id);
  for (const id of currentNewIds) {
    if (!prevKnownSet.has(id)) {
      detectedNewStuff = true;
      break;
    }
  }
  if (currentNewIds.length > 0) {
    detectorState.knownNewAnimeIds = Array.from(new Set([...currentNewIds, ...detectorState.knownNewAnimeIds])).slice(0, 80);
  }

  // Invalidate detail cache for currently airing titles so newly released episodes always appear immediately
  for (const airing of data.recentDrops.media) {
    cache.delete(`anime_detail_v2:${airing.id}`);
  }

  const nowIso = new Date().toISOString();
  lastCatalogSyncAt = nowIso;
  detectorState.lastScanAt = nowIso;
  if (detectedNewStuff) {
    detectorState.catalogRevision += 1;
    cache.forEach((_val, key) => {
      if (key.startsWith('catalog:')) cache.delete(key);
    });
  }
  saveDetectorStateToDisk();

  const feed: HomeFeed = {
    hero,
    trending: data.trending.media.map(mapMediaToSummary),
    seasonal: data.seasonal.media.map(mapMediaToSummary),
    popular: data.popular.media.map(mapMediaToSummary),
    topRated: data.topRated.media.map(mapMediaToSummary),
    recentEpisodes,
    newAnimes,
    catalogRevision: detectorState.catalogRevision,
    lastCatalogSyncAt: nowIso,
  };

  setCached('home_feed', feed, DETECTOR_SYNC_INTERVAL_MS);

  // Asynchronously pre-verify streams for the freshest episodes so they open ready to watch
  void prewarmDetectedEpisodes(recentEpisodes);

  return feed;
}

function resolveMetaProvider(rawProvider?: string) {
  const key = (rawProvider || 'anilist').trim().toLowerCase();
  if (key === 'mal' || key === 'kitsu' || key === 'anilist') {
    return metaProviders[key];
  }
  return null;
}

function qualityWeight(q: BlitzVideoStream['quality']): number {
  switch (q) {
    case '1080p':
      return 5;
    case '720p':
      return 4;
    case '480p':
      return 3;
    case '360p':
      return 2;
    default:
      return 1;
  }
}

function normalizeAndSortStreams(rawStreams: unknown[]): BlitzVideoStream[] {
  const valid: BlitzVideoStream[] = [];
  for (const item of rawStreams) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Partial<BlitzVideoStream>;
    if (typeof s.sourceUrl !== 'string' || !/^https?:\/\//i.test(s.sourceUrl)) continue;
    const isHLS =
      typeof s.isHLS === 'boolean'
        ? s.isHLS
        : /\.m3u8(\?|$)/i.test(s.sourceUrl) || /\/m3u8(\?|$)/i.test(s.sourceUrl);
    const hasHeaders = Boolean(s.headers && Object.keys(s.headers).length > 0);
    const hQuery = hasHeaders ? `&h=${encodeURIComponent(JSON.stringify(s.headers))}` : '';
    const sourceUrl = `/api/v1/proxy?url=${encodeURIComponent(s.sourceUrl)}${hQuery}`;

    const subtitles: BlitzSubtitleTrack[] = Array.isArray(s.subtitles)
      ? s.subtitles
          .filter(
            (sub): sub is BlitzSubtitleTrack =>
              Boolean(sub && typeof sub.url === 'string' && /^https?:\/\//i.test(sub.url))
          )
          .map((sub) => ({
            language: sub.language || 'pt-BR',
            label: sub.label || sub.language || 'Legenda',
            format: sub.format,
            url: `/api/v1/proxy?url=${encodeURIComponent(sub.url)}${hQuery}`,
          }))
      : [];

    valid.push({
      sourceUrl,
      isHLS,
      quality: s.quality || 'auto',
      language: s.language,
      subtitles: subtitles.length > 0 ? subtitles : undefined,
    });
  }

  return valid.sort((a, b) => {
    if (a.isHLS !== b.isHLS) return a.isHLS ? -1 : 1;
    return qualityWeight(b.quality) - qualityWeight(a.quality);
  });
}

async function fetchAuthorizedBlitzEndpoint(
  pathname: string,
  searchParams: URLSearchParams,
  timeoutMs = 25000
): Promise<unknown> {
  const url = `${BLITZ_API_URL}${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (BLITZ_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${BLITZ_AUTH_TOKEN}`;
  }
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Blitz upstream HTTP ${res.status}`);
  }
  return res.json();
}

// ---------- Express App Setup ----------
async function startServer() {
  const isLocalBlitz =
    !RAW_BLITZ_API_URL ||
    /^https?:\/\/(127\.0\.0\.1|localhost):3001$/i.test(BLITZ_API_URL);
  if (isLocalBlitz) {
    await startBlitzServer(3001, '127.0.0.1');
  }

  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '2mb' }));
  app.use(
    [
      '/api/v1/meta/stream',
      '/api/v1/stream',
      '/api/account',
      '/api/auth',
      '/api/app/release',
      '/api/anime/updates',
      '/api/internal/publish',
      '/release.json',
    ],
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      next();
    }
  );

  // Silent Official App Release Manifest
  app.get(['/api/app/release', '/release.json'], (_req: Request, res: Response) => {
    res.json(getEffectiveReleaseManifest());
  });

  // Protected Official Update Publisher (used by CLI `npm run release` or deploy pipelines)
  app.post('/api/internal/publish', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const headerToken = typeof req.headers['x-orvia-publish-token'] === 'string'
      ? req.headers['x-orvia-publish-token'].trim()
      : '';
    const providedToken = headerToken || bearerToken;

    if (ORVIA_PUBLISH_TOKEN) {
      if (providedToken !== ORVIA_PUBLISH_TOKEN) {
        return res.status(403).json({ error: 'Token de publicação oficial inválido.' });
      }
    } else {
      const remoteIp = req.ip || req.socket.remoteAddress || '';
      const isLoopback =
        remoteIp === '127.0.0.1' ||
        remoteIp === '::1' ||
        remoteIp === '::ffff:127.0.0.1';
      if (!isLoopback) {
        return res.status(403).json({
          error: 'Configure ORVIA_PUBLISH_TOKEN para publicar remotamente.',
        });
      }
    }

    const body = (req.body || {}) as { version?: string; notes?: string };
    const nextVersion =
      typeof body.version === 'string' && body.version.trim()
        ? body.version.trim()
        : bumpPatchVersion(releaseManifest.version);

    releaseManifest = {
      version: nextVersion,
      releaseId: crypto.randomBytes(6).toString('hex'),
      publishedAt: new Date().toISOString(),
      notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 240) : undefined,
      channel: 'official',
    };
    saveReleaseManifestToDisk();

    // Clear caches and run immediate episode & new-anime detector scan for the published release
    cache.clear();
    resolvedStreamCache.clear();
    try {
      await buildAndCacheHomeFeed(true);
    } catch {
      // Keep published release valid even if upstream AniList is momentarily slow
    }

    return res.json({
      ok: true,
      release: getEffectiveReleaseManifest(),
    });
  });

  // Blitz-compatible ping & health endpoints
  app.get('/ping', (_req: Request, res: Response) => {
    res.type('text/plain').send('pong ⚡ Blitz');
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'orvia-blitz-gateway',
      version: '2.5.0',
      license: 'MIT',
      licensedStreamConfigured: Boolean(BLITZ_API_URL),
      metadataProviders: Object.keys(metaProviders),
      lastCatalogSyncAt,
    });
  });

  ensureAuthorizedStreamsFile();

  // Healthcheck
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'orvia-streaming',
      release: getEffectiveReleaseManifest(),
      blitz: {
        version: '2.5.0',
        localProvider: akariProvider.id,
        remoteInstanceConfigured: Boolean(BLITZ_API_URL),
        defaultProvider: BLITZ_DEFAULT_PROVIDER,
        lastCatalogSyncAt,
      },
    });
  });

  // ---------- Official Blitz Anime API v2.5.0 Routes ----------
  app.get('/api/v1/providers', async (_req: Request, res: Response) => {
    const localAnime = Object.keys(localContentProviders);
    if (BLITZ_API_URL) {
      try {
        const upstream = (await fetchAuthorizedBlitzEndpoint(
          '/api/v1/providers',
          new URLSearchParams()
        )) as { anime?: string[]; manga?: string[]; metadata?: string[] };
        const mergedAnime = Array.from(new Set([...localAnime, ...(upstream.anime ?? [])]));
        return res.json({
          metadata: upstream.metadata ?? Object.keys(metaProviders),
          anime: mergedAnime,
          manga: upstream.manga ?? [],
          defaultProvider: BLITZ_DEFAULT_PROVIDER,
          connected: true,
        });
      } catch {
        // Fallback to built-in compatible provider
      }
    }
    res.json({
      metadata: Object.keys(metaProviders),
      anime: localAnime,
      manga: [],
      defaultProvider: localAnime.includes(BLITZ_DEFAULT_PROVIDER) ? BLITZ_DEFAULT_PROVIDER : 'akari',
      connected: true,
      mode: BLITZ_API_URL ? 'hybrid-fallback' : 'local-compatible-provider',
      note: 'Provedor compatível "akari" (anime-sdk BaseProvider) ativo. Fontes comerciais HLS/MP4 podem ser registradas em data/authorized-streams.json ou conectadas via BLITZ_API_URL.',
    });
  });

  app.get('/api/v1/meta/search', async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q) return res.status(400).json({ error: 'Parâmetro "q" obrigatório.' });
      const providerId = typeof req.query.provider === 'string' ? req.query.provider : 'anilist';
      const provider = resolveMetaProvider(providerId);
      if (!provider) return res.status(400).json({ error: `Provedor de metadados inválido: ${providerId}` });

      const results = await provider.search(q);
      res.json({ provider: provider.id, results });
    } catch (error) {
      console.error('Erro em /api/v1/meta/search:', error);
      res.status(502).json({ error: 'Falha ao buscar metadados na Blitz Anime API.' });
    }
  });

  app.get('/api/v1/meta/info', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'Parâmetro "id" obrigatório.' });
      const explicitProvider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
      const inferredProvider = explicitProvider || (id.includes(':') ? id.split(':')[0] : 'anilist');
      const provider = resolveMetaProvider(inferredProvider);
      if (!provider) return res.status(400).json({ error: `Provedor inválido: ${inferredProvider}` });

      const info: IMediaMetadata = await provider.fetchMediaInfo(id);
      res.json(info);
    } catch (error) {
      console.error('Erro em /api/v1/meta/info:', error);
      res.status(502).json({ error: 'Falha ao carregar metadados completos.' });
    }
  });

  app.get('/api/v1/meta/browse', async (req: Request, res: Response) => {
    try {
      const typeRaw = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : 'trending';
      const allowedTypes = new Set<BrowseKind>(['trending', 'popular', 'seasonal', 'top']);
      const kind: BrowseKind = allowedTypes.has(typeRaw as BrowseKind)
        ? (typeRaw as BrowseKind)
        : 'trending';
      const providerId = typeof req.query.provider === 'string' ? req.query.provider : 'anilist';
      const provider = resolveMetaProvider(providerId);
      if (!provider) return res.status(400).json({ error: `Provedor inválido: ${providerId}` });
      if (!provider.supportsBrowseKind(kind)) {
        return res.status(400).json({ error: `Provedor ${provider.id} não suporta browse "${kind}".` });
      }

      const page = req.query.page ? Math.max(1, Number(req.query.page)) : 1;
      const perPage = req.query.perPage ? Math.min(36, Math.max(1, Number(req.query.perPage))) : 20;
      const season = typeof req.query.season === 'string' ? (req.query.season.toUpperCase() as MediaSeason) : undefined;
      const year = req.query.year ? Number(req.query.year) : undefined;

      const results = await provider.browse(kind, { page, perPage, season, year });
      res.json({ provider: provider.id, type: kind, page, results });
    } catch (error) {
      console.error('Erro em /api/v1/meta/browse:', error);
      res.status(502).json({ error: 'Falha ao navegar pelo catálogo Blitz.' });
    }
  });

  app.get('/api/v1/meta/content', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'Parâmetro "id" obrigatório.' });
      const explicitMeta = typeof req.query.meta === 'string' ? req.query.meta : undefined;
      const inferredMeta = explicitMeta || (id.includes(':') ? id.split(':')[0] : 'anilist');
      const metaProvider = resolveMetaProvider(inferredMeta);
      if (!metaProvider) return res.status(400).json({ error: `Provedor inválido: ${inferredMeta}` });

      const units = await metaProvider.fetchContentUnits(id, akariProvider);
      res.json({
        id,
        provider: akariProvider.id,
        units,
      });
    } catch (error) {
      console.error('Erro em /api/v1/meta/content:', error);
      res.status(502).json({ error: 'Falha ao carregar lista oficial de episódios.' });
    }
  });

  app.get('/api/v1/search', async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q) return res.status(400).json({ error: 'Parâmetro "q" obrigatório.' });
      const requestedProvider =
        typeof req.query.provider === 'string' ? req.query.provider.trim() : BLITZ_DEFAULT_PROVIDER;

      if (BLITZ_API_URL && requestedProvider !== akariProvider.id) {
        const sp = new URLSearchParams({ q, provider: requestedProvider });
        const upstream = await fetchAuthorizedBlitzEndpoint('/api/v1/search', sp);
        return res.json(upstream);
      }

      const provider = resolveLocalContentProvider(requestedProvider) || akariProvider;
      const results = await provider.search(q);
      return res.json({
        provider: provider.id,
        type: 'anime',
        results,
      });
    } catch (error) {
      console.error('Erro em /api/v1/search:', error);
      res.status(502).json({ error: 'Falha na busca Blitz Anime API.' });
    }
  });

  app.get('/api/v1/content', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'Parâmetro "id" obrigatório.' });
      const requestedProvider =
        typeof req.query.provider === 'string'
          ? req.query.provider.trim()
          : id.includes(':')
            ? id.split(':')[0]
            : BLITZ_DEFAULT_PROVIDER;

      if (BLITZ_API_URL && requestedProvider !== akariProvider.id) {
        const sp = new URLSearchParams({ id, provider: requestedProvider });
        const upstream = await fetchAuthorizedBlitzEndpoint('/api/v1/content', sp);
        return res.json(upstream);
      }

      const provider = resolveLocalContentProvider(requestedProvider) || akariProvider;
      const units = await provider.fetchContentUnits(id);
      return res.json({
        provider: provider.id,
        units,
      });
    } catch (error) {
      console.error('Erro em /api/v1/content:', error);
      res.status(502).json({ error: 'Falha ao consultar conteúdo no provedor Blitz.' });
    }
  });

  app.get('/api/v1/tracks', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
      const languageRaw = typeof req.query.language === 'string' ? req.query.language.trim().toLowerCase() : 'sub';
      const language: ContentLanguage = languageRaw === 'dub' || languageRaw === 'raw' ? languageRaw : 'sub';
      if (!id) return res.status(400).json({ error: 'Parâmetro "id" obrigatório.' });
      const tracks = await akariProvider.fetchUnitTracks(id, language);
      return res.json({ provider: akariProvider.id, ...tracks });
    } catch (error) {
      console.error('Erro em /api/v1/tracks:', error);
      res.status(502).json({ error: 'Falha ao consultar faixas disponíveis.' });
    }
  });

  app.get('/api/v1/meta/tracks', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
      const episode = Math.max(1, Number(req.query.episode) || 1);
      const languageRaw = typeof req.query.language === 'string' ? req.query.language.trim().toLowerCase() : 'sub';
      const language: ContentLanguage = languageRaw === 'dub' || languageRaw === 'raw' ? languageRaw : 'sub';
      if (!id) return res.status(400).json({ error: 'Parâmetro "id" obrigatório.' });
      const tracks = await anilistMeta.fetchUnitTracks(id, episode, akariProvider, language);
      return res.json({ provider: akariProvider.id, ...tracks });
    } catch (error) {
      console.error('Erro em /api/v1/meta/tracks:', error);
      res.status(502).json({ error: 'Falha ao consultar faixas do episódio.' });
    }
  });

  app.get('/api/v1/meta/stream', async (req: Request, res: Response) => {
    const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    const episode = Math.max(1, Number(req.query.episode) || 1);
    const languageRaw = typeof req.query.language === 'string' ? req.query.language.trim().toLowerCase() : 'sub';
    const language: ContentLanguage = languageRaw === 'dub' || languageRaw === 'raw' ? languageRaw : 'sub';
    const requestedProvider =
      (typeof req.query.provider === 'string' && req.query.provider.trim()) || BLITZ_DEFAULT_PROVIDER;
    const meta = typeof req.query.meta === 'string' ? req.query.meta.trim() : 'anilist';

    if (!id) {
      return res.status(400).json({ error: 'Parâmetro "id" obrigatório.' });
    }

    try {
      const payload = await resolveMetaStreamWithFallback(
        id,
        episode,
        language,
        requestedProvider,
        meta,
        true
      );
      return res.json(payload);
    } catch (error) {
      console.error('Erro em /api/v1/meta/stream:', error);
      const payload: BlitzStreamResponse = {
        authorized: false,
        status: 'UNAVAILABLE',
        provider: requestedProvider,
        message: 'Não foi possível resolver a fonte de vídeo para este episódio.',
        streams: [],
      };
      return res.status(502).json(payload);
    }
  });

  app.get('/api/v1/stream', async (req: Request, res: Response) => {
    const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    const languageRaw = typeof req.query.language === 'string' ? req.query.language.trim().toLowerCase() : 'sub';
    const language: ContentLanguage = languageRaw === 'dub' || languageRaw === 'raw' ? languageRaw : 'sub';
    const providerId =
      typeof req.query.provider === 'string'
        ? req.query.provider.trim()
        : id.includes(':')
          ? id.split(':')[0]
          : BLITZ_DEFAULT_PROVIDER;
    if (!id) return res.status(400).json({ error: 'Parâmetro "id" obrigatório.' });

    try {
      if (providerId !== akariProvider.id) {
        try {
          const sp = new URLSearchParams({ id, language, provider: providerId });
          const upstream = (await fetchAuthorizedBlitzEndpoint('/api/v1/stream', sp, 12000)) as {
            stream?: { type?: string; streams?: unknown[] };
            streams?: unknown[];
          };
          const rawStreams = upstream.stream?.streams ?? upstream.streams ?? [];
          const streams = normalizeAndSortStreams(rawStreams);
          return res.json({
            authorized: streams.length > 0,
            status: streams.length > 0 ? 'OK' : 'UNAVAILABLE',
            provider: providerId,
            message:
              streams.length > 0
                ? undefined
                : 'Nenhuma fonte de vídeo disponível para este episódio.',
            streams,
          } satisfies BlitzStreamResponse);
        } catch (err) {
          console.warn('Instância Blitz indisponível em /api/v1/stream:', err);
        }
      }

      const resolved = await akariProvider.resolveStream(id, language);
      const rawStreams = resolved.type === 'video' ? resolved.streams : [];
      const streams = normalizeAndSortStreams(rawStreams);
      const payload: BlitzStreamResponse = {
        authorized: streams.length > 0,
        status: streams.length > 0 ? 'OK' : 'UNAVAILABLE',
        provider: akariProvider.id,
        message:
          streams.length > 0
            ? undefined
            : 'Nenhuma fonte de vídeo disponível para este episódio.',
        streams,
      };
      return res.json(payload);
    } catch (error) {
      console.error('Erro em /api/v1/stream:', error);
      return res.status(502).json({
        authorized: false,
        status: 'UNAVAILABLE',
        provider: providerId,
        message: 'Falha ao consultar fonte de vídeo.',
        streams: [],
      });
    }
  });

  app.options('/api/v1/proxy', (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.sendStatus(204);
  });

  app.get('/api/v1/proxy', async (req: Request, res: Response) => {
    const targetUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      return res.status(400).json({ error: 'URL inválida.' });
    }
    try {
      const extraHeaders: Record<string, string> = {};
      if (typeof req.query.h === 'string' && req.query.h) {
        const parsed = JSON.parse(req.query.h) as Record<string, string>;
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && !['host', 'authorization', 'cookie'].includes(k.toLowerCase())) {
            extraHeaders[k] = v;
          }
        }
      }
      if (req.headers.range) {
        extraHeaders.Range = req.headers.range;
      }

      const upstream = await fetch(targetUrl, {
        headers: extraHeaders,
        signal: AbortSignal.timeout(15000),
      });

      const rawContentType = (upstream.headers.get('content-type') || 'application/octet-stream').toLowerCase();
      const parsedTarget = new URL(targetUrl);
      const isSubtitleUrl =
        /\.vtt(\?|$)/i.test(targetUrl) ||
        /\/captions/i.test(parsedTarget.pathname) ||
        rawContentType.includes('text/vtt');
      const isM3u8Candidate =
        rawContentType.includes('mpegurl') ||
        /\.m3u8(\?|$)/i.test(targetUrl) ||
        /\/m3u8$/i.test(parsedTarget.pathname);

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
      res.status(upstream.status);

      const acceptRanges = upstream.headers.get('accept-ranges');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);

      if (isM3u8Candidate) {
        const manifest = await upstream.text();
        if (manifest.trimStart().startsWith('#EXTM3U')) {
          const hParam = typeof req.query.h === 'string' && req.query.h ? `&h=${encodeURIComponent(req.query.h)}` : '';
          const rewriteUri = (rawUri: string) => {
            const abs = new URL(rawUri, targetUrl).toString();
            return `/api/v1/proxy?url=${encodeURIComponent(abs)}${hParam}`;
          };

          const rewritten = manifest
            .split('\n')
            .map((line) => {
              const trimmed = line.trim();
              if (!trimmed) return line;
              if (trimmed.startsWith('#')) {
                return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
                  try {
                    return `URI="${rewriteUri(uri)}"`;
                  } catch {
                    return `URI="${uri}"`;
                  }
                });
              }
              try {
                return rewriteUri(trimmed);
              } catch {
                return line;
              }
            })
            .join('\n');

          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          return res.send(rewritten);
        }

        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
        return res.send(manifest);
      }

      if (isSubtitleUrl) {
        const text = await upstream.text();
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        return res.send(text);
      }

      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);

      if (upstream.body) {
        const readable = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
        readable.on('error', () => {
          if (!res.headersSent) res.sendStatus(502);
          else res.end();
        });
        return readable.pipe(res);
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.send(buf);
    } catch (error) {
      console.error('Erro em /api/v1/proxy:', error);
      return res.status(502).json({ error: 'Falha ao encaminhar mídia da Blitz API.' });
    }
  });

  // Home Feed
  app.get('/api/anime/home', async (_req: Request, res: Response) => {
    try {
      const feed = await buildAndCacheHomeFeed(false);
      res.json(feed);
    } catch (error) {
      console.error('Erro em /api/anime/home:', error);
      res.status(502).json({ error: 'Não foi possível carregar o catálogo de animes no momento.' });
    }
  });

  // Live Episode & New Anime Detector Sync Endpoint
  app.get('/api/anime/updates', async (req: Request, res: Response) => {
    try {
      const sinceRevision = Number(req.query.sinceRevision) || 0;
      const feed = await buildAndCacheHomeFeed(false);
      const currentRevision = feed.catalogRevision ?? detectorState.catalogRevision;
      const hasUpdates = sinceRevision > 0 && currentRevision > sinceRevision;
      res.json({
        catalogRevision: currentRevision,
        lastCatalogSyncAt: feed.lastCatalogSyncAt ?? detectorState.lastScanAt,
        hasUpdates,
        recentEpisodes: feed.recentEpisodes,
        newAnimes: feed.newAnimes,
      });
    } catch (error) {
      console.error('Erro em /api/anime/updates:', error);
      res.status(502).json({ error: 'Falha ao verificar atualizações de episódios e animes.' });
    }
  });

  // Catalog / Search / Genres / Releases
  app.get('/api/anime/catalog', async (req: Request, res: Response) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const genre = typeof req.query.genre === 'string' ? req.query.genre.trim() : '';
      const format = typeof req.query.format === 'string' ? req.query.format.trim() : '';
      const season = typeof req.query.season === 'string' ? req.query.season.trim() : '';
      const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const year = req.query.year ? Number(req.query.year) : undefined;
      const sort = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'POPULARITY_DESC';
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(36, Math.max(6, Number(req.query.perPage) || 24));

      const cacheKey = `catalog:${JSON.stringify({ search, genre, format, season, status, year, sort, page, perPage })}`;
      const cached = getCached<{ items: AnimeSummary[]; hasNextPage: boolean; page: number; total: number }>(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const allowedSorts = new Set([
        'TRENDING_DESC',
        'POPULARITY_DESC',
        'SCORE_DESC',
        'START_DATE_DESC',
      ]);
      const safeSort = allowedSorts.has(sort) ? sort : 'POPULARITY_DESC';

      const variables: Record<string, unknown> = {
        page,
        perPage,
        sort: [safeSort],
      };
      if (search) variables.search = search;
      if (genre) variables.genre = genre;
      if (format) variables.format = format;
      if (season) variables.season = season;
      if (status) variables.status = status;
      if (year && Number.isFinite(year)) variables.seasonYear = year;

      const query = `
        query CatalogSearch(
          $page: Int,
          $perPage: Int,
          $search: String,
          $genre: String,
          $format: MediaFormat,
          $season: MediaSeason,
          $status: MediaStatus,
          $seasonYear: Int,
          $sort: [MediaSort]
        ) {
          Page(page: $page, perPage: $perPage) {
            pageInfo {
              total
              currentPage
              hasNextPage
            }
            media(
              type: ANIME,
              isAdult: false,
              search: $search,
              genre: $genre,
              format: $format,
              season: $season,
              status: $status,
              seasonYear: $seasonYear,
              sort: $sort
            ) {
              ${SUMMARY_FIELDS}
            }
          }
        }
      `;

      const data = await queryAniList<{
        Page: {
          pageInfo: { total: number; currentPage: number; hasNextPage: boolean };
          media: RawAniListMedia[];
        };
      }>(query, variables);

      const result = {
        items: data.Page.media.map(mapMediaToSummary),
        hasNextPage: data.Page.pageInfo.hasNextPage,
        page: data.Page.pageInfo.currentPage,
        total: data.Page.pageInfo.total,
      };

      setCached(cacheKey, result, 10 * 60 * 1000);
      staleCatalogCache.set(cacheKey, result);
      res.json(result);
    } catch (error) {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const genre = typeof req.query.genre === 'string' ? req.query.genre.trim() : '';
      const format = typeof req.query.format === 'string' ? req.query.format.trim() : '';
      const season = typeof req.query.season === 'string' ? req.query.season.trim() : '';
      const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const year = req.query.year ? Number(req.query.year) : undefined;
      const sort = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'POPULARITY_DESC';
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(36, Math.max(6, Number(req.query.perPage) || 24));
      const fallbackKey = `catalog:${JSON.stringify({ search, genre, format, season, status, year, sort, page, perPage })}`;
      const stale = staleCatalogCache.get(fallbackKey);
      if (stale) {
        return res.json(stale);
      }
      console.error('Erro em /api/anime/catalog:', error);
      res.status(502).json({ error: 'Falha ao consultar o catálogo de animes.' });
    }
  });

  // Anime Detail Profile
  app.get('/api/anime/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de anime inválido.' });
      }

      const cacheKey = `anime_detail_v2:${id}`;
      const cached = getCached<AnimeDetail>(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const query = `
        query AnimeDetail($id: Int) {
          Media(id: $id, type: ANIME) {
            ${SUMMARY_FIELDS}
            streamingEpisodes { title thumbnail site }
            characters(sort: [ROLE, RELEVANCE], perPage: 12) {
              edges {
                role
                node {
                  id
                  name { full }
                  image { large }
                }
                voiceActors(language: JAPANESE, sort: RELEVANCE) {
                  id
                  name { full }
                  image { large }
                  languageV2
                }
              }
            }
            relations {
              edges {
                relationType
                node {
                  id
                  type
                  format
                  title { romaji english }
                  coverImage { large extraLarge }
                  seasonYear
                  episodes
                  isAdult
                }
              }
            }
            recommendations(sort: RATING_DESC, perPage: 12) {
              nodes {
                mediaRecommendation {
                  ${SUMMARY_FIELDS}
                }
              }
            }
          }
        }
      `;

      interface RawDetailMedia extends RawAniListMedia {
        characters?: {
          edges?: Array<{
            role: string;
            node: { id: number; name: { full: string }; image: { large: string } };
            voiceActors: Array<{ id: number; name: { full: string }; image: { large: string }; languageV2: string }>;
          }>;
        };
        relations?: {
          edges?: Array<{
            relationType: string;
            node: {
              id: number;
              type: string;
              format?: string | null;
              title: { romaji: string; english?: string | null };
              coverImage: { large?: string; extraLarge?: string };
              seasonYear?: number | null;
              episodes?: number | null;
              isAdult?: boolean;
            };
          }>;
        };
        recommendations?: {
          nodes?: Array<{ mediaRecommendation?: RawAniListMedia | null }>;
        };
      }

      const data = await queryAniList<{ Media: RawDetailMedia }>(query, { id });
      const m = data.Media;
      const summary = mapMediaToSummary(m);

      // Characters & Voice Actors
      const characters: AnimeCharacter[] = (m.characters?.edges ?? []).map((edge) => {
        const va = edge.voiceActors?.[0] ?? null;
        return {
          id: edge.node.id,
          name: edge.node.name.full,
          image: edge.node.image.large,
          role: edge.role === 'MAIN' ? 'Protagonista' : edge.role === 'SUPPORTING' ? 'Coadjuvante' : 'Recorrente',
          voiceActor: va
            ? {
                id: va.id,
                name: va.name.full,
                image: va.image.large,
                language: va.languageV2 || 'Japonês',
              }
            : null,
        };
      });

      // Seasons / Sequels / Prequels
      const seasonRelationTypes = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY']);
      const seasonsMap = new Map<number, AnimeSeasonRelation>();
      seasonsMap.set(m.id, {
        id: m.id,
        relationType: 'CURRENT',
        title: m.title.english || m.title.romaji,
        format: m.format ?? 'TV',
        seasonYear: m.seasonYear ?? null,
        episodes: m.episodes ?? null,
        coverImage:
          m.id === ONE_PIECE_ID
            ? ONE_PIECE_ELBAPH_COVER
            : m.coverImage.extraLarge || m.coverImage.large || '',
        isCurrent: true,
      });

      for (const edge of m.relations?.edges ?? []) {
        if (
          edge.node.type === 'ANIME' &&
          !edge.node.isAdult &&
          seasonRelationTypes.has(edge.relationType)
        ) {
          seasonsMap.set(edge.node.id, {
            id: edge.node.id,
            relationType: edge.relationType,
            title: edge.node.title.english || edge.node.title.romaji,
            format: edge.node.format ?? 'TV',
            seasonYear: edge.node.seasonYear ?? null,
            episodes: edge.node.episodes ?? null,
            coverImage:
              edge.node.id === ONE_PIECE_ID
                ? ONE_PIECE_ELBAPH_COVER
                : edge.node.coverImage.extraLarge || edge.node.coverImage.large || '',
            isCurrent: false,
          });
        }
      }

      const seasons = Array.from(seasonsMap.values()).sort((a, b) => {
        const yearA = a.seasonYear ?? 9999;
        const yearB = b.seasonYear ?? 9999;
        if (yearA !== yearB) return yearA - yearB;
        return a.id - b.id;
      });

      // Build Official Episode List with genuine individual episode thumbnails only
      const epMap = new Map<number, AnimeEpisode>();
      const defaultDuration = m.duration || 24;
      const defaultReleaseQuality =
        (m.seasonYear ?? 2020) >= 2008 || (m.streamingEpisodes?.length ?? 0) > 0
          ? ['1080p', '720p']
          : ['720p', '480p'];

      const resolveQualities = (epNum: number): string[] => {
        const registered = akariProvider.getRegisteredEpisodeQualities(m.id, epNum);
        return registered.length > 0 ? registered : defaultReleaseQuality;
      };

      const streamingEps = m.streamingEpisodes ?? [];
      streamingEps.forEach((se, index) => {
        const num = extractEpisodeNumber(se.title, index + 1);
        epMap.set(num, {
          number: num,
          title: cleanEpisodeTitle(se.title, num),
          thumbnail: se.thumbnail || null,
          duration: defaultDuration,
          aired: null,
          synopsis: null,
          availableQualities: resolveQualities(num),
        });
      });

      // Enrich in parallel with AniZip (TVDB/Crunchyroll screencaps) + Jikan + Kitsu official episode thumbs
      const declaredTotal = m.episodes || (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : 0);
      const shouldQueryJikan = Boolean(m.idMal && (epMap.size === 0 || epMap.size <= Math.min(declaredTotal, 100)));
      const [aniZipResult, jikanEps] = await Promise.all([
        fetchAniZipEpisodes(m.id),
        shouldQueryJikan && m.idMal ? fetchJikanEpisodes(m.idMal) : Promise.resolve(new Map<number, EpisodeEnrichment>()),
      ]);

      const aniZipEps = aniZipResult.episodes;
      for (const [epNum, info] of aniZipEps.entries()) {
        const existing = epMap.get(epNum);
        epMap.set(epNum, {
          number: epNum,
          title:
            existing?.title && !/^Episódio\s+\d+$/i.test(existing.title)
              ? existing.title
              : info.title || existing?.title || `Episódio ${epNum}`,
          thumbnail: existing?.thumbnail || info.thumbnail || null,
          duration: info.duration || existing?.duration || defaultDuration,
          aired: info.aired || existing?.aired || null,
          synopsis: info.synopsis || existing?.synopsis || null,
          availableQualities: resolveQualities(epNum),
          isFiller: existing?.isFiller,
          isRecap: existing?.isRecap,
        });
      }

      for (const [epNum, info] of jikanEps.entries()) {
        const existing = epMap.get(epNum);
        epMap.set(epNum, {
          number: epNum,
          title: existing?.title || info.title || `Episódio ${epNum}`,
          thumbnail: existing?.thumbnail || info.thumbnail || null,
          duration: existing?.duration || defaultDuration,
          aired: existing?.aired || info.aired || null,
          synopsis: existing?.synopsis || null,
          availableQualities: resolveQualities(epNum),
          isFiller: info.filler,
          isRecap: info.recap,
        });
      }

      const missingThumbAfterPrimary = Array.from(epMap.values()).filter((e) => !e.thumbnail).length;
      if (aniZipResult.kitsuId && (epMap.size === 0 || missingThumbAfterPrimary > 0)) {
        const kitsuEps = await fetchKitsuEpisodes(aniZipResult.kitsuId);
        for (const [epNum, info] of kitsuEps.entries()) {
          const existing = epMap.get(epNum);
          epMap.set(epNum, {
            number: epNum,
            title:
              existing?.title && !/^Episódio\s+\d+$/i.test(existing.title)
                ? existing.title
                : info.title || existing?.title || `Episódio ${epNum}`,
            thumbnail: existing?.thumbnail || info.thumbnail || null,
            duration: info.duration || existing?.duration || defaultDuration,
            aired: existing?.aired || info.aired || null,
            synopsis: info.synopsis || existing?.synopsis || null,
            availableQualities: resolveQualities(epNum),
            isFiller: existing?.isFiller,
            isRecap: existing?.isRecap,
          });
        }
      }

      // Ensure sequential episodes exist up to declared/aired/detected count (capped sensibly for massive long-runners)
      const detectedEpCount = detectorState.knownLatestEpisodeByAnime[String(m.id)] || 0;
      const airedCount = Math.max(
        detectedEpCount,
        m.nextAiringEpisode
          ? Math.max(1, m.nextAiringEpisode.episode - 1)
          : m.episodes || Math.max(epMap.size, m.format === 'MOVIE' ? 1 : 12)
      );
      const capCount = Math.min(Math.max(airedCount, epMap.size), 1200);

      for (let i = 1; i <= capCount; i++) {
        if (!epMap.has(i)) {
          epMap.set(i, {
            number: i,
            title: m.format === 'MOVIE' && capCount === 1 ? (m.title.english || m.title.romaji) : `Episódio ${i}`,
            thumbnail: null,
            duration: defaultDuration,
            aired: null,
            synopsis: null,
            availableQualities: resolveQualities(i),
          });
        }
      }

      // Never repeat the same generic image across multiple episodes
      const thumbCounts = new Map<string, number>();
      for (const ep of epMap.values()) {
        if (ep.thumbnail) {
          thumbCounts.set(ep.thumbnail, (thumbCounts.get(ep.thumbnail) ?? 0) + 1);
        }
      }
      for (const ep of epMap.values()) {
        if (ep.thumbnail && (thumbCounts.get(ep.thumbnail) ?? 0) > 1) {
          ep.thumbnail = null;
        }
      }

      const episodeList = Array.from(epMap.values()).sort((a, b) => a.number - b.number);

      // Recommendations
      const recommendations = (m.recommendations?.nodes ?? [])
        .map((n) => n.mediaRecommendation)
        .filter((rec): rec is RawAniListMedia => Boolean(rec && !rec.isAdult && rec.coverImage?.extraLarge))
        .map(mapMediaToSummary);

      const detail: AnimeDetail = {
        ...summary,
        characters,
        seasons,
        episodeList,
        recommendations,
        mappings: {
          anilist: m.id,
          mal: m.idMal ?? undefined,
        },
      };

      setCached(cacheKey, detail);
      staleDetailCache.set(id, detail);
      res.json(detail);
    } catch (error) {
      const id = Number(req.params.id);
      const stale = Number.isFinite(id) ? staleDetailCache.get(id) : undefined;
      if (stale) {
        return res.json(stale);
      }
      console.error('Erro em /api/anime/:id:', error);
      res.status(502).json({ error: 'Não foi possível carregar os detalhes deste anime.' });
    }
  });

  // Official Anime Character Avatars Grouped by Anime Title
  app.get('/api/avatars', async (_req: Request, res: Response) => {
    try {
      const cached = getCached<{ groups: AvatarGroup[] }>('official_avatars');
      if (cached) {
        return res.json(cached);
      }

      const query = `
        query OfficialAvatars {
          Page(page: 1, perPage: 12) {
            media(
              id_in: [151807, 113415, 101922, 154587, 21, 16498, 127230, 140960, 1735, 11061],
              type: ANIME
            ) {
              id
              title { english romaji }
              characters(sort: [ROLE, FAVOURITES_DESC], perPage: 8) {
                nodes {
                  id
                  name { full }
                  image { large }
                }
              }
            }
          }
        }
      `;

      const data = await queryAniList<{
        Page: {
          media: Array<{
            id: number;
            title: { english?: string | null; romaji: string };
            characters: {
              nodes: Array<{ id: number; name: { full: string }; image: { large: string } }>;
            };
          }>;
        };
      }>(query);

      const order = [151807, 113415, 101922, 154587, 21, 16498, 127230, 140960, 1735, 11061];
      const groups: AvatarGroup[] = data.Page.media
        .map((m) => ({
          animeId: m.id,
          animeTitle: m.title.english || m.title.romaji,
          characters: m.characters.nodes
            .filter((c) => c.image?.large && !c.image.large.includes('default.jpg'))
            .map((c) => ({
              id: c.id,
              name: c.name.full,
              image: c.image.large,
            })),
        }))
        .filter((g) => g.characters.length > 0)
        .sort((a, b) => order.indexOf(a.animeId) - order.indexOf(b.animeId));

      const result = { groups };
      setCached('official_avatars', result, 60 * 60 * 1000);
      staleAvatarsCache = result;
      res.json(result);
    } catch (error) {
      if (staleAvatarsCache) {
        return res.json(staleAvatarsCache);
      }
      console.error('Erro em /api/avatars:', error);
      res.status(502).json({ error: 'Não foi possível carregar os avatares dos personagens.' });
    }
  });

  // Auth: Register, Login, Demo
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { email, password, profileName, avatar } = req.body as {
      email?: string;
      password?: string;
      profileName?: string;
      avatar?: string;
    };
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
    }
    if (usersByEmail.has(normalizedEmail)) {
      return res.status(409).json({ error: 'Já existe uma conta cadastrada com este e-mail.' });
    }

    const randomPart = crypto.randomBytes(2).toString('hex').toUpperCase();
    const syncCode = `ORVIA-${randomPart}-BR`;
    const cleanProfileName = (profileName || normalizedEmail.split('@')[0] || 'Fã de Anime')
      .trim()
      .slice(0, 28);
    const chosenAvatar = avatar || DEFAULT_CHARACTER_AVATAR;

    const ws = createDefaultWorkspace(syncCode, cleanProfileName, chosenAvatar);
    workspaces.set(syncCode, ws);
    usersByEmail.set(normalizedEmail, {
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      syncCode,
      createdAt: new Date().toISOString(),
    });
    persistDbToDisk();

    res.json({ email: normalizedEmail, syncCode, workspace: ws });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const normalizedEmail = (email || '').trim().toLowerCase();
    const user = usersByEmail.get(normalizedEmail);
    if (!user || !password || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    const ws = getOrCreateWorkspace(user.syncCode);
    res.json({ email: user.email, syncCode: user.syncCode, workspace: ws });
  });

  app.post('/api/auth/demo', (_req: Request, res: Response) => {
    const ws = getOrCreateWorkspace('ORVIA-DEMO-BR');
    res.json({ email: 'visitante@orvia.tv', syncCode: ws.syncCode, workspace: ws });
  });

  app.post('/api/account/delete', (req: Request, res: Response) => {
    const { syncCode, email, password, confirmText } = req.body as {
      syncCode?: string;
      email?: string;
      password?: string;
      confirmText?: string;
    };

    const normalizedCode = (syncCode || '').trim().toUpperCase();
    const normalizedEmail = (email || '').trim().toLowerCase();

    if ((confirmText || '').trim().toUpperCase() !== 'EXCLUIR') {
      return res.status(400).json({ error: 'Digite EXCLUIR para confirmar a solicitação.' });
    }

    let matchedUser: StoredUser | undefined = normalizedEmail
      ? usersByEmail.get(normalizedEmail)
      : undefined;

    if (!matchedUser && normalizedCode) {
      for (const u of usersByEmail.values()) {
        if (u.syncCode === normalizedCode) {
          matchedUser = u;
          break;
        }
      }
    }

    if (matchedUser) {
      if (!password || !verifyPassword(password, matchedUser.passwordHash)) {
        return res.status(401).json({
          error: 'Senha incorreta. Informe sua senha atual para confirmar a exclusão definitiva.',
        });
      }
      usersByEmail.delete(matchedUser.email);
      workspaces.delete(matchedUser.syncCode);
    }

    if (normalizedCode) {
      workspaces.delete(normalizedCode);
    }

    writeDbSnapshotToDisk();
    return res.json({
      ok: true,
      deleted: true,
      message: 'Conta, perfis e dados vinculados excluídos permanentemente.',
    });
  });

  // Account & Cross-Device Continuity Endpoints
  app.get('/api/account/:syncCode', (req: Request, res: Response) => {
    const ws = getOrCreateWorkspace(String(req.params.syncCode || 'AKARI-DEMO-BR'));
    res.json(ws);
  });

  app.post('/api/account/:syncCode/profile/select', (req: Request, res: Response) => {
    const ws = getOrCreateWorkspace(String(req.params.syncCode || 'AKARI-DEMO-BR'));
    const { profileId } = req.body as { profileId?: string };
    if (profileId && ws.profiles.some((p) => p.id === profileId)) {
      ws.activeProfileId = profileId;
      ws.updatedAt = new Date().toISOString();
      persistDbToDisk();
    }
    res.json(ws);
  });

  app.post('/api/account/:syncCode/profile', (req: Request, res: Response) => {
    const ws = getOrCreateWorkspace(String(req.params.syncCode || 'AKARI-DEMO-BR'));
    const body = req.body as Partial<UserProfile>;
    const cleanName = (body.name || '').trim().slice(0, 28);
    if (!cleanName) {
      return res.status(400).json({ error: 'Informe um nome para o perfil.' });
    }

    if (body.id) {
      const existing = ws.profiles.find((p) => p.id === body.id);
      if (existing) {
        existing.name = cleanName;
        if (body.avatar) existing.avatar = body.avatar;
        if (body.preferredAudio === 'SUB' || body.preferredAudio === 'DUB') {
          existing.preferredAudio = body.preferredAudio;
        }
        if (body.preferredQuality === '4K' || body.preferredQuality === '1080p' || body.preferredQuality === '720p') {
          existing.preferredQuality = body.preferredQuality;
        }
        if (typeof body.kidsMode === 'boolean') {
          existing.kidsMode = body.kidsMode;
        }
      }
    } else {
      if (ws.profiles.length >= 6) {
        return res.status(400).json({ error: 'Limite de 6 perfis por conta atingido.' });
      }
      const id = `perfil-${Date.now().toString(36)}`;
      const newProfile: UserProfile = {
        id,
        name: cleanName,
        avatar: body.avatar || DEFAULT_CHARACTER_AVATAR,
        preferredAudio: body.preferredAudio === 'DUB' ? 'DUB' : 'SUB',
        preferredQuality:
          body.preferredQuality === '4K' || body.preferredQuality === '720p' ? body.preferredQuality : '1080p',
        kidsMode: Boolean(body.kidsMode),
        createdAt: new Date().toISOString(),
      };
      ws.profiles.push(newProfile);
      ws.dataByProfile[id] = createEmptyProfileData();
      ws.activeProfileId = id;
    }

    ws.updatedAt = new Date().toISOString();
    persistDbToDisk();
    res.json(ws);
  });

  app.delete('/api/account/:syncCode/profile/:profileId', (req: Request, res: Response) => {
    const ws = getOrCreateWorkspace(String(req.params.syncCode || 'AKARI-DEMO-BR'));
    const profileId = String(req.params.profileId);
    if (ws.profiles.length <= 1) {
      return res.status(400).json({ error: 'É necessário manter ao menos um perfil ativo.' });
    }
    ws.profiles = ws.profiles.filter((p) => p.id !== profileId);
    delete ws.dataByProfile[profileId];
    if (ws.activeProfileId === profileId) {
      ws.activeProfileId = ws.profiles[0].id;
    }
    ws.updatedAt = new Date().toISOString();
    persistDbToDisk();
    res.json(ws);
  });

  app.post('/api/account/:syncCode/mylist', (req: Request, res: Response) => {
    const ws = getOrCreateWorkspace(String(req.params.syncCode || 'AKARI-DEMO-BR'));
    const { anime } = req.body as { anime?: AnimeSummary };
    if (!anime || !anime.id) {
      return res.status(400).json({ error: 'Dados de anime inválidos.' });
    }
    const pData = ws.dataByProfile[ws.activeProfileId] ?? createEmptyProfileData();
    const exists = pData.favorites.some((f) => f.id === anime.id);
    if (exists) {
      pData.favorites = pData.favorites.filter((f) => f.id !== anime.id);
    } else {
      pData.favorites = [anime, ...pData.favorites];
    }
    ws.dataByProfile[ws.activeProfileId] = pData;
    ws.updatedAt = new Date().toISOString();
    persistDbToDisk();
    res.json(ws);
  });

  app.post('/api/account/:syncCode/progress', (req: Request, res: Response) => {
    const ws = getOrCreateWorkspace(String(req.params.syncCode || 'AKARI-DEMO-BR'));
    const body = req.body as {
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
    };

    if (!body.animeId || !body.episodeNumber) {
      return res.status(400).json({ error: 'Progresso inválido.' });
    }

    const pData = ws.dataByProfile[ws.activeProfileId] ?? createEmptyProfileData();
    const duration = Math.max(60, body.duration || 1440);
    const currentTime = Math.min(duration, Math.max(0, body.currentTime || 0));
    const completed = currentTime / duration >= 0.92;
    const now = new Date().toISOString();

    pData.progressByAnime[String(body.animeId)] = {
      animeId: body.animeId,
      animeTitle: body.animeTitle,
      coverImage: body.coverImage,
      bannerImage: body.bannerImage ?? null,
      episodeNumber: body.episodeNumber,
      episodeTitle: body.episodeTitle,
      thumbnail: body.thumbnail,
      currentTime,
      duration,
      completed,
      genres: body.genres ?? [],
      updatedAt: now,
    };

    pData.episodeProgress[`${body.animeId}:${body.episodeNumber}`] = {
      currentTime,
      duration,
      completed,
      updatedAt: now,
    };

    const existingIdx = pData.history.findIndex(
      (h) => h.animeId === body.animeId && h.episodeNumber === body.episodeNumber
    );
    const entry = {
      id: `${body.animeId}-${body.episodeNumber}`,
      animeId: body.animeId,
      animeTitle: body.animeTitle,
      coverImage: body.coverImage,
      episodeNumber: body.episodeNumber,
      episodeTitle: body.episodeTitle,
      thumbnail: body.thumbnail,
      watchedSeconds: currentTime,
      durationSeconds: duration,
      watchedAt: now,
    };
    if (existingIdx >= 0) {
      pData.history.splice(existingIdx, 1);
    }
    pData.history.unshift(entry);
    pData.history = pData.history.slice(0, 60);

    ws.dataByProfile[ws.activeProfileId] = pData;
    ws.updatedAt = now;
    persistDbToDisk();
    res.json(ws);
  });

  app.delete('/api/account/:syncCode/progress/:animeId', (req: Request, res: Response) => {
    const ws = getOrCreateWorkspace(String(req.params.syncCode || 'AKARI-DEMO-BR'));
    const pData = ws.dataByProfile[ws.activeProfileId];
    if (pData) {
      delete pData.progressByAnime[String(req.params.animeId)];
      ws.updatedAt = new Date().toISOString();
      persistDbToDisk();
    }
    res.json(ws);
  });

  app.delete('/api/account/:syncCode/history', (req: Request, res: Response) => {
    const ws = getOrCreateWorkspace(String(req.params.syncCode || 'AKARI-DEMO-BR'));
    const pData = ws.dataByProfile[ws.activeProfileId];
    if (pData) {
      pData.history = [];
      ws.updatedAt = new Date().toISOString();
      persistDbToDisk();
    }
    res.json(ws);
  });

  // Vite Middleware (dev) or Static Dist (prod)
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ORVIA streaming server rodando em http://0.0.0.0:${PORT}`);

    // Initial background scan shortly after startup so newly aired episodes & new animes are ready
    const bootWarmTimer = setTimeout(() => {
      buildAndCacheHomeFeed(false).catch((err) => {
        console.warn('Falha na varredura inicial de episódios/animes:', err);
      });
    }, 4000);
    bootWarmTimer.unref();

    // Automatic background episode & new anime detector (every 3 minutes)
    const syncTimer = setInterval(() => {
      buildAndCacheHomeFeed(true).catch((err) => {
        console.warn('Falha na detecção automática de episódios e animes:', err);
      });
    }, DETECTOR_SYNC_INTERVAL_MS);
    syncTimer.unref();
  });
}

startServer();
