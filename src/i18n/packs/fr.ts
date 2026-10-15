// French: interface strings (../ui/fr.ts) and every phrase table under ../fr/ (auto-discovered).
// Loaded lazily by ../index.ts as its own chunk.
import ui from '../ui/fr';
import { buildPack } from '../pack';

export default buildPack(ui, import.meta.glob<{ default?: unknown }>('../fr/*.ts', { eager: true }));
