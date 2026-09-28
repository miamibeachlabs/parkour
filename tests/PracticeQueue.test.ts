import { expect, test } from 'bun:test';
import { parkour } from '../src/content/parkour.ts';
import { isUnlocked, type SkillProfile } from '../src/domain/SkillGraph.ts';
import { lockedSkills, practiceQueue } from '../src/domain/PracticeQueue.ts';

const on = new Date('2026-09-27T12:00:00');

test('hard prerequisites lock the kong vault', () => {
  expect(isUnlocked(parkour, { states: {}, practice: [] }, 'kong-vault')).toBe(false);
  expect(isUnlocked(parkour, {
    states: { 'ground-kong': 'acquired' },
    practice: [],
  }, 'kong-vault')).toBe(true);
});

test('the queue surfaces stale, foundational skills first', () => {
  const profile: SkillProfile = {
    states: { 'animal-landing': 'acquired' },
    practice: [{ skill: 'animal-landing', date: '2026-09-27', intensity: 'medium' }],
  };
  const queue = practiceQueue(parkour, profile, on);
  expect(queue.find(item => item.skill.id === 'animal-landing')?.freshness).toBe('fresh');
  expect(queue[0].skill.id).not.toBe('animal-landing');
});

test('locked skills explain the unmet hard requirement', () => {
  const kong = lockedSkills(parkour, { states: {}, practice: [] })
    .find(item => item.skill.id === 'kong-vault');
  expect(kong?.missing.map(skill => skill.id)).toEqual(['ground-kong']);
});

test('helpful foundations improve recommendation priority without unlocking a skill', () => {
  const profile: SkillProfile = {
    states: { 'animal-landing': 'acquired' },
    practice: [],
  };
  const precision = practiceQueue(parkour, profile, on)
    .find(item => item.skill.id === 'precision-landing');
  expect(precision?.reasons).toContain('supported by foundations');
});
