import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { buildDashboardAcademicYearOptions } from "../utils/academicYear";

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

export function YearProvider({ children }: { children: ReactNode }) {
  const years = useMemo(() => buildDashboardAcademicYearOptions(), []);
  const [year, setYear] = useState(years[0]?.value ?? "");
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
