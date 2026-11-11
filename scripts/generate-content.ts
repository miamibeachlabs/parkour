import { parseDocument } from 'yaml';
import type { FacetDimension, Relation, SkillPack } from '../src/domain/SkillGraph.ts';

type RecordValue = Record<string, unknown>;
type Importance = 'foundational' | 'useful' | 'optional';

const packPath = 'content/parkour/pack.yaml';
const progressionPath = 'content/parkour/progression.yaml';
const movementContextPath = 'content/parkour/movement-context.yaml';
const outputPath = 'src/generated/parkour.ts';
const importance: Readonly<Record<Importance, 1 | 2 | 3>> = {
  foundational: 3,
  useful: 2,
  optional: 1,
};
const facetDimensions = new Set<FacetDimension>([
  'pattern', 'direction', 'action', 'body-orientation', 'support',
  'contact', 'symmetry', 'body-shape', 'dynamics', 'assistance',
]);
const sharedCapabilities = new Set([
  'strength', 'power', 'endurance', 'mobility', 'flexibility', 'speed',
  'balance', 'coordination', 'agility', 'precision', 'rhythm', 'perception',
]);

const fail = (message: string): never => { throw new Error(`Parkour content: ${message}`); };
const record = (value: unknown, context: string): RecordValue =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : fail(`${context} must be a mapping.`);
const text = (value: unknown, context: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fail(`${context} must be a non-empty string.`);
const list = (value: unknown, context: string): readonly unknown[] =>
  Array.isArray(value) ? value : fail(`${context} must be a list.`);

const yaml = async (path: string): Promise<RecordValue> => {
  const document = parseDocument(await Bun.file(path).text(), { prettyErrors: true });
  if (document.errors.length > 0)
    fail(`${path} could not be parsed.\n${document.errors.map(error => error.message).join('\n')}`);
  return record(document.toJS(), path);
};

const unique = (ids: readonly string[], context: string) => {
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) fail(`${context} repeats id '${duplicate}'.`);
};

const requiresAreAcyclic = (relations: readonly Relation[]) => {
  const next = (skill: string) => relations
    .filter(relation => relation.kind === 'requires' && relation.from === skill)
    .map(relation => relation.to);
  const visit = (skill: string, path: readonly string[]): void => {
    if (path.includes(skill)) fail(`requires contains a cycle: ${[...path, skill].join(' → ')}.`);
    for (const following of next(skill)) visit(following, [...path, skill]);
  };
  for (const relation of relations.filter(relation => relation.kind === 'requires')) visit(relation.from, []);
};

export const generateParkour = async () => {
  const source = await yaml(packPath);
  const progression = await yaml(progressionPath);
  const movementContext = await yaml(movementContextPath);
  const rawCategories = list(source.categories, `${packPath} categories`);
  const categories = rawCategories.map((value, index) => {
    const item = record(value, `categories[${index}]`);
    return {
      id: text(item.id, `categories[${index}].id`),
      name: text(item.name, `categories[${index}].name`),
      description: text(item.description, `categories[${index}].description`),
    };
  });
  unique(categories.map(category => category.id), 'categories');
  const categoryIds = new Set(categories.map(category => category.id));

  const rawSkills = list(source.skills, `${packPath} skills`);
  const baseSkills = rawSkills.map((value, index) => {
    const item = record(value, `skills[${index}]`);
    const category = text(item.category, `skills[${index}].category`);
    if (!categoryIds.has(category)) fail(`skills[${index}] uses unknown category '${category}'.`);
    const ranking = text(item.importance, `skills[${index}].importance`) as Importance;
    if (!(ranking in importance)) fail(`skills[${index}].importance must be foundational, useful, or optional.`);
    const tutorial = item.tutorial === undefined ? undefined : text(item.tutorial, `skills[${index}].tutorial`);
    return {
      id: text(item.id, `skills[${index}].id`),
      name: text(item.name, `skills[${index}].name`),
      category,
      importance: importance[ranking],
      origin: item.origin === undefined ? 'parkour' : text(item.origin, `skills[${index}].origin`),
      description: text(item.description, `skills[${index}].description`),
      ...(tutorial ? { tutorialUrl: tutorial } : {}),
    };
  });
  unique(baseSkills.map(skill => skill.id), 'skills');
  const skillIds = new Set(baseSkills.map(skill => skill.id));
  const unknownContexts = Object.keys(movementContext).filter(id => !skillIds.has(id));
  if (unknownContexts.length > 0) fail(`${movementContextPath} names unknown skill '${unknownContexts[0]}'.`);

  const skills = baseSkills.map(skill => {
    const context = record(movementContext[skill.id], `${movementContextPath}:${skill.id}`);
    const rawFacets = record(context.facets, `${movementContextPath}:${skill.id}.facets`);
    const facets = Object.fromEntries(Object.entries(rawFacets).map(([dimension, values]) => {
      if (!facetDimensions.has(dimension as FacetDimension))
        fail(`${movementContextPath}:${skill.id}.facets uses unknown dimension '${dimension}'.`);
      const entries = list(values, `${movementContextPath}:${skill.id}.facets.${dimension}`)
        .map((value, index) => text(value, `${movementContextPath}:${skill.id}.facets.${dimension}[${index}]`));
      return [dimension, entries];
    }));
    const capabilityLinks = record(context.capabilities, `${movementContextPath}:${skill.id}.capabilities`);
    const capabilityList = (kind: 'develops' | 'requires') =>
      (capabilityLinks[kind] === undefined ? [] : list(capabilityLinks[kind], `${movementContextPath}:${skill.id}.capabilities.${kind}`))
        .map((value, index) => text(value, `${movementContextPath}:${skill.id}.capabilities.${kind}[${index}]`));
    const develops = capabilityList('develops');
    if (develops.length === 0) fail(`${movementContextPath}:${skill.id}.capabilities.develops must not be empty.`);
    const requires = capabilityList('requires');
    for (const capability of [...develops, ...requires])
      if (!sharedCapabilities.has(capability)) fail(`${movementContextPath}:${skill.id} names unknown shared capability '${capability}'.`);
    const uses = (context.uses === undefined ? [] : list(context.uses, `${movementContextPath}:${skill.id}.uses`))
      .map((value, index) => text(value, `${movementContextPath}:${skill.id}.uses[${index}]`));
    return { ...skill, facets, capabilities: { develops, requires }, uses };
  });

  const relations: Relation[] = [];
  for (const [target, value] of Object.entries(progression)) {
    if (!skillIds.has(target)) fail(`${progressionPath} names unknown skill '${target}'.`);
    const entry = record(value, `${progressionPath}:${target}`);
    for (const kind of ['requires', 'progresses-to', 'transfers-to'] as const) {
      if (entry[kind] === undefined) continue;
      for (const sourceId of list(entry[kind], `${progressionPath}:${target}.${kind}`)) {
        const from = text(sourceId, `${progressionPath}:${target}.${kind}`);
        if (!skillIds.has(from)) fail(`${progressionPath}:${target}.${kind} names unknown skill '${from}'.`);
        if (from === target) fail(`${progressionPath}:${target} cannot relate a skill to itself.`);
        relations.push({ from, to: target, kind });
      }
    }
  }
  const duplicates = relations.find((relation, index) => relations.findIndex(candidate =>
    candidate.from === relation.from && candidate.to === relation.to && candidate.kind === relation.kind) !== index);
  if (duplicates) fail(`${progressionPath} repeats ${duplicates.kind} ${duplicates.from} → ${duplicates.to}.`);
  const conflicts = relations.find(relation => relations.some(candidate =>
    candidate.from === relation.from && candidate.to === relation.to && candidate.kind !== relation.kind));
  if (conflicts) fail(`${progressionPath} defines multiple relation kinds for ${conflicts.from} → ${conflicts.to}.`);
  requiresAreAcyclic(relations);

  const pack: SkillPack = {
    id: text(source.id, `${packPath}.id`),
    name: text(source.name, `${packPath}.name`),
    categories,
    skills,
    relations,
  };
  const generated = [
    '// Generated from content/parkour/*.yaml. Do not edit this file.',
    "import type { SkillPack } from '../domain/SkillGraph.ts';",
    '',
    `export const parkour = ${JSON.stringify(pack, null, 2)} as const satisfies SkillPack;`,
    '',
  ].join('\n');
  await Bun.write(outputPath, generated);
  console.log(`Generated ${outputPath} from Parkour YAML.`);
};

if (import.meta.main) await generateParkour();
