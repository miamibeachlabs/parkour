import { useEffect, useRef, useState } from 'preact/hooks';
import {
  type CompletedSession,
  type PracticeIntensity,
  type SessionApproach,
  type Skill,
  type SkillId,
  type SkillPack,
  type SkillProfile,
  incoming,
  isUnlocked,
  outgoing,
  emptyProfile,
  progressOf,
  removeCompletedSession,
  replaceCompletedSession,
} from '../domain/SkillGraph.ts';
import {
  activeLearning,
  categoryFreshness,
  completedSessions,
  missingRequirements,
  needsAttention,
  readyToLearn,
  skillsAtReadinessDepth,
  type QueueItem,
} from '../domain/PracticeQueue.ts';
import { exportProfile, importProfile, loadProfile, saveProfile } from '../infrastructure/LocalProfile.ts';

const today = () => new Date().toISOString().slice(0, 10);
const title = (word: string) => word.replace(/(^|-)\w/g, match => match.toUpperCase());
const freshnessLabel = (item: QueueItem) =>
  item.sessionsSincePractice === undefined ? 'Not practiced yet'
    : `${item.lastPracticeIntensity ? `${title(item.lastPracticeIntensity)} · ` : ''}${item.sessionsSincePractice === 0 ? 'In your latest session' : `${item.sessionsSincePractice} session${item.sessionsSincePractice === 1 ? '' : 's'} ago`}`;
const freshnessTone = (item: QueueItem) =>
  item.sessionsSincePractice === undefined ? 'unpracticed' : item.freshness;
const freshnessName = (item: QueueItem) =>
  item.sessionsSincePractice === undefined ? 'Not practiced' : item.freshness.replace('-', ' ');
const displayDate = (date: string) => date === today() ? 'Today' : new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const App = ({ pack }: { pack: SkillPack }) => {
  const [profile, setProfile] = useState<SkillProfile>(loadProfile);
  const [selected, setSelected] = useState<SkillId | undefined>();
  const [editingSession, setEditingSession] = useState<CompletedSession | undefined>();
  useEffect(() => saveProfile(profile), [profile]);

  const active = activeLearning(pack, profile);
  const attention = needsAttention(pack, profile);
  const attentionBySkill = new Map(attention.map(item => [item.skill.id, item]));
  const ready = readyToLearn(pack, profile).slice(0, 4);
  const stretch = skillsAtReadinessDepth(pack, profile, 1);
  const horizon = skillsAtReadinessDepth(pack, profile, 2);
  const history = completedSessions(pack, profile);
  const freshCategories = categoryFreshness(pack, profile);
  const selectedSkill = pack.skills.find(skill => skill.id === selected);
  const session = profile.openSession;
  const inSession = (id: SkillId) => session?.entries.some(entry => entry.skill === id) ?? false;

  const addToSession = (skill: SkillId, approach: SessionApproach = 'ready') => {
    if (inSession(skill)) return;
    setProfile(current => ({
      ...current,
      openSession: {
        startedAt: current.openSession?.startedAt ?? new Date().toISOString(),
        entries: [...(current.openSession?.entries ?? []), { skill, intensity: 'medium', approach }],
      },
    }));
  };

  const setSessionIntensity = (skill: SkillId, intensity: PracticeIntensity) =>
    setProfile(current => !current.openSession ? current : ({
      ...current,
      openSession: { ...current.openSession, entries: current.openSession.entries.map(entry => entry.skill === skill ? { ...entry, intensity } : entry) },
    }));

  const removeFromSession = (skill: SkillId) =>
    setProfile(current => !current.openSession ? current : ({
      ...current,
      openSession: { ...current.openSession, entries: current.openSession.entries.filter(entry => entry.skill !== skill) },
    }));

  const finishSession = () => setProfile(current => {
    const open = current.openSession;
    if (!open || open.entries.length === 0) return current;
    const states = { ...current.states };
    for (const entry of open.entries)
      if (states[entry.skill] !== 'acquired') states[entry.skill] = 'learning';
    return {
      states,
      sessions: [...current.sessions, { id: crypto.randomUUID(), date: today(), entries: open.entries }],
    };
  });
  const setState = (skill: SkillId, state: 'learning' | 'acquired') =>
    setProfile(current => ({ ...current, states: { ...current.states, [skill]: state } }));
  const removeHistory = (sessionId: string) =>
    setProfile(current => removeCompletedSession(current, sessionId));
  const saveHistory = (session: CompletedSession) => {
    setProfile(current => replaceCompletedSession(current, session));
    setEditingSession(undefined);
  };
  const downloadBackup = () => {
    const file = new Blob([exportProfile(profile)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `parkour-practice-${today()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const restoreBackup = async (file: File) => {
    const imported = importProfile(await file.text(), pack.skills.map(skill => skill.id));
    if (!imported) return alert('That is not a valid Parkour Practice backup for this skill pack.');
    if (confirm('Replace this browser’s current Parkour history with the imported backup? Export first if you want to keep both.'))
      setProfile(imported);
  };
  const eraseAllProgress = () => {
    if (confirm('Erase every completed session, skill state, and unfinished session from this browser? This cannot be undone.'))
      setProfile(emptyProfile());
  };

  return <main class="workspace">
    <header class="masthead">
      <div><p class="eyebrow">MIAMI BEACH LABS · {pack.name.toUpperCase()}</p><h1>Parkour Practice<span>.</span></h1><p class="lede">Keep your active curriculum in view, then let freshness show what needs attention.</p></div>
      <div class="legend" aria-label="Practice freshness legend"><span class="unpracticed">Not practiced</span><span class="fresh">Fresh</span><span class="aging">Getting stale</span><span class="stale">Stale</span></div>
    </header>

    <SessionPanel pack={pack} session={session} onSelect={setSelected} onIntensity={setSessionIntensity} onRemove={removeFromSession} onFinish={finishSession} />

    <section class="active-section" aria-labelledby="active-learning">
      <div class="section-heading"><div><p class="eyebrow">YOUR CURRICULUM</p><h2 id="active-learning">Currently learning</h2></div><p>Practicing a skill starts Learning. It stays here until you decide it has become Acquired.</p></div>
      {active.length ? <div class="active-categories">{pack.categories.map(category => {
        const skills = active.filter(skill => skill.category === category.id);
        return skills.length ? <section key={category.id} class="active-category"><h3>{category.name}</h3>{skills.map(skill => <LearningSkill key={skill.id} item={attentionBySkill.get(skill.id)!} inSession={inSession(skill.id)} onAdd={() => addToSession(skill.id)} onSelect={() => setSelected(skill.id)} />)}</section> : null;
      })}</div> : <p class="empty-state">Choose an available skill and record your first practice to begin a visible learning path.</p>}
    </section>

    <section class="queue-section" aria-labelledby="needs-attention">
      <div class="section-heading"><div><p class="eyebrow">TODAY</p><h2 id="needs-attention">Needs attention</h2></div><p>Skills you are learning stay actionable here, alongside stale practice, maintenance, and useful new starts.</p></div>
      <div class="queue-list">{attention.slice(0, 6).map((item, index) => <SkillRow key={item.skill.id} item={item} index={index + 1} inSession={inSession(item.skill.id)} onAdd={() => addToSession(item.skill.id)} onSelect={() => setSelected(item.skill.id)} />)}</div>
    </section>

    {stretch.length > 0 && <section class="stretch-section" aria-labelledby="stretch">
      <div class="section-heading"><div><p class="eyebrow">YOUR FRONTIER</p><h2 id="stretch">Stretch · one layer ahead</h2></div><p>The model suggests a foundation first. Add one anyway when the situation and your judgment make it useful.</p></div>
      <div class="stretch-list">{stretch.map(skill => <StretchSkill key={skill.id} skill={skill} missing={missingRequirements(pack, profile, skill.id)} inSession={inSession(skill.id)} onAdd={() => addToSession(skill.id, 'stretch')} onSelect={() => setSelected(skill.id)} />)}</div>
    </section>}

    <SkillCatalogue pack={pack} profile={profile} onSelect={setSelected} />

    <section class="split-sections">
      <section class="surface" aria-labelledby="terrain"><p class="eyebrow">YOUR MAP</p><h2 id="terrain">Terrain traversed</h2><ul class="coverage-list">{pack.categories.map(category => {
        const skills = pack.skills.filter(skill => skill.category === category.id);
        const counts = { learning: skills.filter(skill => progressOf(profile, skill.id) === 'learning').length, acquired: skills.filter(skill => progressOf(profile, skill.id) === 'acquired').length, available: skills.filter(skill => progressOf(profile, skill.id) === 'not-started' && isUnlocked(pack, profile, skill.id)).length, locked: skills.filter(skill => !isUnlocked(pack, profile, skill.id)).length };
        const freshness = freshCategories.find(item => item.category.id === category.id);
        const summary = [`${counts.learning} learning`, `${counts.acquired} acquired`, `${counts.available} available`, `${counts.locked} locked`].filter(part => !part.startsWith('0 ')).join(' · ') || 'Untouched';
        return <li key={category.id}><button class="coverage-button" onClick={() => setSelected(skills.find(skill => progressOf(profile, skill.id) === 'learning')?.id ?? skills[0]?.id)}><span><strong>{category.name}</strong><small>{summary}</small></span><small class={freshness?.freshness}>{freshness?.sessionsSincePractice === undefined ? 'Untouched' : freshness.sessionsSincePractice === 0 ? 'Latest session' : `${freshness.sessionsSincePractice} session${freshness.sessionsSincePractice === 1 ? '' : 's'} ago`}</small></button></li>;
      })}</ul></section>
      <SessionHistory history={history} onSelect={setSelected} onEdit={setEditingSession} onRemove={removeHistory} onEraseAll={eraseAllProgress} onExport={downloadBackup} onImport={restoreBackup} />
    </section>

    <section class="split-sections lower-split">
      <section class="surface" aria-labelledby="ready"><p class="eyebrow">FRONTIER</p><h2 id="ready">Ready to learn</h2><ul class="plain-list">{ready.map(item => <li key={item.skill.id}><button onClick={() => setSelected(item.skill.id)}>{item.skill.name}<span>›</span></button></li>)}</ul></section>
      <section class="surface" aria-labelledby="horizon"><p class="eyebrow">TECH TREE</p><h2 id="horizon">Horizon · two layers ahead</h2><div class="locked-list">{horizon.map(skill => <button key={skill.id} class="locked-skill" onClick={() => setSelected(skill.id)}><span aria-hidden="true">⌁</span><span><strong>{skill.name}</strong><small>Suggested first: {missingRequirements(pack, profile, skill.id).map(item => item.name).join(', ')}</small></span></button>)}</div></section>
    </section>

    {selectedSkill && <SkillDetail pack={pack} skill={selectedSkill} profile={profile} inSession={inSession(selectedSkill.id)} onClose={() => setSelected(undefined)} onSelect={setSelected} onAdd={addToSession} onSetState={setState} />}
    {editingSession && <SessionEditor pack={pack} session={editingSession} onClose={() => setEditingSession(undefined)} onSave={saveHistory} />}
    <footer>Practice stays in this browser and works offline after the first online visit.</footer>
  </main>;
};

const LearningSkill = ({ item, inSession, onAdd, onSelect }: { item: QueueItem; inSession: boolean; onAdd: () => void; onSelect: () => void }) => <article class={`learning-skill ${freshnessTone(item)}`}><button onClick={onSelect}><strong>{item.skill.name}</strong><small><span class={`freshness-chip ${freshnessTone(item)}`}>{freshnessName(item)}</span><span>{inSession ? 'In today’s session' : freshnessLabel(item)}</span></small></button><button class={inSession ? 'in-session' : 'practice'} onClick={onAdd} disabled={inSession}>{inSession ? 'In session' : 'Add'}</button></article>;

const SkillRow = ({ item, index, inSession, onAdd, onSelect }: { item: QueueItem; index: number; inSession: boolean; onAdd: () => void; onSelect: () => void }) => <article class={`skill-row ${freshnessTone(item)}`}><span class="rank">{index}</span><button class="skill-summary" onClick={onSelect}><strong>{item.skill.name}</strong><small><span class={`freshness-chip ${freshnessTone(item)}`}>{freshnessName(item)}</span><span>{freshnessLabel(item)} · {item.reasons.filter(reason => reason !== 'needs refreshing').slice(0, 2).join(' · ')}</span></small></button><button class={inSession ? 'in-session' : 'practice'} onClick={onAdd} disabled={inSession}>{inSession ? 'In session' : 'Add'}</button></article>;

const StretchSkill = ({ skill, missing, inSession, onAdd, onSelect }: { skill: Skill; missing: readonly Skill[]; inSession: boolean; onAdd: () => void; onSelect: () => void }) => <article class="stretch-skill"><button class="stretch-summary" onClick={onSelect}><strong>{skill.name}</strong><small>Suggested first: {missing.map(item => item.name).join(', ')}</small></button><button class={inSession ? 'in-session' : 'stretch-add'} onClick={onAdd} disabled={inSession}>{inSession ? 'In session' : 'Add as stretch'}</button></article>;

const SkillCatalogue = ({ pack, profile, onSelect }: { pack: SkillPack; profile: SkillProfile; onSelect: (skill: SkillId) => void }) => <section class="catalogue-section" aria-labelledby="catalogue"><div class="section-heading"><div><p class="eyebrow">EXPLORE</p><h2 id="catalogue">All skills</h2></div><p>Browse the complete course map. Opening a skill shows what it needs, what it enables, and lets you make an intentional stretch choice.</p></div><div class="catalogue-grid">{pack.categories.map(category => { const skills = pack.skills.filter(skill => skill.category === category.id); return <section class="catalogue-category" key={category.id}><h3>{category.name}</h3><p>{category.description}</p><ul>{skills.map(skill => <li key={skill.id}><button onClick={() => onSelect(skill.id)}><strong>{skill.name}</strong><small>{catalogueStatus(pack, profile, skill)}</small></button></li>)}</ul></section>; })}</div></section>;

const catalogueStatus = (pack: SkillPack, profile: SkillProfile, skill: Skill) => {
  const progress = progressOf(profile, skill.id);
  if (progress === 'acquired') return 'Acquired';
  if (progress === 'learning') return 'Learning';
  if (isUnlocked(pack, profile, skill.id)) return 'Ready to explore';
  return 'Explore requirements';
};

const SkillDetail = ({ pack, skill, profile, inSession, onClose, onSelect, onAdd, onSetState }: { pack: SkillPack; skill: Skill; profile: SkillProfile; inSession: boolean; onClose: () => void; onSelect: (skill: SkillId) => void; onAdd: (skill: SkillId, approach?: SessionApproach) => void; onSetState: (skill: SkillId, state: 'learning' | 'acquired') => void }) => {
  const sources = (kind: 'requires' | 'helps') => incoming(pack, skill.id, kind).map(relation => pack.skills.find(candidate => candidate.id === relation.from)).filter((candidate): candidate is Skill => candidate !== undefined);
  const targets = (kind: 'requires' | 'helps') => outgoing(pack, skill.id, kind).map(relation => pack.skills.find(candidate => candidate.id === relation.to)).filter((candidate): candidate is Skill => candidate !== undefined);
  const unlocked = isUnlocked(pack, profile, skill.id);
  const state = progressOf(profile, skill.id);
  return <div class="overlay" role="presentation" onClick={onClose}><aside class="detail" role="dialog" aria-modal="true" aria-label={`${skill.name} details`} onClick={event => event.stopPropagation()}>
    <button class="close" onClick={onClose} aria-label="Close details">×</button><p class="eyebrow">{pack.categories.find(category => category.id === skill.category)?.name.toUpperCase()}</p><h2>{skill.name}</h2><p class="description">{skill.description}</p>
    {skill.tutorialUrl && <a class="tutorial" href={skill.tutorialUrl} target="_blank" rel="noreferrer">Open tutorial ↗</a>}{!unlocked && <p class="model-note">The model suggests building the listed requirements first. You can still add this as a Stretch; completed practice establishes your own frontier.</p>}
    <Relationship title="Requires" skills={sources('requires')} profile={profile} onSelect={onSelect} /><Relationship title="Helpful foundations" skills={sources('helps')} profile={profile} onSelect={onSelect} /><Relationship title="Enables" skills={targets('requires')} profile={profile} onSelect={onSelect} /><Relationship title="Helps prepare for" skills={targets('helps')} profile={profile} onSelect={onSelect} />
    <div class="detail-actions"><button class={inSession ? 'in-session detail-session' : unlocked ? 'practice detail-session' : 'stretch-add detail-session'} onClick={() => onAdd(skill.id, unlocked ? 'ready' : 'stretch')} disabled={inSession}>{inSession ? 'In today’s session' : unlocked ? 'Add to today’s session' : 'Add as stretch'}</button><p class="eyebrow">YOUR STATE</p><div class="button-group"><button class={state === 'learning' ? 'selected' : ''} onClick={() => onSetState(skill.id, 'learning')}>Learning</button><button class={state === 'acquired' ? 'selected' : ''} onClick={() => onSetState(skill.id, 'acquired')}>Acquired</button></div></div>
  </aside></div>;
};

const Relationship = ({ title, skills, profile, onSelect }: { title: string; skills: readonly Skill[]; profile: SkillProfile; onSelect: (skill: SkillId) => void }) => skills.length ? <section class="relationship"><h3>{title}</h3><ul>{skills.map(skill => <li key={skill.id}><span>{progressOf(profile, skill.id) === 'acquired' ? '✓' : '○'}</span><button onClick={() => onSelect(skill.id)}>{skill.name}</button></li>)}</ul></section> : null;

const SessionPanel = ({ pack, session, onSelect, onIntensity, onRemove, onFinish }: { pack: SkillPack; session: SkillProfile['openSession']; onSelect: (skill: SkillId) => void; onIntensity: (skill: SkillId, intensity: PracticeIntensity) => void; onRemove: (skill: SkillId) => void; onFinish: () => void }) => session ? <section class="session-panel" aria-labelledby="today-session"><div class="section-heading"><div><p class="eyebrow">TODAY</p><h2 id="today-session">Today’s session</h2></div><p>{session.entries.length} skill{session.entries.length === 1 ? '' : 's'} selected. Add skills as your training unfolds; finish only when they become history.</p></div><div class="session-entries">{session.entries.map(entry => { const skill = pack.skills.find(item => item.id === entry.skill); return skill ? <article key={entry.skill} class="session-entry"><button class="session-skill" onClick={() => onSelect(skill.id)}><strong>{skill.name}</strong><small>{entry.approach === 'stretch' ? 'Stretch · ' : ''}{pack.categories.find(category => category.id === skill.category)?.name}</small></button><div class="intensity-picker">{(['light', 'medium', 'intensive'] as const).map(intensity => <button key={intensity} class={entry.intensity === intensity ? 'selected' : ''} onClick={() => onIntensity(skill.id, intensity)}>{title(intensity)}</button>)}</div><button class="remove-session" onClick={() => onRemove(skill.id)} aria-label={`Remove ${skill.name} from today’s session`}>×</button></article> : null; })}</div><button class="finish-session" onClick={onFinish}>Finish session · save {session.entries.length} skill{session.entries.length === 1 ? '' : 's'}</button></section> : <section class="session-empty"><p class="eyebrow">TODAY’S SESSION</p><p>Add skills as you decide to work on them. They become practice history only when you finish the session.</p></section>;

const SessionHistory = ({ history, onSelect, onEdit, onRemove, onEraseAll, onExport, onImport }: { history: ReturnType<typeof completedSessions>; onSelect: (skill: SkillId) => void; onEdit: (session: CompletedSession) => void; onRemove: (sessionId: string) => void; onEraseAll: () => void; onExport: () => void; onImport: (file: File) => void }) => {
  const importInput = useRef<HTMLInputElement>(null);
  return <section class="surface history" aria-labelledby="history"><div class="history-heading"><div><p class="eyebrow">EVIDENCE</p><h2 id="history">Practice history</h2></div>{history.length ? <button class="erase-progress" onClick={onEraseAll}>Erase all local progress</button> : null}</div><div class="backup-actions"><button onClick={onExport}>Export backup</button><button onClick={() => importInput.current?.click()}>Restore backup</button><input ref={importInput} type="file" accept="application/json,.json" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void onImport(file); event.currentTarget.value = ''; }} /></div>{history.length ? <><p class="history-note">Sessions are your editable trail. Correct the date, skills, or intensity when you remember a workout later. A backup lets you move this trail to another install.</p><div class="history-list">{history.map(({ session, entries }) => <article class="history-session" key={session.id}><header><strong>{displayDate(session.date)}</strong><small>{entries.length} skill{entries.length === 1 ? '' : 's'}</small><span class="history-buttons"><button class="edit-history" onClick={() => onEdit(session)}>Edit</button><button class="remove-history" onClick={() => onRemove(session.id)}>Remove</button></span></header><ul>{entries.map(({ entry, skill }) => <li key={skill.id}><button onClick={() => onSelect(skill.id)}>{skill.name}</button><small>{title(entry.intensity)}{entry.approach === 'stretch' ? ' · Stretch' : ''}</small></li>)}</ul></article>)}</div></> : <p class="empty-state">Finished training sessions will appear here, with their individual skills and intensity.</p>}</section>;
};

const SessionEditor = ({ pack, session, onClose, onSave }: { pack: SkillPack; session: CompletedSession; onClose: () => void; onSave: (session: CompletedSession) => void }) => {
  const [draft, setDraft] = useState(session);
  const updateEntry = (skill: SkillId, update: (entry: typeof draft.entries[number]) => typeof draft.entries[number]) =>
    setDraft(current => ({ ...current, entries: current.entries.map(entry => entry.skill === skill ? update(entry) : entry) }));
  const removeEntry = (skill: SkillId) =>
    setDraft(current => ({ ...current, entries: current.entries.filter(entry => entry.skill !== skill) }));
  const addEntry = (skill: SkillId) =>
    setDraft(current => current.entries.some(entry => entry.skill === skill) ? current : ({ ...current, entries: [...current.entries, { skill, intensity: 'medium', approach: 'ready' }] }));
  return <div class="overlay" role="presentation" onClick={onClose}><aside class="detail session-editor" role="dialog" aria-modal="true" aria-label="Edit practice session" onClick={event => event.stopPropagation()}>
    <button class="close" onClick={onClose} aria-label="Close editor">×</button><p class="eyebrow">PRACTICE HISTORY</p><h2>Edit workout</h2><p class="description">Correct when it happened, what you practiced, and how hard it felt.</p>
    <label class="date-field">Date<input type="date" value={draft.date} onInput={event => setDraft(current => ({ ...current, date: event.currentTarget.value }))} /></label>
    <div class="editor-entries">{draft.entries.map(entry => { const skill = pack.skills.find(item => item.id === entry.skill); return skill ? <article key={entry.skill} class="session-entry"><strong>{skill.name}</strong><div class="intensity-picker">{(['light', 'medium', 'intensive'] as const).map(intensity => <button key={intensity} class={entry.intensity === intensity ? 'selected' : ''} onClick={() => updateEntry(entry.skill, current => ({ ...current, intensity }))}>{title(intensity)}</button>)}</div><button class="remove-session" onClick={() => removeEntry(entry.skill)} aria-label={`Remove ${skill.name} from this workout`}>×</button></article> : null; })}</div>
    <label class="add-skill">Add another skill<select value="" onChange={event => addEntry(event.currentTarget.value)}><option value="">Choose a skill…</option>{pack.categories.map(category => <optgroup key={category.id} label={category.name}>{pack.skills.filter(skill => skill.category === category.id && !draft.entries.some(entry => entry.skill === skill.id)).map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</optgroup>)}</select></label>
    <button class="finish-session" onClick={() => onSave(draft)} disabled={!draft.date || draft.entries.length === 0}>Save workout</button>
  </aside></div>;
};
