import { z } from 'zod';
import type { SceneObjectInfo, Vec3 } from './types';
import type { ValidationIssue } from './validation';

const finite = z.number().finite();
const index = z.number().int().nonnegative();
const gltfSchema = z.object({
  asset: z.object({
    version: z.literal('2.0'),
    generator: z.string().optional(),
    extras: z.record(z.string(), z.unknown()).optional(),
  }),
  scene: index.optional(),
  scenes: z
    .array(
      z.object({
        name: z.string().optional(),
        nodes: z.array(index).optional(),
        extras: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  nodes: z
    .array(
      z.object({
        name: z.string().optional(),
        children: z.array(index).optional(),
        mesh: index.optional(),
        translation: z.tuple([finite, finite, finite]).optional(),
        rotation: z.tuple([finite, finite, finite, finite]).optional(),
        scale: z.tuple([finite, finite, finite]).optional(),
        matrix: z.array(finite).length(16).optional(),
        extras: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  meshes: z
    .array(
      z.object({
        name: z.string().optional(),
        primitives: z
          .array(
            z.object({
              attributes: z.record(z.string(), index),
              indices: index.optional(),
              mode: index.optional(),
            }),
          )
          .min(1),
      }),
    )
    .optional(),
  buffers: z.array(z.object({ uri: z.string().optional(), byteLength: index })).optional(),
  images: z
    .array(z.object({ uri: z.string().optional(), bufferView: index.optional() }))
    .optional(),
  extensionsUsed: z.array(z.string()).optional(),
  extensionsRequired: z.array(z.string()).optional(),
});

/** Parse JSON glTF or the JSON chunk of a binary GLB without altering geometry. */
export function parseGltfBytes(bytes: Uint8Array): unknown {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 4 && view.getUint32(0, true) === 0x46546c67) {
    if (bytes.length < 20) throw new Error('GLB is truncated');
    if (view.getUint32(4, true) !== 2) throw new Error('Only GLB version 2 is supported');
    if (view.getUint32(8, true) !== bytes.length)
      throw new Error('GLB declared length does not match the file');
    const length = view.getUint32(12, true);
    if (view.getUint32(16, true) !== 0x4e4f534a)
      throw new Error('First GLB chunk must contain JSON');
    if (length % 4 || length + 20 > bytes.length)
      throw new Error('GLB JSON chunk has an invalid length');
    return JSON.parse(
      new TextDecoder().decode(bytes.subarray(20, 20 + length)).replace(/[\s\0]+$/, ''),
    );
  }
  return JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/, ''));
}

export interface ModelInspection {
  objects: SceneObjectInfo[];
  issues: ValidationIssue[];
  warnings: string[];
  resources: string[];
  extensionsRequired: string[];
  meshCount: number;
}

export function inspectGltfDocument(input: unknown): ModelInspection {
  const empty = { objects: [], warnings: [], resources: [], extensionsRequired: [], meshCount: 0 };
  const parsed = gltfSchema.safeParse(input);
  if (!parsed.success)
    return {
      ...empty,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  const document = parsed.data;
  const nodes = document.nodes ?? [];
  const issues: ValidationIssue[] = [],
    warnings: string[] = [],
    objects: SceneObjectInfo[] = [];
  const nameCounts = new Map<string, number>(),
    idCounts = new Map<string, number>(),
    parentCounts = new Map<number, number>();
  nodes.forEach((node, i) => {
    if (node.name) nameCounts.set(node.name, (nameCounts.get(node.name) ?? 0) + 1);
    const id = node.extras?.objectId;
    if (typeof id === 'string' && id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    else if (id !== undefined)
      issues.push({
        path: `nodes.${i}.extras.objectId`,
        message: 'objectId must be a nonempty string',
      });
    if (node.mesh !== undefined && !document.meshes?.[node.mesh])
      issues.push({ path: `nodes.${i}.mesh`, message: `Missing mesh index ${node.mesh}` });
    if (node.matrix && (node.translation || node.rotation || node.scale))
      issues.push({
        path: `nodes.${i}`,
        message: 'A node may use matrix or TRS transforms, not both',
      });
    if (node.rotation && Math.abs(Math.hypot(...node.rotation) - 1) > 1e-4)
      issues.push({ path: `nodes.${i}.rotation`, message: 'Rotation must be a unit quaternion' });
    if (node.scale?.some((value) => value === 0))
      issues.push({
        path: `nodes.${i}.scale`,
        message: 'Zero scale prevents meaningful mechanical inspection',
      });
    if (node.scale?.some((value) => value < 0))
      warnings.push(`Node ${node.name ?? i} has a mirrored scale; verify normals and handedness.`);
    if (node.scale && !node.scale.every((value) => value === 1))
      warnings.push(
        `Node ${node.name ?? i} has scale [${node.scale.join(', ')}]. Transform is preserved; verify metre conversion.`,
      );
    if (node.matrix) {
      const m = node.matrix;
      const scales = [
        Math.hypot(m[0], m[1], m[2]),
        Math.hypot(m[4], m[5], m[6]),
        Math.hypot(m[8], m[9], m[10]),
      ];
      if (scales.some((value) => value === 0))
        issues.push({
          path: `nodes.${i}.matrix`,
          message: 'Matrix contains zero scale; meaningful mechanical inspection is impossible',
        });
      if (scales.some((value) => Math.abs(value - 1) > 1e-6))
        warnings.push(
          `Node ${node.name ?? i} has matrix scale [${scales.join(', ')}]. Transform is preserved; verify metre conversion.`,
        );
      if (m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1)
        issues.push({
          path: `nodes.${i}.matrix`,
          message: 'Node matrix must be an affine transform',
        });
    }
    for (const child of node.children ?? []) {
      parentCounts.set(child, (parentCounts.get(child) ?? 0) + 1);
      if (!nodes[child])
        issues.push({ path: `nodes.${i}.children`, message: `Missing child index ${child}` });
    }
  });
  for (const [name, count] of nameCounts)
    if (count > 1)
      warnings.push(
        `Duplicate object name "${name}" (${count} nodes). Persistent objectId values are recommended.`,
      );
  for (const [id, count] of idCounts)
    if (count > 1)
      issues.push({
        path: 'nodes.extras.objectId',
        message: `Duplicate persistent object ID "${id}" (${count} nodes)`,
      });
  for (const [child, count] of parentCounts)
    if (count > 1)
      issues.push({ path: `nodes.${child}`, message: 'glTF nodes must have at most one parent' });
  const sceneIndex = document.scene ?? 0;
  const scene = document.scenes?.[sceneIndex];
  if (document.scene !== undefined && !scene)
    issues.push({ path: 'scene', message: `Missing scene index ${sceneIndex}` });
  const rootKey =
    typeof scene?.extras?.objectId === 'string' && scene.extras.objectId
      ? `id:${scene.extras.objectId}`
      : '$';
  if (rootKey !== '$' && idCounts.has(rootKey.slice(3)))
    issues.push({
      path: 'scenes.extras.objectId',
      message: `Scene and node share persistent object ID "${rootKey.slice(3)}"`,
    });
  objects.push({
    key: rootKey,
    name: scene?.name ?? 'Scene',
    parentKey: null,
    mesh: false,
    position: [0, 0, 0],
  });
  const roots = scene?.nodes ?? nodes.map((_, i) => i).filter((i) => !parentCounts.has(i));
  const visited = new Set<number>();
  const active = new Set<number>();
  const completed = new Set<number>();
  // Check all nodes, including disconnected nodes not present in the default scene.
  for (let start = 0; start < nodes.length; start++) {
    if (completed.has(start)) continue;
    const stack: { id: number; exiting: boolean }[] = [{ id: start, exiting: false }];
    while (stack.length) {
      const item = stack.pop()!;
      if (item.exiting) {
        active.delete(item.id);
        completed.add(item.id);
        continue;
      }
      if (!nodes[item.id] || completed.has(item.id)) continue;
      if (active.has(item.id)) {
        issues.push({ path: `nodes.${item.id}`, message: 'Cyclic scene hierarchy' });
        continue;
      }
      active.add(item.id);
      stack.push({ ...item, exiting: true });
      for (const child of nodes[item.id].children ?? []) stack.push({ id: child, exiting: false });
    }
  }
  const pending = roots
    .map((id, position) => ({ id, parentKey: rootKey, parentPath: '$', position }))
    .reverse();
  while (pending.length) {
    const item = pending.pop()!;
    const node = nodes[item.id];
    if (!node) {
      issues.push({ path: 'scenes.nodes', message: `Missing root node ${item.id}` });
      continue;
    }
    if (visited.has(item.id)) continue;
    visited.add(item.id);
    const path = `${item.parentPath}/${item.position}:${encodeURIComponent(node.name || 'object')}`;
    const key =
      typeof node.extras?.objectId === 'string' && node.extras.objectId
        ? `id:${node.extras.objectId}`
        : path;
    const position: Vec3 =
      node.translation ??
      (node.matrix ? [node.matrix[12], node.matrix[13], node.matrix[14]] : [0, 0, 0]);
    objects.push({
      key,
      name: node.name ?? '',
      parentKey: item.parentKey,
      mesh: node.mesh !== undefined,
      position,
    });
    const children = node.children ?? [];
    for (let i = children.length - 1; i >= 0; i--)
      pending.push({ id: children[i], parentKey: key, parentPath: path, position: i });
  }
  const resources = [...(document.buffers ?? []), ...(document.images ?? [])].flatMap((item) =>
    item.uri && !item.uri.startsWith('data:') ? [item.uri] : [],
  );
  if (nodes.some((node) => !node.extras?.objectId))
    warnings.push(
      'Some nodes lack persistent objectId values. Fallback paths may change after renaming, reordering or adding primitive wrappers; confirm these mappings in the visual editor.',
    );
  warnings.push(
    'glTF 2.0 uses metres and a Y-up coordinate system. File metadata cannot prove source geometry scale: verify a known measurement before publishing.',
  );
  if (
    nodes.some(
      (node) =>
        node.mesh !== undefined && (document.meshes?.[node.mesh]?.primitives.length ?? 0) > 1,
    )
  )
    warnings.push(
      'Multi-primitive meshes create extra render objects. Use node objectId mappings or export the final mapping from the visual editor.',
    );
  return {
    objects,
    issues,
    warnings,
    resources,
    extensionsRequired: document.extensionsRequired ?? [],
    meshCount: nodes.filter((node) => node.mesh !== undefined).length,
  };
}
