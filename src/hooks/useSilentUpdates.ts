import { useEffect, useRef } from 'react';
import type { AppReleaseManifest } from '../types/anime';

const APPLIED_BUILD_STORAGE_KEY = 'orvia_applied_build_id';
const POLL_INTERVAL_MS = 45_000;

async function fetchCurrentRelease(): Promise<AppReleaseManifest | null> {
  try {
    const res = await fetch('/api/app/release', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      return (await res.json()) as AppReleaseManifest;
    }
  } catch {
    // Fallback to static release manifest when running standalone on CDN
  }

  try {
    const staticRes = await fetch(`/release.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (staticRes.ok) {
      return (await staticRes.json()) as AppReleaseManifest;
    }
  } catch {
    // Silent failure when offline
  }

  return null;
}

function isUserTyping(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (el as HTMLElement).isContentEditable
  );
}

/**
 * Silent background updater for official ORVIA releases.
 * Checks for newly published builds without exposing UI telemetry or interrupting active video playback.
 */
export function useSilentUpdates(isPlaybackActive: boolean) {
  const initialBuildIdRef = useRef<string | null>(null);
  const pendingBuildIdRef = useRef<string | null>(null);
  const isPlaybackRef = useRef(isPlaybackActive);
  isPlaybackRef.current = isPlaybackActive;

  const tryApplyPendingUpdate = () => {
    const nextBuildId = pendingBuildIdRef.current;
    if (!nextBuildId) return;
    if (isPlaybackRef.current || isUserTyping()) return;

    try {
      const alreadyApplied = sessionStorage.getItem(APPLIED_BUILD_STORAGE_KEY);
      if (alreadyApplied === nextBuildId) {
        pendingBuildIdRef.current = null;
        return;
      }
      sessionStorage.setItem(APPLIED_BUILD_STORAGE_KEY, nextBuildId);
    } catch {
      // Proceed even if sessionStorage is restricted
    }

    pendingBuildIdRef.current = null;
    window.location.reload();
  };

  useEffect(() => {
    if (!isPlaybackActive && pendingBuildIdRef.current) {
      const timer = window.setTimeout(tryApplyPendingUpdate, 600);
      return () => window.clearTimeout(timer);
    }
  }, [isPlaybackActive]);

  useEffect(() => {
    let active = true;

    const checkRelease = async () => {
      const manifest = await fetchCurrentRelease();
      if (!active || !manifest?.buildId) return;

      if (!initialBuildIdRef.current) {
        initialBuildIdRef.current = manifest.buildId;
        try {
          sessionStorage.setItem(APPLIED_BUILD_STORAGE_KEY, manifest.buildId);
        } catch {
          // Ignore storage errors
        }
        return;
      }

      if (manifest.buildId !== initialBuildIdRef.current) {
        pendingBuildIdRef.current = manifest.buildId;
        tryApplyPendingUpdate();
      }
    };

    checkRelease();

    const interval = window.setInterval(checkRelease, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkRelease();
      }
    };
    const onFocus = () => {
      checkRelease();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
}
