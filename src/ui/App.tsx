import { useEffect, useState } from 'preact/hooks';
import {
  type PracticeIntensity,
  type Skill,
  type SkillId,
  type SkillPack,
  type SkillProfile,
  incoming,
  isUnlocked,
} from '../domain/SkillGraph.ts';
import {
  categoryFreshness,
  lockedSkills,
  practiceQueue,
  readyToLearn,
  type QueueItem,
} from '../domain/PracticeQueue.ts';
import { loadProfile, saveProfile } from '../infrastructure/LocalProfile.ts';

const today = () => new Date().toISOString().slice(0, 10);

const freshnessLabel = (item: QueueItem) =>
  item.daysSincePractice === undefined ? 'Not practiced yet'
    : item.daysSincePractice === 0 ? 'Practiced today'
    : `${item.daysSincePractice}d ago · ${item.freshness.replace('-', ' ')}`;

const label = (word: string) => word.replace(/(^|-)\w/g, match => match.toUpperCase());

export const App = ({ pack }: { pack: SkillPack }) => {
  const [profile, setProfile] = useState<SkillProfile>(loadProfile);
  const [selected, setSelected] = useState<SkillId | undefined>();

  useEffect(() => saveProfile(profile), [profile]);

  const queue = practiceQueue(pack, profile);
  const ready = readyToLearn(pack, profile).slice(0, 4);
  const locked = lockedSkills(pack, profile);
  const selectedSkill = pack.skills.find(skill => skill.id === selected);
  const practicedToday = (id: SkillId) =>
    profile.practice.some(event => event.skill === id && event.date === today());

  const practice = (skill: SkillId, intensity: PracticeIntensity = 'medium') => {
    if (practicedToday(skill)) return;
    setProfile(current => ({
      ...current,
      practice: [...current.practice, { skill, intensity, date: today() }],
    }));
  };

  const setState = (skill: SkillId, state: 'learning' | 'acquired') =>
    setProfile(current => ({ ...current, states: { ...current.states, [skill]: state } }));

  return (
    <main class="workspace">
      <header class="masthead">
        <div>
          <p class="eyebrow">MIAMI BEACH LABS · {pack.name.toUpperCase()}</p>
          <h1>Skill Queue<span>.</span></h1>
          <p class="lede">What deserves attention today—and what does it open next.</p>
        </div>
        <div class="legend" aria-label="Practice freshness legend">
          <span class="fresh">Fresh</span><span class="aging">Getting stale</span><span class="stale">Stale</span>
        </div>
      </header>

      <section class="queue-section" aria-labelledby="practice-next">
        <div class="section-heading">
          <div><p class="eyebrow">TODAY</p><h2 id="practice-next">Practice next</h2></div>
          <p>Hard requirements determine what is available. Importance and neglected practice determine the order.</p>
        </div>
        <div class="queue-list">
          {queue.slice(0, 6).map((item, index) => (
            <SkillRow key={item.skill.id} item={item} index={index + 1} done={practicedToday(item.skill.id)} onPractice={() => practice(item.skill.id)} onSelect={() => setSelected(item.skill.id)} />
          ))}
        </div>
      </section>

      <section class="split-sections">
        <section class="surface" aria-labelledby="coverage">
          <p class="eyebrow">BALANCE</p><h2 id="coverage">Category coverage</h2>
          <ul class="coverage-list">
            {categoryFreshness(pack, profile).map(({ category, freshness, daysSincePractice }) => (
              <li key={category.id}><button class="coverage-button" onClick={() => setSelected(pack.skills.find(skill => skill.category === category.id)?.id)}><span>{category.name}</span><small class={freshness}>{daysSincePractice === undefined ? 'Untouched' : `${daysSincePractice}d ago`}</small></button></li>
            ))}
          </ul>
        </section>
        <section class="surface" aria-labelledby="ready">
          <p class="eyebrow">FRONTIER</p><h2 id="ready">Ready to learn</h2>
          <ul class="plain-list">
            {ready.map(item => <li key={item.skill.id}><button onClick={() => setSelected(item.skill.id)}>{item.skill.name}<span>›</span></button></li>)}
          </ul>
        </section>
      </section>

      <section class="surface coming-soon" aria-labelledby="coming-soon">
        <p class="eyebrow">TECH TREE</p><h2 id="coming-soon">Coming soon</h2>
        <div class="locked-list">
          {locked.map(({ skill, missing }) => <button key={skill.id} class="locked-skill" onClick={() => setSelected(skill.id)}><span aria-hidden="true">⌁</span><span><strong>{skill.name}</strong><small>Need: {missing.map(item => item.name).join(', ')}</small></span></button>)}
        </div>
      </section>

      {selectedSkill && <SkillDetail pack={pack} skill={selectedSkill} profile={profile} onClose={() => setSelected(undefined)} onPractice={practice} onSetState={setState} />}
      <footer>Practice stays in this browser and works offline after the first online visit.</footer>
    </main>
  );
};

const SkillRow = ({ item, index, done, onPractice, onSelect }: { item: QueueItem; index: number; done: boolean; onPractice: () => void; onSelect: () => void }) => (
  <article class="skill-row"><span class="rank">{index}</span><button class="skill-summary" onClick={onSelect}><strong>{item.skill.name}</strong><small>{freshnessLabel(item)} · {item.reasons.slice(0, 2).join(' · ')}</small></button><button class={done ? 'practiced' : 'practice'} onClick={onPractice} disabled={done}>{done ? 'Practiced' : 'Practice'}</button></article>
);

const SkillDetail = ({ pack, skill, profile, onClose, onPractice, onSetState }: { pack: SkillPack; skill: Skill; profile: SkillProfile; onClose: () => void; onPractice: (skill: SkillId, intensity: PracticeIntensity) => void; onSetState: (skill: SkillId, state: 'learning' | 'acquired') => void }) => {
  const related = (kind: 'requires' | 'helps') => incoming(pack, skill.id, kind).map(relation => pack.skills.find(candidate => candidate.id === relation.from)).filter((candidate): candidate is Skill => candidate !== undefined);
  const unlocked = isUnlocked(pack, profile, skill.id);
  const done = profile.practice.some(event => event.skill === skill.id && event.date === today());
  return <div class="overlay" role="presentation" onClick={onClose}><aside class="detail" role="dialog" aria-modal="true" aria-label={`${skill.name} details`} onClick={event => event.stopPropagation()}>
    <button class="close" onClick={onClose} aria-label="Close details">×</button>
    <p class="eyebrow">{pack.categories.find(category => category.id === skill.category)?.name.toUpperCase()}</p><h2>{skill.name}</h2><p class="description">{skill.description}</p>
    {skill.tutorialUrl && <a class="tutorial" href={skill.tutorialUrl} target="_blank" rel="noreferrer">Open tutorial ↗</a>}
    {!unlocked && <p class="locked-note">This is not available yet. Complete its requirements first.</p>}
    <Relationship title="Requires" skills={related('requires')} profile={profile} /><Relationship title="Helpful foundations" skills={related('helps')} profile={profile} />
    <div class="detail-actions"><p class="eyebrow">YOUR STATE</p><div class="button-group"><button class={profile.states[skill.id] === 'learning' ? 'selected' : ''} onClick={() => onSetState(skill.id, 'learning')}>Learning</button><button class={profile.states[skill.id] === 'acquired' ? 'selected' : ''} onClick={() => onSetState(skill.id, 'acquired')}>Acquired</button></div><p class="eyebrow">PRACTICED TODAY</p><div class="button-group">{(['light', 'medium', 'intensive'] as const).map(intensity => <button key={intensity} class={intensity === 'medium' ? 'selected' : ''} onClick={() => onPractice(skill.id, intensity)} disabled={done}>{done ? 'Logged' : label(intensity)}</button>)}</div></div>
  </aside></div>;
};

const Relationship = ({ title, skills, profile }: { title: string; skills: readonly Skill[]; profile: SkillProfile }) => skills.length ? <section class="relationship"><h3>{title}</h3><ul>{skills.map(skill => <li key={skill.id}>{profile.states[skill.id] === 'acquired' ? '✓' : '○'} {skill.name}</li>)}</ul></section> : null;
