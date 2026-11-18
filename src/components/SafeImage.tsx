import { Film } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface SafeImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  fallbackTitle?: string;
  accentColor?: string | null;
}

export function SafeImage({
  src,
  alt,
  className = '',
  loading = 'lazy',
  fallbackTitle,
  accentColor,
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setFailed(true);
    }
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-zinc-900 text-zinc-500 p-4 text-center select-none ${className}`}
        style={{
          backgroundImage: accentColor
            ? `radial-gradient(circle at 30% 20%, ${accentColor}22, #09090B 80%)`
            : 'radial-gradient(circle at 30% 20%, rgba(255,107,26,0.12), #09090B 80%)',
        }}
        role="img"
        aria-label={alt}
      >
        <Film className="w-7 h-7 mb-2 text-zinc-600" strokeWidth={1.5} />
        {fallbackTitle && (
          <span className="text-xs font-medium text-zinc-400 line-clamp-2 max-w-[14ch]">
            {fallbackTitle}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`bg-zinc-900 ${className}`}
    />
  );
}
