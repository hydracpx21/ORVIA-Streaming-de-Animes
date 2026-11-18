import {
  BaseProvider,
  type CallOptions,
  type ContentLanguage,
  HttpClient,
  type IContentUnit,
  type IMediaMappings,
  type IMediaSearchResult,
  type ISubtitleTrack,
  type IUnitTracks,
  type IVideoPayload,
  type MediaCatalogType,
  type ResolvedMediaStream,
} from 'anime-sdk';
import fs from 'fs';

export interface AuthorizedStreamEntry {
  anilistId: number;
  episode: number | '*';
  language: ContentLanguage;
  streams: IVideoPayload[];
  subtitles?: ISubtitleTrack[];
  licenseOwner?: string;
}

interface AniListSearchMedia {
  id: number;
  title: { romaji: string; english?: string | null; native?: string | null };
  coverImage: { extraLarge?: string; large?: string };
  format?: string | null;
  seasonYear?: number | null;
}

interface AniListContentMedia {
  id: number;
  idMal?: number | null;
  format?: string | null;
  episodes?: number | null;
  title: { romaji: string; english?: string | null };
  nextAiringEpisode?: { episode: number } | null;
  streamingEpisodes?: Array<{ title: string; thumbnail?: string | null; url?: string | null }>;
  externalLinks?: Array<{ site: string; url: string; type?: string }>;
}

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

/**
 * Provedor compatível com o contrato `BaseProvider` da `anime-sdk` e da Blitz Anime API.
 *
 * - Usa URN padronizado `akari:<anilistId>` e `akari:<anilistId>/<episodeNumber>`.
 * - Suporta `lookupByMapping` direto via ID da AniList para integração imediata com `AnilistMeta`.
 * - Resolve streams HLS (.m3u8) / MP4 exclusivamente a partir do registro comercial autorizado
 *   em `data/authorized-streams.json`, sem recorrer a scraping não autorizado.
 */
export class AkariBlitzProvider extends BaseProvider {
  readonly id = 'akari';
  readonly name = 'AKARI Official Catalog';
  readonly supportedTypes: MediaCatalogType[] = ['ANIME', 'MOVIE', 'TV'];
  readonly maxConcurrency = 6;

  private readonly streamsFilePath: string;

  constructor(http: HttpClient, streamsFilePath: string) {
    super(http);
    this.streamsFilePath = streamsFilePath;
  }

  async lookupByMapping(mappings: IMediaMappings): Promise<string | null> {
    if (mappings.anilist && Number.isFinite(mappings.anilist)) {
      return String(mappings.anilist);
    }
    return null;
  }

  private loadAuthorizedEntries(): AuthorizedStreamEntry[] {
    try {
      if (!fs.existsSync(this.streamsFilePath)) return [];
      const raw = fs.readFileSync(this.streamsFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item): item is AuthorizedStreamEntry =>
          Boolean(
            item &&
              typeof item.anilistId === 'number' &&
              Array.isArray(item.streams) &&
              item.streams.length > 0
          )
      );
    } catch {
      return [];
    }
  }

  private findAuthorizedStreams(
    anilistId: number,
    episode: number,
    language: ContentLanguage = 'sub'
  ): { streams: IVideoPayload[]; subtitles: ISubtitleTrack[] } {
    const entries = this.loadAuthorizedEntries();
    const matching = entries.filter(
      (e) =>
        e.anilistId === anilistId &&
        (e.episode === episode || e.episode === '*') &&
        e.language === language
    );

    // Fallback to any language entry for this episode if exact language isn't registered
    const candidates =
      matching.length > 0
        ? matching
        : entries.filter(
            (e) => e.anilistId === anilistId && (e.episode === episode || e.episode === '*')
          );

    const streams: IVideoPayload[] = [];
    const subtitles: ISubtitleTrack[] = [];

    for (const entry of candidates) {
      const entrySubs = entry.subtitles ?? [];
      subtitles.push(...entrySubs);
      for (const s of entry.streams) {
        if (!s.sourceUrl || !/^https?:\/\//i.test(s.sourceUrl)) continue;
        streams.push({
          ...s,
          isHLS: typeof s.isHLS === 'boolean' ? s.isHLS : /\.m3u8(\?|$)/i.test(s.sourceUrl),
          language: s.language || entry.language,
          subtitles: s.subtitles && s.subtitles.length > 0 ? s.subtitles : entrySubs,
        });
      }
    }

    return { streams, subtitles };
  }

  getRegisteredEpisodeQualities(anilistId: number, episode: number): string[] {
    const entries = this.loadAuthorizedEntries().filter(
      (e) => e.anilistId === anilistId && (e.episode === episode || e.episode === '*')
    );
    const qualities: string[] = [];
    for (const entry of entries) {
      for (const s of entry.streams) {
        if (s.quality && !qualities.includes(s.quality)) {
          qualities.push(s.quality);
        }
      }
    }
    return qualities;
  }

  private async fetchAniZipEpisodeMap(
    anilistId: number,
    signal?: AbortSignal
  ): Promise<Map<number, { title?: string; thumbnail?: string }>> {
    const map = new Map<number, { title?: string; thumbnail?: string }>();
    try {
      const res = await this.http.get(`https://api.ani.zip/mappings?anilist_id=${anilistId}`, {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!res.ok) return map;
      const json = (await res.json()) as {
        episodes?: Record<
          string,
          {
            title?: Record<string, string>;
            image?: string;
          }
        >;
      };
      for (const [key, ep] of Object.entries(json.episodes ?? {})) {
        if (!/^\d+$/.test(key)) continue;
        const num = Number(key);
        if (!Number.isFinite(num) || num <= 0) continue;
        const thumb = ep.image && /^https?:\/\//i.test(ep.image) ? ep.image : undefined;
        const title = ep.title?.['pt-BR'] || ep.title?.en || ep.title?.['x-jat'] || undefined;
        if (thumb || title) {
          map.set(num, { title, thumbnail: thumb });
        }
      }
    } catch {
      // Optional enrichment fallback
    }
    return map;
  }

  private async postAniList<T>(
    query: string,
    variables: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<T> {
    const res = await this.http.post(
      ANILIST_ENDPOINT,
      JSON.stringify({ query, variables }),
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal,
      }
    );
    if (!res.ok) {
      throw new Error(`AniList HTTP ${res.status}`);
    }
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      throw new Error(json.errors[0].message);
    }
    if (!json.data) {
      throw new Error('Resposta vazia da AniList');
    }
    return json.data;
  }

  protected async searchRaw(query: string, options?: CallOptions): Promise<IMediaSearchResult[]> {
    const gql = `
      query ProviderSearch($search: String) {
        Page(page: 1, perPage: 20) {
          media(type: ANIME, search: $search, isAdult: false, sort: [POPULARITY_DESC]) {
            id
            title { romaji english native }
            coverImage { extraLarge large }
            format
            seasonYear
          }
        }
      }
    `;
    const data = await this.postAniList<{ Page: { media: AniListSearchMedia[] } }>(
      gql,
      { search: query },
      options?.signal
    );

    return data.Page.media.map((m) => ({
      id: String(m.id),
      title: m.title.english || m.title.romaji,
      thumbnailUrl: m.coverImage.extraLarge || m.coverImage.large,
      catalogType: m.format === 'MOVIE' ? 'MOVIE' : 'ANIME',
      providerId: this.id,
      availableLanguages: ['sub', 'dub'],
      year: m.seasonYear ?? undefined,
    }));
  }

  protected async fetchContentUnitsRaw(
    rawMediaId: string,
    options?: CallOptions
  ): Promise<IContentUnit[]> {
    const anilistId = Number(rawMediaId);
    if (!Number.isFinite(anilistId) || anilistId <= 0) {
      return [];
    }

    const gql = `
      query ProviderContent($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          idMal
          format
          episodes
          title { romaji english }
          nextAiringEpisode { episode }
          streamingEpisodes { title thumbnail url }
          externalLinks { site url type }
        }
      }
    `;

    const [data, aniZipMap] = await Promise.all([
      this.postAniList<{ Media: AniListContentMedia }>(gql, { id: anilistId }, options?.signal),
      this.fetchAniZipEpisodeMap(anilistId, options?.signal),
    ]);
    const m = data.Media;
    const unitsByNum = new Map<number, IContentUnit>();

    (m.streamingEpisodes ?? []).forEach((ep, idx) => {
      const match = ep.title.match(/(?:Episode|Ep\.?|Episódio)\s*(\d+)/i);
      const num = match ? Number(match[1]) : idx + 1;
      const cleanTitle =
        ep.title.replace(/^(?:Episode|Ep\.?|Episódio)\s*\d+\s*[-–:]\s*/i, '').trim() ||
        aniZipMap.get(num)?.title ||
        `Episódio ${num}`;

      const { streams, subtitles } = this.findAuthorizedStreams(anilistId, num, 'sub');
      unitsByNum.set(num, {
        id: `${anilistId}/${num}`,
        number: num,
        title: cleanTitle,
        thumbnailUrl: ep.thumbnail || aniZipMap.get(num)?.thumbnail || undefined,
        availableLanguages: ['sub', 'dub'],
        availableQualities:
          streams.length > 0 ? Array.from(new Set(streams.map((s) => s.quality))) : undefined,
        availableSubtitles:
          subtitles.length > 0
            ? subtitles.map((s) => ({ language: s.language, label: s.label, format: s.format }))
            : undefined,
      });
    });

    const total = m.nextAiringEpisode
      ? Math.max(1, m.nextAiringEpisode.episode - 1)
      : m.episodes || Math.max(unitsByNum.size, m.format === 'MOVIE' ? 1 : 12);
    const capped = Math.min(Math.max(total, unitsByNum.size, aniZipMap.size), 1200);

    for (let i = 1; i <= capped; i++) {
      const zipInfo = aniZipMap.get(i);
      if (!unitsByNum.has(i)) {
        const { streams, subtitles } = this.findAuthorizedStreams(anilistId, i, 'sub');
        unitsByNum.set(i, {
          id: `${anilistId}/${i}`,
          number: i,
          title:
            m.format === 'MOVIE' && capped === 1
              ? m.title.english || m.title.romaji
              : zipInfo?.title || `Episódio ${i}`,
          thumbnailUrl: zipInfo?.thumbnail || undefined,
          availableLanguages: ['sub', 'dub'],
          availableQualities:
            streams.length > 0 ? Array.from(new Set(streams.map((s) => s.quality))) : undefined,
          availableSubtitles:
            subtitles.length > 0
              ? subtitles.map((s) => ({ language: s.language, label: s.label, format: s.format }))
              : undefined,
        });
      } else {
        const existing = unitsByNum.get(i)!;
        if (!existing.thumbnailUrl && zipInfo?.thumbnail) {
          existing.thumbnailUrl = zipInfo.thumbnail;
        }
      }
    }

    // Never repeat the same generic thumbnail URL across multiple episodes
    const units = Array.from(unitsByNum.values()).sort((a, b) => a.number - b.number);
    const thumbCounts = new Map<string, number>();
    for (const u of units) {
      if (u.thumbnailUrl) {
        thumbCounts.set(u.thumbnailUrl, (thumbCounts.get(u.thumbnailUrl) ?? 0) + 1);
      }
    }
    for (const u of units) {
      if (u.thumbnailUrl && (thumbCounts.get(u.thumbnailUrl) ?? 0) > 1) {
        u.thumbnailUrl = undefined;
      }
    }

    return units;
  }

  protected async fetchUnitTracksRaw(
    rawUnitId: string,
    language: ContentLanguage = 'sub'
  ): Promise<IUnitTracks> {
    const [mediaPart, epPart] = rawUnitId.split('/');
    const anilistId = Number(mediaPart);
    const episode = Number(epPart) || 1;
    const { streams, subtitles } = this.findAuthorizedStreams(anilistId, episode, language);

    return {
      subtitles,
      qualities: Array.from(new Set(streams.map((s) => s.quality))),
    };
  }

  protected async resolveStreamRaw(
    rawUnitId: string,
    language: ContentLanguage = 'sub'
  ): Promise<ResolvedMediaStream> {
    const [mediaPart, epPart] = rawUnitId.split('/');
    const anilistId = Number(mediaPart);
    const episode = Number(epPart) || 1;

    const { streams } = this.findAuthorizedStreams(anilistId, episode, language);
    return {
      type: 'video',
      streams,
    };
  }
}
