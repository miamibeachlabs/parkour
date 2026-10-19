import {
  type CategoryId,
  type CompletedSession,
  type SessionEntry,
  type Skill,
  type SkillId,
  type SkillPack,
  type SkillProfile,
  incoming,
  isSatisfied,
  isUnlocked,
  outgoing,
  progressOf,
  readinessDepth,
} from './SkillGraph.ts';

export type Freshness = 'fresh' | 'getting-stale' | 'stale';

export type QueueItem = Readonly<{
  skill: Skill;
  priority: number;
  freshness: Freshness;
  sessionsSincePractice?: number;
  categoryIsStale: boolean;
  reasons: readonly string[];
}>;

export type LockedSkill = Readonly<{
  skill: Skill;
  missing: readonly Skill[];
}>;

const staleAfterSessions = 4;

const sessionsNewestFirst = (profile: SkillProfile): readonly CompletedSession[] =>
  profile.sessions
    .map((session, index) => ({ session, index }))
    .sort((left, right) => right.session.date.localeCompare(left.session.date) || right.index - left.index)
    .map(({ session }) => session);

const sessionsSincePractice = (
  profile: SkillProfile,
  pack: SkillPack,
  skill?: SkillId,
  category?: CategoryId,
) => {
  const gap = sessionsNewestFirst(profile).findIndex(session =>
    session.entries.some(entry =>
      (!skill || entry.skill === skill)
      && (!category || pack.skills.find(item => item.id === entry.skill)?.category === category)));
  return gap === -1 ? undefined : gap;
};

const debt = (sessions: number | undefined) =>
  sessions === undefined ? 1 : Math.min(1, sessions / staleAfterSessions);

const freshness = (sessions: number | undefined): Freshness =>
  sessions === undefined || sessions >= staleAfterSessions ? 'stale'
    : sessions === 0 ? 'fresh'
    : 'getting-stale';

export const practiceQueue = (
  pack: SkillPack,
  profile: SkillProfile,
): readonly QueueItem[] => pack.skills
  .filter(skill =>
    isUnlocked(pack, profile, skill.id) || progressOf(profile, skill.id) === 'learning')
  .map(skill => {
    const skillGap = sessionsSincePractice(profile, pack, skill.id);
    const categoryGap = sessionsSincePractice(profile, pack, undefined, skill.category);
    const skillDebt = debt(skillGap);
    const categoryDebt = debt(categoryGap);
    const progress = progressOf(profile, skill.id);
    const learning = progress === 'learning';
    const unlocks = outgoing(pack, skill.id, 'requires').length;
    const helpfulFoundations = incoming(pack, skill.id, 'helps')
      .filter(relation => isSatisfied(profile, relation.from)).length;
    const priority = skill.importance * (skillDebt + categoryDebt * .45)
      + (learning ? 1 : 0)
      + unlocks * .2
      + helpfulFoundations * .3;
    const reasons = [
      skill.importance === 3 ? 'core foundation' : undefined,
      skillGap !== undefined && freshness(skillGap) === 'stale' ? 'needs refreshing' : undefined,
      categoryGap !== undefined && freshness(categoryGap) === 'stale' ? 'category neglected' : undefined,
      learning ? 'actively learning' : progress === 'not-started' ? 'ready to learn' : undefined,
      helpfulFoundations ? 'supported by foundations' : undefined,
      unlocks > 0 ? `unlocks ${unlocks} skill${unlocks === 1 ? '' : 's'}` : undefined,
    ].filter((reason): reason is string => Boolean(reason));

    return {
      skill,
      priority,
      freshness: freshness(skillGap),
      sessionsSincePractice: skillGap,
      categoryIsStale: freshness(categoryGap) === 'stale',
      reasons,
    };
  })
  .sort((left, right) => right.priority - left.priority || left.skill.name.localeCompare(right.skill.name));

export const lockedSkills = (pack: SkillPack, profile: SkillProfile): readonly LockedSkill[] =>
  pack.skills
    .filter(skill => !isUnlocked(pack, profile, skill.id))
    .map(skill => ({
      skill,
      missing: incoming(pack, skill.id, 'requires')
        .filter(relation => !isSatisfied(profile, relation.from))
        .map(relation => pack.skills.find(candidate => candidate.id === relation.from))
        .filter((candidate): candidate is Skill => candidate !== undefined),
    }));

export const skillsAtReadinessDepth = (
  pack: SkillPack,
  profile: SkillProfile,
  depth: number,
) => pack.skills.filter(skill => readinessDepth(pack, profile, skill.id) === depth);

export const missingRequirements = (pack: SkillPack, profile: SkillProfile, skill: SkillId) =>
  incoming(pack, skill, 'requires')
    .filter(relation => !isSatisfied(profile, relation.from))
    .map(relation => pack.skills.find(candidate => candidate.id === relation.from))
    .filter((candidate): candidate is Skill => candidate !== undefined);

export const readyToLearn = (pack: SkillPack, profile: SkillProfile) =>
  practiceQueue(pack, profile).filter(item => progressOf(profile, item.skill.id) === 'not-started');

export const activeLearning = (pack: SkillPack, profile: SkillProfile) =>
  pack.skills.filter(skill =>
    progressOf(profile, skill.id) === 'learning');

export const needsAttention = (pack: SkillPack, profile: SkillProfile) =>
  practiceQueue(pack, profile).filter(item =>
    progressOf(profile, item.skill.id) === 'learning' || item.freshness !== 'fresh');

export type RecordedSession = Readonly<{
  session: CompletedSession;
  entries: readonly Readonly<{ entry: SessionEntry; skill: Skill }>[];
}>;

export const completedSessions = (pack: SkillPack, profile: SkillProfile): readonly RecordedSession[] =>
  [...profile.sessions]
    .sort((left, right) => right.date.localeCompare(left.date))
    .map(session => ({
      session,
      entries: session.entries
        .map(entry => ({ entry, skill: pack.skills.find(skill => skill.id === entry.skill) }))
        .filter((item): item is { entry: SessionEntry; skill: Skill } => item.skill !== undefined),
    }))
    .filter(session => session.entries.length > 0);

export const categoryFreshness = (pack: SkillPack, profile: SkillProfile) =>
  pack.categories.map(category => {
    const gap = sessionsSincePractice(profile, pack, undefined, category.id);
    return { category, freshness: freshness(gap), sessionsSincePractice: gap };
  });
