// Shared simplified geography for the briefing chart and far terrain. Degrees, GeoJSON order.
type Geo = { lat: number; lon: number };
type Pt = [lon: number, lat: number]; // outline vertices, GeoJSON order

const KX = Math.cos((52 * Math.PI) / 180);

const BASE: Geo = { lat: 52.52, lon: -0.61 };    // Deenethorpe, Northants (401st BG)
const NORFOLK: Geo = { lat: 52.93, lon: 1.35 };  // North Sea crossing off Cromer
const ESSEX: Geo = { lat: 51.8, lon: 1.2 };      // southern crossing for the Rhine / Franconia targets
const BERLIN: Geo = { lat: 52.52, lon: 13.4 };   // flak origin for the homeward leg
const FRANKFURT: Geo = { lat: 50.11, lon: 8.68 };
const KENT: Geo = { lat: 51.3, lon: 1.38 };      // Manston, the emergency field on the Kent coast

interface Place extends Geo {
  key: string;      // fragment matched against Mission.target
  eng?: Geo;        // English coast crossing (default NORFOLK)
  ip?: Geo;         // continental coast point the route turns in from
  home?: boolean;   // homeward leg rather than a bomb run
  from?: Geo;       // homeward leg: where it starts (default Berlin)
}

const PLACES: Place[] = [
  { key: 'Emden', lat: 53.37, lon: 7.21, ip: { lat: 53.4, lon: 5.6 } },
  { key: 'Bremen', lat: 53.08, lon: 8.8, ip: { lat: 52.95, lon: 4.7 } },
  { key: 'Ludwigshafen', lat: 49.48, lon: 8.44, eng: ESSEX, ip: { lat: 51.2, lon: 3.1 } },
  { key: 'Leipzig', lat: 51.34, lon: 12.37, ip: { lat: 52.3, lon: 4.2 } },
  { key: 'Schweinfurt', lat: 50.05, lon: 10.23, eng: ESSEX, ip: { lat: 51.3, lon: 3.3 } },
  { key: 'Berlin', lat: 52.52, lon: 13.4, ip: { lat: 53.3, lon: 5.4 } },
  { key: 'Netherlands', lat: 52.6, lon: 5.0, home: true },
  { key: 'Kiel', lat: 54.32, lon: 10.14, ip: { lat: 54.45, lon: 8.55 } },
  { key: 'Regensburg', lat: 49.01, lon: 12.1, eng: ESSEX, ip: { lat: 51.25, lon: 3.2 } },
  { key: 'Oschersleben', lat: 52.03, lon: 11.25, ip: { lat: 52.55, lon: 4.6 } },
  { key: 'Channel', lat: 51.05, lon: 2.35, home: true, from: FRANKFURT, eng: KENT },
];

// Coastline outlines, [lon, lat]. Rough by design: enough to read as a chart.
const ENGLAND: Pt[] = [
  [-1.6, 55.6], [-1.6, 55.0], [-1.2, 54.6], [-0.6, 54.1], [-0.15, 53.6], [0.1, 53.45], [0.35, 53.2],
  [0.3, 52.95], [0.5, 52.8], [0.6, 52.95], [1.1, 52.95], [1.35, 52.93], [1.6, 52.7], [1.75, 52.5],
  [1.7, 52.2], [1.55, 51.95], [1.3, 51.95], [1.1, 51.8], [0.9, 51.55], [0.6, 51.5], [0.5, 51.45],
  [1.0, 51.35], [1.44, 51.36], [1.3, 51.1], [1.0, 50.95], [0.4, 50.75], [-0.2, 50.8], [-1.2, 50.7],
  [-2.5, 50.6], [-4.5, 50.2], [-6.0, 50.0], [-6.0, 58.0], [-1.6, 58.0],
];

const MAINLAND: Pt[] = [
  [-1.9, 49.7], [-1.2, 49.45], [-0.3, 49.35], [0.1, 49.5], [0.4, 49.45], [1.1, 49.9], [1.6, 50.45],
  [1.6, 50.73], [1.85, 50.95], [2.4, 51.05], [2.9, 51.23], [3.2, 51.35], [3.6, 51.45], [4.1, 51.98],
  [4.27, 52.1], [4.6, 52.46], [4.6, 52.6], [4.75, 52.95], [5.0, 53.1], [5.4, 53.18], [6.0, 53.35],
  [6.6, 53.45], [6.9, 53.33], [7.2, 53.37], [7.6, 53.6], [8.15, 53.52], [8.6, 53.87], [8.9, 54.3],
  [8.6, 54.9], [8.1, 55.6], [8.1, 56.2], [8.6, 57.1], [10.6, 57.7], [10.4, 57.2], [10.2, 56.6],
  [10.0, 56.1], [10.0, 55.6], [9.8, 55.0], [9.45, 54.8], [10.15, 54.35], [10.9, 53.95], [12.1, 54.2],
  [13.4, 54.6], [14.2, 54.0], [16.0, 54.4], [16.0, 47.0], [-1.2, 43.4], [-1.3, 46.1], [-2.2, 47.2],
  [-4.5, 47.8], [-4.8, 48.4], [-3.0, 48.8], [-1.6, 48.65],
];

const ISLANDS: Pt[] = [
  [4.8, 53.06], [5.05, 53.3], [5.35, 53.4], [5.8, 53.45], [6.2, 53.48], [6.75, 53.57],
  [7.05, 53.7], [7.2, 53.7], [7.9, 54.18], [8.35, 54.85], [8.4, 55.4],
];

const COUNTRIES: [string, Geo][] = [
  ['ENGLAND', { lat: 52.6, lon: -2.1 }], ['NORTH SEA', { lat: 54.3, lon: 2.8 }],
  ['HOLLAND', { lat: 52.1, lon: 5.4 }], ['BELGIUM', { lat: 50.6, lon: 4.5 }],
  ['FRANCE', { lat: 48.9, lon: 2.4 }], ['GERMANY', { lat: 50.7, lon: 9.6 }],
  ['DENMARK', { lat: 56.0, lon: 9.3 }],
];

// Side-raid targets (game/SideRaids.ts) and the chart data the campaign map (CampaignMap.ts) reuses
const RUHR_IP: Geo = { lat: 52.3, lon: 4.4 }, FRISIAN_IP: Geo = { lat: 53.45, lon: 5.6 };
PLACES.push(
  { key: 'Hamm', lat: 51.68, lon: 7.82, ip: RUHR_IP },
  { key: 'Münster', lat: 51.96, lon: 7.63, ip: RUHR_IP },
  { key: 'Osnabrück', lat: 52.28, lon: 8.05, ip: RUHR_IP },
  { key: 'Hannover', lat: 52.37, lon: 9.73, ip: { lat: 52.6, lon: 4.6 } },
  { key: 'Rheine', lat: 52.28, lon: 7.44, ip: RUHR_IP },
  { key: 'Twente', lat: 52.27, lon: 6.89, ip: RUHR_IP },
  { key: 'Oldenburg', lat: 53.14, lon: 8.21, ip: FRISIAN_IP },
  { key: 'Gelsenkirchen', lat: 51.51, lon: 7.09, eng: ESSEX, ip: { lat: 51.9, lon: 4.1 } },
  { key: 'Leuna', lat: 51.32, lon: 12.02, ip: { lat: 52.3, lon: 4.2 } },
  { key: 'Misburg', lat: 52.39, lon: 9.84, ip: { lat: 52.6, lon: 4.6 } },
  { key: 'Wilhelmshaven', lat: 53.53, lon: 8.11, ip: FRISIAN_IP },
  { key: 'Brunswick', lat: 52.27, lon: 10.52, ip: { lat: 52.55, lon: 4.6 } },
  { key: 'Kassel', lat: 51.31, lon: 9.49, eng: ESSEX, ip: { lat: 51.3, lon: 3.3 } },
  { key: 'Gotha', lat: 50.95, lon: 10.7, eng: ESSEX, ip: { lat: 51.3, lon: 3.3 } },
);
export const CHART = { BASE, NORFOLK, ESSEX, KENT, BERLIN, FRANKFURT, PLACES, ENGLAND, MAINLAND, ISLANDS, COUNTRIES, KX } as const;
export type ChartPlace = Place;
