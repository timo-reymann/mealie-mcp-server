import { describe, it, expect } from 'vitest';
import { classifyAndRank, type MatchField } from '../lib/candidate-matching.js';

const foodFields: MatchField[] = [{ key: 'name' }, { key: 'pluralName' }, { key: 'alias', isAlias: true }];

const unitFields: MatchField[] = [
  { key: 'name' },
  { key: 'pluralName' },
  { key: 'abbreviation' },
  { key: 'pluralAbbreviation' },
  { key: 'alias', isAlias: true },
];

describe('classifyAndRank — foods', () => {
  it('matches on exact canonical name', () => {
    const [match] = classifyAndRank([{ id: '1', name: 'Basil', pluralName: 'Basils', aliases: [] }], foodFields, 'Basil');
    expect(match).toMatchObject({ matchedBy: 'name', matchType: 'exact', matchedValue: 'Basil' });
  });

  it('matches on plural-name', () => {
    const [match] = classifyAndRank(
      [{ id: '1', name: 'Tomato', pluralName: 'Tomatoes', aliases: [] }],
      foodFields,
      'Tomatoes',
    );
    expect(match).toMatchObject({ matchedBy: 'pluralName', matchType: 'exact' });
  });

  it('matches on an exact alias — the som moo regression case', () => {
    const fermentedPork = {
      id: '6d0534a7-ee50-443d-af6e-079731249172',
      name: 'fermented pork',
      pluralName: 'fermented pork',
      aliases: [{ name: 'cured pork (som moo)' }],
    };
    const [match] = classifyAndRank([fermentedPork], foodFields, 'som moo');
    // "som moo" is a substring of the stored alias "cured pork (som moo)", not an exact match on it.
    expect(match).toMatchObject({
      id: '6d0534a7-ee50-443d-af6e-079731249172',
      matchedBy: 'alias',
      matchType: 'substring',
      matchedValue: 'cured pork (som moo)',
    });
  });

  it('matches an alias exactly when the query equals the full alias text', () => {
    const fermentedPork = {
      id: 'food-1',
      name: 'fermented pork',
      pluralName: 'fermented pork',
      aliases: [{ name: 'cured pork (som moo)' }],
    };
    const [match] = classifyAndRank([fermentedPork], foodFields, 'cured pork (som moo)');
    expect(match).toMatchObject({ matchedBy: 'alias', matchType: 'exact', matchedValue: 'cured pork (som moo)' });
  });

  it('matches on canonical-name substring', () => {
    const [match] = classifyAndRank(
      [{ id: '1', name: 'Fresh Mozzarella', pluralName: 'Fresh Mozzarellas', aliases: [] }],
      foodFields,
      'mozzarella',
    );
    expect(match).toMatchObject({ matchedBy: 'name', matchType: 'substring' });
  });

  it('returns multiple candidates for one query without picking a winner', () => {
    const matches = classifyAndRank(
      [
        { id: '1', name: 'pork chop', pluralName: 'pork chops', aliases: [] },
        { id: '2', name: 'pulled pork', pluralName: 'pulled porks', aliases: [] },
      ],
      foodFields,
      'pork',
    );
    expect(matches).toHaveLength(2);
  });

  it('returns nothing for a query with no candidates', () => {
    const matches = classifyAndRank(
      [{ id: '1', name: 'Basil', pluralName: 'Basils', aliases: [] }],
      foodFields,
      'something nonexistent',
    );
    expect(matches).toEqual([]);
  });

  it('matches case-insensitively', () => {
    const [match] = classifyAndRank([{ id: '1', name: 'Basil', pluralName: 'Basils', aliases: [] }], foodFields, 'BASIL');
    expect(match).toMatchObject({ matchType: 'exact' });
  });

  it('ranks exact name above exact alias above substring name', () => {
    const exactName = { id: '1', name: 'garlic', pluralName: 'garlics', aliases: [] };
    const exactAlias = { id: '2', name: 'allium', pluralName: 'alliums', aliases: [{ name: 'garlic' }] };
    const substringName = { id: '3', name: 'garlic powder', pluralName: 'garlic powders', aliases: [] };

    const matches = classifyAndRank([substringName, exactAlias, exactName], foodFields, 'garlic');
    expect(matches.map((m) => m.id)).toEqual(['1', '2', '3']);
  });

  it('breaks ties deterministically by name', () => {
    const a = { id: '2', name: 'zzz garlic', pluralName: '', aliases: [] };
    const b = { id: '1', name: 'aaa garlic', pluralName: '', aliases: [] };
    const matches = classifyAndRank([a, b], foodFields, 'garlic');
    expect(matches.map((m) => m.id)).toEqual(['1', '2']);
  });

  it('picks the alphabetically-first matching alias when several aliases on one food match', () => {
    const food = { id: '1', name: 'x', pluralName: '', aliases: [{ name: 'zzz garlic' }, { name: 'aaa garlic' }] };
    const [match] = classifyAndRank([food], foodFields, 'garlic');
    expect(match.matchedValue).toBe('aaa garlic');
  });
});

describe('classifyAndRank — units', () => {
  it('ranks exact name, plural name, abbreviation, plural abbreviation, then alias, then substrings, in that order', () => {
    const byName = { id: '1', name: 'tablespoon', pluralName: 'x', abbreviation: 'x', pluralAbbreviation: 'x', aliases: [] };
    const byPlural = { id: '2', name: 'x', pluralName: 'tablespoon', abbreviation: 'x', pluralAbbreviation: 'x', aliases: [] };
    const byAbbrev = { id: '3', name: 'x', pluralName: 'x', abbreviation: 'tablespoon', pluralAbbreviation: 'x', aliases: [] };
    const byPluralAbbrev = {
      id: '4',
      name: 'x',
      pluralName: 'x',
      abbreviation: 'x',
      pluralAbbreviation: 'tablespoon',
      aliases: [],
    };
    const byAlias = { id: '5', name: 'x', pluralName: 'x', abbreviation: 'x', pluralAbbreviation: 'x', aliases: [{ name: 'tablespoon' }] };
    const bySubstringName = { id: '6', name: 'tablespoon (heaping)', pluralName: 'x', abbreviation: 'x', pluralAbbreviation: 'x', aliases: [] };

    const shuffled = [bySubstringName, byAlias, byPluralAbbrev, byAbbrev, byPlural, byName];
    const matches = classifyAndRank(shuffled, unitFields, 'tablespoon');
    expect(matches.map((m) => m.id)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('matches on abbreviation', () => {
    const [match] = classifyAndRank(
      [{ id: '1', name: 'tablespoon', pluralName: 'tablespoons', abbreviation: 'tbsp', pluralAbbreviation: 'tbsp', aliases: [] }],
      unitFields,
      'tbsp',
    );
    expect(match).toMatchObject({ matchedBy: 'abbreviation', matchType: 'exact' });
  });

  it('matches on an alias not found by ordinary search — the unit alias regression case', () => {
    const unit = {
      id: 'unit-1',
      name: 'integration-test-measure',
      pluralName: 'integration-test-measures',
      abbreviation: '',
      pluralAbbreviation: '',
      aliases: [{ name: 'special-unit-alias' }],
    };
    const [match] = classifyAndRank([unit], unitFields, 'special-unit-alias');
    expect(match).toMatchObject({ id: 'unit-1', matchedBy: 'alias', matchType: 'exact' });
  });

  it('returns multiple candidates without choosing a winner', () => {
    const matches = classifyAndRank(
      [
        { id: '1', name: 'cup', pluralName: 'cups', abbreviation: 'c', pluralAbbreviation: 'c', aliases: [] },
        { id: '2', name: 'cupful', pluralName: 'cupfuls', abbreviation: '', pluralAbbreviation: '', aliases: [] },
      ],
      unitFields,
      'cup',
    );
    expect(matches).toHaveLength(2);
  });

  it('returns nothing for a query with no candidates', () => {
    const matches = classifyAndRank(
      [{ id: '1', name: 'cup', pluralName: 'cups', abbreviation: 'c', pluralAbbreviation: 'c', aliases: [] }],
      unitFields,
      'nonexistent-unit',
    );
    expect(matches).toEqual([]);
  });
});
