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
      <circle cx="32" cy="32" r="30" fill="black" />
      <circle cx="32" cy="32" r="10" fill="white" />
    </svg>
  );
}
