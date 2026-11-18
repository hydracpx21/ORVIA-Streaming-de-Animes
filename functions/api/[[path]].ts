interface PagesEnv {
  AKARI_BACKEND_URL?: string;
  ORVIA_BACKEND_URL?: string;
  BLITZ_API_URL?: string;
  BLITZ_AUTH_TOKEN?: string;
  BLITZ_DEFAULT_PROVIDER?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
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

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const ANIME_PARADISE_API = 'https://api.animeparadise.moe';
const ANIME_PARADISE_STREAM = 'https://stream.animeparadise.moe';
const DEFAULT_CHARACTER_AVATAR =
  'https://s4.anilist.co/file/anilistcdn/character/large/b40-MNypXsxSRb1R.png';
const ONE_PIECE_ID = 21;
const ONE_PIECE_ELBAPH_COVER = '/src/assets/images/one_piece_elbaph_2026.jpg';

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

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders,
    },
  });
}

function getEdgeCache(): Cache | null {
  try {
    const c = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
    return c?.default ?? null;
  } catch {
    return null;
  }
}

async function queryAniList<T>(
  query: string,
  variables: Record<string, unknown> = {},
  attempt = 0
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if ((res.status === 429 || res.status === 503) && attempt < 1) {
      const retryAfterSec = Number(res.headers.get('retry-after')) || 1;
      const waitMs = Math.min(1500, Math.max(400, retryAfterSec * 1000));
      clearTimeout(timer);
      await new Promise((r) => setTimeout(r, waitMs));
      return queryAniList<T>(query, variables, attempt + 1);
    }
    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) throw new Error(json.errors[0].message);
    if (!json.data) throw new Error('Resposta vazia da API de animes');
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

function mapMediaToSummary(m: RawAniListMedia) {
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

function extractEpisodeNumber(title: string, fallbackIndex: number): number {
  const match = title.match(/(?:Episode|Ep\.?|Episódio)\s*(\d+)/i);
  return match ? Number(match[1]) : fallbackIndex;
}

function cleanEpisodeTitle(raw: string, epNumber: number): string {
  const cleaned = raw.replace(/^(?:Episode|Ep\.?|Episódio)\s*\d+\s*[-–:]\s*/i, '').trim();
  return cleaned || `Episódio ${epNumber}`;
}

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

function buildWorkspace(syncCode: string, profileName = 'Lucas', avatar = DEFAULT_CHARACTER_AVATAR) {
  const normalized = (syncCode || 'ORVIA-DEMO-BR').trim().toUpperCase();
  const defaultProfileId = 'perfil-principal';
  return {
    syncCode: normalized,
    activeProfileId: defaultProfileId,
    profiles: [
      {
        id: defaultProfileId,
        name: profileName,
        avatar,
        preferredAudio: 'SUB' as const,
        preferredQuality: '1080p' as const,
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

function deterministicSyncCode(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(4, '0').slice(0, 4);
  return `ORVIA-${hex}-BR`;
}

async function buildHomeFeed(): Promise<Record<string, unknown>> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStartSec = nowSec - 72 * 3600;
  const tomorrowInt = toAniListFuzzyDateInt(new Date(Date.now() + 24 * 3600 * 1000));
  const lookbackDateInt = toAniListFuzzyDateInt(new Date(Date.now() - 90 * 24 * 3600 * 1000));

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

  const recentEpisodes: Array<Record<string, unknown>> = [];
  const seenKeys = new Set<string>();
  const newPremiereFromSchedules: ReturnType<typeof mapMediaToSummary>[] = [];
  const seenNewIds = new Set<number>();

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
    if (sched.episode === 1 && !seenNewIds.has(m.id)) {
      seenNewIds.add(m.id);
      newPremiereFromSchedules.push(summary);
    }

    const epNum = Math.max(1, sched.episode);
    const dropKey = `${m.id}:${epNum}`;
    if (seenKeys.has(dropKey)) continue;

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

    seenKeys.add(dropKey);
    recentEpisodes.push({
      anime: summary,
      episodeNumber: epNum,
      episodeTitle: matchedStreamEp
        ? cleanEpisodeTitle(matchedStreamEp.title, epNum)
        : `Episódio ${epNum}`,
      thumbnail: thumb,
      airedLabel: formatAiredRelativePt(sched.airingAt),
      airingAt: sched.airingAt,
      isNewDrop: nowSec - sched.airingAt < 24 * 3600,
    });
    if (recentEpisodes.length >= 12) break;
  }

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
      if (!seenKeys.has(dropKey) && latest.thumbnail) {
        seenKeys.add(dropKey);
        recentEpisodes.push({
          anime: summary,
          episodeNumber: highestNum,
          episodeTitle: cleanEpisodeTitle(latest.title, highestNum),
          thumbnail: latest.thumbnail,
          airedLabel: m.nextAiringEpisode ? `Ep. ${highestNum} disponível` : 'Recém-adicionado',
          isNewDrop: false,
        });
      }
    } else if (m.bannerImage || m.trailer?.id) {
      const epNum = m.nextAiringEpisode ? Math.max(1, m.nextAiringEpisode.episode - 1) : 1;
      const dropKey = `${m.id}:${epNum}`;
      if (!seenKeys.has(dropKey)) {
        const thumb =
          m.bannerImage ||
          (m.trailer?.site === 'youtube' ? `https://i.ytimg.com/vi/${m.trailer.id}/maxresdefault.jpg` : '');
        if (thumb) {
          seenKeys.add(dropKey);
          recentEpisodes.push({
            anime: summary,
            episodeNumber: epNum,
            episodeTitle: `Episódio ${epNum}`,
            thumbnail: thumb,
            airedLabel: 'Temporada atual',
            isNewDrop: false,
          });
        }
      }
    }
  }

  const newAnimes = [...newPremiereFromSchedules];
  for (const m of data.newPremieres?.media ?? []) {
    if (!m || m.isAdult || seenNewIds.has(m.id)) continue;
    if (m.countryOfOrigin && m.countryOfOrigin !== 'JP') continue;
    if (!m.coverImage?.extraLarge && !m.coverImage?.large) continue;
    if ((m.popularity ?? 0) < 300) continue;
    seenNewIds.add(m.id);
    newAnimes.push(mapMediaToSummary(m));
    if (newAnimes.length >= 18) break;
  }

  const nowIso = new Date().toISOString();
  return {
    hero,
    trending: data.trending.media.map(mapMediaToSummary),
    seasonal: data.seasonal.media.map(mapMediaToSummary),
    popular: data.popular.media.map(mapMediaToSummary),
    topRated: data.topRated.media.map(mapMediaToSummary),
    recentEpisodes,
    newAnimes,
    catalogRevision: Math.floor(Date.now() / (5 * 60 * 1000)),
    lastCatalogSyncAt: nowIso,
  };
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

async function fetchAniZipEpisodesEdge(anilistId: number) {
  const episodes = new Map<number, EpisodeEnrichment>();
  let kitsuId: number | undefined;
  try {
    const res = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4500),
    });
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
    if (Number.isFinite(rawKitsu) && rawKitsu > 0) kitsuId = rawKitsu;

    for (const [key, ep] of Object.entries(json.episodes ?? {})) {
      if (!/^\d+$/.test(key)) continue;
      const num = Number(key);
      if (!Number.isFinite(num) || num <= 0) continue;
      const thumb = ep.image && /^https?:\/\//i.test(ep.image) ? ep.image : undefined;
      const durCandidate = ep.runtime || ep.length;
      episodes.set(num, {
        title: ep.title?.['pt-BR'] || ep.title?.en || ep.title?.['x-jat'] || undefined,
        thumbnail: thumb,
        duration:
          typeof durCandidate === 'number' && durCandidate > 0 && durCandidate < 300
            ? Math.round(durCandidate)
            : undefined,
        aired: ep.airDate || ep.airdate ? String(ep.airDate || ep.airdate).slice(0, 10) : undefined,
        synopsis: ep.overview || ep.summary ? String(ep.overview || ep.summary).trim() : undefined,
      });
    }
  } catch {
    // Graceful enrichment fallback
  }
  return { episodes, kitsuId };
}

async function fetchKitsuEpisodesEdge(kitsuId?: number): Promise<Map<number, EpisodeEnrichment>> {
  const result = new Map<number, EpisodeEnrichment>();
  if (!kitsuId) return result;
  try {
    const res = await fetch(
      `https://kitsu.io/api/edge/anime/${kitsuId}/episodes?page%5Blimit%5D=20&page%5Boffset%5D=0`,
      { headers: { Accept: 'application/vnd.api+json' }, signal: AbortSignal.timeout(4500) }
    );
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
      const thumb = attrs.thumbnail?.original || attrs.thumbnail?.large || attrs.thumbnail?.medium;
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
  } catch {
    // Graceful enrichment fallback
  }
  return result;
}

async function fetchJikanEpisodesEdge(malId: number): Promise<Map<number, EpisodeEnrichment>> {
  const result = new Map<number, EpisodeEnrichment>();
  if (!malId) return result;
  try {
    const [videosRes, epsRes] = await Promise.allSettled([
      fetch(`https://api.jikan.moe/v4/anime/${malId}/videos/episodes`, {
        signal: AbortSignal.timeout(4500),
      }),
      fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=1`, {
        signal: AbortSignal.timeout(4500),
      }),
    ]);

    if (videosRes.status === 'fulfilled' && videosRes.value.ok) {
      const vJson = (await videosRes.value.json()) as {
        data?: Array<{
          mal_id?: number;
          episode?: string;
          title?: string;
          images?: { jpg?: { image_url?: string } };
        }>;
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
        data?: Array<{
          mal_id: number;
          title?: string;
          aired?: string;
          filler?: boolean;
          recap?: boolean;
        }>;
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

function normalizeTitleTokens(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveAnimeStreamEdge(
  anilistIdParam: string,
  episodeNumber: number,
  language: string,
  env: PagesEnv
) {
  // 1. Check external BLITZ_API_URL if configured
  const blitzBase = (env.BLITZ_API_URL || '').trim().replace(/\/api\/v1\/?$/i, '').replace(/\/+$/, '');
  if (blitzBase) {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (env.BLITZ_AUTH_TOKEN) headers.Authorization = `Bearer ${env.BLITZ_AUTH_TOKEN}`;
      const sp = new URLSearchParams({
        id: anilistIdParam,
        episode: String(episodeNumber),
        language,
        provider: (env.BLITZ_DEFAULT_PROVIDER || 'animeparadise').trim(),
        meta: 'anilist',
      });
      const res = await fetch(`${blitzBase}/api/v1/meta/stream?${sp.toString()}`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const payload = (await res.json()) as {
          stream?: { streams?: Array<Record<string, unknown>> };
          streams?: Array<Record<string, unknown>>;
        };
        const rawStreams = payload.stream?.streams ?? payload.streams ?? [];
        if (rawStreams.length > 0) {
          const wrapped = rawStreams.map((s) => {
            const url = String(s.sourceUrl || '');
            const hdrs = s.headers ? `&h=${encodeURIComponent(JSON.stringify(s.headers))}` : '';
            const subs = Array.isArray(s.subtitles)
              ? (s.subtitles as Array<Record<string, unknown>>)
                  .filter((sub) => typeof sub.url === 'string')
                  .map((sub) => ({
                    language: String(sub.language || 'pt-BR'),
                    label: String(sub.label || sub.language || 'Legenda'),
                    format: sub.format,
                    url: `/api/v1/proxy?url=${encodeURIComponent(String(sub.url))}${hdrs}`,
                  }))
              : undefined;
            return {
              sourceUrl: `/api/v1/proxy?url=${encodeURIComponent(url)}${hdrs}`,
              isHLS: typeof s.isHLS === 'boolean' ? s.isHLS : /m3u8/i.test(url),
              quality: String(s.quality || 'auto'),
              language: String(s.language || language),
              subtitles: subs,
            };
          });
          return {
            authorized: true,
            status: 'OK',
            provider: env.BLITZ_DEFAULT_PROVIDER || 'animeparadise',
            streams: wrapped,
          };
        }
      }
    } catch {
      // Fallback cleanly to built-in edge provider
    }
  }

  // 2. Built-in Web Standard AnimeParadise resolver via AniList title matching
  const numericId = Number(anilistIdParam.replace(/^anilist:/i, ''));
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return {
      authorized: false,
      status: 'UNAVAILABLE',
      provider: 'animeparadise',
      message: 'Identificador de anime inválido.',
      streams: [],
    };
  }

  const metaData = await queryAniList<{
    Media?: {
      title: { romaji: string; english?: string | null };
      seasonYear?: number | null;
    };
  }>(
    `query StreamTitle($id: Int) { Media(id: $id, type: ANIME) { title { romaji english } seasonYear } }`,
    { id: numericId }
  );

  const candidates = [metaData.Media?.title.english, metaData.Media?.title.romaji].filter(
    (t): t is string => Boolean(t && t.trim())
  );

  for (const queryTitle of candidates) {
    try {
      const searchRes = await fetch(
        `${ANIME_PARADISE_API}/search?q=${encodeURIComponent(queryTitle)}&limit=20`,
        { signal: AbortSignal.timeout(7000) }
      );
      if (!searchRes.ok) continue;
      const searchJson = (await searchRes.json()) as {
        data?: Array<{
          _id: string;
          title?: string;
          alternativeTitle?: { english?: string };
        }>;
      };
      const results = searchJson.data ?? [];
      if (results.length === 0) continue;

      const needle = normalizeTitleTokens(queryTitle);
      const bestMatch =
        results.find((item) => {
          const eng = normalizeTitleTokens(item.alternativeTitle?.english || '');
          const rom = normalizeTitleTokens(item.title || '');
          return eng === needle || rom === needle;
        }) || results[0];

      const epListRes = await fetch(
        `${ANIME_PARADISE_API}/anime/${encodeURIComponent(bestMatch._id)}/episode`,
        { signal: AbortSignal.timeout(7000) }
      );
      if (!epListRes.ok) continue;
      const epListJson = (await epListRes.json()) as {
        data?: Array<{ uid: string; number: string | number; title?: string }>;
      };
      const episodes = epListJson.data ?? [];
      const targetEp = episodes.find((e) => Number(e.number) === episodeNumber);
      if (!targetEp) continue;

      const epDetailRes = await fetch(
        `${ANIME_PARADISE_API}/ep/${encodeURIComponent(targetEp.uid)}?origin=${encodeURIComponent(bestMatch._id)}`,
        { signal: AbortSignal.timeout(7000) }
      );
      if (!epDetailRes.ok) continue;
      const epDetailJson = (await epDetailRes.json()) as {
        data?: {
          episode?: {
            streamLink?: string;
            subData?: Array<{ url?: string; src?: string; label?: string; language?: string; type?: string }>;
          };
        };
      };
      const epPayload = epDetailJson.data?.episode;
      if (!epPayload?.streamLink) continue;

      const hQuery = `&h=${encodeURIComponent(JSON.stringify({ Referer: 'https://animeparadise.moe/' }))}`;
      const rawStreamUrl = `${ANIME_PARADISE_STREAM}/m3u8?url=${encodeURIComponent(epPayload.streamLink)}`;
      const subtitles = (epPayload.subData ?? [])
        .map((sub) => {
          const u = sub.url || sub.src;
          if (!u || !/^https?:\/\//i.test(u)) return null;
          const label = (sub.label || sub.language || 'Legenda').trim();
          return {
            language: sub.language || label.slice(0, 2).toLowerCase(),
            label,
            format: sub.type,
            url: `/api/v1/proxy?url=${encodeURIComponent(u)}${hQuery}`,
          };
        })
        .filter((s): s is NonNullable<typeof s> => Boolean(s));

      return {
        authorized: true,
        status: 'OK',
        provider: 'animeparadise',
        streams: [
          {
            sourceUrl: `/api/v1/proxy?url=${encodeURIComponent(rawStreamUrl)}${hQuery}`,
            isHLS: true,
            quality: 'auto',
            language: 'sub',
            subtitles: subtitles.length > 0 ? subtitles : undefined,
          },
        ],
      };
    } catch {
      // Try next title candidate
    }
  }

  return {
    authorized: false,
    status: 'UNAVAILABLE',
    provider: 'animeparadise',
    message: 'Nenhuma fonte de vídeo disponível para este episódio no momento.',
    streams: [],
  };
}

async function handleProxyRequest(request: Request, url: URL): Promise<Response> {
  if (request.method.toUpperCase() === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
      },
    });
  }

  const targetUrl = (url.searchParams.get('url') || '').trim();
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return jsonResponse({ error: 'URL inválida.' }, 400);
  }

  try {
    const extraHeaders: Record<string, string> = {};
    const hRaw = url.searchParams.get('h');
    if (hRaw) {
      const parsed = JSON.parse(hRaw) as Record<string, string>;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && !['host', 'authorization', 'cookie'].includes(k.toLowerCase())) {
          extraHeaders[k] = v;
        }
      }
    }
    const range = request.headers.get('range');
    if (range) extraHeaders.Range = range;

    const upstream = await fetch(targetUrl, {
      headers: extraHeaders,
      signal: AbortSignal.timeout(15000),
    });

    const rawCt = (upstream.headers.get('content-type') || 'application/octet-stream').toLowerCase();
    const parsedTarget = new URL(targetUrl);
    const isSub =
      /\.vtt(\?|$)/i.test(targetUrl) ||
      /\/captions/i.test(parsedTarget.pathname) ||
      rawCt.includes('text/vtt');
    const isM3u8 =
      rawCt.includes('mpegurl') ||
      /\.m3u8(\?|$)/i.test(targetUrl) ||
      /\/m3u8$/i.test(parsedTarget.pathname);

    const outHeaders = new Headers();
    outHeaders.set('Access-Control-Allow-Origin', '*');
    outHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) outHeaders.set('Accept-Ranges', acceptRanges);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) outHeaders.set('Content-Range', contentRange);

    if (isM3u8) {
      const manifest = await upstream.text();
      if (manifest.trimStart().startsWith('#EXTM3U')) {
        const hParam = hRaw ? `&h=${encodeURIComponent(hRaw)}` : '';
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

        outHeaders.set('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        outHeaders.set('Cache-Control', 'no-store');
        return new Response(rewritten, { status: upstream.status, headers: outHeaders });
      }
      outHeaders.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
      return new Response(manifest, { status: upstream.status, headers: outHeaders });
    }

    if (isSub) {
      outHeaders.set('Content-Type', 'text/vtt; charset=utf-8');
      return new Response(await upstream.text(), { status: upstream.status, headers: outHeaders });
    }

    outHeaders.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) outHeaders.set('Content-Length', contentLength);

    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
  } catch {
    return jsonResponse({ error: 'Falha ao encaminhar mídia da Blitz API.' }, 502);
  }
}

export async function onRequest(context: {
  request: Request;
  env: PagesEnv;
}): Promise<Response> {
  const { request, env } = context;
  const incomingUrl = new URL(request.url);
  const path = incomingUrl.pathname;
  const method = request.method.toUpperCase();

  // Optional external Node backend override when configured and healthy
  const backendBase = (env.ORVIA_BACKEND_URL || env.AKARI_BACKEND_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (backendBase) {
    try {
      const targetUrl = `${backendBase}${incomingUrl.pathname}${incomingUrl.search}`;
      const headers = new Headers(request.headers);
      headers.delete('host');
      headers.set('x-forwarded-host', incomingUrl.host);
      headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));
      const hasBody = method !== 'GET' && method !== 'HEAD';
      const upstream = await fetch(targetUrl, {
        method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(5500),
      });
      const ct = upstream.headers.get('content-type') || '';
      if (upstream.status < 500 && !ct.includes('text/html')) {
        const respHeaders = new Headers(upstream.headers);
        respHeaders.set('Access-Control-Allow-Origin', '*');
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: respHeaders,
        });
      }
    } catch {
      // Fall through cleanly to native Edge runtime
    }
  }

  // ---- Built-in Cloudflare Pages Edge API ----
  if (path === '/api/health') {
    return jsonResponse({
      ok: true,
      service: 'orvia-cloudflare-edge',
      mode: 'edge-standalone',
      blitz: { version: '2.5.0', defaultProvider: 'animeparadise' },
    });
  }

  if (path === '/api/app/release') {
    if (env.ASSETS) {
      try {
        const releaseAsset = await env.ASSETS.fetch(new Request(`${incomingUrl.origin}/release.json`));
        if (releaseAsset.ok) {
          const data = await releaseAsset.json();
          return jsonResponse(data, 200, {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          });
        }
      } catch {
        // Fallback below
      }
    }
    return jsonResponse(
      {
        version: '1.0.0',
        buildId: 'cloudflare-edge',
        publishedAt: new Date().toISOString(),
        channel: 'official',
      },
      200,
      { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    );
  }

  if (path === '/api/v1/proxy') {
    return handleProxyRequest(request, incomingUrl);
  }

  if (path === '/api/v1/meta/stream') {
    const id = (incomingUrl.searchParams.get('id') || '').trim();
    const episode = Math.max(1, Number(incomingUrl.searchParams.get('episode')) || 1);
    const language = (incomingUrl.searchParams.get('language') || 'sub').trim().toLowerCase();
    if (!id) return jsonResponse({ error: 'Parâmetro "id" obrigatório.' }, 400);

    try {
      const payload = await resolveAnimeStreamEdge(id, episode, language, env);
      return jsonResponse(payload, 200, { 'Cache-Control': 'no-store' });
    } catch {
      return jsonResponse(
        {
          authorized: false,
          status: 'UNAVAILABLE',
          provider: 'animeparadise',
          message: 'Nenhuma fonte de vídeo disponível para este episódio no momento.',
          streams: [],
        },
        200,
        { 'Cache-Control': 'no-store' }
      );
    }
  }

  const edgeCache = getEdgeCache();

  if (path === '/api/anime/home' || path === '/api/anime/updates') {
    const cacheReq = new Request(`${incomingUrl.origin}/api/anime/home`);
    if (edgeCache) {
      const cached = await edgeCache.match(cacheReq);
      if (cached) {
        if (path === '/api/anime/updates') {
          const feed = (await cached.json()) as {
            catalogRevision?: number;
            lastCatalogSyncAt?: string;
            recentEpisodes?: unknown[];
            newAnimes?: unknown[];
          };
          const since = Number(incomingUrl.searchParams.get('sinceRevision')) || 0;
          const rev = feed.catalogRevision || 1;
          return jsonResponse(
            {
              catalogRevision: rev,
              lastCatalogSyncAt: feed.lastCatalogSyncAt || new Date().toISOString(),
              hasUpdates: since > 0 && rev > since,
              recentEpisodes: feed.recentEpisodes || [],
              newAnimes: feed.newAnimes || [],
            },
            200,
            { 'Cache-Control': 'no-store' }
          );
        }
        return cached;
      }
    }

    try {
      const feed = await buildHomeFeed();
      const resp = jsonResponse(feed, 200, { 'Cache-Control': 'public, max-age=300' });
      if (edgeCache) await edgeCache.put(cacheReq, resp.clone());

      if (path === '/api/anime/updates') {
        const since = Number(incomingUrl.searchParams.get('sinceRevision')) || 0;
        const rev = Number(feed.catalogRevision) || 1;
        return jsonResponse(
          {
            catalogRevision: rev,
            lastCatalogSyncAt: feed.lastCatalogSyncAt,
            hasUpdates: since > 0 && rev > since,
            recentEpisodes: feed.recentEpisodes,
            newAnimes: feed.newAnimes,
          },
          200,
          { 'Cache-Control': 'no-store' }
        );
      }
      return resp;
    } catch {
      return jsonResponse({ error: 'Falha ao carregar catálogo inicial.' }, 502);
    }
  }

  if (path === '/api/anime/catalog') {
    const cacheReq = new Request(incomingUrl.toString());
    if (edgeCache) {
      const cached = await edgeCache.match(cacheReq);
      if (cached) return cached;
    }

    try {
      const search = (incomingUrl.searchParams.get('search') || '').trim();
      const genre = (incomingUrl.searchParams.get('genre') || '').trim();
      const format = (incomingUrl.searchParams.get('format') || '').trim();
      const season = (incomingUrl.searchParams.get('season') || '').trim();
      const status = (incomingUrl.searchParams.get('status') || '').trim();
      const year = incomingUrl.searchParams.get('year') ? Number(incomingUrl.searchParams.get('year')) : undefined;
      const sort = (incomingUrl.searchParams.get('sort') || 'POPULARITY_DESC').trim();
      const page = Math.max(1, Number(incomingUrl.searchParams.get('page')) || 1);
      const perPage = Math.min(36, Math.max(6, Number(incomingUrl.searchParams.get('perPage')) || 24));

      const allowedSorts = new Set(['TRENDING_DESC', 'POPULARITY_DESC', 'SCORE_DESC', 'START_DATE_DESC']);
      const safeSort = allowedSorts.has(sort) ? sort : 'POPULARITY_DESC';

      const variables: Record<string, unknown> = { page, perPage, sort: [safeSort] };
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
            pageInfo { total currentPage hasNextPage }
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

      const resp = jsonResponse(
        {
          items: data.Page.media.map(mapMediaToSummary),
          hasNextPage: data.Page.pageInfo.hasNextPage,
          page: data.Page.pageInfo.currentPage,
          total: data.Page.pageInfo.total,
        },
        200,
        { 'Cache-Control': 'public, max-age=300' }
      );
      if (edgeCache) await edgeCache.put(cacheReq, resp.clone());
      return resp;
    } catch {
      return jsonResponse({ error: 'Falha ao consultar o catálogo de animes.' }, 502);
    }
  }

  const animeDetailMatch = path.match(/^\/api\/anime\/(\d+)$/);
  if (animeDetailMatch) {
    const id = Number(animeDetailMatch[1]);
    const cacheReq = new Request(`${incomingUrl.origin}/api/anime/${id}`);
    if (edgeCache) {
      const cached = await edgeCache.match(cacheReq);
      if (cached) return cached;
    }

    try {
      const query = `
        query AnimeDetail($id: Int) {
          Media(id: $id, type: ANIME) {
            ${SUMMARY_FIELDS}
            streamingEpisodes { title thumbnail site }
            characters(sort: [ROLE, RELEVANCE], perPage: 12) {
              edges {
                role
                node { id name { full } image { large } }
                voiceActors(language: JAPANESE, sort: RELEVANCE) {
                  id name { full } image { large } languageV2
                }
              }
            }
            relations {
              edges {
                relationType
                node {
                  id type format
                  title { romaji english }
                  coverImage { large extraLarge }
                  seasonYear episodes isAdult
                }
              }
            }
            recommendations(sort: RATING_DESC, perPage: 12) {
              nodes {
                mediaRecommendation { ${SUMMARY_FIELDS} }
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
            voiceActors: Array<{
              id: number;
              name: { full: string };
              image: { large: string };
              languageV2: string;
            }>;
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
        recommendations?: { nodes?: Array<{ mediaRecommendation?: RawAniListMedia | null }> };
      }

      const data = await queryAniList<{ Media: RawDetailMedia }>(query, { id });
      const m = data.Media;
      const summary = mapMediaToSummary(m);

      const characters = (m.characters?.edges ?? []).map((edge) => {
        const va = edge.voiceActors?.[0] ?? null;
        return {
          id: edge.node.id,
          name: edge.node.name.full,
          image: edge.node.image.large,
          role:
            edge.role === 'MAIN'
              ? 'Protagonista'
              : edge.role === 'SUPPORTING'
                ? 'Coadjuvante'
                : 'Recorrente',
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

      const seasonRelationTypes = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY']);
      const seasonsMap = new Map<number, Record<string, unknown>>();
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
        if (edge.node.type === 'ANIME' && !edge.node.isAdult && seasonRelationTypes.has(edge.relationType)) {
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

      const seasons = Array.from(seasonsMap.values()).sort(
        (a, b) => Number(a.seasonYear ?? 9999) - Number(b.seasonYear ?? 9999) || Number(a.id) - Number(b.id)
      );

      interface EpEntry {
        number: number;
        title: string;
        thumbnail: string | null;
        duration: number;
        aired: string | null;
        synopsis: string | null;
        availableQualities: string[];
        isFiller?: boolean;
        isRecap?: boolean;
      }

      const epMap = new Map<number, EpEntry>();
      const defaultDuration = m.duration || 24;
      const defaultQualities =
        (m.seasonYear ?? 2020) >= 2008 || (m.streamingEpisodes?.length ?? 0) > 0
          ? ['1080p', '720p']
          : ['720p', '480p'];

      (m.streamingEpisodes ?? []).forEach((se, index) => {
        const num = extractEpisodeNumber(se.title, index + 1);
        epMap.set(num, {
          number: num,
          title: cleanEpisodeTitle(se.title, num),
          thumbnail: se.thumbnail || null,
          duration: defaultDuration,
          aired: null,
          synopsis: null,
          availableQualities: defaultQualities,
        });
      });

      const declaredTotal = m.episodes || (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : 0);
      const shouldQueryJikan = Boolean(
        m.idMal && (epMap.size === 0 || epMap.size <= Math.min(declaredTotal, 100))
      );
      const [aniZipResult, jikanEps] = await Promise.all([
        fetchAniZipEpisodesEdge(m.id),
        shouldQueryJikan && m.idMal
          ? fetchJikanEpisodesEdge(m.idMal)
          : Promise.resolve(new Map<number, EpisodeEnrichment>()),
      ]);

      for (const [epNum, info] of aniZipResult.episodes.entries()) {
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
          availableQualities: defaultQualities,
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
          availableQualities: defaultQualities,
          isFiller: info.filler,
          isRecap: info.recap,
        });
      }

      const missingThumbAfterPrimary = Array.from(epMap.values()).filter((e) => !e.thumbnail).length;
      if (aniZipResult.kitsuId && (epMap.size === 0 || missingThumbAfterPrimary > 0)) {
        const kitsuEps = await fetchKitsuEpisodesEdge(aniZipResult.kitsuId);
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
            availableQualities: defaultQualities,
            isFiller: existing?.isFiller,
            isRecap: existing?.isRecap,
          });
        }
      }

      const airedCount = m.nextAiringEpisode
        ? Math.max(1, m.nextAiringEpisode.episode - 1)
        : m.episodes || Math.max(epMap.size, m.format === 'MOVIE' ? 1 : 12);
      const capCount = Math.min(Math.max(airedCount, epMap.size), 1200);
      for (let i = 1; i <= capCount; i++) {
        if (!epMap.has(i)) {
          epMap.set(i, {
            number: i,
            title: m.format === 'MOVIE' && capCount === 1 ? m.title.english || m.title.romaji : `Episódio ${i}`,
            thumbnail: null,
            duration: defaultDuration,
            aired: null,
            synopsis: null,
            availableQualities: defaultQualities,
          });
        }
      }

      const thumbCounts = new Map<string, number>();
      for (const ep of epMap.values()) {
        if (ep.thumbnail) thumbCounts.set(ep.thumbnail, (thumbCounts.get(ep.thumbnail) ?? 0) + 1);
      }
      for (const ep of epMap.values()) {
        if (ep.thumbnail && (thumbCounts.get(ep.thumbnail) ?? 0) > 1) ep.thumbnail = null;
      }

      const episodeList = Array.from(epMap.values()).sort((a, b) => a.number - b.number);
      const recommendations = (m.recommendations?.nodes ?? [])
        .map((n) => n.mediaRecommendation)
        .filter((rec): rec is RawAniListMedia => Boolean(rec && !rec.isAdult && rec.coverImage?.extraLarge))
        .map(mapMediaToSummary);

      const resp = jsonResponse(
        {
          ...summary,
          characters,
          seasons,
          episodeList,
          recommendations,
          mappings: { anilist: m.id, mal: m.idMal ?? undefined },
        },
        200,
        { 'Cache-Control': 'public, max-age=600' }
      );
      if (edgeCache) await edgeCache.put(cacheReq, resp.clone());
      return resp;
    } catch {
      return jsonResponse({ error: 'Não foi possível carregar os detalhes deste anime.' }, 502);
    }
  }

  if (path === '/api/avatars') {
    const cacheReq = new Request(`${incomingUrl.origin}/api/avatars`);
    if (edgeCache) {
      const cached = await edgeCache.match(cacheReq);
      if (cached) return cached;
    }

    try {
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
                nodes { id name { full } image { large } }
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
            characters: { nodes: Array<{ id: number; name: { full: string }; image: { large: string } }> };
          }>;
        };
      }>(query);
      const order = [151807, 113415, 101922, 154587, 21, 16498, 127230, 140960, 1735, 11061];
      const groups = data.Page.media
        .map((m) => ({
          animeId: m.id,
          animeTitle: m.title.english || m.title.romaji,
          characters: m.characters.nodes
            .filter((c) => c.image?.large && !c.image.large.includes('default.jpg'))
            .map((c) => ({ id: c.id, name: c.name.full, image: c.image.large })),
        }))
        .filter((g) => g.characters.length > 0)
        .sort((a, b) => order.indexOf(a.animeId) - order.indexOf(b.animeId));

      const resp = jsonResponse({ groups }, 200, { 'Cache-Control': 'public, max-age=1800' });
      if (edgeCache) await edgeCache.put(cacheReq, resp.clone());
      return resp;
    } catch {
      return jsonResponse({ error: 'Não foi possível carregar os avatares dos personagens.' }, 502);
    }
  }

  // ---- Account & Auth Stateless Edge Handlers (persisted cleanly via localStorage on client) ----
  if (path === '/api/auth/demo' && method === 'POST') {
    const syncCode = 'ORVIA-DEMO-BR';
    return jsonResponse({
      email: 'visitante@orvia.tv',
      syncCode,
      workspace: buildWorkspace(syncCode),
    });
  }

  if (path === '/api/auth/register' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      profileName?: string;
      avatar?: string;
    };
    const email = (body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return jsonResponse({ error: 'Informe um e-mail válido.' }, 400);
    }
    if (!body.password || body.password.length < 6) {
      return jsonResponse({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400);
    }
    const syncCode = deterministicSyncCode(email);
    const name = (body.profileName || email.split('@')[0] || 'Fã de Anime').trim().slice(0, 28);
    return jsonResponse({
      email,
      syncCode,
      workspace: buildWorkspace(syncCode, name, body.avatar || DEFAULT_CHARACTER_AVATAR),
    });
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };
    const email = (body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@') || !body.password || body.password.length < 6) {
      return jsonResponse({ error: 'Informe um e-mail válido e senha com 6 ou mais caracteres.' }, 401);
    }
    const syncCode = deterministicSyncCode(email);
    const name = (email.split('@')[0] || 'Lucas').trim().slice(0, 28);
    return jsonResponse({
      email,
      syncCode,
      workspace: buildWorkspace(syncCode, name),
    });
  }

  if (path === '/api/account/delete' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { confirmText?: string };
    if ((body.confirmText || '').trim().toUpperCase() !== 'EXCLUIR') {
      return jsonResponse({ error: 'Digite EXCLUIR para confirmar a solicitação.' }, 400);
    }
    return jsonResponse({
      ok: true,
      deleted: true,
      message: 'Conta, perfis e dados vinculados excluídos permanentemente.',
    });
  }

  const accountMatch = path.match(/^\/api\/account\/([^/]+)(\/.*)?$/);
  if (accountMatch) {
    const syncCode = decodeURIComponent(accountMatch[1]).toUpperCase();
    return jsonResponse(buildWorkspace(syncCode), 200, { 'Cache-Control': 'no-store' });
  }

  return jsonResponse({ error: 'Rota da API não encontrada.' }, 404);
}
