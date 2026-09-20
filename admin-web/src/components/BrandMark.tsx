export function BrandMark({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <img
          src="/harsha-logo.png"
          alt="Harsha ID Solutions"
          className="h-10 w-10 object-contain"
        />
        <div className="min-w-0">
          <div className="text-sm font-bold leading-tight text-button-blue">
            HARSHA ID SOLUTIONS
          </div>
          <div className="text-[10px] font-semibold tracking-wide text-accent-purple">
            - A Complete ID World...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-5 ${className}`}>
      <img
        src="/harsha-logo.png"
        alt="Harsha ID Solutions"
        className="h-[88px] w-[88px] rounded-2xl object-contain shadow-lg"
      />
      <div className="min-w-0">
        <div className="text-[28px] font-extrabold leading-tight tracking-tight text-button-blue">
          HARSHA ID SOLUTIONS
        </div>
        <div className="mt-1 text-[15px] font-bold italic tracking-wide text-accent-purple">
          - A Complete ID World...
        </div>
      </div>
    </div>
  );
}
