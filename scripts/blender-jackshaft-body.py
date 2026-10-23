"""Jackshaft BODY revision 2; run in Blender's Text Editor, Object Mode.

Every length below is in mm; 1 BU/mm matches the existing hardware and pulleys.
User selected photos 1–3 as the stock-shaft shape reference. The catalog envelope
is not a measured drawing of that photographed part. Detailed dimensions and
hole positions remain provisional; the two ends use independent profiles.
Edit PARAMETERS, then rerun. Only this generator's body is replaced; its object
transform and objectId survive. No saves/exports or assembly positioning occur.
"""
import json
import math
import uuid

import bpy
import bmesh
from mathutils import Vector

OWNER = "lbx-jackshaft-body-v1"
NAME = "jackshaft_body_61281_visual"
COLLECTION = "LBX_Jackshaft_Body"
MM_TO_BU = 1.0
PARAMETERS = {
    "catalog_envelope_mm": [114.0, 54.0, 54.0],
    "visual_mm": {
        "length": 114.0, "maximum_flange_diameter": 54.0,
        "body_diameter": 26.0, "through_bore": 18.0,
        "mouth_chamfer": 0.35, "edge_bevel": 0.25, "hole_mouth_chamfer": 0.20,
    },
    # End labels are local-axis labels, NOT verified motorcycle left/right.
    "end_a_mm": {"flange_diameter": 54.0, "flange_thickness": 5.0,
                 "pilot_height": 5.0, "pilot_diameter": 30.0,
                 "lug_tip_radius": 6.0,
                 "scallop_centre_radius": 33.0, "scallop_radius": 13.0,
                 "outline_blend": 4.0, "shoulder_diameter": 32.0,
                 "neck_diameter": 30.0, "transition_length": 6.0,
                 "hole_circle_diameter": 42.0, "hole_diameter": 6.0,
                 "end_bore": 26.0, "end_bore_depth": 10.0},
    "end_b_mm": {"flange_diameter": 44.0, "flange_thickness": 13.0,
                 "crown_flat_radius": 21.5, "machined_rim_depth": 2.8,
                 "front_edge_chamfer": 0.65,
                 "scallop_centre_radius": 25.3, "scallop_radius": 5.7,
                 "outline_blend": 0.65, "shoulder_length": 8.0,
                 "hole_circle_diameter": 35.0, "hole_diameter": 5.4,
                 "end_bore": 26.0, "end_bore_depth": 9.0},
    "shape": {"lobes": 6, "holes_per_end": 6, "phase_degrees": 0.0,
              "radial_segments": 192, "hole_segments": 32},
}
SOURCES = {
    "catalog": "reference/parts-catalogue/katalog-zapchastej-surron-light-bee-2021.pdf p15 item17_09: 61281-YQ2A-0001, envelope114x54x54",
    "legacy_catalog": "reference/parts-catalogue/Sur-Ron-Spare-Parts.pdf p23 item15_09: 61281-YQ2A-0000 (different source suffix preserved)",
    "photos": "User explicitly selected images 1–3 as matching their stock shaft. These alone define this revision's exterior. Images 4–6 are retained for provenance, not blended into the shape.",
    "personal_measured_dimensions": "NONE supplied",
}


def make_material(name, color, metallic, roughness):
    mat = bpy.data.materials.get(name)
    if mat:
        if mat.get("generator") != OWNER:
            raise RuntimeError("Unrelated material name collision: " + name)
    else:
        mat = bpy.data.materials.new(name)
    mat["generator"] = OWNER
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def outline_radius(angle, end, flat=False):
    """Circular scallop cuts; broad flat crowns only on the thick collar."""
    sector = math.tau / PARAMETERS["shape"]["lobes"]
    phase = math.radians(PARAMETERS["shape"]["phase_degrees"])
    delta = (angle-phase+sector/2) % sector-sector/2
    radius = end["flange_diameter"]/2
    if flat:
        radius = min(radius, end["crown_flat_radius"]/math.cos(delta))
    # Nearest circular scallop is midway between the mounting lugs.
    d = sector/2-abs(delta)
    centre, cut = end["scallop_centre_radius"], end["scallop_radius"]
    discriminant = cut*cut-(centre*math.sin(d))**2
    if discriminant > 0:
        hit = centre*math.cos(d)-math.sqrt(discriminant)
        blend = end["outline_blend"]
        radius = min(radius, hit)-max(blend-abs(radius-hit), 0)**2/(4*blend)
    if "lug_tip_radius" in end and abs(delta) < math.radians(14):
        tip = end["lug_tip_radius"]
        centre = end["flange_diameter"]/2-tip
        cap = centre*math.cos(delta)+math.sqrt(tip*tip-(centre*math.sin(delta))**2)
        u = min(max((abs(delta)-math.radians(8))/math.radians(6), 0), 1)
        weight = 1-u*u*(3-2*u)
        radius += (min(radius, cap)-radius)*weight
    return radius


def make_shell(materials):
    """Continuous shell with a thin scalloped flange and a smaller deep collar."""
    p, a, b, shape = (PARAMETERS[k] for k in
                     ("visual_mm", "end_a_mm", "end_b_mm", "shape"))
    h = p["length"] / 2
    r, bore = p["body_diameter"]/2, p["through_bore"]/2
    c = p["mouth_chamfer"]
    af, bf = -h+a["pilot_height"], h
    ab, bb = af+a["flange_thickness"], bf-b["flange_thickness"]
    ap, neck = a["pilot_diameter"]/2, a["neck_diameter"]/2
    ar, br = a["end_bore"]/2, b["end_bore"]/2
    edge = p["edge_bevel"]
    assert bore < r < neck < a["flange_diameter"]/2
    rings = []
    # Each ring stores radii around the axis, Z and outgoing surface material.
    # 0 black, 1 machined. All bore/seat details are illustrative assumptions.
    count = shape["radial_segments"]
    def circle(radius, z, material=0):
        rings.append(([radius]*count, z, material))
    def flange(end, z, material=0, inset=0, scale=1, flat=False):
        rings.append(([(outline_radius(math.tau*j/count, end, flat)-inset)*scale
                       for j in range(count)], z, material))
    circle(ap-c, -h, 1)
    circle(ap, -h+c, 1)
    circle(ap, af-0.3, 1)
    circle(ap+0.3, af, 1)
    flange(a, af, 1, inset=edge)
    flange(a, af+edge)
    flange(a, ab-edge)
    flange(a, ab, inset=edge)
    circle(a["shoulder_diameter"]/2, ab)
    circle(a["shoulder_diameter"]/2, ab+1.2)
    circle(a["shoulder_diameter"]/2-0.4, ab+1.9)
    circle(neck, ab+2.8)
    circle(neck, ab+3.8)
    # Concave shoulder rolls into the straight tube; it is not a conical flange.
    for i in range(1, 9):
        u = i/8
        circle(r+(neck-r)*(1-u)**2, ab+3.8+a["transition_length"]*u)
    circle(r, bb-b["shoulder_length"])
    for i in range(1, 9):
        u = i/8
        z = bb-b["shoulder_length"]*(1-u)
        end_radius = [outline_radius(math.tau*j/count, b, True) for j in range(count)]
        # Sloping drill exits emerge through this black shoulder as in photos.
        rings.append(([r+(value-0.8-r)*u*u for value in end_radius], z, 0))
    flange(b, bb+0.8, flat=True)
    flange(b, bf-b["machined_rim_depth"], 1, flat=True)
    flange(b, bf-b["front_edge_chamfer"], 1, flat=True)
    flange(b, bf, 1, inset=b["front_edge_chamfer"], flat=True)
    circle(br+c, bf, 1)
    circle(br, bf-c, 1)
    circle(br, bf-b["end_bore_depth"], 1)
    circle(bore+c, bf-b["end_bore_depth"], 1)
    circle(bore, bf-b["end_bore_depth"]-c, 1)
    circle(bore, -h+a["end_bore_depth"]+c, 1)
    circle(bore+c, -h+a["end_bore_depth"], 1)
    circle(ar, -h+a["end_bore_depth"], 1)
    circle(ar, -h+c, 1)
    circle(ar+c, -h, 1)
    vertices, faces = [], []
    for radii, z, material in rings:
        for j in range(count):
            angle = math.tau*j/count
            radial = radii[j]
            vertices.append((radial*math.cos(angle)*MM_TO_BU,
                             radial*math.sin(angle)*MM_TO_BU, z*MM_TO_BU))
    for i in range(len(rings)):
        k = (i+1) % len(rings)
        for j in range(count):
            n = (j+1) % count
            faces.append((i*count+j, i*count+n, k*count+n, k*count+j))
    mesh = bpy.data.meshes.new(NAME+"_build_mesh")
    mesh["generator"] = OWNER
    mesh.from_pydata(vertices, [], faces)
    assert not mesh.validate(), "Invalid shell"
    for mat in materials:
        mesh.materials.append(mat)
    for poly in mesh.polygons:
        ring = poly.index // count
        poly.material_index = rings[ring][2]
        poly.use_smooth = rings[ring][1] != rings[(ring+1)%len(rings)][1]
    mesh.update()
    return mesh


def select_only(obj):
    for other in bpy.context.selected_objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def make_hole_cutter(sign, end, angle, materials):
    """Plain mounting hole with a real chamfer on its exposed mounting face."""
    p, shape = PARAMETERS["visual_mm"], PARAMETERS["shape"]
    face = sign*(p["length"]/2-end.get("pilot_height", 0))
    inner = face-sign*end["flange_thickness"]
    radius, c = end["hole_diameter"]/2, p["hole_mouth_chamfer"]
    if sign < 0:
        profile = [(radius+c, face-4), (radius+c, face),
                   (radius, face+c), (radius, inner+4)]
    else:
        profile = [(radius, inner-end["shoulder_length"]-2), (radius, face-c),
                   (radius+c, face), (radius+c, face+4)]
    count = shape["hole_segments"]
    centre = end["hole_circle_diameter"]/2
    vertices = [((centre*math.cos(angle)+r*math.cos(math.tau*j/count))*MM_TO_BU,
                 (centre*math.sin(angle)+r*math.sin(math.tau*j/count))*MM_TO_BU,
                 z*MM_TO_BU) for r,z in profile for j in range(count)]
    faces = [tuple(reversed(range(count)))]
    for i in range(len(profile)-1):
        for j in range(count):
            k = (j+1)%count
            faces.append((i*count+j, i*count+k, (i+1)*count+k, (i+1)*count+j))
    faces.append(tuple(range((len(profile)-1)*count, len(profile)*count)))
    mesh = bpy.data.meshes.new("_LBX_Shaft_Hole_Cutter")
    mesh.from_pydata(vertices, [], faces)
    for material in materials:
        mesh.materials.append(material)
    for poly in mesh.polygons:
        poly.use_smooth = 0 < poly.index < len(mesh.polygons)-1
        poly.material_index = 1
    return bpy.data.objects.new("_LBX_Shaft_Hole_Cutter", mesh)


def generate():
    if bpy.context.mode != "OBJECT":
        raise RuntimeError("Switch to Object Mode before generation")
    existing = bpy.data.objects.get(NAME)
    collection = bpy.data.collections.get(COLLECTION)
    if existing and existing.get("generator") != OWNER:
        raise RuntimeError("Unrelated object name collision")
    if collection and collection.get("generator") != OWNER:
        raise RuntimeError("Unrelated collection name collision")
    selected, active = list(bpy.context.selected_objects), bpy.context.view_layer.objects.active
    black = make_material("LBX_Shaft_Black_Metal", (0.018, 0.021, 0.023), 0.55, 0.42)
    machined = make_material("LBX_Shaft_Machined_Metal", (0.58, 0.60, 0.62), 0.85, 0.27)
    if collection is None:
        collection = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(collection)
        collection["generator"] = OWNER
        collection["review_only"] = True
        bounds = [o.matrix_world @ Vector(v) for o in bpy.context.scene.objects
                  if o.type == "MESH" for v in o.bound_box]
        collection["review_anchor_bu"] = [max((v.x for v in bounds), default=0)+100*MM_TO_BU, 0, 27*MM_TO_BU]
    cutters = bpy.data.collections.new("_LBX_Shaft_Temporary_Cutters")
    bpy.context.scene.collection.children.link(cutters)
    work = bpy.data.objects.new("_LBX_Shaft_Build", make_shell([black, machined]))
    collection.objects.link(work)
    p, shape = PARAMETERS["visual_mm"], PARAMETERS["shape"]
    try:
        for sign, end in [(-1, PARAMETERS["end_a_mm"]), (1, PARAMETERS["end_b_mm"])]:
            for i in range(shape["holes_per_end"]):
                angle = math.tau*i/shape["holes_per_end"]+math.radians(shape["phase_degrees"])
                cutter = make_hole_cutter(sign, end, angle, [black, machined])
                cutters.objects.link(cutter)
        select_only(work)
        holes = work.modifiers.new("Six open holes per flange", "BOOLEAN")
        holes.operand_type = "COLLECTION"
        holes.collection = cutters
        holes.operation = "DIFFERENCE"
        holes.solver = "EXACT"
        bpy.ops.object.modifier_apply(modifier=holes.name)
        # Mark hard joins without faceting the curved body and scallops.
        bm = bmesh.new()
        bm.from_mesh(work.data)
        # Exact booleans can leave coincident seam vertices. Weld only numerical
        # duplicates in this newly generated mesh before evaluating edge bevels.
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001*MM_TO_BU)
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=0.000001*MM_TO_BU)
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.1),
                                use_dissolve_boundaries=True,
                                verts=list(bm.verts), edges=list(bm.edges),
                                delimit={"MATERIAL"})
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        assert all(e.is_manifold for e in bm.edges), "Shell/holes are not manifold"
        assert all(e.calc_length() > 0.000001*MM_TO_BU for e in bm.edges)
        for edge in bm.edges:
            edge.smooth = edge.calc_face_angle() < math.radians(40)
        bm.to_mesh(work.data)
        bm.free()
        work.data.update()
        final = existing or bpy.data.objects.new(NAME, work.data)
        if existing:
            old = final.data
            final.data = work.data
            for modifier in list(final.modifiers):
                if modifier.name in {"Small edge bevels", "Surface normals"}:
                    final.modifiers.remove(modifier)
            if old.users == 0 and old.get("generator") == OWNER:
                bpy.data.meshes.remove(old)
        else:
            collection.objects.link(final)
            final.location = collection["review_anchor_bu"]
            final.rotation_euler = (0, math.pi/2, 0)
            final["objectId"] = str(uuid.uuid5(uuid.NAMESPACE_URL, OWNER+"/"+NAME))
        final.data.name = NAME+"_mesh"
        final.data["generator"] = OWNER
        # Chamfers are explicit profile geometry, avoiding global bevel clamping
        # around the short intersection edges left by mounting-hole booleans.
        normals = final.modifiers.new("Surface normals", "WEIGHTED_NORMAL")
        normals.keep_sharp = True
        normals.weight = 30
        final["generator"] = OWNER
        final["parameters_mm"] = json.dumps(PARAMETERS, sort_keys=True)
        final["source_references"] = json.dumps(SOURCES)
        final["revision"] = 2
        final["accuracy"] = "Exterior follows photos 1–3, selected by the user as their stock shaft. Catalog overall length and maximum flange diameter are retained; detailed proportions and hole/seat dimensions are photo-derived assumptions, not measured OEM specifications."
        final["bore_note"] = "Illustrative open bore and end counterbores. Seat depths and internal profile require measurement. No bearings/seals, threads or retaining grooves included."
        final["placement"] = "Separate review area; not an assembled location"
        final["axis_and_origin"] = "Local Z along shaft; origin at axial midpoint; end A=-Z, end B=+Z"
        final["mm_to_blender_units"] = MM_TO_BU
        bpy.context.view_layer.update()
        return final.name
    finally:
        for obj in list(cutters.objects):
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        bpy.data.collections.remove(cutters)
        mesh = work.data
        bpy.data.objects.remove(work, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
        for obj in bpy.context.selected_objects:
            obj.select_set(False)
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = active


if __name__ == "__main__":
    print("Generated:", generate())
