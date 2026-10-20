import {
  type CategoryId,
  type CompletedSession,
  type PracticeIntensity,
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
  sessionEntrySkills,
} from './SkillGraph.ts';

export type Freshness = 'fresh' | 'getting-stale' | 'stale';

export type QueueItem = Readonly<{
  skill: Skill;
  priority: number;
  freshness: Freshness;
  sessionsSincePractice?: number;
  lastPracticeIntensity?: PracticeIntensity;
  categoryIsStale: boolean;
  reasons: readonly string[];
}>;

export type LockedSkill = Readonly<{
  skill: Skill;
  missing: readonly Skill[];
}>;

const reserveSessions: Readonly<Record<PracticeIntensity, number>> = {
  light: 2,
  medium: 4,
  intensive: 6,
};

const intensityRank: Readonly<Record<PracticeIntensity, number>> = {
  light: 1,
  medium: 2,
  intensive: 3,
};

type PracticeRecency = Readonly<{
  sessionsSincePractice: number;
  intensity: PracticeIntensity;
}>;

const sessionsNewestFirst = (profile: SkillProfile): readonly CompletedSession[] =>
  profile.sessions
    .map((session, index) => ({ session, index }))
    .sort((left, right) => right.session.date.localeCompare(left.session.date) || right.index - left.index)
    .map(({ session }) => session);

const latestPractice = (
  profile: SkillProfile,
  pack: SkillPack,
  skill?: SkillId,
  category?: CategoryId,
) => {
  const sessions = sessionsNewestFirst(profile);
  for (const [sessionsSincePractice, session] of sessions.entries()) {
    const entries = session.entries.flatMap(entry =>
      sessionEntrySkills(entry)
        .filter(skillId => (!skill || skillId === skill)
          && (!category || pack.skills.find(item => item.id === skillId)?.category === category))
        .map(skillId => ({ skill: skillId, intensity: entry.intensity })));
    if (entries.length > 0) {
      const intensity = entries.reduce((strongest, entry) =>
        intensityRank[entry.intensity] > intensityRank[strongest] ? entry.intensity : strongest,
      entries[0].intensity);
      return { sessionsSincePractice, intensity };
    }
  }
  return undefined;
};

const debt = (practice: PracticeRecency | undefined) =>
  practice === undefined ? 1
    : Math.min(1, practice.sessionsSincePractice / reserveSessions[practice.intensity]);

const freshness = (practice: PracticeRecency | undefined): Freshness =>
  practice === undefined || practice.sessionsSincePractice >= reserveSessions[practice.intensity] ? 'stale'
    : practice.sessionsSincePractice < reserveSessions[practice.intensity] * .4 ? 'fresh'
    : 'getting-stale';

export const practiceQueue = (
  pack: SkillPack,
  profile: SkillProfile,
): readonly QueueItem[] => pack.skills
  .filter(skill =>
    isUnlocked(pack, profile, skill.id) || progressOf(profile, skill.id) === 'learning')
  .map(skill => {
    const skillPractice = latestPractice(profile, pack, skill.id);
    const categoryPractice = latestPractice(profile, pack, undefined, skill.category);
    const skillDebt = debt(skillPractice);
    const categoryDebt = debt(categoryPractice);
    const progress = progressOf(profile, skill.id);
    const learning = progress === 'learning';
    const unlocks = outgoing(pack, skill.id, 'requires').length;
    const supportingPractice = incoming(pack, skill.id, 'supports')
      .filter(relation => isSatisfied(profile, relation.from)).length;
    const priority = skill.importance * (skillDebt + categoryDebt * .45)
      + (learning ? 1 : 0)
      + unlocks * .2
      + supportingPractice * .3;
    const reasons = [
      skill.importance === 3 ? 'core foundation' : undefined,
      skillPractice !== undefined && freshness(skillPractice) === 'stale' ? 'needs refreshing' : undefined,
      categoryPractice !== undefined && freshness(categoryPractice) === 'stale' ? 'category neglected' : undefined,
      learning ? 'actively learning' : progress === 'not-started' ? 'ready to learn' : undefined,
      supportingPractice ? 'supported by practice' : undefined,
      unlocks > 0 ? `unlocks ${unlocks} skill${unlocks === 1 ? '' : 's'}` : undefined,
    ].filter((reason): reason is string => Boolean(reason));

    return {
      skill,
      priority,
      freshness: freshness(skillPractice),
      sessionsSincePractice: skillPractice?.sessionsSincePractice,
      lastPracticeIntensity: skillPractice?.intensity,
      categoryIsStale: freshness(categoryPractice) === 'stale',
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
  entries: readonly Readonly<{ entry: SessionEntry; skills: readonly Skill[] }>[];
}>;

export const completedSessions = (pack: SkillPack, profile: SkillProfile): readonly RecordedSession[] =>
  [...profile.sessions]
    .sort((left, right) => right.date.localeCompare(left.date))
    .map(session => ({
      session,
      entries: session.entries
        .map(entry => ({ entry, skills: sessionEntrySkills(entry)
          .map(skillId => pack.skills.find(skill => skill.id === skillId))
          .filter((skill): skill is Skill => skill !== undefined) }))
        .filter(item => item.skills.length > 0),
    }))
    .filter(session => session.entries.length > 0);

export const categoryFreshness = (pack: SkillPack, profile: SkillProfile) =>
  pack.categories.map(category => {
    const practice = latestPractice(profile, pack, undefined, category.id);
    return { category, freshness: freshness(practice), sessionsSincePractice: practice?.sessionsSincePractice };
  });
