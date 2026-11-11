import { expect, test } from 'bun:test';
import { parkour } from '../src/generated/parkour.ts';
import { isUnlocked, practiceEvents, progressOf, readinessDepth, removeCompletedSession, replaceCompletedSession, type SkillProfile } from '../src/domain/SkillGraph.ts';
import { exportProfile, importProfile } from '../src/infrastructure/LocalProfile.ts';
import { activePractice, completedSessions, lockedSkills, needsAttention, practiceQueue, skillsAtReadinessDepth } from '../src/domain/PracticeQueue.ts';

test('unpracticed prerequisites hold back the kong vault by default', () => {
  expect(isUnlocked(parkour, { states: {}, sessions: [] }, 'kong-vault')).toBe(false);
  expect(isUnlocked(parkour, {
    states: { 'ground-kong': 'acquired' },
    sessions: [],
  }, 'kong-vault')).toBe(true);
});

test('completed practice establishes the learner frontier without claiming acquisition', () => {
  const profile: SkillProfile = {
    states: { 'ground-kong': 'practicing' },
    sessions: [{
      id: 'ground-kong',
      date: '2026-09-27',
      entries: [{ skill: 'ground-kong', intensity: 'medium', approach: 'stretch' }],
    }],
  };
  expect(isUnlocked(parkour, profile, 'ground-kong')).toBe(true);
  expect(isUnlocked(parkour, profile, 'kong-vault')).toBe(true);
  expect(profile.states['ground-kong']).toBe('practicing');
});

test('skill progress distinguishes untried, exploring, practicing, and acquired', () => {
  expect(progressOf({ states: {}, sessions: [] }, 'ground-kong')).toBe('untried');
  expect(progressOf({ states: {}, sessions: [{ id: 'attempt', date: '2026-11-11', entries: [{ skill: 'ground-kong', intensity: 'light' }] }] }, 'ground-kong')).toBe('exploring');
  expect(progressOf({ states: { 'ground-kong': 'practicing' }, sessions: [] }, 'ground-kong')).toBe('practicing');
  expect(progressOf({ states: { 'ground-kong': 'acquired' }, sessions: [] }, 'ground-kong')).toBe('acquired');
});

test('the queue surfaces stale, foundational skills first', () => {
  const profile: SkillProfile = {
    states: { 'animal-landing': 'acquired' },
    sessions: [{ id: 'landing', date: '2026-09-27', entries: [{ skill: 'animal-landing', intensity: 'medium' }] }],
  };
  const queue = practiceQueue(parkour, profile, '2026-09-28');
  expect(queue.find(item => item.skill.id === 'animal-landing')?.freshness).toBe('fresh');
  expect(queue[0].skill.id).not.toBe('animal-landing');
});

test('freshness follows calendar days rather than the number of completed sessions', () => {
  const profile: SkillProfile = {
    states: { 'animal-landing': 'acquired' },
    sessions: [
      { id: 'landing', date: '2026-09-24', entries: [{ skill: 'animal-landing', intensity: 'medium' }] },
      { id: 'one', date: '2026-09-25', entries: [{ skill: 'safety-vault', intensity: 'medium' }] },
      { id: 'two', date: '2026-09-26', entries: [{ skill: 'safety-vault', intensity: 'medium' }] },
      { id: 'three', date: '2026-09-27', entries: [{ skill: 'safety-vault', intensity: 'medium' }] },
    ],
  };
  const landing = practiceQueue(parkour, profile, '2026-09-27').find(item => item.skill.id === 'animal-landing');
  expect(landing?.daysSincePractice).toBe(3);
  expect(landing?.freshness).toBe('getting-stale');
});

test('heavier practice carries freshness through more calendar days', () => {
  const profile: SkillProfile = {
    states: { 'animal-landing': 'acquired', 'sideways-roll': 'acquired', 'shoulder-roll': 'acquired' },
    sessions: [
      {
        id: 'practice',
        date: '2026-09-20',
        entries: [
          { skill: 'animal-landing', intensity: 'light' },
          { skill: 'sideways-roll', intensity: 'medium' },
          { skill: 'shoulder-roll', intensity: 'intensive' },
        ],
      },
      { id: 'later', date: '2026-09-22', entries: [{ skill: 'safety-vault', intensity: 'medium' }] },
    ],
  };
  const bySkill = new Map(practiceQueue(parkour, profile, '2026-09-24').map(item => [item.skill.id, item]));
  expect(bySkill.get('animal-landing')?.freshness).toBe('stale');
  expect(bySkill.get('sideways-roll')?.freshness).toBe('getting-stale');
  expect(bySkill.get('shoulder-roll')?.freshness).toBe('fresh');
});

test('locked skills explain the unmet hard requirement', () => {
  const kong = lockedSkills(parkour, { states: {}, sessions: [] })
    .find(item => item.skill.id === 'kong-vault');
  expect(kong?.missing.map(skill => skill.id)).toEqual(['ground-kong']);
});

test('common-route practice improves recommendation priority without unlocking a skill', () => {
  const profile: SkillProfile = {
    states: { 'animal-landing': 'acquired' },
    sessions: [],
  };
  const precision = practiceQueue(parkour, profile)
    .find(item => item.skill.id === 'precision-landing');
  expect(precision?.reasons).toContain('prepared by practice');
});

test('movement practice belongs to the same ordinary skill map', () => {
  const profile: SkillProfile = { states: {}, sessions: [] };
  expect(activePractice(parkour, profile).map(skill => skill.id)).not.toContain('ginga');
  expect(needsAttention(parkour, profile).map(item => item.skill.id)).toContain('ginga');
  expect(practiceQueue(parkour, profile).find(item => item.skill.id === 'ginga')?.skill.category).toBe('ground');
});

test('every movement carries shared-context facets, capability links, and environmental use', () => {
  const kong = parkour.skills.find(skill => skill.id === 'kong-vault');
  expect(kong?.facets.pattern).toEqual(expect.arrayContaining(['support', 'transition']));
  expect(kong?.capabilities.develops).toEqual(expect.arrayContaining(['strength', 'power', 'coordination']));
  expect(kong?.uses).toEqual(['obstacle']);
  expect(parkour.skills.every(skill => skill.capabilities.develops.length > 0)).toBe(true);
});

test('the queue begins a soft progression at its lowest unpracticed movement', () => {
  const empty: SkillProfile = { states: {}, sessions: [] };
  expect(needsAttention(parkour, empty).map(item => item.skill.id)).toContain('low-au');
  expect(needsAttention(parkour, empty).map(item => item.skill.id)).not.toContain('cartwheel-au');
  const queue = practiceQueue(parkour, empty);
  expect(queue.map(item => item.skill.id)).toContain('cartwheel-au');
  expect(queue.find(item => item.skill.id === 'low-au')?.priority)
    .toBeGreaterThan(queue.find(item => item.skill.id === 'cartwheel-au')?.priority ?? 0);

  const skippedAhead: SkillProfile = {
    states: {},
    sessions: [{ id: 'cartwheel', date: '2026-10-20', entries: [{ skill: 'cartwheel-au', intensity: 'medium' }] }],
  };
  expect(needsAttention(parkour, skippedAhead).map(item => item.skill.id)).toContain('cartwheel-au');
});

test('a combo records practice for its components without becoming a skill', () => {
  const profile: SkillProfile = {
    states: {},
    sessions: [{ id: 'combo', date: '2026-10-19', entries: [{ kind: 'combo', id: 'monkey-roll', skills: ['monkey-walk', 'sideways-roll'], intensity: 'medium' }] }],
  };
  expect(practiceEvents(profile).map(event => event.skill)).toEqual(['monkey-walk', 'sideways-roll']);
  expect(activePractice(parkour, profile).map(skill => skill.id)).toEqual(expect.arrayContaining(['monkey-walk', 'sideways-roll']));
  expect(parkour.skills.map(skill => skill.id)).not.toContain('monkey-roll');
});

test('existing practice becomes an exploring path until explicitly updated', () => {
  const profile: SkillProfile = {
    states: {},
    sessions: [{ id: 'vault', date: '2026-09-27', entries: [{ skill: 'safety-vault', intensity: 'medium' }] }],
  };
  expect(progressOf(profile, 'safety-vault')).toBe('exploring');
  expect(activePractice(parkour, profile).map(skill => skill.id)).toContain('safety-vault');
  expect(needsAttention(parkour, profile).map(item => item.skill.id)).toContain('safety-vault');
});

test('a completed stretch becomes exploring practice and advances the frontier', () => {
  const profile: SkillProfile = {
    states: { 'ground-kong': 'exploring' },
    sessions: [{
      id: 'stretch',
      date: '2026-09-27',
      entries: [{ skill: 'ground-kong', intensity: 'medium', approach: 'stretch' }],
    }],
  };
  expect(isUnlocked(parkour, profile, 'ground-kong')).toBe(true);
  expect(activePractice(parkour, profile).map(skill => skill.id)).toContain('ground-kong');
  expect(practiceQueue(parkour, profile).map(item => item.skill.id)).toContain('ground-kong');
  expect(needsAttention(parkour, profile).map(item => item.skill.id)).toContain('ground-kong');
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
    states: { 'ground-kong': 'practicing' },
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
