"""Rear wheel revision 01. Run build() through Blender MCP, then save_review/export_parts.

All geometry uses the portal's existing raw millimetre coordinate convention.
Only this generator's tagged objects are rebuilt. The imported original hub is
retained, and its public GLB is never overwritten. Editable assumptions and fitted
mounting coordinates live in data/models/rear-wheel-assembly.json.
"""
import hashlib
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / 'data/models/rear-wheel-assembly.json').read_text())
CONTOURS = json.loads((ROOT / 'data/models/rear-wheel-contours.json').read_text())
OWNER = 'lbx-rear-wheel-r01'
COLLECTION = 'LBX Rear Wheel · 18 inch'
CENTER = Vector(DATA['axis']['centerMm'])
TAU = math.tau
PARTS = {}


def material(name, rgb, metallic, roughness):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*rgb, 1)
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def mesh_object(name, vertices, faces, mat=None, smooth=False):
    mesh = bpy.data.meshes.new(name)
    mesh['generator'] = OWNER
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.data.collections[COLLECTION].objects.link(obj)
    obj['generator'] = OWNER
    if mat:
        mesh.materials.append(mat)
    for face in mesh.polygons:
        face.use_smooth = smooth
    return obj


def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.data.collections[COLLECTION].objects.link(obj)
    obj.parent = parent
    obj['generator'] = OWNER
    return obj


def register(part_id, objects, parent):
    entry = next(e for e in DATA['instances'] if e['id'] == part_id)
    for obj in objects:
        obj.parent = parent
        obj['part_id'] = part_id
        obj['model_notes'] = DATA['specs'][entry['spec']]['notes']
    PARTS[part_id] = objects
    return objects


def frame(axis):
    axis = Vector(axis).normalized()
    seed = Vector((0, 1, 0)) if abs(axis.y) < .9 else Vector((0, 0, 1))
    u = (seed - seed.dot(axis) * axis).normalized()
    return axis, u, axis.cross(u).normalized()


def revolve(name, profile, origin, mat, segments=96, closed=True, axis=(1, 0, 0), smooth=True):
    """Profile is (axial distance, radius), about any explicit world-space axis."""
    a, u, v = frame(axis)
    origin = Vector(origin)
    vertices = [tuple(origin + x*a + r*(math.cos(t*TAU/segments)*u + math.sin(t*TAU/segments)*v))
                for x, r in profile for t in range(segments)]
    faces = []
    for j in range(len(profile) if closed else len(profile)-1):
        k = (j+1) % len(profile)
        for i in range(segments):
            n = (i+1) % segments
            faces.append((j*segments+i, j*segments+n, k*segments+n, k*segments+i))
    if not closed:
        faces += [tuple(reversed(range(segments))), tuple((len(profile)-1)*segments+i for i in range(segments))]
    return mesh_object(name, vertices, faces, mat, smooth)


def prism(name, outline, x0, x1, mat=None):
    """Extrude a YZ polygon along the wheel axle."""
    n = len(outline)
    vertices = [(x, y, z) for x in (x0, x1) for y, z in outline]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
    faces += [(i, (i+1) % n, (i+1) % n+n, i+n) for i in range(n)]
    return mesh_object(name, vertices, faces, mat)


def circle(yz, radius, segments=32):
    return [(yz[0]+radius*math.cos(i*TAU/segments), yz[1]+radius*math.sin(i*TAU/segments)) for i in range(segments)]


def polar(radius, angle, center=None):
    center = CENTER[1:] if center is None else center
    return (center[0]+radius*math.cos(angle), center[1]+radius*math.sin(angle))


def round_polygon(points, iterations=2):
    for _ in range(iterations):
        points = [p for a, b in zip(points, points[1:]+points[:1])
                  for p in ((.75*a[0]+.25*b[0], .75*a[1]+.25*b[1]),
                            (.25*a[0]+.75*b[0], .25*a[1]+.75*b[1]))]
    return points


def difference(obj, cutters):
    """One exact boolean with disconnected, non-overlapping cutter volumes."""
    vertices, faces = [], []
    for cutter in cutters:
        offset = len(vertices)
        vertices.extend(tuple(cutter.matrix_world @ v.co) for v in cutter.data.vertices)
        faces.extend(tuple(offset+i for i in p.vertices) for p in cutter.data.polygons)
    tool = mesh_object('Temporary wheel cutters', vertices, faces)
    for cutter in cutters:
        bpy.data.objects.remove(cutter, do_unlink=True)
    mod = obj.modifiers.new('Machined openings', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = tool
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(tool, do_unlink=True)


def bevel(obj, width, segments=2):
    mod = obj.modifiers.new('Edge radii', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = .45
    mod.affect = 'EDGES'


def pipe(name, points, radius, mat, sides=12):
    points = [Vector(p) for p in points]
    vertices, faces = [], []
    for j, p in enumerate(points):
        tangent = points[min(j+1, len(points)-1)] - points[max(0, j-1)]
        _, u, v = frame(tangent)
        vertices.extend(tuple(p+radius*(math.cos(i*TAU/sides)*u+math.sin(i*TAU/sides)*v)) for i in range(sides))
    for j in range(len(points)-1):
        for i in range(sides):
            faces.append((j*sides+i, j*sides+(i+1) % sides, (j+1)*sides+(i+1) % sides, (j+1)*sides+i))
    faces += [tuple(reversed(range(sides))), tuple((len(points)-1)*sides+i for i in range(sides))]
    return mesh_object(name, vertices, faces, mat, True)


def build_rim(parent, black):
    half = [(0, 216.5), (9, 216.5), (13, 217.5), (17, 221), (20.32, 228.6),
            (20.32, 235), (21, 237.7), (22.5, 238.5), (24.2, 238.5),
            (25, 236.5), (23.6, 226), (20.5, 220.5), (14, 214.4), (8, 213.5), (0, 213.5)]
    profile = half + [(-x, r) for x, r in reversed(half[1:-1])]
    rim = revolve('18 × 1.60 drop-center rim', profile, CENTER, black, 256)
    cutters = []
    # Alternate drillings match the actual spoke endpoints on the rim.
    for i in range(36):
        angle = math.radians(5+10*i)
        radial = Vector((0, math.cos(angle), math.sin(angle)))
        origin = CENTER + Vector((6 if i % 2 == 0 else -6, 0, 0)) + 210*radial
        cutters.append(revolve('Nipple drilling', [(0, 2.6), (12, 2.6)], origin, None, 16, False, radial))
    radial = Vector((0, 0, 1))
    cutters.append(revolve('Valve drilling', [(0, 4.2), (12, 4.2)], CENTER+210*radial, None, 24, False, radial))
    difference(rim, cutters)
    register('rear-rim-18', [rim], parent)


def build_spokes(parent, steel):
    objects = []
    spans = []
    for side, flange_x, phase, rim_x in [('sprocket', -29.2, 15, -6), ('disc', 35, 5, 6)]:
        for i, hole in enumerate(DATA['spokeHoles'][side]):
            angle = math.radians(phase+20*i)
            lead = 1 if i % 2 == 0 else -1
            rim_angle = angle+lead*math.radians(60)
            y, z = hole['centerYZ']
            outer = -1 if side == 'sprocket' else 1
            head_side = outer*lead
            head = Vector((flange_x+head_side*2.3, y, z))
            elbow = Vector((flange_x-head_side*3.4, y, z))
            end = CENTER + Vector((rim_x, 214.6*math.cos(rim_angle), 214.6*math.sin(rim_angle)))
            direction = (end-elbow).normalized()
            # Rounded J-bend with its head on alternating flange faces.
            bend_start = elbow + Vector((head_side*2, 0, 0))
            bend_end = elbow + direction*3.2
            points = [head, bend_start]
            for j in range(1, 6):
                t = j/5
                points.append((1-t)**2*bend_start+2*(1-t)*t*elbow+t*t*bend_end)
            points.append(end)
            spoke = pipe(f'{side.title()} spoke {i+1:02}', points, 1.4, steel)
            cap = revolve(f'{side.title()} spoke head {i+1:02}',
                          [(0, 1.4), (.2, 2.2), (.65, 2.2), (1.2, 1.3)],
                          head, steel, 16, False, (head_side, 0, 0))
            nipple = revolve(f'{side.title()} nipple {i+1:02}',
                             [(-12, 2.2), (-11, 2.65), (-2, 2.65), (-1, 3.8), (0, 3.8), (.4, 2.6)],
                             end, steel, 12, False, direction)
            objects.extend([spoke, cap, nipple])
            spans.append(round((end-elbow).length, 3))
    register('rear-spokes', objects, parent)
    return {'count':36, 'modeledSpanRangeMm':[min(spans), max(spans)]}


def build_sprocket(parent, metal):
    mount = DATA['mounts']['sprocket']
    yz = mount['pitchCenterYZ']
    samples = [(-.5, 93.2), (-.40, 93.35), (-.32, 94.1), (-.24, 96), (-.18, 98.3),
               (-.10, 99.45), (.10, 99.45), (.18, 98.3), (.24, 96), (.32, 94.1), (.40, 93.35)]
    outline = [polar(r, TAU*(i+t)/48, yz) for i in range(48) for t, r in samples]
    sprocket = prism('48-tooth sprocket', outline, -55.8, -49.8, metal)
    cutters = [prism('Sprocket center bore', circle(yz, 26, 96), -60, -45)]
    cutters += [prism('Sprocket mounting hole', circle(h['centerYZ'], 4.4), -60, -45) for h in mount['holes']]
    # Five paired windows form the distinctive star web in the reference.
    # Align its upper mounting pair with the hub's measured five-hole phase.
    phase = mount['anglesRadians'][1]-math.radians(54)
    for i in range(5):
        a = i*TAU/5+phase
        for key in ['innerTemplate', 'outerTemplate']:
            outline = [(yz[0]+y*math.cos(a)-z*math.sin(a), yz[1]+y*math.sin(a)+z*math.cos(a))
                       for y, z in CONTOURS['sprocket'][key]]
            cutters.append(prism('Traced sprocket window', outline, -60, -45))
    difference(sprocket, cutters)
    bevel(sprocket, .18)
    register('rear-sprocket-48t', [sprocket], parent)


def build_disc(parent, steel):
    mount = DATA['mounts']['disc']
    yz = mount['pitchCenterYZ']
    outline = [(yz[0]+y, yz[1]+z) for y, z in CONTOURS['disc']['outer']]
    disc = prism('Wave disc · 202.8 × 2', outline, 58.6, 60.6, steel)
    cutters = [prism('Traced disc '+opening['kind'], [(yz[0]+y, yz[1]+z) for y, z in opening['points']], 55, 64)
               for opening in CONTOURS['disc']['openings']]
    cutters += [prism('Disc mounting hole', circle(h['centerYZ'], 3.15), 55, 64) for h in mount['holes']]
    difference(disc, cutters)
    bevel(disc, .07)
    register('rear-disc', [disc], parent)


def build_bolts(parent, steel):
    for kind, side, length, diameter, face in [('sprocket', -1, 16, 8, -55.8), ('disc', 1, 13, 6, 60.6)]:
        for i, hole in enumerate(DATA['mounts'][kind]['holes']):
            origin = (face, *hole['centerYZ'])
            if kind == 'sprocket':
                profile = [(-length, 3.5), (-length+.6, 4), (-.4, 4), (0, 4.4),
                           (0, 6.3), (.7, 6.5), (7.2, 6.5), (8, 5.7)]
                top, af, depth = 8, 6, 4.2
            else:
                profile = [(-length, 2.5), (-length+.5, 3), (-.3, 3), (0, 3.3),
                           (0, 5.2), (.55, 5.3), (1.6, 4.9), (2.6, 3.9), (3, 3.4)]
                top, af, depth = 3, 4, 1.8
            bolt = revolve(f'{kind.title()} screw {i+1:02}', profile, origin, steel, 48, False, (side, 0, 0))
            center = (face+side*(top-depth), *hole['centerYZ'])
            cutter = revolve('Hex socket', [(0, af/math.sqrt(3)), (depth+2, af/math.sqrt(3))],
                              center, None, 6, False, (side, 0, 0), False)
            difference(bolt, [cutter])
            bevel(bolt, .1)
            register(f'rear-{kind}-bolt-{i+1:02}', [bolt], parent)


def smooth_profile(points, steps=3):
    """Closed Catmull-Rom section, retaining the specified section stations."""
    output = []
    for i in range(len(points)):
        p0, p1, p2, p3 = [Vector(points[j % len(points)]) for j in (i-1, i, i+1, i+2)]
        for j in range(steps):
            t = j/steps
            p = .5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)
            output.append(tuple(p))
    return output


def tread_blocks(mat):
    vertices, faces = [], []
    cut_vertices, cut_faces = [], []
    # The supplied side silhouette has 52 shoulder pitches. The CM708 product
    # photograph resolves alternating two-/four-block center rows and slotted
    # pentagonal shoulder lugs, rather than a generic repeated square pattern.
    for row in range(52):
        blocks = [(-6.8, 11.6, 17.5, False), (6.8, 11.6, 17.5, False)] if row % 2 == 0 else [(-9, 15, 19, False), (9, 15, 19, False)]
        if row % 2 == 0:
            blocks += [(-22, 10, 15, False), (22, 10, 15, False)]
        blocks += [(-33.5, 12, 21, True), (33.5, 12, 21, True)]
        for x, width, length, shoulder in blocks:
            angle = (row+(.44 if shoulder else 0))*TAU/52
            footprint = ([(-.5, -.27), (-.2, -.5), (.32, -.5), (.5, -.17),
                          (.5, .32), (.17, .5), (-.34, .5), (-.5, .23)] if shoulder else
                         [(-.5, -.38), (-.38, -.5), (.38, -.5), (.5, -.38),
                          (.5, .38), (.38, .5), (-.38, .5), (-.5, .38)])
            offset = len(vertices)
            for level in (0, 1):
                scale = 1 if level == 0 else .90
                for u, v in footprint:
                    xx = x+u*width*scale
                    if shoulder and level:
                        xx += math.copysign(.6, x)
                    radius = 297-.012*xx*xx
                    radius += (-1 if level == 0 else 8.2)
                    a = angle+v*length*scale/297
                    vertices.append(tuple(CENTER+Vector((xx, radius*math.cos(a), radius*math.sin(a)))))
            faces += [tuple(offset+i for i in reversed(range(8))), tuple(offset+8+i for i in range(8))]
            faces += [(offset+i, offset+(i+1) % 8, offset+8+(i+1) % 8, offset+8+i) for i in range(8)]
            # Shallow longitudinal sipes in alternate center blocks, deeper
            # rectangular pockets in the shoulder blocks visible in the photo.
            slots = [0] if shoulder else [-2.4, 2.4] if row % 2 == 0 else []
            for sx in slots:
                xx = x+sx
                top = 297-.012*xx*xx+8.2
                slot_width, slot_length = (2.8, 9.5) if shoulder else (1.25, 7.5)
                start = len(cut_vertices)
                for rr in (top-(2.3 if shoulder else 1.2), top+3):
                    for u, v in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                        aa = angle+v*slot_length/2/297
                        cut_vertices.append(tuple(CENTER+Vector((xx+u*slot_width/2, rr*math.cos(aa), rr*math.sin(aa)))))
                cut_faces += [tuple(start+i for i in [3,2,1,0]), tuple(start+i for i in [4,5,6,7])]
                cut_faces += [(start+i,start+(i+1)%4,start+4+(i+1)%4,start+4+i) for i in range(4)]
    obj = mesh_object('Knobby tread blocks', vertices, faces, mat)
    difference(obj, [mesh_object('Tread sipes and shoulder pockets', cut_vertices, cut_faces)])
    bevel(obj, .35, 2)
    return obj


def sidewall_lettering(text, radius, angle, size, side, mat, section):
    curve = bpy.data.curves.new('Temporary sidewall text', 'FONT')
    curve.body = text
    curve.size = size
    curve.align_x = 'CENTER'
    curve.extrude = .18
    curve.resolution_u = 3
    obj = bpy.data.objects.new('Temporary sidewall text', curve)
    bpy.data.collections[COLLECTION].objects.link(obj)
    bpy.context.view_layer.update()
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    points = []
    for v in mesh.vertices:
        rr = radius+v.co.y
        theta = angle-side*v.co.x/radius
        # Conform lettering to the inflated sidewall, not to a floating plane.
        intersections = [abs(x0+(rr-r0)/(r1-r0)*(x1-x0))
                         for (x0,r0),(x1,r1) in zip(section, section[1:]+section[:1])
                         if min(r0,r1) <= rr <= max(r0,r1) and abs(r1-r0) > 1e-8]
        x = max(intersections)
        points.append(tuple(CENTER+Vector((side*(x+.1+v.co.z), rr*math.cos(theta), rr*math.sin(theta)))))
    faces = [tuple(p.vertices) for p in mesh.polygons]
    label = mesh_object('Sidewall · '+text, points, faces, mat)
    bm = bmesh.new()
    bm.from_mesh(label.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.0001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(label.data)
    bm.free()
    evaluated.to_mesh_clear()
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.curves.remove(curve)
    return label


def build_tire(parent, rubber):
    outer = [(-19.7, 228.5), (-23, 232), (-29, 240), (-35, 253), (-38.1, 265),
             (-37.3, 277), (-32, 286), (-22, 292.6), (-10, 296), (0, 297)]
    outer += [(-x, r) for x, r in reversed(outer[:-1])]
    inner = [(17.4, 229.5), (20.5, 236), (25, 244), (30.2, 255), (32, 265),
             (30.5, 276), (24, 284), (13, 288.7), (0, 290.5)]
    inner += [(-x, r) for x, r in reversed(inner[:-1])]
    section = smooth_profile(outer+inner)
    carcass = revolve('3.00-18 hollow tire carcass', section, CENTER, rubber, 256)
    blocks = tread_blocks(rubber)
    # Small circumferential molding ribs distinguish the sidewall from the crown.
    ribs = []
    for side in (-1, 1):
        for x, radius in [(24.8, 235), (35.9, 253)]:
            profile = [(side*x+.32*math.cos(i*TAU/8), radius+.32*math.sin(i*TAU/8)) for i in range(8)]
            ribs.append(revolve('Sidewall molding rib', profile, CENTER, rubber, 192))
    labels = [sidewall_lettering(text, radius, math.radians(angle), size, side, rubber, section)
              for side in (-1,1) for text,radius,angle,size in [('CST',258,235,12),('3.00-18',258,65,7),('CM708',258,110,5)]]
    register('rear-tire-18', [carcass, blocks, *ribs, *labels], parent)


def build_tube(parent, rubber, steel):
    profile = [(29.4*math.cos(i*TAU/32), 259.8+29*math.sin(i*TAU/32)) for i in range(32)]
    tube = revolve('Inflated 18-inch tube', profile, CENTER, rubber, 192)
    # Valve sits between rim drillings at 90 degrees, directed inward toward the hub.
    stem = revolve('Tube valve stem', [(0, 4.3), (8, 4.3), (9, 3), (34, 3)],
                   CENTER+Vector((0, 0, 231)), steel, 32, False, (0, 0, -1))
    cap = revolve('Valve dust cap', [(0, 3.65), (6, 3.65), (7, 2.8)],
                  CENTER+Vector((0, 0, 200)), rubber, 24, False, (0, 0, -1))
    register('rear-tube-18', [tube, stem, cap], parent)


def build():
    PARTS.clear()
    hub_path = ROOT/'public/parts/Rear Hub.glb'
    if hashlib.sha256(hub_path.read_bytes()).hexdigest() != DATA['sourceFiles']['public/parts/Rear Hub.glb']:
        raise RuntimeError('The source hub changed. Review the fitted mounting coordinates first.')
    collection = bpy.data.collections.get(COLLECTION)
    if not collection:
        collection = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(collection)
    # Only remove geometry from this generator. The hub mesh is never regenerated.
    for obj in list(bpy.data.objects):
        if obj.get('generator') == OWNER:
            bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.get('generator') == OWNER and not mesh.users:
            bpy.data.meshes.remove(mesh)
    hub = bpy.data.objects.get('Rear_Hub_001')
    if not hub:
        bpy.ops.import_scene.gltf(filepath=str(hub_path))
        hub = next(o for o in bpy.context.selected_objects if o.type == 'MESH')
    world = hub.matrix_world.copy()
    for coll in list(hub.users_collection):
        coll.objects.unlink(hub)
    collection.objects.link(hub)
    root = empty('Rear Wheel Assembly')
    groups = {name:empty(f'{i:02} {name}', root) for i, name in enumerate(
        ['Hub', 'Rim', 'Spokes', 'Sprocket', 'Bolts', 'Disc', 'Tire', 'Tube'], 1)}
    hub.parent = groups['Hub']
    hub.matrix_world = world
    hub['part_id'] = 'rear-hub'
    PARTS['rear-hub'] = [hub]
    black = material('Wheel · black anodized rim', (.018, .022, .027), .78, .32)
    spokes = material('Wheel · stainless spokes', (.52, .55, .58), .9, .24)
    sprocket = material('Wheel · satin sprocket', (.45, .43, .37), .86, .36)
    steel = material('Wheel · machined steel', (.55, .58, .61), .92, .3)
    rubber = material('Wheel · tire rubber', (.006, .007, .008), 0, .91)
    rubber.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value = .25
    tube_rubber = material('Wheel · tube rubber', (.025, .026, .028), 0, .68)
    build_rim(groups['Rim'], black)
    spoke_info = build_spokes(groups['Spokes'], spokes)
    build_sprocket(groups['Sprocket'], sprocket)
    build_disc(groups['Disc'], steel)
    build_bolts(groups['Bolts'], steel)
    build_tire(groups['Tire'], rubber)
    build_tube(groups['Tube'], tube_rubber, steel)
    root['configuration'] = '18 × 1.60 / provisional 3.00-18 / 48T / 36 spokes'
    root['placement_notes'] = DATA['placementNotes']
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = .001
    bpy.context.scene.unit_settings.length_unit = 'MILLIMETERS'
    bpy.context.view_layer.update()
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    # Keep the script in the review file for further work through the Text Editor.
    text = bpy.data.texts.get('rear-wheel-generator.py') or bpy.data.texts.new('rear-wheel-generator.py')
    text.clear()
    text.write(Path(__file__).read_text())
    set_view()
    return {'parts':len(PARTS), 'spokes':spoke_info, 'collection':collection.name}


def set_view():
    target = CENTER
    eye = Vector((870, -780, 470))
    rotation = eye.to_track_quat('Z', 'Y')
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                space = area.spaces.active
                space.clip_start = .5
                space.clip_end = 100000
                space.shading.type = 'MATERIAL'
                space.overlay.show_overlays = False
                space.region_3d.view_location = target
                space.region_3d.view_rotation = rotation
                space.region_3d.view_distance = 1050
                space.region_3d.view_perspective = 'PERSP'


def objects_for(part_id):
    return [o for o in bpy.data.collections[COLLECTION].all_objects if o.get('part_id') == part_id]


def save_review():
    destination = ROOT/'reference/models/lbx-rear-wheel'
    destination.mkdir(parents=True, exist_ok=True)
    path = destination/'lbx-rear-wheel-r01.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    return str(path)


def export_parts():
    previous_scale = bpy.context.scene.unit_settings.scale_length
    bpy.context.scene.unit_settings.scale_length = 1
    try:
        return _export_parts()
    finally:
        bpy.context.scene.unit_settings.scale_length = previous_scale


def _export_parts():
    # The old project stores raw mm despite its legacy metre asset label. Blender's
    # glTF exporter keeps numeric mesh coordinates; assert bounds again in validation.
    records = []
    for entry in DATA['instances']:
        if entry['id'] == 'rear-hub':
            continue
        objects = objects_for(entry['id'])
        if not objects:
            raise RuntimeError('Missing part: '+entry['id'])
        for selected in bpy.context.selected_objects:
            selected.select_set(False)
        for obj in objects:
            obj.hide_set(False)
            obj.hide_render = False
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        path = ROOT/'public/parts'/(entry['name']+'.glb')
        # Keep individual spoke/nipple/lug objects editable in Blender, but combine
        # their evaluated geometry per selectable portal part to avoid 108 spoke draws.
        temporary = None
        if len(objects) > 1:
            vertices, faces, slots, face_settings = [], [], [], []
            for obj in objects:
                obj.select_set(False)
                evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
                mesh = evaluated.to_mesh()
                offset = len(vertices)
                vertices.extend(tuple(obj.matrix_world @ v.co) for v in mesh.vertices)
                for face in mesh.polygons:
                    mat = mesh.materials[face.material_index]
                    if mat not in slots:
                        slots.append(mat)
                    faces.append(tuple(offset+i for i in face.vertices))
                    face_settings.append((slots.index(mat), face.use_smooth))
                evaluated.to_mesh_clear()
            temporary = mesh_object(entry['name'], vertices, faces)
            for mat in slots:
                temporary.data.materials.append(mat)
            for face, (index, smooth) in zip(temporary.data.polygons, face_settings):
                face.material_index = index
                face.use_smooth = smooth
            temporary['part_id'] = entry['id']
            temporary.select_set(True)
            bpy.context.view_layer.objects.active = temporary
        try:
            bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                export_yup=True, export_apply=True, export_extras=True, export_animations=False,
                export_cameras=False, export_lights=False)
        finally:
            if temporary:
                mesh = temporary.data
                bpy.data.objects.remove(temporary, do_unlink=True)
                bpy.data.meshes.remove(mesh)
        triangles = 0
        vertices, materials = [], set()
        for obj in objects:
            evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            mesh.calc_loop_triangles()
            triangles += len(mesh.loop_triangles)
            vertices.extend(obj.matrix_world @ v.co for v in mesh.vertices)
            materials.update(m.name for m in mesh.materials if m)
            evaluated.to_mesh_clear()
        records.append(dict(id=entry['id'], name=entry['name'], file=path.name, role=entry['role'],
            sourceObject=objects[0].name, sourceBlend='reference/models/lbx-rear-wheel/lbx-rear-wheel-r01.blend',
            rearWheelSpec=entry['spec'], triangles=triangles, bytes=path.stat().st_size,
            sha256=hashlib.sha256(path.read_bytes()).hexdigest(), materials=sorted(materials),
            sourceWorldBounds=[[min(p[i] for p in vertices) for i in range(3)],
                               [max(p[i] for p in vertices) for i in range(3)]]))
    path = ROOT/'public/parts/manifest.json'
    manifest = json.loads(path.read_text())
    ids = {record['id'] for record in records}
    manifest['parts'] = [part for part in manifest['parts'] if part['id'] not in ids]+records
    manifest['totalTriangles'] = sum(p['triangles'] for p in manifest['parts'])
    manifest['totalBytes'] = sum(p['bytes'] for p in manifest['parts'])
    path.write_text(json.dumps(manifest, indent=2)+'\n')
    return {'exported':len(records), 'addedTriangles':sum(p['triangles'] for p in records),
            'addedBytes':sum(p['bytes'] for p in records)}


if __name__ == '__main__':
    print(json.dumps(build()), flush=True)
