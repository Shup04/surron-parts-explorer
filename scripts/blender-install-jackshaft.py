"""Export the saved jackshaft models at manual-based assembly positions.

Run in a separate Blender process, never in the user's live scene:
  blender --background --factory-startup --python scripts/blender-install-jackshaft.py
Only copies from the two saved sources are used. No source file is overwritten.
Coordinates, source references, assumptions and exploded offsets are recorded in
data/models/jackshaft-assembly.json. Existing public assets remain untouched.
"""
import hashlib
import json
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / 'data/models/jackshaft-assembly.json').read_text())
DESTINATION = ROOT / 'public/parts'
COLLECTION = 'LBX_Jackshaft_Installed'


def export_parts():
    if not bpy.app.background or bpy.data.filepath:
        raise RuntimeError('Use a new background Blender process with --factory-startup.')
    # This process owns the factory startup scene, including its default cube.
    for obj in list(bpy.context.scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    collection = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(collection)
    masters = {}
    for source in {entry['sourceBlend'] for entry in DATA['instances']}:
        expected = DATA['sourceFiles'][source]
        if hashlib.sha256((ROOT / source).read_bytes()).hexdigest() != expected:
            raise RuntimeError('Source changed; review placements before exporting: ' + source)
        names = sorted({entry['sourceObject'] for entry in DATA['instances'] if entry['sourceBlend'] == source})
        with bpy.data.libraries.load(str(ROOT / source), link=False) as (available, loaded):
            if not set(names).issubset(available.objects):
                raise RuntimeError('Missing source objects in ' + source)
            loaded.objects = names
        masters.update({(source, obj.name): obj for obj in loaded.objects})

    records = []
    for entry in DATA['instances']:
        obj = masters[(entry['sourceBlend'], entry['sourceObject'])].copy()
        collection.objects.link(obj)
        obj.name = entry['name']
        obj.parent = None
        obj.location = entry['positionMm']
        obj.scale = (1, 1, 1)
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(entry['axis']))
        obj.hide_viewport = False
        obj.hide_render = False
        obj.hide_set(False)
        obj['objectId'] = 'installed:' + entry['id']
        obj['placement_notes'] = DATA['placementNotes']
        obj['model_notes'] = DATA['specs'][entry['spec']]['notes']
        obj['source_object'] = entry['sourceObject']
        bpy.context.view_layer.update()
        for selected in bpy.context.selected_objects:
            selected.select_set(False)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        path = DESTINATION / (entry['name'] + '.glb')
        bpy.ops.export_scene.gltf(
            filepath=str(path), export_format='GLB', use_selection=True,
            export_yup=True, export_apply=True, export_extras=True,
            export_animations=False, export_cameras=False, export_lights=False,
        )
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        world = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
        records.append(dict(
            id=entry['id'], name=entry['name'], file=path.name, role=entry['role'],
            sourceObject=entry['sourceObject'], sourceBlend=entry['sourceBlend'],
            jackshaftSpec=entry['spec'], triangles=len(mesh.loop_triangles),
            bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            materials=[material.name for material in mesh.materials],
            sourceWorldBounds=[[min(p[i] for p in world) for i in range(3)],
                               [max(p[i] for p in world) for i in range(3)]],
        ))
        evaluated.to_mesh_clear()

    # Replace only entries owned by this export; retain every existing model.
    path = DESTINATION / 'manifest.json'
    manifest = json.loads(path.read_text())
    ids = {record['id'] for record in records}
    manifest['parts'] = [part for part in manifest['parts'] if part['id'] not in ids] + records
    manifest['totalTriangles'] = sum(part['triangles'] for part in manifest['parts'])
    manifest['totalBytes'] = sum(part['bytes'] for part in manifest['parts'])
    path.write_text(json.dumps(manifest, indent=2) + '\n')
    destination = ROOT / 'reference/models/lbx-jackshaft-installed'
    destination.mkdir(parents=True, exist_ok=True)
    # A separate assembly-only review file; original body/hardware/bike files stay unchanged.
    bpy.ops.wm.save_as_mainfile(filepath=str(destination / 'lbx-jackshaft-installed.blend'))
    return dict(exports=len(records), totalParts=len(manifest['parts']), triangles=manifest['totalTriangles'])


if __name__ == '__main__':
    print(json.dumps(export_parts()), flush=True)
