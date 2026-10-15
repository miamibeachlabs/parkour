import { expect, test } from 'bun:test';
import { parkour } from '../src/generated/parkour.ts';
import { isUnlocked, practiceEvents, progressOf, readinessDepth, removeCompletedSession, replaceCompletedSession, type SkillProfile } from '../src/domain/SkillGraph.ts';
import { exportProfile, importProfile } from '../src/infrastructure/LocalProfile.ts';
import { activeLearning, completedSessions, lockedSkills, needsAttention, practiceQueue, skillsAtReadinessDepth } from '../src/domain/PracticeQueue.ts';

const on = new Date('2026-09-27T12:00:00');

test('unpracticed prerequisites hold back the kong vault by default', () => {
  expect(isUnlocked(parkour, { states: {}, sessions: [] }, 'kong-vault')).toBe(false);
  expect(isUnlocked(parkour, {
    states: { 'ground-kong': 'acquired' },
    sessions: [],
  }, 'kong-vault')).toBe(true);
});

test('completed practice establishes the learner frontier without claiming acquisition', () => {
  const profile: SkillProfile = {
    states: { 'ground-kong': 'learning' },
    sessions: [{
      id: 'ground-kong',
      date: '2026-09-27',
      entries: [{ skill: 'ground-kong', intensity: 'medium', approach: 'stretch' }],
    }],
  };
  expect(isUnlocked(parkour, profile, 'ground-kong')).toBe(true);
  expect(isUnlocked(parkour, profile, 'kong-vault')).toBe(true);
  expect(profile.states['ground-kong']).toBe('learning');
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
  expect(needsAttention(parkour, profile, on).map(item => item.skill.id)).toContain('safety-vault');
});

test('a completed stretch becomes learning practice and advances the frontier', () => {
  const profile: SkillProfile = {
    states: { 'ground-kong': 'learning' },
    sessions: [{
      id: 'stretch',
      date: '2026-09-27',
      entries: [{ skill: 'ground-kong', intensity: 'medium', approach: 'stretch' }],
    }],
  };
  expect(isUnlocked(parkour, profile, 'ground-kong')).toBe(true);
  expect(activeLearning(parkour, profile).map(skill => skill.id)).toContain('ground-kong');
  expect(practiceQueue(parkour, profile, on).map(item => item.skill.id)).toContain('ground-kong');
  expect(needsAttention(parkour, profile, on).map(item => item.skill.id)).toContain('ground-kong');
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

test('session history keeps related practice together and supports correcting one session', () => {
  const profile: SkillProfile = {
    states: {},
    sessions: [
      { id: 'first', date: '2026-09-25', entries: [{ skill: 'animal-landing', intensity: 'light' }] },
      { id: 'latest', date: '2026-09-27', entries: [{ skill: 'safety-vault', intensity: 'intensive' }] },
    ],
  };
  expect(completedSessions(parkour, profile).map(item => item.session.id)).toEqual(['latest', 'first']);
  expect(removeCompletedSession(profile, 'latest').sessions.map(session => session.id)).toEqual(['first']);
});

test('editing a session replaces its facts without duplicating the workout', () => {
  const profile: SkillProfile = {
    states: {},
    sessions: [
      { id: 'first', date: '2026-09-25', entries: [{ skill: 'animal-landing', intensity: 'light' }] },
      { id: 'latest', date: '2026-09-27', entries: [{ skill: 'safety-vault', intensity: 'intensive' }] },
    ],
  };
  const corrected = replaceCompletedSession(profile, {
    id: 'latest',
    date: '2026-09-26',
    entries: [{ skill: 'safety-vault', intensity: 'medium' }, { skill: 'monkey-walk', intensity: 'light' }],
  });
  expect(corrected.sessions).toHaveLength(2);
  expect(corrected.sessions.find(session => session.id === 'latest')).toEqual({
    id: 'latest',
    date: '2026-09-26',
    entries: [{ skill: 'safety-vault', intensity: 'medium' }, { skill: 'monkey-walk', intensity: 'light' }],
  });
});

test('a backup round-trips only known skills from this pack', () => {
  const profile: SkillProfile = {
    states: { 'ground-kong': 'learning' },
    sessions: [{ id: 'beach-session', date: '2026-09-27', entries: [{ skill: 'ground-kong', intensity: 'medium' }] }],
  };
  const skillIds = parkour.skills.map(skill => skill.id);
  expect(importProfile(exportProfile(profile), skillIds)).toEqual(profile);
  expect(importProfile(exportProfile(profile), skillIds.filter(id => id !== 'ground-kong'))).toBeUndefined();
});

test('the frontier distinguishes skills one and two readiness layers away', () => {
  const profile: SkillProfile = { states: {}, sessions: [] };
  expect(readinessDepth(parkour, profile, 'ground-kong')).toBe(1);
  expect(readinessDepth(parkour, profile, 'kong-vault')).toBe(2);
  expect(skillsAtReadinessDepth(parkour, profile, 1).map(skill => skill.id)).toContain('ground-kong');
  expect(skillsAtReadinessDepth(parkour, profile, 2).map(skill => skill.id)).toContain('kong-vault');
});
