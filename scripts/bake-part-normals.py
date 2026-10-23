"""Bake source surface normals onto the reduced frame/swingarm without saving the source.

blender --background reference/models/surron-parts/frame-update/surron-parts-ready.blend \
  --python scripts/bake-part-normals.py -- --output /tmp/surron-normal-bakes

Outputs are staged in a new directory. Inspect them before replacing public assets.
NumPy is supplied by Blender; no browser or host Python dependency is added.
"""

import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys

import bpy
import numpy as np

REPO = Path(__file__).resolve().parents[1]
SOURCES = REPO / 'reference/models/surron-parts'
LOW_SOURCE = SOURCES / 'frame-update/surron-parts-ready.blend'
PARTS = [
    ('main-frame', 'Main Frame.glb', '03', SOURCES / 'frame-update/before-frame-optimization.blend', 2048),
    ('swingarm', 'Swingarm.glb', 'Swingarm_001', SOURCES / 'surron-parts-original.blend', 1024),
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(path):
    data = Path(path).read_bytes()
    assert data[:4] == b'glTF' and struct.unpack_from('<I', data, 4)[0] == 2
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length])
    binary = memoryview(data)[28 + length:]
    return document, binary


def accessor(document, binary, index):
    item = document['accessors'][index]
    view = document['bufferViews'][item['bufferView']]
    dtype = {5123: '<u2', 5125: '<u4', 5126: '<f4'}[item['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[item['type']]
    size = np.dtype(dtype).itemsize
    return np.ndarray((item['count'], width), dtype=dtype, buffer=binary,
                      offset=view.get('byteOffset', 0) + item.get('byteOffset', 0),
                      strides=(view.get('byteStride', size * width), size))


def image_bytes(document, binary, texture_index):
    image = document['images'][document['textures'][texture_index]['source']]
    view = document['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    return bytes(binary[start:start + view['byteLength']])


def geometry_fingerprints(document, binary):
    assert len(document['meshes']) == 1 and len(document['meshes'][0]['primitives']) == 1
    primitive = document['meshes'][0]['primitives'][0]
    indices = accessor(document, binary, primitive['indices']).ravel()
    fingerprints = {
        name: digest(accessor(document, binary, index)[indices].tobytes())
        for name, index in primitive['attributes'].items()
        if name == 'POSITION' or name.startswith('TEXCOORD_')
    }
    return len(indices) // 3, fingerprints


def bake_part(identifier, filename, object_name, reference_file, size, output):
    target = bpy.data.objects[object_name]
    before_path = REPO / 'public/parts' / filename
    before, before_binary = read_glb(before_path)
    triangles, fingerprints = geometry_fingerprints(before, before_binary)
    with bpy.data.libraries.load(str(reference_file), link=False) as (_, destination):
        destination.objects = [object_name]
    reference = destination.objects[0]
    bpy.context.scene.collection.objects.link(reference)
    bpy.context.view_layer.update()
    assert np.allclose(np.array(reference.matrix_world), np.array(target.matrix_world), atol=1e-5)
    source_triangles = sum(len(face.vertices) - 2 for face in reference.data.polygons)

    for item in bpy.context.scene.objects:
        item.select_set(False)
        item.hide_render = item not in (target, reference)
    target.hide_set(False)
    reference.hide_set(False)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    target.data = target.data.copy()
    custom = target.data.attributes.get('custom_normal')
    if custom:
        target.data.attributes.remove(custom)
    # Finalize sharp edges and the tangent basis before baking, never afterward.
    for modifier in list(target.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    original_material = target.active_material
    original_name = original_material.name
    original_material.name = original_name + ' (source)'
    material = original_material.copy()
    material.name = original_name
    target.data.materials.clear()
    target.data.materials.append(material)
    reference.data.materials.clear()
    neutral = bpy.data.materials.new('Normal bake reference ' + identifier)
    neutral.use_nodes = True
    reference.data.materials.append(neutral)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
    for socket in ['Normal', 'Coat Normal']:
        for link in list(shader.inputs[socket].links):
            links.remove(link)

    image = bpy.data.images.new(identifier + '-surface-normal', width=size, height=size, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    for node in nodes:
        node.select = node == texture
    nodes.active = texture
    reference.select_set(True)
    bpy.context.view_layer.update()
    bpy.ops.object.bake(type='NORMAL', use_selected_to_active=True, cage_extrusion=0.8,
                       max_ray_distance=2.0, margin=8, uv_layer='FinishUV')
    image.filepath_raw = str(output / (identifier + '-surface-normal.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()

    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'FinishUV'
    links.new(uv.outputs['UV'], texture.inputs['Vector'])
    normal = nodes.new('ShaderNodeNormalMap')
    normal.space = 'TANGENT'
    normal.uv_map = 'FinishUV'
    normal.inputs['Strength'].default_value = 1
    links.new(texture.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    # Clearcoat otherwise uses the low-poly normals and retains the crumpled highlights.
    links.new(normal.outputs['Normal'], shader.inputs['Coat Normal'])
    reference.select_set(False)
    target_path = output / filename
    bpy.ops.export_scene.gltf(filepath=str(target_path), check_existing=False, export_format='GLB',
        use_selection=True, export_apply=True, export_yup=True, export_animations=False,
        export_skins=False, export_morph=False, export_cameras=False, export_lights=False,
        export_extras=False, export_normals=True, export_texcoords=True, export_tangents=True,
        export_materials='EXPORT', export_draco_mesh_compression_enable=False,
        export_use_gltfpack=False, will_save_settings=False)
    material.name = original_name + ' (baked ' + identifier + ')'
    original_material.name = original_name

    after, after_binary = read_glb(target_path)
    assert geometry_fingerprints(after, after_binary) == (triangles, fingerprints)
    assert after['nodes'] == before['nodes'], 'Authored placement changed'
    old_material, new_material = before['materials'][0], after['materials'][0]
    assert old_material['name'] == new_material['name']
    old_pbr, new_pbr = old_material['pbrMetallicRoughness'], new_material['pbrMetallicRoughness']
    assert old_pbr['baseColorFactor'] == new_pbr['baseColorFactor']
    old_texture, new_texture = old_pbr['metallicRoughnessTexture'], new_pbr['metallicRoughnessTexture']
    assert {k: v for k, v in old_texture.items() if k != 'index'} == {
        k: v for k, v in new_texture.items() if k != 'index'}
    assert image_bytes(before, before_binary, old_texture['index']) == image_bytes(
        after, after_binary, new_texture['index'])
    normal_bytes = image_bytes(after, after_binary, new_material['normalTexture']['index'])
    clearcoat = new_material['extensions']['KHR_materials_clearcoat']
    assert normal_bytes == image_bytes(after, after_binary, clearcoat['clearcoatNormalTexture']['index'])
    for key in ['clearcoatFactor', 'clearcoatRoughnessFactor']:
        assert clearcoat[key] == old_material['extensions']['KHR_materials_clearcoat'][key]
    return {'id': identifier, 'file': filename, 'sourceObject': object_name,
            'referenceBlend': str(reference_file.relative_to(REPO)),
            'referenceSha256': digest(reference_file.read_bytes()),
            'sourceTriangles': source_triangles, 'triangles': triangles,
            'geometryPerCornerSha256': fingerprints, 'nodes': after['nodes'],
            'normalTextureSize': size, 'normalTextureSha256': digest(normal_bytes),
            'metallicRoughnessTextureSha256': digest(image_bytes(after, after_binary, new_texture['index'])),
            'previousBytes': before_path.stat().st_size, 'previousSha256': digest(before_path.read_bytes()),
            'bytes': target_path.stat().st_size,
            'sha256': digest(target_path.read_bytes())}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv if argv is not None else sys.argv[sys.argv.index('--') + 1:])
    if Path(bpy.data.filepath).resolve() != LOW_SOURCE.resolve():
        raise RuntimeError('Open the saved surron-parts-ready.blend source in background mode.')
    if args.output.exists() and any(args.output.iterdir()):
        raise RuntimeError('Use a new output directory to preserve earlier exports.')
    args.output.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.bake.normal_space = 'TANGENT'
    scene.render.bake.margin_type = 'EXTEND'
    report = {'version': 1, 'blenderVersion': bpy.app.version_string,
              'lowPolySource': str(LOW_SOURCE.relative_to(REPO)),
              'lowPolySourceSha256': digest(LOW_SOURCE.read_bytes()),
              'method': 'Selected-to-active tangent-space bake, shared by base and clearcoat. '
                        'Metallic/roughness flakes retained; flake-only bump replaced by source surface normals.',
              'parts': [bake_part(*part, args.output) for part in PARTS]}
    (args.output / 'surface-normals.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    result = main()
