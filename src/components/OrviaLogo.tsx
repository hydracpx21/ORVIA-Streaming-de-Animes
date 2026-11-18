import { useId } from 'react';

interface OrviaLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}

export function OrviaLogo({
  size = 'md',
  showWordmark = true,
  className = '',
}: OrviaLogoProps) {
  const gradId = useId();

  const iconDim = size === 'sm' ? 22 : size === 'lg' ? 32 : 26;
  const textClass =
    size === 'sm'
      ? 'text-lg tracking-[0.06em]'
      : size === 'lg'
        ? 'text-2xl tracking-[0.05em]'
        : 'text-xl tracking-[0.05em]';

  return (
    <span className={`inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0 ${className}`}>
      <svg
        width={iconDim}
        height={iconDim}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id={gradId} x1="4" y1="32" x2="32" y2="4" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E65100" />
            <stop offset="55%" stopColor="#FF6B1A" />
            <stop offset="100%" stopColor="#FF9E53" />
          </linearGradient>
        </defs>

        {/* Kinetic Orbital Portal Arc */}
        <path
          d="M27.4 9.6A13 13 0 1 0 30.6 21.2"
          stroke={`url(#${gradId})`}
          strokeWidth="4.4"
          strokeLinecap="round"
        />

        {/* Upper-Right Orbit Flare Terminal */}
        <path
          d="M29.9 13.2L32.8 10.6"
          stroke="#FF9E53"
          strokeWidth="3.6"
          strokeLinecap="round"
        />

        {/* Central Play Prism */}
        <path
          d="M15.1 12.1C15.1 11.2 16.1 10.7 16.9 11.1L25.4 16.3C26.2 16.8 26.2 18.0 25.4 18.5L16.9 23.7C16.1 24.1 15.1 23.6 15.1 22.7V12.1Z"
          fill="#FFFFFF"
        />
      </svg>

      {showWordmark && (
        <span className={`font-display font-extrabold text-white leading-none ${textClass}`}>
          ORVIA
        </span>
      )}
    </span>
  );
}
