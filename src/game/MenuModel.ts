import { CAMPAIGN } from './Missions';
import type { Progress } from '../ui/UI';

export const MAIN_ENTRIES = ['campaign', 'survival', 'coop', 'hangar', 'settings'] as const;
export const HANGAR_TABS = [
  { id: 'crew', label: 'Crew & Skills', entries: [
    ['tour', 'The Tour', 'Twenty-five missions, one ship, one crew'], ['skills', 'Skills', 'Train your gunner'], ['mastery', 'Gunner Mastery', 'Station ranks, challenges and unlocks'], ['crew', 'Crew', 'Stations, skills and recovery'], ['career', 'Career', 'Rank and flight record'],
  ] },
  { id: 'aircraft', label: 'Aircraft & Armory', entries: [
    ['aircraft', 'Aircraft', 'Recognition gallery and quiz'], ['armory', 'Armory', 'Aircraft, weapons and upgrades'], ['customize', 'Customize', 'Name, nose art and paint'],
  ] },
  { id: 'records', label: 'Records', entries: [
    ['trophies', 'Trophies', 'Your achievement collection'], ['leaderboards', 'Leaderboards', 'Global and squadron scores'], ['daily', 'Daily Orders', 'Three orders for today'],
    ['weekly', 'Weekly Challenge', 'A new operation each week'], ['squadron', 'Squadron', 'Your online squadron'], ['career', 'Service Record', 'Rank and flight record'],
  ] },
  { id: 'more', label: 'More', entries: [
    ['manual', 'Field Manual', 'Learn the controls and tactics'], ['whatsnew', "What's new", 'Read the latest bulletin'], ['theatre', 'Theatre', 'Watch your saved moments'],
    ['campaign', 'Campaign Map', 'Story missions and side raids'], ['custom', 'Custom Battle', 'Build your own battle'], ['training', 'Training', 'A guided gunner flight'],
  ] },
] as const;
export type HangarTab = typeof HANGAR_TABS[number]['id'];
export type HangarRoute = 'settings' | typeof HANGAR_TABS[number]['entries'][number][0];
export function nextCampaignMission(progress: Pick<Progress, 'unlocked'>) {
  const index = Number.isFinite(progress.unlocked) ? Math.floor(progress.unlocked) : 0;
  return CAMPAIGN[Math.max(0, Math.min(CAMPAIGN.length - 1, index))];
}

export interface FirstFlightState { tutorialDone?: boolean; promptDismissed?: boolean }
export function shouldStartFirstFlight(saved: FirstFlightState, progress: Progress, careerMissions: number) {
  return !saved.tutorialDone && !saved.promptDismissed && careerMissions === 0 && progress.unlocked === 0
    && Object.keys(progress.best).length === 0 && Object.keys(progress.medals).length === 0 && progress.survival.length === 0;
}
