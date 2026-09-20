import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface AcademicYear {
  label: string;
  value: string;
}

interface YearContextValue {
  year: string;
  yearLabel: string;
  years: AcademicYear[];
  yearFilterEnabled: boolean;
  setYear: (value: string) => void;
  setYearFilterEnabled: (enabled: boolean) => void;
}

const YearContext = createContext<YearContextValue | null>(null);

function buildYears(): AcademicYear[] {
  const current = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, i) => {
    const y = current - i;
    return { label: `${y} - ${y + 1}`, value: String(y) };
  });
}

export function YearProvider({ children }: { children: ReactNode }) {
  const years = useMemo(buildYears, []);
  const [year, setYear] = useState(years[0]?.value ?? String(new Date().getFullYear()));
  const [yearFilterEnabled, setYearFilterEnabled] = useState(true);
  const yearLabel = years.find((item) => item.value === year)?.label ?? year;

  return (
    <YearContext.Provider
      value={{ year, yearLabel, years, yearFilterEnabled, setYear, setYearFilterEnabled }}
    >
      {children}
    </YearContext.Provider>
  );
}

export function useYear() {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error("useYear must be used within YearProvider");
  return ctx;
}
