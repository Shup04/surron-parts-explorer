import database from '../../data/oem/catalog.json';
import type { OemDatabase } from '@/oem/types';
import { toExplorerCatalog } from '@/oem/adapter';

/** Generated factual records, never the copyrighted reference PDFs or diagram artwork. */
export const oemDatabase = database as unknown as OemDatabase;
export const oemCatalog = toExplorerCatalog(oemDatabase);
