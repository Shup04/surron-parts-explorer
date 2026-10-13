"""Blender helper: blender source.blend --background --python scripts/blender-export.py -- /tmp/model.glb

The helper refuses unconfigured units and does not apply transforms, join objects,
recenter origins, or save changes to the source .blend. Inspect the exported GLB.
"""
import os
import sys
import uuid
import bpy

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(args) != 1 or not args[0].lower().endswith('.glb'):
    raise RuntimeError('Supply one output .glb path after --')
output = os.path.abspath(args[0])
if os.path.exists(output):
    raise RuntimeError('Output already exists. Choose a new filename to preserve it.')
scene = bpy.context.scene
if scene.unit_settings.system != 'METRIC':
    raise RuntimeError('Set scene units to Metric and verify a known measurement first.')
if scene.unit_settings.scale_length <= 0:
    raise RuntimeError('Scene unit scale must be positive.')

seen = set()
for obj in scene.objects:
    if obj.type not in {'MESH', 'EMPTY'}:
        continue
    identifier = obj.get('objectId')
    if not identifier:
        # Persist IDs manually in your .blend before using future replacement models.
        raise RuntimeError(f'{obj.name}: add an objectId custom string property (e.g. {uuid.uuid4()}) and save the .blend before exporting.')
    if not isinstance(identifier, str) or identifier in seen:
        raise RuntimeError(f'{obj.name}: duplicate or invalid objectId {identifier!r}')
    seen.add(identifier)
    if any(axis == 0 for axis in obj.scale):
        raise RuntimeError(f'{obj.name}: zero object scale')

bpy.ops.export_scene.gltf(filepath=output, export_format='GLB', export_yup=True,
                          export_extras=True, export_apply=False,
                          use_selection=False, export_cameras=False,
                          export_lights=False)
print(f'Exported {output}. Source transforms and origins were not changed. Verify a known dimension in metres.')
