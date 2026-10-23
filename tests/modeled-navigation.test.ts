import { describe, expect, it } from 'vitest';
import { oemCatalog, oemDatabase } from '../src/data/oem';
import { demoCatalog } from '../src/data/catalog';
import { projectParts, projectPartsMapping, withProjectParts } from '../src/config/project-parts';
import {
  buildModeledNavigation,
  geometrySelectionAssembly,
  modeledScope,
} from '../src/navigation/modeled';
import { navigationAncestors, navigationForOccurrence } from '../src/navigation/model';
import { resolveNavigationLocation } from '../src/navigation/location';
import type { Catalog, Part } from '../src/core/types';

const catalog = withProjectParts(oemCatalog);
const mapped = new Set(projectPartsMapping.mappings.map((entry) => entry.partId));
const navigation = buildModeledNavigation(oemDatabase, catalog, mapped);

describe('model-driven explorer navigation', () => {
  it('opens the jackshaft parent from every component hit, then allows individual picks inside it', () => {
    const assembly = navigation.byId.get('nav.jackshaft.assembly')!;
    expect(assembly.modelPartIds).toHaveLength(21);
    for (const partId of assembly.modelPartIds!) {
      expect(geometrySelectionAssembly(navigation, undefined, partId)).toBe(assembly);
      expect(geometrySelectionAssembly(navigation, navigation.byId.get('jackshaft'), partId)).toBe(
        assembly,
      );
      expect(geometrySelectionAssembly(navigation, assembly, partId)).toBeUndefined();
      expect(
        geometrySelectionAssembly(navigation, navigationForOccurrence(navigation, partId), partId),
      ).toBeUndefined();
    }
    expect(
      geometrySelectionAssembly(
        navigation,
        navigation.byId.get('nav.jackshaft.pulley-bolts'),
        'project-jackshaft-pulley-bolt-01',
      ),
    ).toBeUndefined();
    expect(geometrySelectionAssembly(navigation, undefined, 'project-main-frame')).toBeUndefined();
    expect(
      geometrySelectionAssembly(navigation, undefined, 'project-swingarm-pivot-washer'),
    ).toBeUndefined();
    expect(geometrySelectionAssembly(navigation, undefined, 'missing-part')).toBeUndefined();
    expect(geometrySelectionAssembly(null, undefined, 'bearing-left')).toBeUndefined();
  });

  it('lists each supplied model once and omits every empty system and role', () => {
    const leaves = [...navigation.byId.values()].filter((node) => node.occurrenceId);
    expect(leaves).toHaveLength(projectParts.length);
    expect(new Set(leaves.map((node) => node.occurrenceId))).toEqual(mapped);
    expect(navigation.byId.has('front-wheel')).toBe(false);
    expect(navigation.byId.has('front-suspension')).toBe(false);
    expect(navigation.byId.has('nav.battery.pack')).toBe(false);
    expect(navigation.byId.has('jackshaft')).toBe(true);
    expect(navigation.byId.has('nav.motor.pulley')).toBe(false);
    for (const node of navigation.byId.values())
      expect(node.modelPartIds?.length).toBeGreaterThan(0);
  });

  it('keeps multiple models in a role individually selectable without a service placeholder', () => {
    const hardware = navigation.byId.get('nav.frame.fasteners')!;
    expect(hardware.parentId).toBe('frame');
    expect(hardware.children.map((node) => node.occurrenceId)).toEqual([
      'project-m6-hardware-right',
      'project-m6-hardware-left',
    ]);
    expect(navigationAncestors(navigation, hardware.children[0].id)).toEqual([
      'frame',
      'nav.frame.fasteners',
    ]);
    expect(navigationForOccurrence(navigation, 'project-m6-hardware-left')).toBe(
      hardware.children[1],
    );
  });

  it('adds jackshaft children when models are assigned and removes their empty branches again', () => {
    const baseline = new Set([...mapped].filter((id) => !id.startsWith('project-jackshaft-')));
    const parts = [
      ['bearing-left', 'nav.jackshaft.bearings'],
      ['bearing-right', 'nav.jackshaft.bearings'],
      ['spacer', 'nav.jackshaft.inner-spacer'],
      ['bolt', 'nav.jackshaft.fasteners'],
    ].map(
      ([id, role]): Part => ({
        ...catalog.parts.find((part) => part.id === 'project-main-frame')!,
        id,
        name: id,
        parentId: 'jackshaft',
        specifications: { 'Model role': role },
      }),
    );
    const expanded: Catalog = { ...catalog, parts: [...catalog.parts, ...parts] };
    const ids = new Set([...baseline, ...parts.map((part) => part.id)]);
    const added = buildModeledNavigation(oemDatabase, expanded, ids);
    expect(added.byId.get('jackshaft')?.modelPartIds).toHaveLength(4);
    expect(added.byId.get('nav.jackshaft.bearings')?.children).toHaveLength(2);
    const removed = buildModeledNavigation(oemDatabase, expanded, baseline);
    expect(removed.byId.has('nav.jackshaft.bearings')).toBe(false);
    expect(removed.byId.has('jackshaft')).toBe(false);
  });

  it('opens both pegs, their brackets and all four bolts as one footpeg assembly', () => {
    const assembly = navigation.byId.get('nav.footpegs-stand.footpegs')!;
    expect(new Set(assembly.modelPartIds)).toEqual(
      new Set([
        'project-footpeg-left',
        'project-footpeg-right',
        'project-footpeg-bracket-left',
        'project-footpeg-bracket-right',
        'project-bolt-peg-left-upper',
        'project-bolt-peg-left-lower',
        'project-bolt-peg-right-upper',
        'project-bolt-peg-right-lower',
      ]),
    );
    expect(navigation.byId.get('nav.footpegs-stand.brackets')?.modelPartIds).toHaveLength(6);
    expect(navigationAncestors(navigation, 'nav.footpegs-stand.left-peg')).toEqual([
      'footpegs-stand',
      assembly.id,
    ]);
    const location = resolveNavigationLocation(
      `?nav=${assembly.id}&part=project-footpeg-left`,
      catalog,
      navigation,
    );
    expect(modeledScope(navigation, location.assemblyId, location.partId, assembly.id)).toBe(
      assembly,
    );
  });

  it('keeps the original catalogs and developer role picker intact', () => {
    const before = JSON.stringify({ catalog, database: oemDatabase });
    const empty = buildModeledNavigation(oemDatabase, catalog, new Set());
    expect(empty.roots).toEqual([]);
    expect(empty.byId.size).toBe(0);
    expect(JSON.stringify({ catalog, database: oemDatabase })).toBe(before);
  });

  it('shows only explicitly mapped OEM occurrences, without inferring variants or quantities', () => {
    const id = 'occ-lbx2021-p10-r4';
    const modeled = buildModeledNavigation(oemDatabase, oemCatalog, new Set([id]));
    const seat = modeled.byId.get('nav.body.seat')!;
    expect(seat.occurrenceId).toBe(id);
    expect(seat.modelPartIds).toEqual([id]);
    expect(seat.installedOccurrenceIds).toEqual([]);
    expect(seat.references).toEqual([]);
    expect([...modeled.byId.values()].filter((node) => node.occurrenceId)).toHaveLength(1);
  });

  it('resolves existing role links to the actual modeled part', () => {
    expect(resolveNavigationLocation('?nav=nav.swingarm.arm', catalog, navigation)).toEqual({
      assemblyId: 'swingarm',
      partId: 'project-swingarm',
    });
    expect(resolveNavigationLocation('?nav=nav.battery.pack', catalog, navigation)).toEqual({
      assemblyId: 'lbx',
      partId: null,
    });
  });

  it('resolves direct part links and rejects unrelated assembly scopes', () => {
    const part = modeledScope(navigation, 'frame', 'project-main-frame', null);
    expect(part?.id).toBe('nav.frame.frame');
    const assembly = modeledScope(navigation, 'frame', 'project-main-frame', 'frame');
    expect(assembly?.id).toBe('frame');
    expect(modeledScope(navigation, 'frame', 'project-main-frame', 'jackshaft')).toBe(part);
    expect(modeledScope(navigation, 'jackshaft', 'occ-lbx2021-p15-r16', null)).toBeUndefined();
  });

  it('preserves custom nested assembly ancestry and includes models with new roles', () => {
    const custom = buildModeledNavigation(
      oemDatabase,
      demoCatalog,
      new Set(['shaft', 'bearing-left']),
    );
    expect(custom.roots.map((node) => node.id)).toEqual(['drivetrain']);
    expect(custom.byId.get('jackshaft')?.modelPartIds).toEqual(['shaft', 'bearing-left']);
    expect(navigationAncestors(custom, 'modeled.bearing-left')).toEqual([
      'drivetrain',
      'jackshaft',
    ]);
    const newPart = {
      ...catalog.parts.find((part) => part.id === 'project-main-frame')!,
      id: 'new-part',
      parentId: 'jackshaft',
      specifications: { 'Model role': 'new-role' },
    };
    const added = buildModeledNavigation(
      oemDatabase,
      { ...catalog, parts: [...catalog.parts, newPart] },
      new Set([...mapped, newPart.id]),
    );
    expect(added.byId.get('modeled.new-part')?.parentId).toBe('jackshaft');
    expect(added.byId.get('jackshaft')?.modelPartIds).toContain('new-part');
  });
});
