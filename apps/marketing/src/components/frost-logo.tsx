interface FrostLogoProps {
  className?: string;
  size?: number;
}

export function FrostLogo({ className, size = 32 }: FrostLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="frost-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(56,189,248,0.3)" />
          <stop offset="100%" stopColor="rgba(56,189,248,0)" />
        </radialGradient>
        <radialGradient id="frost-inner" cx="50%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e0f2fe" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="#0a0a0a" />
      <circle cx="32" cy="32" r="30" fill="url(#frost-glow)" />
      <circle cx="32" cy="32" r="10" fill="url(#frost-inner)" />
    </svg>
  );
}
