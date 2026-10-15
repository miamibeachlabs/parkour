export type SkillId = string;
export type CategoryId = string;
export type RelationKind = 'requires' | 'helps';
export type SkillState = 'learning' | 'acquired';
export type SkillProgress = 'not-started' | SkillState;
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

export type SessionEntry = Readonly<{
  skill: SkillId;
  intensity: PracticeIntensity;
  approach?: SessionApproach;
}>;

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
    session.entries.map(entry => ({ ...entry, date: session.date })));

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
// traverse it. Completed practice is evidence that a skill is usable enough to
// establish the learner's frontier, while Acquired remains an explicit mastery
// decision.
export const isSatisfied = (profile: SkillProfile, skill: SkillId) =>
  progressOf(profile, skill) !== 'not-started';

export const progressOf = (profile: SkillProfile, skill: SkillId): SkillProgress =>
  profile.states[skill]
  ?? (practiceEvents(profile).some(event => event.skill === skill) ? 'learning' : 'not-started');

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
