"""Separate the supplied stock shock's existing surfaces and match its finishes.

Run build() in the dedicated rear-shock review file. The original source is read
only. Missing contact surfaces are repaired with user authorization; the original
scan and the first separation are backed up. No website assets are changed.
"""

import hashlib
import json
import math
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path('/home/shup/repositories/surron-parts-explorer')
SOURCE = ROOT / 'reference/models/surron-parts/surron-parts-original.blend'
DEST = ROOT / 'reference/models/lbx-rear-shock'
FILE = DEST / 'lbx-rear-shock-separated.blend'
SOURCE_OBJECT = 'Rear_Shock___Stock_001'
OWNER = 'lbx-rear-shock-separated'
ORIGIN = np.array([1.7166594872079244, 205.2614744057793, 72.90300651327587])
AXIS = np.array([.0064836137616640175, .7395202432033818, .6731030921374531])
X = np.array([.9999789811553988, -.004794864408372451, -.004364232202319458])
Q = np.array([0., -.673117240284125, .739535787391174])
BASIS = np.column_stack((X, -Q, AXIS))
PART_NAMES = ('Rear Shock Main Body', 'Rear Shock Spring', 'Rear Shock Preload Nut')


def coordinates(points):
    relative = np.asarray(points) - ORIGIN
    return relative @ X, relative @ Q, relative @ AXIS + 200


def material(name, color, metallic, roughness, coat=0, micro=None):
    mat = bpy.data.materials.new('Rear Shock | ' + name)
    mat['owner'] = OWNER
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Coat Weight'].default_value = coat
    shader.inputs['Coat Roughness'].default_value = .22
    if metallic > .8:
        shader.inputs['Anisotropic'].default_value = .23
    if micro:
        noise = mat.node_tree.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = micro[0]
        noise.inputs['Detail'].default_value = 2
        bump = mat.node_tree.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .12
        bump.inputs['Distance'].default_value = micro[1]
        coord = mat.node_tree.nodes.new('ShaderNodeTexCoord')
        mat.node_tree.links.new(coord.outputs['Object'], noise.inputs['Vector'])
        mat.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
        mat.node_tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return mat


def finishes():
    mats = [
        material('Cast charcoal', (.027, .033, .035), .65, .38, micro=(15, .025)),
        material('White powder coat', (.88, .89, .875), 0, .25, .28, (22, .008)),
        material('Black preload adjuster', (.014, .019, .021), .8, .29, .12),
        material('Champagne gold anodized aluminum', (.64, .445, .205), 1, .26, .16),
        material('Bronze threaded sleeve', (.34, .225, .105), 1, .31),
        material('Polished piston chrome', (.72, .77, .8), 1, .115),
        material('Black seals and lower spring seat', (.012, .015, .017), .25, .36),
        material('Steel mounting bushings', (.42, .47, .49), 1, .23),
    ]
    reservoir = mats[3].copy()
    reservoir.name = 'Rear Shock | Gold reservoir with reference warning label'
    reservoir['owner'] = OWNER
    nodes, links = reservoir.node_tree.nodes, reservoir.node_tree.links
    shader = nodes.get('Principled BSDF')
    image = bpy.data.images.load(str(DEST / 'reference-white-spring.png'), check_existing=True)
    image.pack()
    image['source'] = 'User-supplied photograph, Image #1; original pixels retained.'
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'Reservoir Label UV'
    separate = nodes.new('ShaderNodeSeparateXYZ')
    links.new(uv.outputs['UV'], separate.inputs[0])

    def operation(op, first, second):
        node = nodes.new('ShaderNodeMath')
        node.operation = op
        for index, value in enumerate((first, second)):
            if isinstance(value, (float, int)):
                node.inputs[index].default_value = value
            else:
                links.new(value, node.inputs[index])
        return node.outputs[0]

    # Rounded label mask, with a photographic crop expressed solely as UVs.
    # No fabricated branding or warning text is introduced.
    du = operation('ABSOLUTE', operation('SUBTRACT', separate.outputs['X'], .5), 0)
    dv = operation('ABSOLUTE', operation('SUBTRACT', separate.outputs['Y'], .5), 0)
    du = operation('MAXIMUM', operation('SUBTRACT', du, .455), 0)
    dv = operation('MAXIMUM', operation('SUBTRACT', dv, .475), 0)
    distance = operation('SQRT', operation('ADD', operation('MULTIPLY', du, du),
                                        operation('MULTIPLY', dv, dv)), 0)
    mask = operation('LESS_THAN', distance, .025)
    mapped = nodes.new('ShaderNodeVectorMath')
    mapped.operation = 'MULTIPLY_ADD'
    mapped.inputs[1].default_value = (55 / 1500, 128 / 1500, 1)
    mapped.inputs[2].default_value = (425 / 1500, 1 - 477 / 1500, 0)
    links.new(uv.outputs['UV'], mapped.inputs[0])
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    texture.extension = 'EXTEND'
    links.new(mapped.outputs[0], texture.inputs['Vector'])
    mix = nodes.new('ShaderNodeMixRGB')
    mix.inputs[1].default_value = (.64, .445, .205, 1)
    links.new(mask, mix.inputs[0])
    links.new(texture.outputs['Color'], mix.inputs[2])
    links.new(mix.outputs[0], shader.inputs['Base Color'])
    links.new(operation('SUBTRACT', 1, mask), shader.inputs['Metallic'])
    links.new(operation('ADD', .26, operation('MULTIPLY', mask, .2)),
              shader.inputs['Roughness'])
    mats.append(reservoir)
    return mats


def connected_vertices(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    seen, components = set(), []
    for vert in bm.verts:
        if vert.index in seen:
            continue
        seen.add(vert.index)
        stack, ids = [vert], []
        while stack:
            current = stack.pop()
            ids.append(current.index)
            for edge in current.link_edges:
                other = edge.other_vert(current)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
        components.append(ids)
    bm.free()
    return sorted(components, key=len, reverse=True)


def build():
    assert Path(bpy.data.filepath) == FILE, 'Run only in the dedicated shock file.'
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    # Rebuild only this file's owned objects and its initial extracted shock.
    for obj in list(bpy.data.objects):
        if obj.get('owner') == OWNER or obj.name == SOURCE_OBJECT:
            bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        if collection.get('owner') == OWNER:
            bpy.data.collections.remove(collection)
    for mesh in list(bpy.data.meshes):
        if mesh.get('owner') == OWNER and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        if mat.get('owner') == OWNER and mat.users == 0:
            bpy.data.materials.remove(mat)

    with bpy.data.libraries.load(str(SOURCE), link=False) as (available, loaded):
        assert SOURCE_OBJECT in available.objects
        loaded.objects = [SOURCE_OBJECT]
    source = loaded.objects[0]
    source.name = 'Source - original unsplit rear shock'
    source['owner'] = OWNER
    source['source_file'] = str(SOURCE.relative_to(ROOT))
    source_collection = bpy.data.collections.new('Source backup - original unsplit shock')
    source_collection['owner'] = OWNER
    bpy.context.scene.collection.children.link(source_collection)
    source_collection.objects.link(source)
    source_collection.hide_render = True
    source_collection.hide_viewport = True

    collection = bpy.data.collections.new('Rear Shock Assembly')
    collection['owner'] = OWNER
    bpy.context.scene.collection.children.link(collection)
    root = bpy.data.objects.new('Rear Shock Assembly', None)
    root['owner'] = OWNER
    root['source_file'] = str(SOURCE.relative_to(ROOT))
    root['notes'] = 'Three editable parts. Local Z follows the shock axis. Original assembled position retained.'
    root.empty_display_size = 12
    collection.objects.link(root)
    basis = Matrix(BASIS.tolist()).to_4x4()
    basis.translation = Vector(ORIGIN + AXIS * (55.3 - 200))
    root.matrix_world = source.matrix_world @ basis

    mesh = source.data
    assert len(mesh.vertices) == 160397 and len(mesh.polygons) == 289590
    assert all(len(p.vertices) == 3 for p in mesh.polygons)
    xyz = np.array([v.co[:] for v in mesh.vertices])
    polygons = np.array([p.vertices[:] for p in mesh.polygons])
    fc = xyz[polygons].mean(axis=1)
    x, q, t = coordinates(fc)
    radius = np.hypot(x, q)
    components = connected_vertices(mesh)
    assert len(components[1]) == 44161
    core_vertices = np.zeros(len(xyz), dtype=bool)
    core_vertices[components[1]] = True
    core = core_vertices[polygons[:, 0]]
    # These planes follow the contact shoulders found in source cross sections.
    # The rounded uppermost coil remains with the spring, below the notched nut.
    group = np.zeros(len(polygons), dtype=np.int32)
    group[(~core) & (radius > 18.5) & (radius < 32) & (t > 83.35) & (t < 274.15)] = 1
    group[(~core) & (radius > 17.15) & (radius < 32) & (t >= 274.15) & (t < 280.25)] = 2

    finish = np.zeros(len(polygons), dtype=np.int32)
    finish[core & (t >= 170) & (t < 212)] = 3
    finish[core & (t >= 212)] = 4
    finish[core & (t >= 100) & (t < 163)] = 5
    finish[core & (t < 100)] = 6
    finish[core & (t >= 163) & (t < 170)] = 6
    finish[(q < -35) & (t >= 211) & (t < 298)] = 8
    finish[(q < -35) & (t < 211)] = 6
    finish[(q < -35) & (t > 314)] = 3
    finish[(radius < 19) & (t >= 280) & (t < 287.5)] = 4
    finish[(radius > 18) & (radius < 32) & (t >= 76) & (t <= 83.35)] = 6
    upper_eye = np.hypot(q, t - 322.5)
    lower_eye = np.hypot(q, t - 55.3)
    finish[(upper_eye < 8.5) | (lower_eye < 7.4)] = 7
    finish[group == 1] = 1
    finish[group == 2] = 2

    working = source.copy()
    working.data = source.data.copy()
    working.data['owner'] = OWNER
    collection.objects.link(working)
    working['owner'] = OWNER
    working.hide_render = False
    working.hide_viewport = False
    working.data.attributes.new('source_face_id', 'INT', 'FACE').data.foreach_set(
        'value', np.arange(len(polygons), dtype=np.int32))
    working.data.attributes.new('source_vertex_id', 'INT', 'POINT').data.foreach_set(
        'value', np.arange(len(xyz), dtype=np.int32))
    mats = finishes()
    working.data.materials.clear()
    for mat in mats[:3]:
        working.data.materials.append(mat)
    working.data.polygons.foreach_set('material_index', group)
    bpy.ops.object.select_all(action='DESELECT')
    working.select_set(True)
    bpy.context.view_layer.objects.active = working
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='MATERIAL')
    bpy.ops.object.mode_set(mode='OBJECT')
    parts = sorted(bpy.context.selected_objects, key=lambda o: int(o.data.polygons[0].material_index))
    assert len(parts) == 3
    source_normals = np.array([n.vector[:] for n in source.data.corner_normals])
    loop_start = np.array([p.loop_start for p in source.data.polygons])

    for index, obj in enumerate(parts):
        # Separation may compact material slots, so source face IDs identify the part.
        face_ids = np.array([a.value for a in obj.data.attributes['source_face_id'].data])
        kind = int(group[face_ids[0]])
        assert np.all(group[face_ids] == kind)
        obj.name = PART_NAMES[kind]
        obj.data.name = PART_NAMES[kind] + ' mesh'
        obj['owner'] = OWNER
        obj['component'] = ('main body', 'spring', 'preload nut')[kind]
        obj['original_face_count'] = len(face_ids)
        obj['source_geometry'] = 'Original triangles retained; contact vertices split only.'
        vertex_ids = np.array([a.value for a in obj.data.attributes['source_vertex_id'].data])
        obj.data.materials.clear()
        for mat in mats:
            obj.data.materials.append(mat)
        obj.data.polygons.foreach_set('material_index', finish[face_ids])
        # Pack the supplied photograph; cylindrical UVs sample its actual warning label.
        uv = obj.data.uv_layers.new(name='Reservoir Label UV')
        for poly in obj.data.polygons:
            for li in poly.loop_indices:
                original_index = vertex_ids[obj.data.loops[li].vertex_index]
                vx, vq, vt = coordinates(xyz[original_index])
                theta = math.atan2(vq + 55.5, vx)
                uv.data[li].uv = (.5 - (theta + .06) / 1.2, (vt - 235) / 44)
        origin_t = (188.9, 178.75, 277.2)[kind]
        transform = Matrix(BASIS.T.tolist()).to_4x4()
        transform.translation = Vector(-BASIS.T @ (ORIGIN + AXIS * (origin_t - 200)))
        obj.data.transform(transform)
        obj.parent = root
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = Matrix.Translation((0, 0, origin_t - 55.3))
        # Explicitly retain the supplied split normals through the new coordinate basis.
        normals = []
        for poly in obj.data.polygons:
            src = int(face_ids[poly.index])
            original_verts = polygons[src].tolist()
            for vi in poly.vertices:
                corner = original_verts.index(int(vertex_ids[vi]))
                normals.append(source_normals[loop_start[src] + corner] @ BASIS)
        obj.data.normals_split_custom_set(normals)
        obj.data.update()

    setup_review(root)
    bpy.context.view_layer.update()
    repair_surfaces()
    report = validate()
    text = bpy.data.texts.get('rear-shock-separation.py') or bpy.data.texts.new('rear-shock-separation.py')
    text.clear()
    text.write((ROOT / 'scripts/blender-rear-shock.py').read_text())
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(FILE))
    return report


def setup_review(root):
    collection = bpy.data.collections.new('Shock review studio')
    collection['owner'] = OWNER
    bpy.context.scene.collection.children.link(collection)
    def point(local):
        return root.matrix_world @ Vector(local)

    target = point((0, 22, 137))
    back = (root.matrix_world.to_3x3() @ Vector((1, -.26, .12))).normalized()
    up = (root.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
    right = up.cross(back).normalized()
    up = back.cross(right).normalized()
    rotation = Matrix((right, up, back)).transposed().to_quaternion()
    data = bpy.data.cameras.new('Shock review camera')
    camera = bpy.data.objects.new('Shock review camera', data)
    camera['owner'] = OWNER
    collection.objects.link(camera)
    camera.location = target + back * 650
    camera.rotation_mode = 'QUATERNION'
    camera.rotation_quaternion = rotation
    data.type = 'ORTHO'
    data.ortho_scale = 346
    data.clip_start, data.clip_end = .1, 5000
    bpy.context.scene.camera = camera
    for name, position, energy, size, color in (
        ('Key softbox', (240, -180, 360), 4200000, 260, (1., .94, .84)),
        ('Fill softbox', (180, 240, 170), 2800000, 240, (.8, .88, 1.)),
        ('Edge softbox', (-180, 80, 300), 5000000, 180, (1., .97, .91)),
    ):
        light = bpy.data.lights.new(name, 'AREA')
        light.energy, light.shape, light.size, light.color = energy, 'DISK', size, color
        obj = bpy.data.objects.new(name, light)
        obj['owner'] = OWNER
        collection.objects.link(obj)
        obj.location = point(position)
        obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()
    scene = bpy.context.scene
    world = bpy.data.worlds.new('Shock studio world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.075, .085, .105, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .5
    scene.world = world
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 960, 1280
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(DEST / 'rear-shock-assembled.png')
    scene.view_settings.view_transform = 'AgX'
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = bpy.data.objects[PART_NAMES[1]]
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                space = area.spaces.active
                space.shading.type = 'MATERIAL'
                space.shading.studiolight_rotate_z = .7
                space.overlay.show_overlays = False
                space.show_region_ui = False
                space.clip_start, space.clip_end = .1, 5000
                space.region_3d.view_rotation = rotation
                space.region_3d.view_location = target
                space.region_3d.view_distance = 335
                space.region_3d.view_perspective = 'ORTHO'


def validate():
    if bpy.data.objects['Rear Shock Assembly'].get('surface_repair'):
        return validate_repaired()
    source = bpy.data.objects['Source - original unsplit rear shock']
    bpy.context.view_layer.update()
    original = np.array([(source.matrix_world @ v.co)[:] for v in source.data.vertices])
    covered, parts, max_error = [], [], 0.
    for name in PART_NAMES:
        obj = bpy.data.objects[name]
        ids = np.array([a.value for a in obj.data.attributes['source_vertex_id'].data])
        actual = np.array([(obj.matrix_world @ v.co)[:] for v in obj.data.vertices])
        assert np.isfinite(actual).all()
        error = float(np.max(np.linalg.norm(actual - original[ids], axis=1)))
        max_error = max(max_error, error)
        face_ids = [a.value for a in obj.data.attributes['source_face_id'].data]
        for poly, source_id in zip(obj.data.polygons, face_ids):
            assert tuple(int(ids[v]) for v in poly.vertices) == tuple(source.data.polygons[source_id].vertices)
        covered.extend(face_ids)
        assert obj.data.has_custom_normals
        assert obj.parent.name == 'Rear Shock Assembly'
        assert obj.data.users == 1
        parts.append({'name': name, 'vertices': len(ids), 'triangles': len(face_ids),
                      'maximum_world_position_error': error,
                      'materials': sorted({obj.data.materials[p.material_index].name for p in obj.data.polygons})})
    assert sorted(covered) == list(range(len(source.data.polygons)))
    assert max_error < .00015
    return {'source': str(SOURCE.relative_to(ROOT)),
            'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            'output': str(FILE.relative_to(ROOT)), 'parts': parts,
            'all_original_triangles_retained_exactly_once': True,
            'original_triangle_count': len(covered),
            'maximum_world_position_error': max_error,
            'reference_image_packed': bpy.data.images.get('reference-white-spring.png').packed_file is not None,
            'geometry_note': 'Original scan has open interior surfaces and contact joins. This pass separates existing faces; it does not rebuild missing surfaces or certify watertight solids.',
            'portal_integration': False}


def repair_surfaces():
    """Complete scan occlusions using profiles fitted to the supplied surfaces."""
    from mathutils.bvhtree import BVHTree

    root = bpy.data.objects['Rear Shock Assembly']
    assert not root.get('surface_repair'), 'Repair is already applied; use build() to regenerate.'
    body, spring, nut = [bpy.data.objects[n] for n in PART_NAMES]
    source = bpy.data.objects['Source - original unsplit rear shock']
    core_vertices = set(connected_vertices(source.data)[1])
    bm = bmesh.new()
    bm.from_mesh(body.data)
    fid = bm.faces.layers.int.get('source_face_id')
    vid = bm.verts.layers.int.get('source_vertex_id')
    remove = []
    for face in bm.faces:
        center = face.calc_center_median()
        t = center.z + 188.9
        r = math.hypot(center.x, center.y)
        original = source.data.polygons[face[fid]]
        if original.vertices[0] in core_vertices or (83.4 < t < 287.3 and r < 18.8):
            remove.append(face)
    bmesh.ops.delete(bm, geom=remove, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context='VERTS')

    # One closed, continuous damper surface, including the previously missing
    # neck, piston, and occluded bands. Radii and thread pitch come from the scan.
    profile = [(83.2, 7.5), (84, 7.5), (85, 9.5), (87, 12), (94.7, 13.9),
               (97.9, 13.4), (99, 12.3), (99.6, 7), (100, 6.0655),
               (162.2, 6.0655), (162.8, 6.6), (163.1, 14.6), (163.6, 16.1),
               (169, 16.3), (170, 16.5456), (211, 16.5456)]
    profile.extend((float(t), 16.47) for t in np.arange(211.3, 287.05, .18))
    profile.append((287.4, 16.47))
    rings = []
    for t, r in profile:
        ring = []
        for j in range(128):
            theta = 2 * math.pi * j / 128
            radius = r
            if 211.3 <= t <= 287.05:
                radius += .19 * math.cos(2 * math.pi * (t - 211.3) / 1.2653 - theta)
            offset_x = (-.32417 + .006363 * (t - 130)) if 100 <= t < 162.8 else 0
            offset_y = (-.053929 + .001169 * (t - 130)) if 100 <= t < 162.8 else 0
            vertex = bm.verts.new((radius * math.cos(theta) + offset_x,
                                   radius * math.sin(theta) + offset_y, t - 188.9))
            vertex[vid] = -1
            ring.append(vertex)
        rings.append(ring)
    for i in range(len(rings) - 1):
        middle = (profile[i][0] + profile[i + 1][0]) / 2
        mat = 5 if 99.8 <= middle < 162.8 else 3 if 169.8 <= middle < 211.2 else 4 if middle >= 211.2 else 6
        for j in range(128):
            k = (j + 1) % 128
            face = bm.faces.new((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]))
            face[fid] = -1
            face.material_index, face.smooth = mat, True
    for ring, reverse in ((rings[0], True), (rings[-1], False)):
        face = bm.faces.new(tuple(reversed(ring)) if reverse else tuple(ring))
        face[fid] = -1
        face.material_index = 6 if reverse else 4
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    body['repair'] = 'Damper sleeve, 1.2653-unit thread pitch, 6.0655-radius piston and end seats fitted to source.'

    # A swept tube fitted to 391 circular sections of the original outer coil.
    # The source's bow and radial variation are retained; missing inner arcs are
    # completed. Ground end faces retain the original contact planes.
    rc = np.array([23.8413099057, -.0079821772, .0501717294, -.1594201343,
                   .2379803289, -.0591748505, -1.2390648894, -.0197971144, .6649971448])
    tc = np.array([-1.0289644892, 18.3902221760, .0907082783, .0224096886,
                   .0024772063, -.3459993770])
    def center(turn):
        theta = turn * 2 * math.pi
        u = (tc[0] + tc[1] * turn - 180) / 80
        c, s = math.cos(theta), math.sin(theta)
        radius = float(rc @ np.array([1, u, u*u, c, u*c, u*u*c, s, u*s, u*u*s]))
        z = float(tc @ np.array([1, turn, c, s, u*c, u*s]))
        z = 85.65 + 2.4 * float(np.logaddexp(0, (z - 85.65) / 2.4))
        z = 271.8 - 1.7 * float(np.logaddexp(0, (271.8 - z) / 1.7))
        return Vector((radius*c, radius*s, z - 178.75))

    source_bvh = BVHTree.FromObject(spring, bpy.context.evaluated_depsgraph_get())
    verts, faces, flat = [], [], []
    steps, sides = 1408, 40
    projected = 0
    for i in range(steps + 1):
        turn = 4.28 + 11 * i / steps
        position = center(turn)
        tangent = (center(turn + .0001) - center(turn - .0001)).normalized()
        radial = Vector((math.cos(2*math.pi*turn), math.sin(2*math.pi*turn), 0))
        radial = (radial - tangent * tangent.dot(radial)).normalized()
        vertical = radial.cross(tangent).normalized()
        for j in range(sides):
            angle = 2 * math.pi * j / sides
            normal = radial * math.cos(angle) + vertical * math.sin(angle)
            point = position + normal * 4.8774393
            # Reuse visible surface detail where the original scan is present.
            if math.cos(angle) > .65 and 102 < point.z + 178.75 < 253:
                closest, old_normal, _, distance = source_bvh.find_nearest(point)
                if closest is not None and distance < .6 and old_normal.dot(normal) > .4:
                    weight = (math.cos(angle) - .65) / .35
                    point = point.lerp(closest, weight)
                    projected += 1
            point.z = min(274.15 - 178.75, max(83.35 - 178.75, point.z))
            verts.append(point[:])
    for i in range(steps):
        for j in range(sides):
            k = (j + 1) % sides
            face = (i*sides+j, (i+1)*sides+j, (i+1)*sides+k, i*sides+k)
            faces.append(face)
            heights = [verts[v][2] for v in face]
            flat.append(max(heights) - min(heights) < 1e-6)
    faces.extend((tuple(reversed(range(sides))), tuple(steps*sides+j for j in range(sides))))
    flat.extend((True, True))
    repaired = bpy.data.meshes.new('Rear Shock Spring repaired mesh')
    repaired['owner'] = OWNER
    repaired.from_pydata(verts, [], faces)
    repaired.materials.append(next(m for m in spring.data.materials if 'White powder coat' in m.name))
    for polygon, is_flat in zip(repaired.polygons, flat):
        polygon.use_smooth = not is_flat
    bm = bmesh.new()
    bm.from_mesh(repaired)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(repaired)
    bm.free()
    spring.data = repaired
    spring['repair'] = 'Inner surface completed from 391 source cross sections; ground ends and original bow retained.'
    spring['surface_fit_median_error'] = .0512341513
    spring['original_surface_samples_reused'] = projected

    # Preserve the scanned notches; close its underside and form a complete bore.
    bm = bmesh.new()
    bm.from_mesh(nut.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.025)
    bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=.002)
    edges = [e for e in bm.edges if e.is_boundary]
    filled = bmesh.ops.holes_fill(bm, edges=edges, sides=0)['faces']
    for face in filled:
        face.material_index, face.smooth = 2, False
        layer = bm.faces.layers.int.get('source_face_id')
        if layer:
            face[layer] = -1
    if filled:
        bmesh.ops.triangulate(bm, faces=filled)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(nut.data)
    bm.free()
    bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=17.1, depth=18)
    cutter = bpy.context.object
    cutter.matrix_world = nut.matrix_world.copy()
    modifier = nut.modifiers.new('Repaired continuous preload bore', 'BOOLEAN')
    modifier.operation, modifier.solver, modifier.object = 'DIFFERENCE', 'EXACT', cutter
    bpy.context.view_layer.objects.active = nut
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    nut_material = next(m for m in nut.data.materials if 'Black preload adjuster' in m.name)
    nut.data.materials.clear()
    nut.data.materials.append(nut_material)
    for poly in nut.data.polygons:
        poly.material_index = 0
    modifier = nut.modifiers.new('Close remaining scan pinholes', 'REMESH')
    modifier.mode, modifier.voxel_size, modifier.use_smooth_shade = 'VOXEL', .10, True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier = nut.modifiers.new('Blend repaired underside', 'SMOOTH')
    modifier.factor, modifier.iterations = .35, 2
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    nut.data.calc_loop_triangles()
    modifier = nut.modifiers.new('Retain notch detail at practical density', 'DECIMATE')
    modifier.ratio = 20000 / len(nut.data.loop_triangles)
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    components = connected_vertices(nut.data)
    bm = bmesh.new()
    bm.from_mesh(nut.data)
    bm.verts.ensure_lookup_table()
    keep = set(components[0])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context='VERTS')
    bm.to_mesh(nut.data)
    bm.free()
    nut['repair'] = 'Original notched exterior retained; underside and 17.1-radius through bore completed.'
    close_contact_patches(body)
    root['surface_repair'] = True
    root['notes'] = 'Three editable parts with repaired occluded surfaces. Local Z follows the shock axis; assembled placement retained.'
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = spring


def close_contact_patches(body):
    """Fill the seat and housing contact openings while retaining mounting bores."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    boundary = {edge for edge in bm.edges if edge.is_boundary}
    groups = []
    while boundary:
        first = boundary.pop()
        stack, edges = [first], [first]
        while stack:
            edge = stack.pop()
            for vert in edge.verts:
                for other in vert.link_edges:
                    if other in boundary:
                        boundary.remove(other)
                        stack.append(other)
                        edges.append(other)
        groups.append(edges)
    fid = bm.faces.layers.int.get('source_face_id')
    all_new = []
    for edges in groups:
        vertices = list({v for e in edges for v in e.verts})
        low = min(v.co.z for v in vertices) + 188.9
        high = max(v.co.z for v in vertices) + 188.9
        # These regions contain the two real transverse mounting bores.
        if low < 72 or high > 307:
            continue
        nearby = [f.material_index for e in edges for f in e.link_faces]
        mat = max(set(nearby), key=nearby.count) if nearby else 0
        filled = bmesh.ops.holes_fill(bm, edges=edges, sides=0)['faces']
        for face in filled:
            face.material_index = mat
            face.smooth = high - low > 2
            face[fid] = -1
        all_new.extend(filled)
    if all_new:
        bmesh.ops.triangulate(bm, faces=all_new)
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()


def validate_repaired():
    parts = []
    for name in PART_NAMES:
        obj = bpy.data.objects[name]
        assert obj.data.users == 1 and obj.parent.name == 'Rear Shock Assembly'
        assert all(math.isfinite(x) for v in obj.data.vertices for x in v.co)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        nonmanifold = sum(not e.is_manifold for e in bm.edges)
        boundary = sum(e.is_boundary for e in bm.edges)
        bm.free()
        obj.data.calc_loop_triangles()
        parts.append({'name': name, 'vertices': len(obj.data.vertices),
                      'triangles': len(obj.data.loop_triangles),
                      'boundary_edges': boundary, 'nonmanifold_edges': nonmanifold,
                      'repair': obj.get('repair'),
                      'materials': sorted({obj.data.materials[p.material_index].name for p in obj.data.polygons})})
    assert parts[1]['boundary_edges'] == 0 and parts[1]['nonmanifold_edges'] == 0
    assert parts[2]['boundary_edges'] == 0 and parts[2]['nonmanifold_edges'] == 0
    return {'source': str(SOURCE.relative_to(ROOT)),
            'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            'output': str(FILE.relative_to(ROOT)), 'parts': parts,
            'source_backup': 'Source backup - original unsplit shock',
            'pre_repair_file': str((DEST / 'rear-shock-before-surface-repair.blend').relative_to(ROOT)),
            'surface_repair_authorized': True, 'coil_fit_cross_sections': 391,
            'coil_centerline_median_fit_error': .0512341513,
            'coil_wire_radius': 4.8774393, 'piston_radius': 6.0655, 'thread_pitch': 1.2653,
            'repair_note': 'Missing coil, damper and preload surfaces completed from source fits. Housing and reservoir scan detail retained.',
            'remaining_scan_limitations': 'The retained casting and mounting-eye surfaces still contain source scan boundaries; the whole main assembly is not certified watertight. Spring and preload nut are closed manifold meshes.',
            'reference_image_packed': bpy.data.images.get('reference-white-spring.png').packed_file is not None,
            'portal_integration': False}
