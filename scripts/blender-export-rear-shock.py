"""Export the approved shock in the portal's bike coordinates.

Run in background Blender with the approved .blend already open. Temporary mesh
copies receive portable baked PBR materials. The source .blend is never saved.
"""

import hashlib
import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / 'data/models/rear-shock-assembly.json'
DATA = json.loads(DATA_PATH.read_text())
TEXTURES = ROOT / 'reference/models/lbx-rear-shock/portal-textures'


def select_only(obj):
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def bake_body(obj):
    """Bake the label mask and micro-surface finish through an ordinary UV atlas."""
    select_only(obj)
    uv = obj.data.uv_layers.new(name='PortalUV')
    obj.data.uv_layers.active = uv
    uv.active_render = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=.003,
                             margin_method='FRACTION', scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    originals = list(obj.data.materials)
    material_indices = [face.material_index for face in obj.data.polygons]
    copies = []
    for source in originals:
        mat = source.copy()
        mat.name = 'Bake / ' + source.name
        copies.append(mat)
    obj.data.materials.clear()
    for mat in copies:
        obj.data.materials.append(mat)
    for face, index in zip(obj.data.polygons, material_indices):
        face.material_index = index

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 8
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 8
    maps = {}
    TEXTURES.mkdir(parents=True, exist_ok=True)
    for kind in ('base-color', 'metal-roughness', 'normal'):
        image = bpy.data.images.new('Rear shock ' + kind, width=2048, height=2048, alpha=False)
        image.colorspace_settings.name = 'sRGB' if kind == 'base-color' else 'Non-Color'
        image.generated_color = (.5, .5, 1, 1) if kind == 'normal' else (0, 0, 0, 1)
        restore = []
        for mat in copies:
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            target = nodes.new('ShaderNodeTexImage')
            target.image = image
            for node in nodes:
                node.select = False
            target.select = True
            nodes.active = target
            shader = nodes.get('Principled BSDF')
            output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
            surface = output.inputs['Surface'].links[0].from_socket
            restore.append((mat, output, surface))
            if kind == 'normal':
                continue
            emission = nodes.new('ShaderNodeEmission')
            emission.inputs['Strength'].default_value = 1
            if kind == 'base-color':
                socket = shader.inputs['Base Color']
                if socket.is_linked:
                    links.new(socket.links[0].from_socket, emission.inputs['Color'])
                else:
                    emission.inputs['Color'].default_value = socket.default_value
            else:
                channels = nodes.new('ShaderNodeCombineXYZ')
                channels.inputs[0].default_value = 1
                for index, name in ((1, 'Roughness'), (2, 'Metallic')):
                    socket = shader.inputs[name]
                    if socket.is_linked:
                        links.new(socket.links[0].from_socket, channels.inputs[index])
                    else:
                        channels.inputs[index].default_value = socket.default_value
                links.new(channels.outputs[0], emission.inputs['Color'])
            links.new(emission.outputs[0], output.inputs['Surface'])
        bpy.ops.object.bake(type='NORMAL' if kind == 'normal' else 'EMIT')
        image.filepath_raw = str(TEXTURES / (kind + '.png'))
        image.file_format = 'PNG'
        image.save()
        image.pack()
        maps[kind] = image
        for mat, output, surface in restore:
            mat.node_tree.links.new(surface, output.inputs['Surface'])
    obj.data.materials.clear()
    for mat in originals:
        obj.data.materials.append(mat)
    for face, index in zip(obj.data.polygons, material_indices):
        face.material_index = index
    return maps


def portable_material(source, maps=None):
    name = source.name
    shader = source.node_tree.nodes.get('Principled BSDF')
    values = {key: shader.inputs[key].default_value for key in (
        'Base Color', 'Metallic', 'Roughness', 'Coat Weight', 'Coat Roughness',
        'Anisotropic', 'IOR', 'Specular IOR Level')}
    source.name = 'Source / ' + name
    material = bpy.data.materials.new(name)
    material.diffuse_color = source.diffuse_color
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    principled = nodes.get('Principled BSDF')
    for key, value in values.items():
        principled.inputs[key].default_value = value
    if maps:
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'PortalUV'
        for kind, image in maps.items():
            texture = nodes.new('ShaderNodeTexImage')
            texture.image = image
            links.new(uv.outputs[0], texture.inputs['Vector'])
            if kind == 'base-color':
                links.new(texture.outputs['Color'], principled.inputs['Base Color'])
            elif kind == 'metal-roughness':
                split = nodes.new('ShaderNodeSeparateColor')
                links.new(texture.outputs['Color'], split.inputs['Color'])
                links.new(split.outputs['Green'], principled.inputs['Roughness'])
                links.new(split.outputs['Blue'], principled.inputs['Metallic'])
            else:
                normal = nodes.new('ShaderNodeNormalMap')
                normal.uv_map = 'PortalUV'
                links.new(texture.outputs['Color'], normal.inputs['Color'])
                links.new(normal.outputs[0], principled.inputs['Normal'])
    return material


def export():
    assert bpy.data.filepath.endswith('lbx-rear-shock-separated.blend')
    source_path = Path(bpy.data.filepath)
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    correction = Matrix(DATA['placement']['standaloneToBikeMatrix'])
    root = bpy.data.objects[DATA['sourceObject']]
    assembly_matrix = correction @ root.matrix_world
    records = []
    material_cache = {}
    scene = bpy.context.scene
    scene.unit_settings.scale_length = 1
    for instance in DATA['instances']:
        source = bpy.data.objects[instance['name']]
        temporary = source.copy()
        temporary.data = source.data.copy()
        temporary.name = instance['name'] + ' export'
        temporary.parent = None
        scene.collection.objects.link(temporary)
        temporary.matrix_world = source.matrix_world
        select_only(temporary)
        bpy.context.view_layer.update()
        source.data.calc_loop_triangles()
        original_triangles = len(source.data.loop_triangles)
        temporary.data.validate(clean_customdata=False)
        triangulate = temporary.modifiers.new('Portable triangles', 'TRIANGULATE')
        if hasattr(triangulate, 'keep_custom_normals'):
            triangulate.keep_custom_normals = True
        bpy.ops.object.modifier_apply(modifier=triangulate.name)
        maps = bake_body(temporary) if instance['id'] == 'rear-shock-body' else None
        source_materials = list(temporary.data.materials)
        used_slots = sorted({p.material_index for p in temporary.data.polygons})
        slot_map = {old: i for i, old in enumerate(used_slots)}
        indices = [slot_map[p.material_index] for p in temporary.data.polygons]
        temporary.data.materials.clear()
        for old in used_slots:
            mat = source_materials[old]
            key = (mat.as_pointer(), bool(maps))
            if key not in material_cache:
                material_cache[key] = portable_material(mat, maps)
            temporary.data.materials.append(material_cache[key])
        for face, index in zip(temporary.data.polygons, indices):
            face.material_index = index
        if maps:
            for uv in list(temporary.data.uv_layers):
                if uv.name != 'PortalUV':
                    temporary.data.uv_layers.remove(uv)
        else:
            # The untextured spring and nut need no legacy scan UVs.
            for uv in list(temporary.data.uv_layers):
                temporary.data.uv_layers.remove(uv)
        world = correction @ source.matrix_world
        normals = np.array([n.vector[:] for n in temporary.data.corner_normals])
        rotation = np.array([list(row) for row in world.to_3x3()])
        temporary.data.transform(world)
        temporary.data.normals_split_custom_set(normals @ rotation.T)
        temporary.matrix_world = Matrix.Identity(4)
        bpy.context.view_layer.update()
        temporary.data.calc_loop_triangles()
        path = ROOT / 'public/parts' / (instance['name'] + '.glb')
        select_only(temporary)
        status = bpy.ops.export_scene.gltf(
            filepath=str(path), export_format='GLB', use_selection=True,
            export_yup=True, export_apply=True, export_animations=False,
            export_cameras=False, export_lights=False, export_extras=False,
            export_normals=True, export_texcoords=True, export_tangents=bool(maps),
            export_materials='EXPORT', will_save_settings=False,
        )
        assert status == {'FINISHED'}
        points = np.array([v.co[:] for v in temporary.data.vertices])
        offset = assembly_matrix.to_3x3() @ Vector(instance['localExplosionOffset'])
        instance['explosionOffset'] = [offset.x, offset.z, -offset.y]
        records.append({
            'id': instance['id'], 'name': instance['name'], 'file': path.name,
            'role': instance['role'], 'sourceObject': source.name,
            'sourceBlend': DATA['sourceBlend'], 'sourceBlendSha256': source_hash,
            'triangles': len(temporary.data.loop_triangles), 'bytes': path.stat().st_size,
            'sourceTriangles': original_triangles,
            'degenerateTrianglesRemoved': original_triangles - len(temporary.data.loop_triangles),
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'materials': [m.name for m in temporary.data.materials],
            'sourceWorldBounds': [points.min(0).tolist(), points.max(0).tolist()],
        })
        mesh = temporary.data
        bpy.data.objects.remove(temporary, do_unlink=True)
        bpy.data.meshes.remove(mesh)
    manifest_path = ROOT / 'public/parts/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    ids = {p['id'] for p in records}
    manifest['parts'] = [p for p in manifest['parts'] if p['id'] not in ids] + records
    manifest['totalTriangles'] = sum(p['triangles'] for p in manifest['parts'])
    manifest['totalBytes'] = sum(p['bytes'] for p in manifest['parts'])
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    DATA['sourceBlendSha256'] = source_hash
    DATA['placement']['assembledRootMatrix'] = [list(row) for row in assembly_matrix]
    DATA_PATH.write_text(json.dumps(DATA, indent=2) + '\n')
    assert hashlib.sha256(source_path.read_bytes()).hexdigest() == source_hash
    return {'parts': records, 'source_preserved': True,
            'mount_center_residuals': DATA['placement']['mountCenterResiduals']}


if __name__ == '__main__':
    print(json.dumps(export(), indent=2), flush=True)
