"""Generate the sourced hardware batch in the open Blender assembly.

Run generate(repository_path) in Blender. Only this generator's objects are
rebuilt. Mounts use the bike's existing 1 BU/mm convention, not scene units.
Export is explicit: export(repository_path, staging_path). Unplaced suspension
masters stay in a hidden collection and are never included in the portal set.
"""
import hashlib
import json
import math
from pathlib import Path
import uuid

import bpy
from mathutils import Vector

OWNER = "lbx-mounted-hardware-v1"


def load(root):
    return json.loads((Path(root) / "data/models/mounted-hardware.json").read_text())


def collection(name, hidden=False):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    coll.hide_viewport = hidden
    coll.hide_render = hidden
    return coll


def screw_mesh(name, spec, material):
    """Closed mesh with a real hex recess; nominal, unthreaded shaft."""
    r, length = spec["diameterMm"] / 2, spec["lengthMm"]
    R, h = spec["headDiameterMm"] / 2, spec["headHeightMm"]
    a, depth = spec["allenKeyMm"] / 2, spec["visualSocketDepthMm"]
    bevel = 0.15
    profile = [(0, -h + depth, "circle"), (a, -h + depth, "hex"),
               (a, -h + bevel, "hex"), (a + bevel, -h, "hex")]
    if spec["headType"] == "Socket cap":
        profile += [(R - 0.3, -h, "circle"), (R, -h + 0.3, "circle"),
                    (R, -0.15, "circle"), (R - 0.15, 0, "circle")]
    else:
        # Smooth domed silhouette constrained by the published head envelope.
        top = a / math.cos(math.pi / 6) + 0.45
        profile.append((top, -h, "circle"))
        for i in range(1, 9):
            t = i * math.pi / 16
            profile.append((top + (R - top) * math.sin(t),
                            -h + (h - 0.18) * (1 - math.cos(t)), "circle"))
        profile += [(R, -0.08, "circle"), (R - 0.08, 0, "circle")]
    profile += [(r, 0, "circle"), (r, length - 0.3, "circle"),
                (r - 0.3, length, "circle"), (0, length, "circle")]
    vertices, rings, faces, smooth = [], [], [], []
    segments = 72  # Divisible by six: exact straight socket flats.
    for radius, z, shape in profile:
        ring = []
        for j in range(1 if radius == 0 else segments):
            theta = j * math.tau / segments
            rr = radius / math.cos(theta % (math.pi / 3) - math.pi / 6) if shape == "hex" else radius
            ring.append(len(vertices))
            vertices.append((rr * math.cos(theta), rr * math.sin(theta), z))
        rings.append(ring)
    for i in range(len(rings) - 1):
        ring, other = rings[i:i+2]
        curved = profile[i][1] != profile[i+1][1] and not (profile[i][2] == profile[i+1][2] == "hex")
        for j in range(segments):
            k = (j + 1) % segments
            faces.append((ring[0], other[k], other[j]) if len(ring) == 1 else
                         (ring[j], ring[k], other[0]) if len(other) == 1 else
                         (ring[j], ring[k], other[k], other[j]))
            smooth.append(curved)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    assert not mesh.validate(), name
    mesh.materials.append(material)
    for face, curved in zip(mesh.polygons, smooth):
        face.use_smooth = curved
    ring_index = {v: i for i, ring in enumerate(rings) for v in ring}
    for edge in mesh.edges:
        edge.use_edge_sharp = ring_index[edge.vertices[0]] == ring_index[edge.vertices[1]]
    mesh.update()
    mesh["generator"] = OWNER
    return mesh


def generate(root):
    data = load(root)
    assert data["mmToBlenderUnit"] == 1
    material = bpy.data.materials.get(data["finish"])
    if material is None:
        material = bpy.data.materials.new(data["finish"])
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (0.55, 0.57, 0.60, 1)
        bsdf.inputs["Metallic"].default_value = 1
        bsdf.inputs["Roughness"].default_value = 0.3
    mounted = collection("LBX_Mounted_Hardware")
    unplaced = collection("LBX_Unplaced_Suspension_Bolts", hidden=True)
    for entry in data["instances"] + data["unplaced"]:
        name = entry["name"]
        existing = bpy.data.objects.get(name)
        if existing:
            if existing.get("generator") != OWNER:
                raise RuntimeError("Name belongs to another object: " + name)
            old_mesh = existing.data
            bpy.data.objects.remove(existing, do_unlink=True)
            if old_mesh.users == 0:
                bpy.data.meshes.remove(old_mesh)
        spec = data["specs"][entry["spec"]]
        mesh = screw_mesh(name, spec, material)
        obj = bpy.data.objects.new(name, mesh)
        installed = "seatMm" in entry
        (mounted if installed else unplaced).objects.link(obj)
        if installed:
            if not bpy.data.objects.get(entry["mountObject"]):
                raise RuntimeError("Missing mounting reference: " + entry["mountObject"])
            obj.location = entry["seatMm"]
            obj.rotation_mode = "QUATERNION"
            obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(entry["shaftDirection"]))
        else:
            # Masters are exported at origin; this collection is hidden.
            obj.location = (0, 0, 0)
        obj["generator"] = OWNER
        obj["objectId"] = str(uuid.uuid5(uuid.NAMESPACE_URL, OWNER + "/" + entry["id"]))
        obj["part_id"] = entry["id"]
        obj["oem_number"] = spec["oemNumber"]
        obj["allen_key_mm"] = spec["allenKeyMm"]
        obj["dimensions_json"] = json.dumps(spec)
        obj["geometry_notes"] = data["geometryNotes"]
        obj["placement"] = "Fitted to supplied mounting mesh" if installed else "UNPLACED: " + entry["reason"]
    bpy.context.view_layer.update()
    return {"mounted": len(data["instances"]), "unplacedMasters": len(data["unplaced"])}


def export(root, staging):
    root, staging = Path(root), Path(staging)
    data = load(root)
    staging.mkdir(parents=True, exist_ok=True)
    selected = list(bpy.context.selected_objects)
    active = bpy.context.view_layer.objects.active
    unplaced = bpy.data.collections["LBX_Unplaced_Suspension_Bolts"]
    unplaced.hide_viewport = False
    entries = []
    try:
        for entry in data["instances"] + data["unplaced"]:
            obj = bpy.data.objects[entry["name"]]
            installed = "seatMm" in entry
            destination = staging if installed else root / "reference/models/lbx-mounted-hardware/unplaced"
            destination.mkdir(parents=True, exist_ok=True)
            path = destination / (entry["name"] + ".glb")
            for other in bpy.context.selected_objects:
                other.select_set(False)
            obj.hide_set(False)
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                                      export_yup=True, export_extras=True, export_materials="EXPORT",
                                      export_animations=False, export_cameras=False, export_lights=False)
            obj.data.calc_loop_triangles()
            world = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
            record = dict(id=entry["id"], name=entry["name"], file=path.name,
                          role=entry.get("role"), sourceObject=obj.name,
                          sourceBlend="reference/models/lbx-mounted-hardware/lbx-mounted-hardware.blend",
                          hardwareSpec=entry["spec"], triangles=len(obj.data.loop_triangles),
                          bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                          materials=[data["finish"]],
                          sourceWorldBounds=[[min(v[i] for v in world) for i in range(3)],
                                             [max(v[i] for v in world) for i in range(3)]])
            if installed:
                entries.append(record)
        (staging / "hardware-manifest.json").write_text(json.dumps(entries, indent=2) + "\n")
    finally:
        for obj in bpy.context.selected_objects:
            obj.select_set(False)
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = active
        unplaced.hide_viewport = True
    return {"mountedExports": len(entries), "unplacedExports": len(data["unplaced"])}
