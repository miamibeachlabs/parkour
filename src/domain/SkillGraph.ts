export type SkillId = string;
export type CategoryId = string;
export type RelationKind = 'requires' | 'supports';
export type SkillState = 'exploring' | 'practicing' | 'acquired';
export type SkillProgress = 'untried' | SkillState;
export type PracticeIntensity = 'light' | 'medium' | 'intensive';
export type SessionApproach = 'ready' | 'stretch';

export type Category = Readonly<{
  id: CategoryId;
  name: string;
  description: string;
}>;

export type Skill = Readonly<{
  id: SkillId;
  name: string;
  description: string;
  category: CategoryId;
  importance: 1 | 2 | 3;
  origin: string;
  functions: readonly string[];
  tutorialUrl?: string;
}>;

export type Relation = Readonly<{
  from: SkillId;
  to: SkillId;
  kind: RelationKind;
}>;

export type SkillPack = Readonly<{
  id: string;
  name: string;
  categories: readonly Category[];
  skills: readonly Skill[];
  relations: readonly Relation[];
}>;

export type PracticeEvent = Readonly<{
  skill: SkillId;
  date: string;
  intensity: PracticeIntensity;
}>;

export type SkillSessionEntry = Readonly<{
  kind?: 'skill';
  skill: SkillId;
  intensity: PracticeIntensity;
  approach?: SessionApproach;
}>;

export type ComboSessionEntry = Readonly<{
  kind: 'combo';
  id: string;
  skills: readonly SkillId[];
  intensity: PracticeIntensity;
  approach?: SessionApproach;
  label?: string;
}>;

export type SessionEntry = SkillSessionEntry | ComboSessionEntry;

export type CompletedSession = Readonly<{
  id: string;
  date: string;
  entries: readonly SessionEntry[];
}>;

export type OpenSession = Readonly<{
  startedAt: string;
  entries: readonly SessionEntry[];
}>;

export type SkillProfile = Readonly<{
  states: Readonly<Record<SkillId, SkillState>>;
  sessions: readonly CompletedSession[];
  openSession?: OpenSession;
}>;

export const emptyProfile = (): SkillProfile => ({ states: {}, sessions: [] });

export const removeCompletedSession = (profile: SkillProfile, sessionId: string): SkillProfile => ({
  ...profile,
  sessions: profile.sessions.filter(session => session.id !== sessionId),
});

export const replaceCompletedSession = (
  profile: SkillProfile,
  replacement: CompletedSession,
): SkillProfile => ({
  ...profile,
  sessions: profile.sessions.map(session =>
    session.id === replacement.id ? replacement : session),
});

export const practiceEvents = (profile: SkillProfile): readonly PracticeEvent[] =>
  profile.sessions.flatMap(session =>
    session.entries.flatMap(entry =>
      sessionEntrySkills(entry).map(skill => ({ skill, intensity: entry.intensity, date: session.date }))));

export const sessionEntrySkills = (entry: SessionEntry): readonly SkillId[] =>
  entry.kind === 'combo' ? entry.skills : [entry.skill];

export const sessionEntryId = (entry: SessionEntry) =>
  entry.kind === 'combo' ? entry.id : entry.skill;

export const incoming = (
  pack: SkillPack,
  skill: SkillId,
  kind?: RelationKind,
) => pack.relations.filter(relation =>
  relation.to === skill && (kind === undefined || relation.kind === kind));

export const outgoing = (
  pack: SkillPack,
  skill: SkillId,
  kind?: RelationKind,
) => pack.relations.filter(relation =>
  relation.from === skill && (kind === undefined || relation.kind === kind));

// Requirements describe the default route, not a claim that every learner must
// traverse it. Completed practice establishes the learner's frontier, while
// reliable acquisition remains an explicit personal decision.
export const isSatisfied = (profile: SkillProfile, skill: SkillId) =>
  progressOf(profile, skill) !== 'untried';

export const progressOf = (profile: SkillProfile, skill: SkillId): SkillProgress =>
  profile.states[skill]
  ?? (practiceEvents(profile).some(event => event.skill === skill) ? 'exploring' : 'untried');

export const isUnlocked = (pack: SkillPack, profile: SkillProfile, skill: SkillId) =>
  isSatisfied(profile, skill)
  || incoming(pack, skill, 'requires').every(relation => isSatisfied(profile, relation.from));

export const readinessDepth = (
  pack: SkillPack,
  profile: SkillProfile,
  skill: SkillId,
  seen: readonly SkillId[] = [],
): number => {
  if (isUnlocked(pack, profile, skill)) return 0;
  if (seen.includes(skill)) return Infinity;
  const missing = incoming(pack, skill, 'requires')
    .filter(relation => !isSatisfied(profile, relation.from));
  return 1 + Math.max(...missing.map(relation =>
    readinessDepth(pack, profile, relation.from, [...seen, skill])));
};
