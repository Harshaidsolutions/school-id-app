import { harshaLetterColors } from "../theme/colors";

const LETTERS = ["H", "A", "R", "S", "H", "A"] as const;

/**
 * Brand lockup matching the Figma auth screens:
 * colored letter tiles + "ID SOLUTIONS" + tagline.
 */
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="flex items-center gap-1 sm:gap-1.5">
        {LETTERS.map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className="flex h-9 w-9 items-center justify-center rounded-md text-base font-bold text-white shadow-sm sm:h-10 sm:w-10 sm:text-lg"
            style={{ backgroundColor: harshaLetterColors[index] }}
          >
            {letter}
          </span>
        ))}
      </div>
      <div className="mt-2 text-center text-sm font-bold tracking-[0.2em] text-dark-blue uppercase sm:text-base">
        ID SOLUTIONS
      </div>
      <div className="mt-1.5 text-center text-[10px] font-medium tracking-[0.18em] text-text-navy uppercase sm:text-[11px]">
        A COMPLETE ID WORLD...
      </div>
    </div>
  );
}
