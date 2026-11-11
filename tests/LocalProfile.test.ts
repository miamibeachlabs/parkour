import { expect, test } from 'bun:test';
import { parkour } from '../src/generated/parkour.ts';
import { importProfile } from '../src/infrastructure/LocalProfile.ts';

test('a version-one backup migrates learning to practicing', () => {
  const legacyBackup = JSON.stringify({
    format: 'parkour-profile',
    version: 1,
    exportedAt: '2026-11-11T00:00:00.000Z',
    profile: {
      states: { 'ground-kong': 'learning', 'kong-vault': 'acquired' },
      sessions: [],
    },
  });

  expect(importProfile(legacyBackup, parkour.skills.map(skill => skill.id))?.states).toEqual({
    'ground-kong': 'practicing',
    'kong-vault': 'acquired',
  });
});
