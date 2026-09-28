import { expect, test } from 'bun:test';
import { parkour } from '../src/content/parkour.ts';
import { isUnlocked, practiceEvents, progressOf, type SkillProfile } from '../src/domain/SkillGraph.ts';
import { activeLearning, lockedSkills, needsAttention, practiceQueue } from '../src/domain/PracticeQueue.ts';

const on = new Date('2026-09-27T12:00:00');

test('hard prerequisites lock the kong vault', () => {
  expect(isUnlocked(parkour, { states: {}, sessions: [] }, 'kong-vault')).toBe(false);
  expect(isUnlocked(parkour, {
    states: { 'ground-kong': 'acquired' },
    sessions: [],
  }, 'kong-vault')).toBe(true);
});

test('the queue surfaces stale, foundational skills first', () => {
  const profile: SkillProfile = {
    states: { 'animal-landing': 'acquired' },
    sessions: [{ id: 'landing', date: '2026-09-27', entries: [{ skill: 'animal-landing', intensity: 'medium' }] }],
  };
  const queue = practiceQueue(parkour, profile, on);
  expect(queue.find(item => item.skill.id === 'animal-landing')?.freshness).toBe('fresh');
  expect(queue[0].skill.id).not.toBe('animal-landing');
});

test('locked skills explain the unmet hard requirement', () => {
  const kong = lockedSkills(parkour, { states: {}, sessions: [] })
    .find(item => item.skill.id === 'kong-vault');
  expect(kong?.missing.map(skill => skill.id)).toEqual(['ground-kong']);
});

test('helpful foundations improve recommendation priority without unlocking a skill', () => {
  const profile: SkillProfile = {
    states: { 'animal-landing': 'acquired' },
    sessions: [],
  };
  const precision = practiceQueue(parkour, profile, on)
    .find(item => item.skill.id === 'precision-landing');
  expect(precision?.reasons).toContain('supported by foundations');
});

test('existing practice becomes a durable learning path until explicitly acquired', () => {
  const profile: SkillProfile = {
    states: {},
    sessions: [{ id: 'vault', date: '2026-09-27', entries: [{ skill: 'safety-vault', intensity: 'medium' }] }],
  };
  expect(progressOf(profile, 'safety-vault')).toBe('learning');
  expect(activeLearning(parkour, profile).map(skill => skill.id)).toContain('safety-vault');
  expect(needsAttention(parkour, profile, on).map(item => item.skill.id)).not.toContain('safety-vault');
});

test('completed sessions retain a shared history boundary and per-skill intensity', () => {
  const profile: SkillProfile = {
    states: {},
    sessions: [{
      id: 'beach-session',
      date: '2026-09-27',
      entries: [
        { skill: 'animal-landing', intensity: 'medium' },
        { skill: 'safety-vault', intensity: 'intensive' },
      ],
    }],
  };
  expect(practiceEvents(profile)).toEqual([
    { skill: 'animal-landing', intensity: 'medium', date: '2026-09-27' },
    { skill: 'safety-vault', intensity: 'intensive', date: '2026-09-27' },
  ]);
});
