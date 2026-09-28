import { emptyProfile, type SkillProfile } from '../domain/SkillGraph.ts';

const storageKey = 'skill-queue-profile-v1';

export const loadProfile = (): SkillProfile => {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return emptyProfile();

  try {
    const profile = JSON.parse(saved) as SkillProfile;
    if (!profile || typeof profile !== 'object' || !profile.states || !Array.isArray(profile.practice))
      return emptyProfile();
    return profile;
  } catch {
    return emptyProfile();
  }
};

export const saveProfile = (profile: SkillProfile) =>
  localStorage.setItem(storageKey, JSON.stringify(profile));
