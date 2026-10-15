type HarshaLogoProps = {
  /** Sidebar / compact header */
  compact?: boolean;
  src?:string;
  alt?:string;
  className?: string;
};

export function HarshaLogo({ compact = false, className = "", src="/brand-wordmark.png", alt="My School ID Card" }: HarshaLogoProps) {
  return (
    <div
      className={`logo-swing flex justify-center ${compact ? "py-1" : "py-2"} ${className}`}
    >
      <img
        src={src}
        alt={alt}
        className={
          compact
            ? "sidebar-brand-image"
            : "h-auto w-full max-w-[min(100%,380px)] object-contain"
        }
      />
    </div>
  );
}
