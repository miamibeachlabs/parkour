import {
  type CategoryId,
  type PracticeEvent,
  type Skill,
  type SkillId,
  type SkillPack,
  type SkillProfile,
  incoming,
  isUnlocked,
  outgoing,
} from './SkillGraph.ts';

export type Freshness = 'fresh' | 'getting-stale' | 'stale';

export type QueueItem = Readonly<{
  skill: Skill;
  priority: number;
  freshness: Freshness;
  daysSincePractice?: number;
  categoryIsStale: boolean;
  reasons: readonly string[];
}>;

export type LockedSkill = Readonly<{
  skill: Skill;
  missing: readonly Skill[];
}>;

const day = 86_400_000;
const refreshDays = { light: 5, medium: 10, intensive: 15 } as const;

const daysBetween = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / day));

const latestPractice = (
  events: readonly PracticeEvent[],
  on: Date,
  skill?: SkillId,
  category?: CategoryId,
  pack?: SkillPack,
) => events
  .filter(event => !skill || event.skill === skill)
  .filter(event => !category || pack?.skills.find(item => item.id === event.skill)?.category === category)
  .map(event => ({ event, days: daysBetween(new Date(`${event.date}T00:00:00`), on) }))
  .sort((left, right) => left.days - right.days)[0];

const debt = (event: { event: PracticeEvent; days: number } | undefined) =>
  event ? Math.min(1, event.days / refreshDays[event.event.intensity]) : 1;

const freshness = (amount: number): Freshness =>
  amount < .4 ? 'fresh' : amount < .85 ? 'getting-stale' : 'stale';

export const practiceQueue = (
  pack: SkillPack,
  profile: SkillProfile,
  on = new Date(),
): readonly QueueItem[] => pack.skills
  .filter(skill => isUnlocked(pack, profile, skill.id))
  .map(skill => {
    const latest = latestPractice(profile.practice, on, skill.id);
    const categoryLatest = latestPractice(profile.practice, on, undefined, skill.category, pack);
    const skillDebt = debt(latest);
    const categoryDebt = debt(categoryLatest);
    const learning = profile.states[skill.id] !== 'acquired';
    const unlocks = outgoing(pack, skill.id, 'requires').length;
    const helpfulFoundations = incoming(pack, skill.id, 'helps')
      .filter(relation => profile.states[relation.from] === 'acquired').length;
    const priority = skill.importance * (skillDebt + categoryDebt * .45)
      + (learning ? 1 : 0)
      + unlocks * .2
      + helpfulFoundations * .3;
    const reasons = [
      skill.importance === 3 ? 'core foundation' : undefined,
      freshness(skillDebt) === 'stale' ? 'needs refreshing' : undefined,
      freshness(categoryDebt) === 'stale' ? 'category neglected' : undefined,
      learning ? 'ready to learn' : undefined,
      helpfulFoundations ? 'supported by foundations' : undefined,
      unlocks > 0 ? `unlocks ${unlocks} skill${unlocks === 1 ? '' : 's'}` : undefined,
    ].filter((reason): reason is string => Boolean(reason));

    return {
      skill,
      priority,
      freshness: freshness(skillDebt),
      daysSincePractice: latest?.days,
      categoryIsStale: freshness(categoryDebt) === 'stale',
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
        .filter(relation => profile.states[relation.from] !== 'acquired')
        .map(relation => pack.skills.find(candidate => candidate.id === relation.from))
        .filter((candidate): candidate is Skill => candidate !== undefined),
    }));

export const readyToLearn = (pack: SkillPack, profile: SkillProfile) =>
  practiceQueue(pack, profile).filter(item => profile.states[item.skill.id] !== 'acquired');

export const categoryFreshness = (pack: SkillPack, profile: SkillProfile, on = new Date()) =>
  pack.categories.map(category => {
    const latest = latestPractice(profile.practice, on, undefined, category.id, pack);
    const amount = debt(latest);
    return { category, freshness: freshness(amount), daysSincePractice: latest?.days };
  });
