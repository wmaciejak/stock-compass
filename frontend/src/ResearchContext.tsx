import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SizingInput } from "./types";

type ResearchDraft = {
  noteDraft?: string;
  thesisDraft?: string;
  sizingForm?: Record<string, string>;
  sizingInput?: SizingInput;
};
type Value = {
  getDraft: (symbol: string) => ResearchDraft;
  updateDraft: (symbol: string, patch: Partial<ResearchDraft>) => void;
  comparisonSymbols: string[];
  setComparisonSymbols: (symbols: string[]) => void;
};
const Context = createContext<Value | null>(null);

export function ResearchContextProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, ResearchDraft>>({});
  const [comparisonSymbols, setComparisonSymbols] = useState<string[]>([]);
  const ref = useRef(drafts);
  ref.current = drafts;
  const getDraft = useCallback(
    (symbol: string) => ref.current[symbol] || {},
    [],
  );
  const updateDraft = useCallback(
    (symbol: string, patch: Partial<ResearchDraft>) =>
      setDrafts((old) => ({ ...old, [symbol]: { ...old[symbol], ...patch } })),
    [],
  );
  return (
    <Context.Provider
      value={{ getDraft, updateDraft, comparisonSymbols, setComparisonSymbols }}
    >
      {children}
    </Context.Provider>
  );
}
export function useResearchContext() {
  const value = useContext(Context);
  if (!value) throw new Error("Research context provider is missing.");
  return value;
}
