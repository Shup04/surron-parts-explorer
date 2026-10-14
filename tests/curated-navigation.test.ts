import { describe, expect, it } from 'vitest';
import { oemCatalog, oemDatabase } from '../src/data/oem';
import { toExplorerCatalog } from '../src/oem/adapter';
import { applyReviewPatches } from '../src/oem/review';
import { buildCatalogIndex, searchParts } from '../src/core/catalog';
import { parseExplorerUrl } from '../src/core/navigation';
import {
  CURATED_SYSTEMS,
  REFERENCE_ONLY_ASSEMBLY_IDS,
  REFERENCE_ONLY_OEM_NUMBERS,
  type NavigationDefinition,
} from '../src/navigation/definition';
import {
  buildCuratedNavigation,
  navigationForOccurrence,
  type VerifiedConfiguration,
} from '../src/navigation/model';
import { resolveNavigationLocation } from '../src/navigation/location';

const model = buildCuratedNavigation(oemDatabase, oemCatalog);
const flatten = (nodes: NavigationDefinition[]): NavigationDefinition[] =>
  nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
const installed = (value = model) =>
  [...value.byId.values()].filter((node) => node.kind === 'installed');
const candidateIds = (id: string) =>
  model.byId.get(id)!.references.flatMap((group) => group.occurrenceIds);
const batteryRow = oemDatabase.sourceRows.find(
  (row) => row.sourceId === 'lbx2021' && row.oemNumber === '26000-YQ2A-0500',
)!;
const batteryOccurrence = oemDatabase.occurrences.find(
  (occurrence) => occurrence.sourceRowId === batteryRow.id,
)!;
const configuration: VerifiedConfiguration = {
  id: 'reviewed-fixture',
  name: 'Test fixture only',
  motorcycleId: 'lbx',
  modelYear: 2021,
  assignments: [
    {
      nodeId: 'nav.battery.pack',
      occurrenceIds: [batteryOccurrence.id],
      verification: 'verified-installed',
      evidence: 'Automated fixture simulating explicit owner inspection, not shipped fitment data.',
    },
  ],
};
const configured = (config = configuration, year: number | 'unknown' = 2021) =>
  buildCuratedNavigation(oemDatabase, oemCatalog, {
    modelYear: year,
    configurationId: config.id,
    configurations: [config],
  });

describe('curated motorcycle presentation', () => {
  it('retains fourteen physical systems without pruning or reparenting the full catalog', () => {
    const before = JSON.stringify({ database: oemDatabase, catalog: oemCatalog });
    const navigation = buildCuratedNavigation(oemDatabase, oemCatalog);
    expect(navigation.roots).toHaveLength(14);
    expect(navigation.roots.map((node) => node.id)).toEqual(
      CURATED_SYSTEMS.map((system) => system.id),
    );
    expect(navigation.roots.some((node) => REFERENCE_ONLY_ASSEMBLY_IDS.includes(node.id))).toBe(
      false,
    );
    expect(installed(navigation)).toEqual([]);
    expect(JSON.stringify({ database: oemDatabase, catalog: oemCatalog })).toBe(before);
    expect(oemDatabase.occurrences).toHaveLength(1396);
  });

  it('binds every explicit role to real source scopes and identifiers', () => {
    const definitions = CURATED_SYSTEMS.flatMap((system) => flatten(system.children));
    expect(new Set(definitions.map((node) => node.id)).size).toBe(definitions.length);
    for (const system of CURATED_SYSTEMS) {
      for (const node of flatten(system.children)) {
        const scopes = node.sourceAssemblyIds ?? system.sourceAssemblyIds;
        for (const number of node.oemNumbers ?? [])
          expect(
            oemDatabase.sourceRows.some(
              (row) =>
                row.oemNumber === number &&
                scopes.includes(
                  oemDatabase.occurrences.find((occurrence) => occurrence.sourceRowId === row.id)!
                    .assemblyId,
                ),
            ),
            `${node.id}: ${number}`,
          ).toBe(true);
        for (const id of node.sourceRowIds ?? [])
          expect(
            oemDatabase.sourceRows.some((row) => row.id === id),
            id,
          ).toBe(true);
      }
    }
  });

  it('presents the front wheel through serviceable roles, not every catalog variant', () => {
    const wheel = model.byId.get('front-wheel')!;
    expect(wheel.children.map((node) => node.name)).toEqual(
      expect.arrayContaining([
        'Tire',
        'Rim and spokes',
        'Hub',
        'Axle',
        'Wheel bearings',
        'Brake rotor',
        'Service parts',
      ]),
    );
    expect(wheel.children.length).toBeLessThan(
      oemCatalog.parts.filter((part) => part.parentId === 'front-wheel').length,
    );
    const tires = model.byId.get('nav.front-wheel.tire')!;
    expect(tires.references.length).toBeGreaterThan(1);
    expect(tires.children).toEqual([]);
    expect(model.byId.get('nav.front-wheel.service')!.children.length).toBeGreaterThan(0);
    expect(
      model.byId.get('nav.front-wheel.axle')!.references.some((group) => group.oemNumber === null),
    ).toBe(true);
  });

  it('preserves jackshaft bearing designations and per-source quantities without leaking swingarm uses', () => {
    const bearings = model.byId.get('nav.jackshaft.bearings')!;
    expect(bearings.references.map((group) => group.oemNumber)).toEqual(
      expect.arrayContaining(['Z-6000-2Z-26-10-08', 'Z-6000-2RS-26-10-08', 'Z-6001-2RS-28-12-08']),
    );
    const historical = bearings.references.filter(
      (group) => group.oemNumber === 'Z-6000-2Z-26-10-08',
    );
    expect(historical).toHaveLength(1);
    const occurrences = historical[0].occurrenceIds.map(
      (id) => oemDatabase.occurrences.find((item) => item.id === id)!,
    );
    expect(occurrences.map((occurrence) => occurrence.quantity).sort()).toEqual([1, 1, 3]);
    expect(occurrences.every((occurrence) => occurrence.assemblyId === 'jackshaft')).toBe(true);
    expect(candidateIds('nav.jackshaft.bearings')).not.toEqual(
      candidateIds('nav.swingarm.bearings'),
    );
  });

  it('keeps small jackshaft service parts and all their selection identities reachable', () => {
    const shaft = model.byId.get('jackshaft')!;
    const references = shaft.children.flatMap((node) =>
      node.references.flatMap((group) => group.occurrenceIds),
    );
    for (const callout of ['17_02', '17_03', '17_04', '17_05', '17_07', '17_08', '17_11']) {
      const row = oemDatabase.sourceRows.find(
        (row) => row.sourceId === 'lbx2021' && row.callout === callout,
      )!;
      const occurrence = oemDatabase.occurrences.find(
        (occurrence) => occurrence.sourceRowId === row.id,
      )!;
      expect(references, callout).toContain(occurrence.id);
      expect(navigationForOccurrence(model, occurrence.id)).toBeDefined();
      expect(parseExplorerUrl(`?part=${occurrence.id}`, oemCatalog).partId).toBe(occurrence.id);
    }
    expect(shaft.children.some((node) => node.kind === 'service')).toBe(true);
  });

  it('keeps front and rear brake locations distinct and unresolved caliper positions out of both', () => {
    const brake = model.byId.get('brakes')!;
    expect(brake.children.map((node) => node.name)).toEqual(
      expect.arrayContaining(['Front brake', 'Rear brake', 'Brake pads', 'Brake levers']),
    );
    const front = brake.children.find((node) => node.name === 'Front brake')!;
    const rear = brake.children.find((node) => node.name === 'Rear brake')!;
    expect(front.id).not.toBe(rear.id);
    const ambiguous = '52190-YQ2A-0000';
    for (const node of [front, rear])
      expect(node.references.some((group) => group.oemNumber === ambiguous)).toBe(false);
    expect(brake.references.some((group) => group.oemNumber === ambiguous)).toBe(true);
  });

  it('excludes accessories and cosmetics from ordinary role candidates while preserving search and links', () => {
    expect(model.byId.has('nav.electrical.road-lighting')).toBe(false);
    expect(model.byId.has('nav.controls.mirrors')).toBe(false);
    for (const node of model.byId.values())
      for (const group of node.references)
        expect(REFERENCE_ONLY_OEM_NUMBERS).not.toContain(group.oemNumber);
    for (const assemblyId of ['stickers', 'tools', 'supermoto', 'pedal-kit']) {
      expect(model.byId.has(assemblyId)).toBe(false);
      const occurrence = oemDatabase.occurrences.find((item) => item.assemblyId === assemblyId)!;
      expect(
        parseExplorerUrl(`?assembly=${assemblyId}&part=${occurrence.id}`, oemCatalog).partId,
      ).toBe(occurrence.id);
    }
    expect(searchParts(buildCatalogIndex(oemCatalog), '21700-YQ2A-0800').length).toBeGreaterThan(0);
    expect(model.byId.get('nav.battery.pack')!.references.length).toBeGreaterThan(1);
  });

  it('uses explicit identity classifications even when a reviewer changes a display name', () => {
    const occurrence = model.byId.get('nav.front-wheel.tire')!.references[0].occurrenceIds[0];
    const reviewed = applyReviewPatches(oemDatabase, {
      version: 1,
      patches: [
        {
          occurrenceId: occurrence,
          normalizedName: 'Renamed part including the words sticker and charger',
          note: 'Presentation-only test',
          updatedAt: '2026-10-14T00:00:00Z',
        },
      ],
    });
    const next = buildCuratedNavigation(reviewed, toExplorerCatalog(reviewed));
    expect(
      next.byId.get('nav.front-wheel.tire')!.references.flatMap((group) => group.occurrenceIds),
    ).toContain(occurrence);
  });

  it('does not promote source or mechanical review status or geometry mapping into installed fitment', () => {
    const reviewed = applyReviewPatches(oemDatabase, {
      version: 1,
      patches: [
        {
          occurrenceId: batteryOccurrence.id,
          reviewStatus: 'mechanically-verified',
          note: 'Dimension checked, no installed configuration claim',
          updatedAt: '2026-10-14T00:00:00Z',
        },
      ],
    });
    const catalog = toExplorerCatalog(reviewed, { modelYear: 2021 });
    expect(installed(buildCuratedNavigation(reviewed, catalog, { modelYear: 2021 }))).toEqual([]);
  });

  it('shows exactly the evidenced installed variant for a matching explicit configuration', () => {
    const result = configured();
    expect(result.warnings).toEqual([]);
    expect(installed(result)).toHaveLength(1);
    expect(installed(result)[0].occurrenceId).toBe(batteryOccurrence.id);
    expect(result.byId.get('nav.battery.pack')!.references.length).toBeGreaterThan(1);
    expect(installed(configured(configuration, 2026))).toEqual([]);
    expect(installed(configured(configuration, 'unknown'))).toEqual([]);
    expect(installed(configured({ ...configuration, motorcycleId: 'another-bike' }))).toEqual([]);
  });

  it('fails closed for ambiguous, unevidenced or wrong-role assignments', () => {
    const assignment = configuration.assignments[0];
    const other = model.byId
      .get('nav.battery.pack')!
      .references.find((group) => !group.occurrenceIds.includes(batteryOccurrence.id))!;
    for (const assignments of [
      [assignment, assignment],
      [{ ...assignment, evidence: '' }],
      [{ ...assignment, occurrenceIds: [batteryOccurrence.id, other.occurrenceIds[0]] }],
      [{ ...assignment, nodeId: 'nav.front-wheel.tire' }],
      [{ ...assignment, occurrenceIds: ['missing-record'] }],
    ])
      expect(installed(configured({ ...configuration, assignments }))).toEqual([]);
  });

  it('keeps reference year filtering separate from generic inspection groups', () => {
    const emptyCatalog = toExplorerCatalog(oemDatabase, { sourceId: 'lbx2021', modelYear: 2026 });
    const empty = buildCuratedNavigation(oemDatabase, emptyCatalog, { modelYear: 2026 });
    expect(empty.roots).toHaveLength(14);
    expect(empty.byId.get('nav.battery.pack')!.references).toEqual([]);
    expect(installed(empty)).toEqual([]);
  });

  it('resolves presentation URLs to existing engine scopes and preserves exact part links', () => {
    const state = resolveNavigationLocation('?nav=nav.jackshaft.bearings', oemCatalog, model);
    expect(state).toEqual({ assemblyId: 'jackshaft', partId: 'jackshaft' });
    const unchanged = resolveNavigationLocation(
      `?nav=nav.jackshaft.bearings&part=${batteryOccurrence.id}`,
      oemCatalog,
      model,
    );
    expect(unchanged).toEqual(parseExplorerUrl(`?part=${batteryOccurrence.id}`, oemCatalog));
    expect(resolveNavigationLocation('?nav=missing', oemCatalog, model)).toEqual({
      assemblyId: 'lbx',
      partId: null,
    });
    expect(
      resolveNavigationLocation(
        '?motorcycle=another-bike&nav=nav.jackshaft.bearings',
        oemCatalog,
        model,
      ).assemblyId,
    ).toBe('lbx');
  });
});
