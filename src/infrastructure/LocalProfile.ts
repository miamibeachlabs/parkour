import {
  emptyProfile,
  type CompletedSession,
  type PracticeIntensity,
  type SessionApproach,
  type SessionEntry,
  type SkillProfile,
  sessionEntrySkills,
} from '../domain/SkillGraph.ts';

const storageKey = 'parkour-profile-v3';
const legacyStorageKeys = ['parkour-profile-v2', 'parkour-profile-v1', 'skill-queue-profile-v1'];

const intensities: readonly PracticeIntensity[] = ['light', 'medium', 'intensive'];
const isIntensity = (value: unknown): value is PracticeIntensity =>
  typeof value === 'string' && intensities.includes(value as PracticeIntensity);
const isApproach = (value: unknown): value is SessionApproach =>
  value === 'ready' || value === 'stretch';
const stateFrom = (value: unknown): SkillProfile['states'][string] | undefined =>
  value === 'learning' ? 'practicing'
    : value === 'exploring' || value === 'practicing' || value === 'acquired' ? value
      : undefined;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sessionEntry = (value: unknown): SessionEntry | undefined =>
  isRecord(value) && isIntensity(value.intensity) && (value.approach === undefined || isApproach(value.approach))
    ? value.kind === 'combo'
      && typeof value.id === 'string'
      && Array.isArray(value.skills)
      && value.skills.length >= 2
      && value.skills.every(skill => typeof skill === 'string')
      && (value.label === undefined || typeof value.label === 'string')
        ? { kind: 'combo', id: value.id, skills: value.skills, intensity: value.intensity, ...(value.approach ? { approach: value.approach } : {}), ...(value.label ? { label: value.label } : {}) }
        : typeof value.skill === 'string'
          && (value.kind === undefined || value.kind === 'skill')
          ? { ...(value.kind === 'skill' ? { kind: 'skill' as const } : {}), skill: value.skill, intensity: value.intensity, ...(value.approach ? { approach: value.approach } : {}) }
          : undefined
    : undefined;

const completedSession = (value: unknown): CompletedSession | undefined => {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.date !== 'string' || !Array.isArray(value.entries)) return undefined;
  const entries = value.entries.map(sessionEntry);
  return entries.every((entry): entry is SessionEntry => entry !== undefined) && entries.length > 0
    ? { id: value.id, date: value.date, entries }
    : undefined;
};

const profileFrom = (value: unknown): SkillProfile | undefined => {
  if (!isRecord(value) || !isRecord(value.states) || !Array.isArray(value.sessions)) return undefined;
  const states = Object.entries(value.states).map(([skill, state]) => [skill, stateFrom(state)] as const);
  const sessions = value.sessions.map(completedSession);
  if (!states.every(([, state]) => state !== undefined)
    || !sessions.every((session): session is CompletedSession => session !== undefined)) return undefined;
  const open = value.openSession;
  if (open !== undefined && (!isRecord(open) || typeof open.startedAt !== 'string' || !Array.isArray(open.entries))) return undefined;
  let openSession: SkillProfile['openSession'];
  if (isRecord(open) && typeof open.startedAt === 'string' && Array.isArray(open.entries)) {
    const entries = open.entries.map(sessionEntry);
    if (!entries.every((entry): entry is SessionEntry => entry !== undefined)) return undefined;
    openSession = { startedAt: open.startedAt, entries };
  }
  return {
    states: Object.fromEntries(states) as SkillProfile['states'],
    sessions,
    ...(openSession ? { openSession: { startedAt: openSession.startedAt, entries: openSession.entries } } : {}),
  };
};

type ProfileBackup = Readonly<{
  format: 'parkour-profile';
  version: 1 | 2 | 3;
  exportedAt: string;
  profile: SkillProfile;
}>;

const legacySessions = (practice: unknown): readonly CompletedSession[] =>
  Array.isArray(practice) ? practice.flatMap((event, index) =>
    event && typeof event === 'object'
    && typeof event.skill === 'string'
    && typeof event.date === 'string'
    && isIntensity(event.intensity)
      ? [{ id: `legacy-${event.date}-${index}`, date: event.date, entries: [{ skill: event.skill, intensity: event.intensity }] }]
      : []) : [];

export const loadProfile = (): SkillProfile => {
  const current = localStorage.getItem(storageKey);
  const legacy = legacyStorageKeys.map(key => localStorage.getItem(key)).find(Boolean);
  const saved = current ?? legacy;
  if (!saved) return emptyProfile();

  try {
    const profile = JSON.parse(saved) as SkillProfile & { practice?: unknown };
    const parsed = profileFrom(profile)
      ?? (isRecord(profile) && 'states' in profile
        ? profileFrom({
          states: profile.states,
          sessions: legacySessions(profile.practice),
          openSession: profile.openSession,
        }) ?? emptyProfile()
        : emptyProfile());
    return parsed;
  } catch {
    return emptyProfile();
  }
};

export const saveProfile = (profile: SkillProfile) =>
  {
    localStorage.setItem(storageKey, JSON.stringify(profile));
    legacyStorageKeys.forEach(key => localStorage.removeItem(key));
  };

export const exportProfile = (profile: SkillProfile): string =>
  JSON.stringify({
    format: 'parkour-profile',
    version: 3,
    exportedAt: new Date().toISOString(),
    profile,
  } satisfies ProfileBackup, null, 2);

export const importProfile = (text: string, skillIds: readonly string[]): SkillProfile | undefined => {
  try {
    const backup = JSON.parse(text) as Partial<ProfileBackup>;
    if (backup.format !== 'parkour-profile' || (backup.version !== 1 && backup.version !== 2 && backup.version !== 3)) return undefined;
    const profile = profileFrom(backup.profile);
    if (!profile) return undefined;
    const known = new Set(skillIds);
    const referencesKnownSkill = (skill: string) => known.has(skill);
    const entriesAreKnown = (entries: readonly SessionEntry[]) => entries.every(entry => sessionEntrySkills(entry).every(referencesKnownSkill));
    return Object.keys(profile.states).every(referencesKnownSkill)
      && profile.sessions.every(session => entriesAreKnown(session.entries))
      && (!profile.openSession || entriesAreKnown(profile.openSession.entries))
      ? profile
      : undefined;
  } catch {
    return undefined;
  }
};
