"""Editable LBX hardware, all lengths in mm. Run in Blender's Text Editor.

Edit PARTS below and rerun. Only this generator's named objects are rebuilt;
existing transforms and objectIds survive. No unrelated objects are removed.
The saved bike uses 1 BU/mm despite its Metric/1.0 unit display. Match that
geometry convention explicitly; never derive this conversion from the display.
This script neither saves files nor exports, and never installs an assembly.
"""
import json
import math
import uuid

import bpy

MM_TO_BU = 1.0
COLLECTION = "LBX_Jackshaft_Hardware"
OWNER = "lbx-jackshaft-hardware-v1"
TIMKEN = "https://cad.timken.com/item/deep-groove-ball-bearings/deep-groove-ball-bearings--6000--6200--6300--64/6000-2rs"
DMX = "https://dmxbikes.at/product/antriebssystem/"
CATALOG = "reference/parts-catalogue/Sur-Ron-Spare-Parts.pdf"
DIAGRAMS = "reference/parts-catalogue/sur-ron-light-bee-parts-diagrams.pdf"
SUPPLEMENT = "reference/parts-catalogue/katalog-zapchastej-surron-light-bee-2021.pdf"

# nominal_mm: reference-stated values. envelope_mm: catalog bounding envelopes.
# visual_mm: PROVISIONAL values, never claimed as OEM measurements.
# No personal caliper measurements were supplied or found for these parts.
PARTS = {
    "bearing": dict(
        name="bearing_6000_2rs", kind="bearing", count=1, segments=64,
        nominal_mm=dict(bore=10, outside=26, width=8),
        visual_mm=dict(inner_band_outside=14.8, outer_band_inside=22.4,
                       bevel=0.18, seal_recess=0.22, seal_transition=0.10),
        sources=[TIMKEN, CATALOG + " p23 item 15_08 (2Z, not 2RS)"],
        reference_part="Z-6000-2Z-26-10-08",
        note="Requested 6000-2RS visual master. Catalog's 2Z designation is unchanged. Ring bands and seal recess illustrative; installed quantity undecided.",
        position=(-75, 30, 4), rotation=(0, 0, 0)),
    "washer": dict(
        name="washer_pivot_10x20x2", kind="tube", count=1, segments=64,
        nominal_mm=dict(bore=10, outside=20, width=2),
        visual_mm=dict(bevel=0.08), reference_part="B4-001-10-F1",
        sources=[CATALOG + " p1 Illustration 01 item 1_08",
                 DIAGRAMS + " p1 Figure 01 item 1_08"],
        note="Specific pivot washer; no washers added beneath the twelve bolts.",
        position=(-35, 30, 1), rotation=(0, 0, 0)),
    "centre_spacer": dict(
        name="spacer_jackshaft_centre_61282", kind="tube", count=1, segments=48,
        envelope_mm=[15, 15, 81], nominal_mm={},
        visual_mm=dict(outside=15, width=81, bore=10, bevel=0.25),
        reference_part="61282-YQ2A-0000",
        sources=[CATALOG + " p23 item 15_01", SUPPLEMENT + " p15 item 17_08"],
        note="PROVISIONAL straight internal spacer: envelope interpreted as OD15 x L81; bore10 ASSUMED. Measure bore and end/profile details. Not the rotating jackshaft body.",
        position=(35, 30, 7.5), rotation=(0, 90, 0)),
    "right_spacer": dict(
        name="spacer_jackshaft_right_61234", kind="tube", count=1, segments=48,
        envelope_mm=[15, 15, 17], nominal_mm={},
        visual_mm=dict(outside=15, width=17, bore=10, bevel=0.20),
        reference_part="61234-YQ2A-0000",
        sources=[CATALOG + " p23 item 15_04", SUPPLEMENT + " p15 item 17_02"],
        note="PROVISIONAL straight spacer: envelope interpreted as OD15 x L17; bore10 ASSUMED. Shoulders, recesses and bore unverified.",
        position=(-75, -15, 7.5), rotation=(0, 90, 0)),
    "left_spacer": dict(
        name="spacer_jackshaft_left_61233", kind="tube", count=1, segments=48,
        envelope_mm=[15, 15, 12], nominal_mm={},
        visual_mm=dict(outside=15, width=12, bore=10, bevel=0.20),
        reference_part="61233-YQ2A-0000",
        sources=[CATALOG + " p23 item 15_07", SUPPLEMENT + " p15 item 17_12"],
        note="PROVISIONAL straight spacer: envelope interpreted as OD15 x L12; bore10 ASSUMED. Shoulders, recesses and bore unverified.",
        position=(-40, -15, 7.5), rotation=(0, 90, 0)),
    "right_seal": dict(
        name="seal_jackshaft_right_15x24x7", kind="seal", count=1, segments=64,
        nominal_mm=dict(bore=15, outside=24, width=7),
        visual_mm=dict(bevel=0.18, outer_rim=0.75, lip_band=0.65,
                       face_recess=0.65, lip_drop=0.20),
        reference_part="B7-001-15-24-7",
        sources=[CATALOG + " p23 item 15_05", SUPPLEMENT + " p15 item 17_04"],
        note="Nominal envelope; recessed face and sealing lip illustrative, not a manufacturing cross-section. No spring or reinforcement.",
        position=(0, -15, 3.5), rotation=(0, 0, 0)),
    "left_seal": dict(
        name="seal_jackshaft_left_15x26x6", kind="seal", count=1, segments=64,
        nominal_mm=dict(bore=15, outside=26, width=6),
        visual_mm=dict(bevel=0.18, outer_rim=0.75, lip_band=0.65,
                       face_recess=0.65, lip_drop=0.20),
        reference_part="B7-001-15-26-6",
        sources=[CATALOG + " p24 item 15_13", SUPPLEMENT + " p15 item 17_10"],
        note="Nominal envelope; recessed face and sealing lip illustrative, not a manufacturing cross-section. Separate from bearing seals.",
        position=(40, -15, 3), rotation=(0, 0, 0)),
    "sprocket_bolts": dict(
        name="bolt_sprocket_m6x25", kind="flanged_socket_bolt", count=6, segments=48,
        nominal_mm=dict(shaft=6, length=25),
        visual_mm=dict(head_diameter=10.0, head_height=6.0,
                       socket_across_flats=5.0, socket_depth=3.0,
                       socket_chamfer=0.15, flange_diameter=13.0,
                       flange_thickness=1.2, head_chamfer=0.25,
                       flange_chamfer=0.15, tip_chamfer=0.30),
        reference_part="B3-003-06-025-F3",
        sources=[CATALOG + " p23 item 15_02", SUPPLEMENT + " p15 item 17_03", DMX],
        user_observations=["User corrected M6x25 bolts to Allen/socket drive, not external hex."],
        note="Allen drive per USER CORRECTION. Socket-cap profile and ALL head/recess dimensions PROVISIONAL. Retains integral flange from earlier replacement reference, pending actual-part photo. DMX lists external hex/flange/AF10: conflicting head-style evidence, NOT this model's specification. Head height excludes flange (total 7.2). Length 25 from seating plane; plain shaft, thread extent unverified.",
        position=(-75, -60, 6.5), rotation=(-90, 0, 0)),
    "pulley_bolts": dict(
        name="bolt_pulley_m6x16", kind="socket_bolt", count=6, segments=48,
        nominal_mm=dict(shaft=6, length=16),
        visual_mm=dict(head_diameter=10.0, head_height=6.0,
                       socket_across_flats=5.0, socket_depth=3.0,
                       socket_chamfer=0.15, head_chamfer=0.25,
                       seat_chamfer=0.15, tip_chamfer=0.30),
        reference_part="B3-001-06-016-F0",
        sources=[CATALOG + " p23 item 15_10", SUPPLEMENT + " p15 item 17_13"],
        note="PROVISIONAL socket-cap head AND dimensions; no clear reference photo found. Need front/side head photos and dimensions. Length16 from seating plane; plain shaft, thread extent unverified. No strength marking or washer.",
        position=(-75, -105, 5), rotation=(-90, 0, 0)),
}


def material(name, color, metallic, roughness):
    mat = bpy.data.materials.get(name)
    if mat:
        if mat.get("generator") != OWNER:
            raise RuntimeError("Unrelated material name collision: " + name)
        return mat
    mat = bpy.data.materials.new(name)
    mat["generator"] = OWNER
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def lathe(name, profile, segments, materials, rubber_segments=()):
    """Sweep an ordered (radius, Z, circle/hex) boundary. Hex radius=apothem.

    Positive orientation travels up the outside wall. Radius0 ends form fans,
    not collapsed quads. Sharp profile joins keep faces flat and cylinders clean.
    """
    vertices, rings, faces, smooth, slots = [], [], [], [], []
    for radius, z, shape in profile:
        ring = []
        for j in range(segments if radius else 1):
            theta = j * math.tau / segments
            r = radius
            if shape == "hex":
                r /= math.cos(theta % (math.pi / 3) - math.pi / 6)
            ring.append(len(vertices))
            vertices.append((r * math.cos(theta) * MM_TO_BU,
                             r * math.sin(theta) * MM_TO_BU, z * MM_TO_BU))
        rings.append(ring)
    for i, ring in enumerate(rings):
        k = (i + 1) % len(rings)
        other = rings[k]
        if len(ring) == len(other) == 1:
            continue
        curved = (profile[i][1] != profile[k][1] and
                  not (profile[i][2] == profile[k][2] == "hex"))
        for j in range(segments):
            n = (j + 1) % segments
            if len(ring) == 1:
                face = (ring[0], other[n], other[j])
            elif len(other) == 1:
                face = (ring[j], ring[n], other[0])
            else:
                face = (ring[j], ring[n], other[n], other[j])
            faces.append(face)
            smooth.append(curved)
            slots.append(1 if i in rubber_segments else 0)
    mesh = bpy.data.meshes.new(name)
    mesh["generator"] = OWNER
    mesh.from_pydata(vertices, [], faces)
    if mesh.validate():
        raise RuntimeError("Invalid generated mesh: " + name)
    for mat in materials:
        mesh.materials.append(mat)
    for face, curved, slot in zip(mesh.polygons, smooth, slots):
        face.use_smooth = curved
        face.material_index = slot
    ring_index = {v: i for i, ring in enumerate(rings) for v in ring}
    for edge in mesh.edges:
        a, b = edge.vertices
        edge.use_edge_sharp = ring_index[a] == ring_index[b]
    mesh.update()
    return mesh


def section(part):
    """Return a meridian in mm and material boundaries; no hidden internals."""
    p = part["nominal_mm"] | part["visual_mm"]
    kind = part["kind"]
    rubber = ()
    if kind in {"tube", "bearing", "seal"}:
        r, R, h, c = p["bore"] / 2, p["outside"] / 2, p["width"] / 2, p["bevel"]
        assert 0 < c < min(h, (R - r) / 2)
    if kind == "tube":
        points = [(R, -h+c), (R, h-c), (R-c, h), (r+c, h),
                  (r, h-c), (r, -h+c), (r+c, -h), (R-c, -h)]
    elif kind == "bearing":
        a, b = p["inner_band_outside"]/2, p["outer_band_inside"]/2
        d, t = p["seal_recess"], p["seal_transition"]
        points = [(R, -h+c), (R, h-c), (R-c, h), (b, h),
                  (b-t, h-d), (a+t, h-d), (a, h), (r+c, h),
                  (r, h-c), (r, -h+c), (r+c, -h), (a, -h),
                  (a+t, -h+d), (b-t, -h+d), (b, -h), (R-c, -h)]
        rubber = (3, 4, 5, 11, 12, 13)
    elif kind == "seal":
        a, b = r + p["lip_band"], R - p["outer_rim"]
        d, lip = p["face_recess"], p["lip_drop"]
        points = [(R, -h+c), (R, h-c), (R-c, h), (b, h),
                  (b-c, h-d), (a+c, h-d), (a, h-lip),
                  (r+c, h-lip), (r, h-lip-c), (r, -h+c),
                  (r+c, -h), (R-c, -h)]
    else:
        r, L, tip = p["shaft"]/2, p["length"], p["tip_chamfer"]
        H, c = p["head_height"], p["head_chamfer"]
        R, a = p["head_diameter"]/2, p["socket_across_flats"]/2
        d, s = p["socket_depth"], p["socket_chamfer"]
        assert s < d < H and a / math.cos(math.pi/6) + s < R-c
        t = p.get("flange_thickness", 0)
        head = [(0, -H-t+d, "circle"), (a, -H-t+d, "hex"),
                (a, -H-t+s, "hex"), (a+s, -H-t, "hex"),
                (R-c, -H-t, "circle"), (R, -H-t+c, "circle")]
        if t:
            F, f = p["flange_diameter"]/2, p["flange_chamfer"]
            head += [(R, -t, "circle"), (F-f, -t, "circle"),
                     (F, -t+f, "circle"), (F, -f, "circle"),
                     (F-f, 0, "circle")]
        else:
            f = p["seat_chamfer"]
            head += [(R, -f, "circle"), (R-f, 0, "circle")]
        return head + [(r, 0, "circle"), (r, L-tip, "circle"),
                       (r-tip, L, "circle"), (0, L, "circle")], rubber
    return [(radius, z, "circle") for radius, z in points], rubber


def object_names(part):
    return ([part["name"]] if part["count"] == 1 else
            [part["name"] + f"_{i:02d}" for i in range(1, part["count"]+1)])


def generate(keys=None):
    """Optional keys allow staged inspection: bearing, washer, spacers, etc."""
    keys = tuple(keys) if keys is not None else tuple(PARTS)
    if bpy.context.mode != "OBJECT":
        raise RuntimeError("Switch to Object Mode before generation")
    collection = bpy.data.collections.get(COLLECTION)
    if collection and collection.get("generator") != OWNER:
        raise RuntimeError("Requested collection already contains unrelated work")
    for key in keys:
        for name in object_names(PARTS[key]):
            existing = bpy.data.objects.get(name)
            if existing and existing.get("generator") != OWNER:
                raise RuntimeError("Unrelated object name collision: " + name)
    if collection is None:
        collection = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(collection)
        collection["generator"] = OWNER
        collection["mm_to_blender_units"] = MM_TO_BU
        collection["review_layout_only"] = True
        collection["scale_note"] = "1 BU per mm matches saved bike geometry; original unit display remains unchanged."
        # In an occupied scene, place the review group beyond unrelated bounds.
        from mathutils import Vector
        bounds = [o.matrix_world @ Vector(v) for o in bpy.context.scene.objects
                  if o.type == "MESH" for v in o.bound_box]
        collection["review_anchor_bu"] = [max(v.x for v in bounds)+160*MM_TO_BU, 0, 0] if bounds else [0, 0, 0]
    if collection["mm_to_blender_units"] != MM_TO_BU:
        raise RuntimeError("Conversion differs from this batch; reconcile scale explicitly")
    steel = material("LBX_HW_Steel", (0.42, 0.46, 0.50), 0.85, 0.28)
    rubber = material("LBX_HW_Rubber", (0.016, 0.019, 0.024), 0.0, 0.58)
    output = []
    for key in keys:
        part = PARTS[key]
        profile, rubber_faces = section(part)
        mats = [rubber] if part["kind"] == "seal" else [steel]
        if part["kind"] == "bearing":
            mats.append(rubber)
        mesh_name = part["name"] + "_mesh"
        mesh = lathe(mesh_name, profile, part["segments"], mats, rubber_faces)
        previous = set()
        for i, name in enumerate(object_names(part)):
            obj = bpy.data.objects.get(name)
            if obj is None:
                obj = bpy.data.objects.new(name, mesh)
                collection.objects.link(obj)
                pos = list(part["position"])
                pos[0] += i * 26  # Review grid spacing only, never a bolt circle.
                obj.location = [x*MM_TO_BU+a for x, a in zip(pos, collection["review_anchor_bu"])]
                obj.rotation_euler = [math.radians(a) for a in part["rotation"]]
                obj["objectId"] = str(uuid.uuid5(uuid.NAMESPACE_URL, OWNER+"/"+name))
            else:
                previous.add(obj.data)
                obj.data = mesh
            obj["generator"] = OWNER
            obj["part_key"] = key
            obj["reference_part_number"] = part["reference_part"]
            obj["reference_dimensions_mm"] = json.dumps(part["nominal_mm"], sort_keys=True)
            obj["catalog_envelope_mm"] = json.dumps(part.get("envelope_mm"))
            obj["personal_measurements_mm"] = "NONE supplied or found"
            obj["user_observations"] = json.dumps(part.get("user_observations", []))
            obj["provisional_visual_parameters_mm"] = json.dumps(part["visual_mm"], sort_keys=True)
            obj["source_references"] = json.dumps(part["sources"])
            obj["accuracy_note"] = part["note"]
            obj["placement"] = "REVIEW ONLY; no assembly stack or bolt circle inferred"
            obj["local_axis"] = "Z; bolt shaft extends positive Z" if "bolt" in part["kind"] else "Z; origin at mid-width on bore axis"
            obj["mm_to_blender_units"] = MM_TO_BU
            output.append(obj.name)
        for old in previous:
            if old.users == 0 and old.get("generator") == OWNER:
                bpy.data.meshes.remove(old)
        mesh.name = mesh_name
    bpy.context.view_layer.update()
    return output


if __name__ == "__main__":
    print("Generated:", generate())
