import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useDb } from './db/provider';

import { currentMonthKey } from './lib/dates';
import { getLatestMonth, getMainCurrency } from './db/database';

type AppState = {
  month: string;
  setMonth: (m: string) => void;
  currency: string;
  /** Increments whenever data changes, so screens know to reload */
  version: number;
  refresh: () => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const db = useDb();
  const [month, setMonth] = useState(currentMonthKey());
  const [currency, setCurrency] = useState('EUR');
  const [version, setVersion] = useState(0);
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [latest, cur] = await Promise.all([getLatestMonth(db), getMainCurrency(db)]);
      if (!alive) return;
      setCurrency(cur);
      // On first launch, open the latest month that has data
      if (!initialized) {
        if (latest) setMonth(latest);
        setInitialized(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [db, version, initialized]);

  const value = useMemo(() => ({ month, setMonth, currency, version, refresh }), [month, currency, version, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}
