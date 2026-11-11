import { useEffect, useRef, useState } from 'preact/hooks';
import {
  type CompletedSession,
  type PracticeIntensity,
  type RelationKind,
  type SessionApproach,
  type Skill,
  type SkillId,
  type SkillPack,
  type SkillProgress,
  type SkillState,
  type SkillProfile,
  incoming,
  isUnlocked,
  outgoing,
  emptyProfile,
  progressOf,
  removeCompletedSession,
  replaceCompletedSession,
  sessionEntryId,
  sessionEntrySkills,
} from '../domain/SkillGraph.ts';
import {
  activePractice,
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
  item.daysSincePractice === undefined ? 'Not practiced yet'
    : `${item.lastPracticeIntensity ? `${title(item.lastPracticeIntensity)} · ` : ''}${item.daysSincePractice === 0 ? 'Practiced today' : `${item.daysSincePractice} day${item.daysSincePractice === 1 ? '' : 's'} ago`}`;
const freshnessTone = (item: QueueItem) =>
  item.daysSincePractice === undefined ? 'unpracticed' : item.freshness;
const freshnessName = (item: QueueItem) =>
  item.daysSincePractice === undefined ? 'Not practiced' : item.freshness.replace('-', ' ');
const displayDate = (date: string) => date === today() ? 'Today' : new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const App = ({ pack }: { pack: SkillPack }) => {
  const [profile, setProfile] = useState<SkillProfile>(loadProfile);
  const [selected, setSelected] = useState<SkillId | undefined>();
  const [editingSession, setEditingSession] = useState<CompletedSession | undefined>();
  useEffect(() => saveProfile(profile), [profile]);

  const active = activePractice(pack, profile);
  const attention = needsAttention(pack, profile);
  const attentionBySkill = new Map(attention.map(item => [item.skill.id, item]));
  const ready = readyToLearn(pack, profile).slice(0, 4);
  const stretch = skillsAtReadinessDepth(pack, profile, 1);
  const horizon = skillsAtReadinessDepth(pack, profile, 2);
  const history = completedSessions(pack, profile);
  const freshCategories = categoryFreshness(pack, profile);
  const selectedSkill = pack.skills.find(skill => skill.id === selected);
  const session = profile.openSession;
  const inSession = (id: SkillId) => session?.entries.some(entry => sessionEntrySkills(entry).includes(id)) ?? false;

  const addToSession = (skill: SkillId, approach: SessionApproach = 'ready') => {
    if (inSession(skill)) return;
    setProfile(current => ({
      ...current,
      openSession: {
        startedAt: current.openSession?.startedAt ?? new Date().toISOString(),
        entries: [...(current.openSession?.entries ?? []), { kind: 'skill', skill, intensity: 'light', approach }],
      },
    }));
  };

  const setSessionIntensity = (entryId: string, intensity: PracticeIntensity) =>
    setProfile(current => !current.openSession ? current : ({
      ...current, openSession: { ...current.openSession, entries: current.openSession.entries.map(entry => sessionEntryId(entry) === entryId ? { ...entry, intensity } : entry) },
    }));

  const removeFromSession = (entryId: string) =>
    setProfile(current => !current.openSession ? current : ({
      ...current, openSession: { ...current.openSession, entries: current.openSession.entries.filter(entry => sessionEntryId(entry) !== entryId) },
    }));

  const addCombo = (skills: readonly SkillId[]) => setProfile(current => ({
    ...current,
    openSession: {
      startedAt: current.openSession?.startedAt ?? new Date().toISOString(),
      entries: [...(current.openSession?.entries ?? []), { kind: 'combo', id: crypto.randomUUID(), skills, intensity: 'light' }],
    },
  }));

  const finishSession = () => setProfile(current => {
    const open = current.openSession;
    if (!open || open.entries.length === 0) return current;
    const states = { ...current.states };
    for (const entry of open.entries)
      for (const skill of sessionEntrySkills(entry))
        if (states[skill] === undefined) states[skill] = 'exploring';
    return {
      states,
      sessions: [...current.sessions, { id: crypto.randomUUID(), date: today(), entries: open.entries }],
    };
  });
  const setState = (skill: SkillId, state: SkillState) =>
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

    <SessionPanel pack={pack} session={session} onSelect={setSelected} onIntensity={setSessionIntensity} onRemove={removeFromSession} onAddCombo={addCombo} onFinish={finishSession} />

    <section class="active-section" aria-labelledby="in-progress">
      <div class="section-heading"><div><p class="eyebrow">YOUR CURRICULUM</p><h2 id="in-progress">In progress</h2></div><p>A first attempt begins Exploring. Move it to Practicing when the movement is familiar enough to work on deliberately.</p></div>
      {active.length ? <div class="active-categories">{pack.categories.map(category => {
        const skills = active.filter(skill => skill.category === category.id);
        return skills.length ? <section key={category.id} class="active-category"><h3>{category.name}</h3>{skills.map(skill => <ProgressSkill key={skill.id} item={attentionBySkill.get(skill.id)!} state={progressOf(profile, skill.id)} inSession={inSession(skill.id)} onAdd={() => addToSession(skill.id)} onSelect={() => setSelected(skill.id)} />)}</section> : null;
      })}</div> : <p class="empty-state">Choose an available movement and record your first practice to begin a visible path.</p>}
    </section>

    <section class="queue-section" aria-labelledby="needs-attention">
      <div class="section-heading"><div><p class="eyebrow">TODAY</p><h2 id="needs-attention">Needs attention</h2></div><p>Movements in progress stay actionable here, alongside stale practice, maintenance, and useful new starts.</p></div>
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
        const counts = { exploring: skills.filter(skill => progressOf(profile, skill.id) === 'exploring').length, practicing: skills.filter(skill => progressOf(profile, skill.id) === 'practicing').length, acquired: skills.filter(skill => progressOf(profile, skill.id) === 'acquired').length, available: skills.filter(skill => progressOf(profile, skill.id) === 'untried' && isUnlocked(pack, profile, skill.id)).length, locked: skills.filter(skill => !isUnlocked(pack, profile, skill.id)).length };
        const freshness = freshCategories.find(item => item.category.id === category.id);
        const summary = [`${counts.exploring} exploring`, `${counts.practicing} practicing`, `${counts.acquired} acquired`, `${counts.available} available`, `${counts.locked} locked`].filter(part => !part.startsWith('0 ')).join(' · ') || 'Untouched';
        return <li key={category.id}><button class="coverage-button" onClick={() => setSelected(skills.find(skill => ['exploring', 'practicing'].includes(progressOf(profile, skill.id)))?.id ?? skills[0]?.id)}><span><strong>{category.name}</strong><small>{summary}</small></span><small class={freshness?.freshness}>{freshness?.daysSincePractice === undefined ? 'Untouched' : freshness.daysSincePractice === 0 ? 'Practiced today' : `${freshness.daysSincePractice} day${freshness.daysSincePractice === 1 ? '' : 's'} ago`}</small></button></li>;
      })}</ul></section>
      <SessionHistory pack={pack} history={history} onSelect={setSelected} onEdit={setEditingSession} onRemove={removeHistory} onEraseAll={eraseAllProgress} onExport={downloadBackup} onImport={restoreBackup} />
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

const ProgressSkill = ({ item, state, inSession, onAdd, onSelect }: { item: QueueItem; state: SkillProgress; inSession: boolean; onAdd: () => void; onSelect: () => void }) => <article class={`active-skill ${freshnessTone(item)}`}><button onClick={onSelect}><strong>{item.skill.name}</strong><small><span class={`freshness-chip ${freshnessTone(item)}`}>{freshnessName(item)}</span><span>{title(state)} · {inSession ? 'In today’s session' : freshnessLabel(item)}</span></small></button><button class={inSession ? 'in-session' : 'practice'} onClick={onAdd} disabled={inSession}>{inSession ? 'In session' : 'Add'}</button></article>;

const SkillRow = ({ item, index, inSession, onAdd, onSelect }: { item: QueueItem; index: number; inSession: boolean; onAdd: () => void; onSelect: () => void }) => <article class={`skill-row ${freshnessTone(item)}`}><span class="rank">{index}</span><button class="skill-summary" onClick={onSelect}><strong>{item.skill.name}</strong><small><span class={`freshness-chip ${freshnessTone(item)}`}>{freshnessName(item)}</span><span>{freshnessLabel(item)} · {item.reasons.filter(reason => reason !== 'needs refreshing').slice(0, 2).join(' · ')}</span></small></button><button class={inSession ? 'in-session' : 'practice'} onClick={onAdd} disabled={inSession}>{inSession ? 'In session' : 'Add'}</button></article>;

const StretchSkill = ({ skill, missing, inSession, onAdd, onSelect }: { skill: Skill; missing: readonly Skill[]; inSession: boolean; onAdd: () => void; onSelect: () => void }) => <article class="stretch-skill"><button class="stretch-summary" onClick={onSelect}><strong>{skill.name}</strong><small>Suggested first: {missing.map(item => item.name).join(', ')}</small></button><button class={inSession ? 'in-session' : 'stretch-add'} onClick={onAdd} disabled={inSession}>{inSession ? 'In session' : 'Add as stretch'}</button></article>;

const SkillCatalogue = ({ pack, profile, onSelect }: { pack: SkillPack; profile: SkillProfile; onSelect: (skill: SkillId) => void }) => <section class="catalogue-section" aria-labelledby="catalogue"><div class="section-heading"><div><p class="eyebrow">EXPLORE</p><h2 id="catalogue">Practice map</h2></div><p>Browse every movement you practice. Details show its facets, capabilities, relationships, and how it fits into your own path.</p></div><div class="catalogue-grid">{pack.categories.map(category => { const skills = pack.skills.filter(skill => skill.category === category.id); return <section class="catalogue-category" key={category.id}><h3>{category.name}</h3><p>{category.description}</p><ul>{skills.map(skill => <li key={skill.id}><button onClick={() => onSelect(skill.id)}><strong>{skill.name}</strong><small>{catalogueStatus(pack, profile, skill)}</small></button></li>)}</ul></section>; })}</div></section>;

const catalogueStatus = (pack: SkillPack, profile: SkillProfile, skill: Skill) => {
  const progress = progressOf(profile, skill.id);
  if (progress === 'acquired') return 'Acquired';
  if (progress === 'practicing') return 'Practicing';
  if (progress === 'exploring') return 'Exploring';
  if (isUnlocked(pack, profile, skill.id)) return 'Untried · ready to explore';
  return 'Explore requirements';
};

const SkillDetail = ({ pack, skill, profile, inSession, onClose, onSelect, onAdd, onSetState }: { pack: SkillPack; skill: Skill; profile: SkillProfile; inSession: boolean; onClose: () => void; onSelect: (skill: SkillId) => void; onAdd: (skill: SkillId, approach?: SessionApproach) => void; onSetState: (skill: SkillId, state: SkillState) => void }) => {
  const sources = (kind: RelationKind) => incoming(pack, skill.id, kind).map(relation => pack.skills.find(candidate => candidate.id === relation.from)).filter((candidate): candidate is Skill => candidate !== undefined);
  const targets = (kind: RelationKind) => outgoing(pack, skill.id, kind).map(relation => pack.skills.find(candidate => candidate.id === relation.to)).filter((candidate): candidate is Skill => candidate !== undefined);
  const unlocked = isUnlocked(pack, profile, skill.id);
  const state = progressOf(profile, skill.id);
  const alternatives = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${skill.name} ${skill.origin} tutorial`)}`;
  return <div class="overlay" role="presentation" onClick={onClose}><aside class="detail" role="dialog" aria-modal="true" aria-label={`${skill.name} details`} onClick={event => event.stopPropagation()}>
    <button class="close" onClick={onClose} aria-label="Close details">×</button><p class="eyebrow">{pack.categories.find(category => category.id === skill.category)?.name.toUpperCase()} · {skill.origin.toUpperCase()}</p><h2>{skill.name}</h2><p class="description">{skill.description}</p>
    <MovementContext skill={skill} />
    <div class="tutorials">{skill.tutorialUrl && <a class="tutorial" href={skill.tutorialUrl} target="_blank" rel="noreferrer">Open tutorial ↗</a>}<a class="tutorial alternatives" href={alternatives} target="_blank" rel="noreferrer">Search for alternatives ↗</a></div>{!unlocked && <p class="model-note">The model suggests building the listed requirements first. You can still add this as a Stretch; completed practice establishes your own frontier.</p>}
    <Relationship title="Requires" skills={sources('requires')} profile={profile} onSelect={onSelect} /><Relationship title="Common route from" skills={sources('progresses-to')} profile={profile} onSelect={onSelect} /><Relationship title="Transfers from" skills={sources('transfers-to')} profile={profile} onSelect={onSelect} /><Relationship title="Enables" skills={targets('requires')} profile={profile} onSelect={onSelect} /><Relationship title="Progresses to" skills={targets('progresses-to')} profile={profile} onSelect={onSelect} /><Relationship title="Transfers to" skills={targets('transfers-to')} profile={profile} onSelect={onSelect} />
    <div class="detail-actions"><button class={inSession ? 'in-session detail-session' : unlocked ? 'practice detail-session' : 'stretch-add detail-session'} onClick={() => onAdd(skill.id, unlocked ? 'ready' : 'stretch')} disabled={inSession}>{inSession ? 'In today’s session' : unlocked ? 'Add to today’s session' : 'Add as stretch'}</button><p class="eyebrow">YOUR STATE · {title(state)}</p><div class="button-group"><button class={state === 'exploring' ? 'selected' : ''} onClick={() => onSetState(skill.id, 'exploring')}>Exploring</button><button class={state === 'practicing' ? 'selected' : ''} onClick={() => onSetState(skill.id, 'practicing')}>Practicing</button><button class={state === 'acquired' ? 'selected' : ''} onClick={() => onSetState(skill.id, 'acquired')}>Acquired</button></div></div>
  </aside></div>;
};

const Relationship = ({ title, skills, profile, onSelect }: { title: string; skills: readonly Skill[]; profile: SkillProfile; onSelect: (skill: SkillId) => void }) => skills.length ? <section class="relationship"><h3>{title}</h3><ul>{skills.map(skill => <li key={skill.id}><span>{progressOf(profile, skill.id) === 'acquired' ? '✓' : '○'}</span><button onClick={() => onSelect(skill.id)}>{skill.name}</button></li>)}</ul></section> : null;

const MovementContext = ({ skill }: { skill: Skill }) => {
  const facets = Object.entries(skill.facets).flatMap(([dimension, values]) => values.map(value => `${title(dimension)} · ${title(value)}`));
  return <div class="context-tags" aria-label="Movement context">
    {facets.map(facet => <span key={facet}>{facet}</span>)}
    {skill.capabilities.develops.map(capability => <span key={`develops-${capability}`}>Develops · {title(capability)}</span>)}
    {skill.capabilities.requires.map(capability => <span key={`requires-${capability}`}>Requires · {title(capability)}</span>)}
    {skill.uses.map(resource => <span key={`uses-${resource}`}>Uses · {title(resource)}</span>)}
  </div>;
};

const sessionEntryName = (pack: SkillPack, entry: SkillProfile['sessions'][number]['entries'][number]) =>
  entry.kind === 'combo'
    ? entry.label ?? sessionEntrySkills(entry).map(id => pack.skills.find(skill => skill.id === id)?.name ?? id).join(' → ')
    : pack.skills.find(skill => skill.id === entry.skill)?.name ?? entry.skill;

const SessionPanel = ({ pack, session, onSelect, onIntensity, onRemove, onAddCombo, onFinish }: { pack: SkillPack; session: SkillProfile['openSession']; onSelect: (skill: SkillId) => void; onIntensity: (entryId: string, intensity: PracticeIntensity) => void; onRemove: (entryId: string) => void; onAddCombo: (skills: readonly SkillId[]) => void; onFinish: () => void }) => <section class={session ? 'session-panel' : 'session-empty'} aria-labelledby="today-session"><div class="section-heading"><div><p class="eyebrow">TODAY</p><h2 id="today-session">Today’s session</h2></div><p>{session ? `${session.entries.length} practice item${session.entries.length === 1 ? '' : 's'} selected. Finish only when they become history.` : 'Add skills as training unfolds, or combine skills into an on-the-fly sequence.'}</p></div>{session && <div class="session-entries">{session.entries.map(entry => <article key={sessionEntryId(entry)} class="session-entry"><button class="session-skill" onClick={() => onSelect(sessionEntrySkills(entry)[0])}><strong>{sessionEntryName(pack, entry)}</strong><small>{entry.kind === 'combo' ? `Combo · ${sessionEntrySkills(entry).length} skills` : entry.approach === 'stretch' ? 'Stretch skill' : 'Skill'}</small></button><div class="intensity-picker">{(['light', 'medium', 'intensive'] as const).map(intensity => <button key={intensity} class={entry.intensity === intensity ? 'selected' : ''} onClick={() => onIntensity(sessionEntryId(entry), intensity)}>{title(intensity)}</button>)}</div><button class="remove-session" onClick={() => onRemove(sessionEntryId(entry))} aria-label={`Remove ${sessionEntryName(pack, entry)} from today’s session`}>×</button></article>)}</div>}<ComboBuilder pack={pack} onAdd={onAddCombo} />{session && <button class="finish-session" onClick={onFinish}>Finish session · save {session.entries.length} practice item{session.entries.length === 1 ? '' : 's'}</button>}</section>;

const ComboBuilder = ({ pack, onAdd }: { pack: SkillPack; onAdd: (skills: readonly SkillId[]) => void }) => {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<SkillId[]>([]);
  const choose = (event: Event) => {
    const select = event.currentTarget as HTMLSelectElement | null;
    if (!select) return;
    const skill = select.value;
    if (skill && !skills.includes(skill)) setSkills(current => [...current, skill]);
    select.value = '';
  };
  const add = () => { if (skills.length < 2) return; onAdd(skills); setSkills([]); setOpen(false); };
  const name = (skill: SkillId) => pack.skills.find(item => item.id === skill)?.name ?? skill;
  return open ? <div class="combo-builder"><label>Add the next skill<select value="" onChange={choose}><option value="">Choose a skill…</option>{pack.categories.map(category => <optgroup key={category.id} label={category.name}>{pack.skills.filter(skill => skill.category === category.id && !skills.includes(skill.id)).map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</optgroup>)}</select></label>{skills.length ? <ol>{skills.map(skill => <li key={skill}><span>{name(skill)}</span><button onClick={() => setSkills(current => current.filter(item => item !== skill))} aria-label={`Remove ${name(skill)} from combo`}>×</button></li>)}</ol> : <p>Add skills in the order you want to practice them.</p>}<div><button onClick={add} disabled={skills.length < 2}>Add combo</button><button onClick={() => setOpen(false)}>Cancel</button></div></div> : <button class="add-combo" onClick={() => setOpen(true)}>Combine skills</button>;
};

const SessionHistory = ({ pack, history, onSelect, onEdit, onRemove, onEraseAll, onExport, onImport }: { pack: SkillPack; history: ReturnType<typeof completedSessions>; onSelect: (skill: SkillId) => void; onEdit: (session: CompletedSession) => void; onRemove: (sessionId: string) => void; onEraseAll: () => void; onExport: () => void; onImport: (file: File) => void }) => {
  const importInput = useRef<HTMLInputElement>(null);
  return <section class="surface history" aria-labelledby="history"><div class="history-heading"><div><p class="eyebrow">EVIDENCE</p><h2 id="history">Practice history</h2></div>{history.length ? <button class="erase-progress" onClick={onEraseAll}>Erase all local progress</button> : null}</div><div class="backup-actions"><button onClick={onExport}>Export backup</button><button onClick={() => importInput.current?.click()}>Restore backup</button><input ref={importInput} type="file" accept="application/json,.json" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void onImport(file); event.currentTarget.value = ''; }} /></div>{history.length ? <><p class="history-note">Sessions are your editable trail. Correct the date, skills, combinations, or intensity when you remember a workout later.</p><div class="history-list">{history.map(({ session, entries }) => <article class="history-session" key={session.id}><header><strong>{displayDate(session.date)}</strong><small>{entries.length} practice item{entries.length === 1 ? '' : 's'}</small><span class="history-buttons"><button class="edit-history" onClick={() => onEdit(session)}>Edit</button><button class="remove-history" onClick={() => onRemove(session.id)}>Remove</button></span></header><ul>{entries.map(({ entry, skills }) => <li key={sessionEntryId(entry)}><button onClick={() => onSelect(skills[0].id)}>{sessionEntryName(pack, entry)}</button><small>{title(entry.intensity)}{entry.kind === 'combo' ? ' · Combo' : entry.approach === 'stretch' ? ' · Stretch' : ''}</small></li>)}</ul></article>)}</div></> : <p class="empty-state">Finished training sessions will appear here, with their individual skills and intensity.</p>}</section>;
};

const SessionEditor = ({ pack, session, onClose, onSave }: { pack: SkillPack; session: CompletedSession; onClose: () => void; onSave: (session: CompletedSession) => void }) => {
  const [draft, setDraft] = useState(session);
  const updateEntry = (entryId: string, update: (entry: typeof draft.entries[number]) => typeof draft.entries[number]) =>
    setDraft(current => ({ ...current, entries: current.entries.map(entry => sessionEntryId(entry) === entryId ? update(entry) : entry) }));
  const removeEntry = (entryId: string) =>
    setDraft(current => ({ ...current, entries: current.entries.filter(entry => sessionEntryId(entry) !== entryId) }));
  const addEntry = (skill: SkillId) =>
    setDraft(current => current.entries.some(entry => sessionEntrySkills(entry).includes(skill)) ? current : ({ ...current, entries: [...current.entries, { kind: 'skill', skill, intensity: 'light', approach: 'ready' }] }));
  const addCombo = (skills: readonly SkillId[]) =>
    setDraft(current => ({ ...current, entries: [...current.entries, { kind: 'combo', id: crypto.randomUUID(), skills, intensity: 'light' }] }));
  return <div class="overlay" role="presentation" onClick={onClose}><aside class="detail session-editor" role="dialog" aria-modal="true" aria-label="Edit practice session" onClick={event => event.stopPropagation()}>
    <button class="close" onClick={onClose} aria-label="Close editor">×</button><p class="eyebrow">PRACTICE HISTORY</p><h2>Edit workout</h2><p class="description">Correct when it happened, what you practiced, and how hard it felt.</p>
    <label class="date-field">Date<input type="date" value={draft.date} onInput={event => setDraft(current => ({ ...current, date: event.currentTarget.value }))} /></label>
    <div class="editor-entries">{draft.entries.map(entry => <article key={sessionEntryId(entry)} class="session-entry"><strong>{sessionEntryName(pack, entry)}</strong><div class="intensity-picker">{(['light', 'medium', 'intensive'] as const).map(intensity => <button key={intensity} class={entry.intensity === intensity ? 'selected' : ''} onClick={() => updateEntry(sessionEntryId(entry), current => ({ ...current, intensity }))}>{title(intensity)}</button>)}</div><button class="remove-session" onClick={() => removeEntry(sessionEntryId(entry))} aria-label={`Remove ${sessionEntryName(pack, entry)} from this workout`}>×</button></article>)}</div>
    <label class="add-skill">Add another skill<select value="" onChange={event => addEntry(event.currentTarget.value)}><option value="">Choose a skill…</option>{pack.categories.map(category => <optgroup key={category.id} label={category.name}>{pack.skills.filter(skill => skill.category === category.id && !draft.entries.some(entry => sessionEntrySkills(entry).includes(skill.id))).map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</optgroup>)}</select></label>
    <ComboBuilder pack={pack} onAdd={addCombo} />
    <button class="finish-session" onClick={() => onSave(draft)} disabled={!draft.date || draft.entries.length === 0}>Save workout</button>
  </aside></div>;
};
