/** Phones (iOS/Android): SQLite database. The web build uses provider.web.tsx instead. */
import React from 'react';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';

import { DATABASE_NAME, migrate, type Db } from './database';

export function DbProvider({ children }: { children: React.ReactNode }) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
      {children}
    </SQLiteProvider>
  );
}

export function useDb(): Db {
  return useSQLiteContext();
}
