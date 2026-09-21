import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_FILTERS, type TournamentFilters } from "../pumpfantasy/tournamentFilters";

// One set of filters for the whole tab navigator: the header (TopBar) edits
// them, and Lobby / Live / Results all read them.
interface Ctx {
  filters: TournamentFilters;
  setFilter: <K extends keyof TournamentFilters>(key: K, value: TournamentFilters[K]) => void;
  reset: () => void;
}

const FiltersContext = createContext<Ctx | null>(null);

export function TournamentFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<TournamentFilters>(DEFAULT_FILTERS);
  const setFilter = useCallback<Ctx["setFilter"]>((key, value) => setFilters((prev) => ({ ...prev, [key]: value })), []);
  const reset = useCallback(() => setFilters(DEFAULT_FILTERS), []);
  const value = useMemo(() => ({ filters, setFilter, reset }), [filters, setFilter, reset]);
  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useTournamentFilters(): Ctx {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useTournamentFilters must be used inside TournamentFiltersProvider");
  return ctx;
}
