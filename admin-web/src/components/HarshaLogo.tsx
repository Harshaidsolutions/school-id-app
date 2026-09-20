type HarshaLogoProps = {
  /** Sidebar / compact header */
  compact?: boolean;
  className?: string;
};

export function HarshaLogo({ compact = false, className = "" }: HarshaLogoProps) {
  return (
    <div
      className={`logo-swing flex justify-center ${compact ? "py-1" : "py-2"} ${className}`}
    >
      <img
        src="/harsha-logo-new.png"
        alt="Harsha ID Solutions"
        className={
          compact
            ? "h-auto w-full max-w-[148px] object-contain"
            : "h-auto w-full max-w-[min(100%,380px)] object-contain"
        }
      />
    </div>
  );
}
