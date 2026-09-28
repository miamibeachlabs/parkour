import {
  emptyProfile,
  type CompletedSession,
  type PracticeIntensity,
  type SkillProfile,
} from '../domain/SkillGraph.ts';

const storageKey = 'parkour-profile-v1';
const legacyStorageKeys = ['skill-queue-profile-v1'];

const intensities: readonly PracticeIntensity[] = ['light', 'medium', 'intensive'];
const isIntensity = (value: unknown): value is PracticeIntensity =>
  typeof value === 'string' && intensities.includes(value as PracticeIntensity);

const legacySessions = (practice: unknown): readonly CompletedSession[] =>
  Array.isArray(practice) ? practice.flatMap((event, index) =>
    event && typeof event === 'object'
    && typeof event.skill === 'string'
    && typeof event.date === 'string'
    && isIntensity(event.intensity)
      ? [{ id: `legacy-${event.date}-${index}`, date: event.date, entries: [{ skill: event.skill, intensity: event.intensity }] }]
      : []) : [];

export const loadProfile = (): SkillProfile => {
  const saved = localStorage.getItem(storageKey)
    ?? legacyStorageKeys.map(key => localStorage.getItem(key)).find(Boolean);
  if (!saved) return emptyProfile();

  try {
    const profile = JSON.parse(saved) as SkillProfile & { practice?: unknown };
    if (!profile || typeof profile !== 'object' || !profile.states)
      return emptyProfile();
    return {
      states: profile.states,
      sessions: Array.isArray(profile.sessions) ? profile.sessions : legacySessions(profile.practice),
      openSession: profile.openSession,
    };
  } catch {
    return emptyProfile();
  }
};

export const saveProfile = (profile: SkillProfile) =>
  {
    localStorage.setItem(storageKey, JSON.stringify(profile));
    legacyStorageKeys.forEach(key => localStorage.removeItem(key));
  };
