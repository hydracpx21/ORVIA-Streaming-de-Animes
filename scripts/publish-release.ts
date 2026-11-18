import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const PUBLISH_TOKEN = (process.env.ORVIA_PUBLISH_TOKEN || '').trim();
const APP_RELEASE_FILE = path.resolve(__dirname, 'data/app-release.json');
const DIST_RELEASE_FILE = path.resolve(__dirname, 'dist/release.json');

interface ReleaseManifest {
  version: string;
  releaseId: string;
  publishedAt: string;
  notes?: string;
  channel: 'official';
}

function bumpPatch(version: string): string {
  const parts = version.split('.').map((n) => Number(n));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
  return '1.0.1';
}

async function main() {
  const args = process.argv.slice(2);
  const notes = args.join(' ').trim() || undefined;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (PUBLISH_TOKEN) {
      headers['x-orvia-publish-token'] = PUBLISH_TOKEN;
    }

    const res = await fetch(`http://127.0.0.1:${PORT}/api/internal/publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ notes }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const json = (await res.json()) as { ok: boolean; release: unknown };
      console.log('Atualização oficial do ORVIA publicada:', JSON.stringify(json.release, null, 2));
      return;
    }
  } catch {
    // Fallback to direct manifest update when server is offline
  }

  let currentVersion = '1.0.0';
  if (fs.existsSync(APP_RELEASE_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(APP_RELEASE_FILE, 'utf-8')) as Partial<ReleaseManifest>;
      if (prev.version) currentVersion = prev.version;
    } catch {
      // Use default base version
    }
  }

  const nextManifest: ReleaseManifest = {
    version: bumpPatch(currentVersion),
    releaseId: crypto.randomBytes(6).toString('hex'),
    publishedAt: new Date().toISOString(),
    notes,
    channel: 'official',
  };

  fs.mkdirSync(path.dirname(APP_RELEASE_FILE), { recursive: true });
  fs.writeFileSync(APP_RELEASE_FILE, JSON.stringify(nextManifest, null, 2) + '\n', 'utf-8');

  if (fs.existsSync(path.dirname(DIST_RELEASE_FILE))) {
    const hash = crypto.createHash('sha256');
    hash.update(nextManifest.version);
    hash.update(nextManifest.releaseId);
    fs.writeFileSync(
      DIST_RELEASE_FILE,
      JSON.stringify(
        {
          version: nextManifest.version,
          buildId: hash.digest('hex').slice(0, 16),
          publishedAt: nextManifest.publishedAt,
          channel: 'official',
        },
        null,
        2
      ) + '\n',
      'utf-8'
    );
  }

  console.log('Manifesto oficial do ORVIA atualizado localmente:', JSON.stringify(nextManifest, null, 2));
}

main().catch((err) => {
  console.error('Falha ao publicar atualização oficial:', err);
  process.exit(1);
});
