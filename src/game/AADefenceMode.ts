import type { Mission } from './Missions';
import { registerMode, type ModeDef } from './Modes';
import { mountLeaderboard } from '../ui/LeaderboardPanel';
import { tx } from '../i18n';
import type { Mood, Weather } from '../render/Weather';
import { AA_LEADERBOARD } from '../net/Leaderboard';
export const AA_MOODS: Mood[] = ['clear', 'overcast', 'storm', 'dusk', 'night'];
export function aaWeather(mood: Mood): Weather {
  return { mood, sunEl: mood === 'dusk' ? 8 : mood === 'night' ? 24 : 42, sunAz: 205, low: mood === 'storm' ? 0.97 : mood === 'overcast' ? 0.9 : 0.5, high: 0.5, contrails: false };
}
export function aaMission(mood: Mood = AA_MOODS[Math.floor(Math.random() * AA_MOODS.length)]): Mission {
  return {
    id: AA_LEADERBOARD, number: 0, title: 'Hold the Field', target: 'Deenethorpe air defence', date: 'Airfield under attack', role: 'gunner',
    briefing: ['Man the ground guns. Stop the raiders before they destroy the control tower or every parked bomber.', 'Switch between the quad .50 and the Bofors. Lead your targets, fire short bursts, and choose one repair or upgrade after each wave.'],
    objectives: ['Protect the tower and parked bombers', 'Hold off as many waves as possible'],
    bombers: 0, escorts: 0, waves: [], duration: Infinity, rounds: Infinity, maxBombersLost: 99, weather: aaWeather(mood),
    round: { duration: Infinity, start: 0, min: 0, max: 0, skill: [1, 1] },
  };
}
export const AA_MODE: ModeDef = {
  id: AA_LEADERBOARD, title: 'Hold the Field', blurb: 'Fixed AA guns. Endless raids. Defend your airfield from the ground.', roles: ['gunner'],
  mission: () => aaMission(), matches: m => m.id === AA_LEADERBOARD, board: () => AA_LEADERBOARD,
  panel(body, onPick, options) {
    const p = document.createElement('p'); p.textContent = tx(AA_MODE.blurb); body.append(p);
    const label = document.createElement('label'); label.className = 'mode-picker'; label.textContent = tx('Weather');
    const weather = document.createElement('select'); weather.dataset.aaWeather = '1';
    for (const mood of AA_MOODS) {
      const option = document.createElement('option'); option.value = mood; option.textContent = tx(mood[0].toUpperCase() + mood.slice(1)); weather.append(option);
    }
    label.append(weather); body.append(label);
    const row = document.createElement('div'); row.className = 'row'; body.append(row);
    const launch = document.createElement('button'); launch.className = 'btn'; launch.dataset.aaStart = '1'; launch.textContent = tx('Hold the Field');
    launch.onclick = () => onPick(aaMission(weather.value as Mood)); row.append(launch);
    if (options?.boards !== false) mountLeaderboard(body, AA_LEADERBOARD, tx('Airfield defenders'));

  },
};
registerMode(AA_MODE, 1);
