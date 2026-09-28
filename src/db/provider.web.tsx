/** Web: data is kept in the browser's storage, so there is no database connection to provide. */
import React from 'react';

import type { Db } from './database';

export function DbProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useDb(): Db {
  return null as unknown as Db;
}
