// German: interface strings (../ui/de.ts) and every phrase table under ../de/ (auto-discovered).
// Loaded lazily by ../index.ts as its own chunk.
import ui from '../ui/de';
import { buildPack } from '../pack';

export default buildPack(ui, import.meta.glob<{ default?: unknown }>('../de/*.ts', { eager: true }));
