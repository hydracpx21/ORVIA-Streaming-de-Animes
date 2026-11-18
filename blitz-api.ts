import {
  AllmangaProvider,
  AnilistMeta,
  AnimeParadiseProvider,
  AnikotoProvider,
  BaseProvider,
  type BrowseKind,
  type ContentLanguage,
  GogoanimeProvider,
  GoyabuProvider,
  HttpClient,
  KitsuMeta,
  MalMeta,
  MappingClient,
  type MediaSeason,
  MegaPlayProvider,
  type SdkCache,
} from 'anime-sdk';
import express, { type Express, type Request, type Response } from 'express';
import type http from 'http';
import { pathToFileURL } from 'url';

const BLITZ_CACHE_TTL_MS = 20 * 60 * 1000;

interface CacheItem {
  value: unknown;
  expiresAt: number;
}

class MemorySdkCache implements SdkCache {
  private store = new Map<string, CacheItem>();

  get(key: string): unknown {
    if (key.startsWith('stream:')) return undefined;
    const item = this.store.get(key);
    if (!item) return undefined;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return item.value;
  }

  set(key: string, value: unknown): void {
    if (key.startsWith('stream:')) return;
    if (this.store.size > 1500) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + BLITZ_CACHE_TTL_MS,
    });
  }
}

export const OFFICIAL_BLITZ_ANIME_PROVIDERS = [
  'animeparadise',
  'allmanga',
  'anikoto',
  'megaplay',
  'gogoanime',
  'goyabu',
] as const;

export function createBlitzApp(): Express {
  const app = express();
  const sdkCache = new MemorySdkCache();
  const sdkHttp = new HttpClient({ timeoutMs: 12000 });
  const mappingClient = new MappingClient(sdkHttp, {
    cache: sdkCache,
    disableAnify: true,
    disableMalsync: true,
    disableArmServer: true,
  });

  const animeProviders: Record<string, BaseProvider> = {
    animeparadise: new AnimeParadiseProvider(sdkHttp),
    allmanga: new AllmangaProvider(sdkHttp),
    anikoto: new AnikotoProvider(sdkHttp),
    megaplay: new MegaPlayProvider(sdkHttp),
    gogoanime: new GogoanimeProvider(sdkHttp),
    goyabu: new GoyabuProvider(sdkHttp),
  };

  const metaProviders = {
    anilist: new AnilistMeta(sdkHttp, { mappingClient }),
    mal: new MalMeta(sdkHttp, { mappingClient }),
    kitsu: new KitsuMeta(sdkHttp, { mappingClient }),
  };

  function getAnimeProvider(raw?: string): BaseProvider | null {
    const key = (raw || process.env.BLITZ_DEFAULT_PROVIDER || 'animeparadise').trim().toLowerCase();
    return animeProviders[key] ?? null;
  }

  function getMetaProvider(raw?: string, idFallback?: string) {
    const inferred = raw || (idFallback && idFallback.includes(':') ? idFallback.split(':')[0] : 'anilist');
    const key = inferred.trim().toLowerCase();
    if (key === 'anilist' || key === 'mal' || key === 'kitsu') {
      return metaProviders[key];
    }
    return null;
  }

  function parseLang(raw?: string): ContentLanguage {
    const v = (raw || 'sub').trim().toLowerCase();
    if (v === 'dub' || v === 'raw') return v;
    return 'sub';
  }

  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
    next();
  });

  app.get('/ping', (_req: Request, res: Response) => {
    res.type('text/plain').send('pong ⚡ Blitz');
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'blitz-anime-api',
      version: '2.5.0',
      license: 'MIT',
      providers: {
        metadata: Object.keys(metaProviders),
        anime: Object.keys(animeProviders),
        manga: [],
      },
    });
  });

  app.get('/api/v1/providers', (_req: Request, res: Response) => {
    res.json({
      metadata: Object.keys(metaProviders),
      anime: Object.keys(animeProviders),
      manga: [],
    });
  });

  app.get('/api/v1/search', async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q) return res.status(400).json({ error: 'Query parameter "q" is required.' });
      const provider = getAnimeProvider(typeof req.query.provider === 'string' ? req.query.provider : undefined);
      if (!provider) return res.status(400).json({ error: 'Invalid anime provider.' });

      const results = await provider.search(q);
      return res.json({ provider: provider.id, type: 'anime', results });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Search failed.',
      });
    }
  });

  app.get('/api/v1/content', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'Query parameter "id" is required.' });
      const inferred =
        typeof req.query.provider === 'string'
          ? req.query.provider
          : id.includes(':')
            ? id.split(':')[0]
            : undefined;
      const provider = getAnimeProvider(inferred);
      if (!provider) return res.status(400).json({ error: 'Invalid anime provider.' });

      const units = await provider.fetchContentUnits(id);
      return res.json({ provider: provider.id, units });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to fetch content units.',
      });
    }
  });

  app.get('/api/v1/tracks', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'Query parameter "id" is required.' });
      const inferred =
        typeof req.query.provider === 'string'
          ? req.query.provider
          : id.includes(':')
            ? id.split(':')[0]
            : undefined;
      const provider = getAnimeProvider(inferred);
      if (!provider) return res.status(400).json({ error: 'Invalid anime provider.' });
      const lang = parseLang(typeof req.query.language === 'string' ? req.query.language : undefined);

      const tracks = await provider.fetchUnitTracks(id, lang);
      return res.json({ provider: provider.id, ...tracks });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to fetch tracks.',
      });
    }
  });

  app.get('/api/v1/stream', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'Query parameter "id" is required.' });
      const inferred =
        typeof req.query.provider === 'string'
          ? req.query.provider
          : id.includes(':')
            ? id.split(':')[0]
            : undefined;
      const provider = getAnimeProvider(inferred);
      if (!provider) return res.status(400).json({ error: 'Invalid anime provider.' });
      const lang = parseLang(typeof req.query.language === 'string' ? req.query.language : undefined);

      const stream = await provider.resolveStream(id, lang);
      return res.json({ provider: provider.id, stream });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to resolve stream.',
      });
    }
  });

  app.get('/api/v1/meta/search', async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q) return res.status(400).json({ error: 'Query parameter "q" is required.' });
      const meta = getMetaProvider(typeof req.query.provider === 'string' ? req.query.provider : 'anilist');
      if (!meta) return res.status(400).json({ error: 'Invalid metadata provider.' });

      const results = await meta.search(q);
      return res.json({ provider: meta.id, results });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Metadata search failed.',
      });
    }
  });

  app.get('/api/v1/meta/info', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'Query parameter "id" is required.' });
      const meta = getMetaProvider(typeof req.query.provider === 'string' ? req.query.provider : undefined, id);
      if (!meta) return res.status(400).json({ error: 'Invalid metadata provider.' });

      const info = await meta.fetchMediaInfo(id);
      return res.json(info);
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Metadata info failed.',
      });
    }
  });

  app.get('/api/v1/meta/browse', async (req: Request, res: Response) => {
    try {
      const meta = getMetaProvider(typeof req.query.provider === 'string' ? req.query.provider : 'anilist');
      if (!meta) return res.status(400).json({ error: 'Invalid metadata provider.' });
      const rawType = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : 'trending';
      const allowed = new Set<BrowseKind>(['trending', 'popular', 'seasonal', 'top']);
      const kind: BrowseKind = allowed.has(rawType as BrowseKind) ? (rawType as BrowseKind) : 'trending';
      const page = req.query.page ? Math.max(1, Number(req.query.page)) : 1;
      const perPage = req.query.perPage ? Math.min(36, Math.max(1, Number(req.query.perPage))) : 20;
      const season = typeof req.query.season === 'string' ? (req.query.season.toUpperCase() as MediaSeason) : undefined;
      const year = req.query.year ? Number(req.query.year) : undefined;

      const results = await meta.browse(kind, { page, perPage, season, year });
      return res.json({ provider: meta.id, type: kind, page, results });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Metadata browse failed.',
      });
    }
  });

  app.get('/api/v1/meta/content', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'Query parameter "id" is required.' });
      const meta = getMetaProvider(typeof req.query.meta === 'string' ? req.query.meta : undefined, id);
      const provider = getAnimeProvider(typeof req.query.provider === 'string' ? req.query.provider : undefined);
      if (!meta || !provider) return res.status(400).json({ error: 'Invalid metadata or content provider.' });

      const units = await meta.fetchContentUnits(id, provider);
      return res.json({ id, provider: provider.id, units });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Metadata content lookup failed.',
      });
    }
  });

  app.get('/api/v1/meta/tracks', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'Query parameter "id" is required.' });
      const episode = Math.max(1, Number(req.query.episode) || 1);
      const lang = parseLang(typeof req.query.language === 'string' ? req.query.language : undefined);
      const meta = getMetaProvider(typeof req.query.meta === 'string' ? req.query.meta : undefined, id);
      const provider = getAnimeProvider(typeof req.query.provider === 'string' ? req.query.provider : undefined);
      if (!meta || !provider) return res.status(400).json({ error: 'Invalid metadata or content provider.' });

      const tracks = await meta.fetchUnitTracks(id, episode, provider, lang);
      return res.json({ id, episode, provider: provider.id, ...tracks });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Metadata tracks lookup failed.',
      });
    }
  });

  app.get('/api/v1/meta/stream', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'Query parameter "id" is required.' });
      const episode = Math.max(1, Number(req.query.episode) || 1);
      const lang = parseLang(typeof req.query.language === 'string' ? req.query.language : undefined);
      const meta = getMetaProvider(typeof req.query.meta === 'string' ? req.query.meta : undefined, id);
      const provider = getAnimeProvider(typeof req.query.provider === 'string' ? req.query.provider : undefined);
      if (!meta || !provider) return res.status(400).json({ error: 'Invalid metadata or content provider.' });

      const stream = await meta.resolveStream(id, episode, provider, lang);
      return res.json({
        id,
        episode,
        provider: provider.id,
        language: lang,
        stream,
      });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Metadata stream resolution failed.',
      });
    }
  });

  return app;
}

let runningServer: http.Server | null = null;

export async function startBlitzServer(port = 3001, host = '127.0.0.1'): Promise<http.Server | null> {
  if (runningServer) return runningServer;
  const app = createBlitzApp();
  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      runningServer = server;
      console.log(`Blitz Anime API v2.5.0 ativa em http://${host}:${port}`);
      resolve(server);
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`Porta ${port} já está em uso para Blitz Anime API; reutilizando instância ativa.`);
        resolve(null);
      } else {
        console.error('Erro ao iniciar Blitz Anime API:', err);
        resolve(null);
      }
    });
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.BLITZ_PORT) || 3001;
  startBlitzServer(port, '0.0.0.0');
}
