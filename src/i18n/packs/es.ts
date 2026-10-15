// Spanish: interface strings (../ui/es.ts) and every phrase table under ../es/ (auto-discovered).
// Loaded lazily by ../index.ts as its own chunk.
import ui from '../ui/es';
import { buildPack } from '../pack';

export default buildPack(ui, import.meta.glob<{ default?: unknown }>('../es/*.ts', { eager: true }));
