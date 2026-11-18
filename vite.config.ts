import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ and writes dist/release.json for silent client updates.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }

          if (fs.existsSync(distDir)) {
            const hash = crypto.createHash('sha256');
            const distIndex = path.join(distDir, 'index.html');
            if (fs.existsSync(distIndex)) {
              hash.update(fs.readFileSync(distIndex));
            }
            const assetsDir = path.join(distDir, 'assets');
            if (fs.existsSync(assetsDir)) {
              for (const file of fs.readdirSync(assetsDir).sort()) {
                hash.update(file);
              }
            }

            let version = '1.0.0';
            let publishedAt = new Date().toISOString();
            const releaseFile = path.resolve(__dirname, 'data/app-release.json');
            if (fs.existsSync(releaseFile)) {
              try {
                const parsed = JSON.parse(fs.readFileSync(releaseFile, 'utf-8')) as {
                  version?: string;
                  releaseId?: string;
                  publishedAt?: string;
                };
                if (parsed.version) version = parsed.version;
                if (parsed.releaseId) hash.update(parsed.releaseId);
                if (parsed.publishedAt) publishedAt = parsed.publishedAt;
              } catch {
                // Ignore malformed release manifest
              }
            }

            const manifest = {
              version,
              buildId: hash.digest('hex').slice(0, 16),
              publishedAt,
              channel: 'official' as const,
            };
            fs.writeFileSync(
              path.join(distDir, 'release.json'),
              JSON.stringify(manifest, null, 2) + '\n',
              'utf-8'
            );
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
