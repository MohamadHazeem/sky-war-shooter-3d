"""
convert_ac.py -- FlightGear AC3D aircraft -> web-ready glTF binary (.glb)
=========================================================================

Blender (5.x) script.  Run headless:

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        --python tools/convert_models/convert_ac.py -- \
        <input.ac|model.xml> <output.glb> [options]

Input
  * an AC3D file (.ac), or
  * a FlightGear model XML (e.g. Models/b17.xml).  The XML's <path> .ac is
    loaded and its <model> sub-models (engines, turrets, guns, canopy, pilots
    ...) are followed recursively and placed with their <offsets>
    (x/y/z-m, roll/pitch/heading-deg).  "Aircraft/<dir>/..." paths are
    resolved against --fg-root (the folder that contains the aircraft dirs).

Options
  --config FILE      JSON with per-aircraft rules (see configs/*.json). Keys:
                       submodels.include/exclude  regexes on sub-model paths (relative to aircraft root)
                       exclude_objects            regexes (full match) on object keys "<instance>/<object>"
                       texture_files              {ac texture basename: replacement path}
                       texture_objects            [{objects:[re], texture:path}]  (FG livery/material anims)
                       glass_objects              regexes on object keys whose materials become glass
                                                  (for models whose glass is opaque in the .ac, set by FG effects)
                       opaque_textures            texture basenames whose alpha channel is ignored
                       max_texture                max texture edge for this model (never above --max-texture)
                       texture_max                {texture basename: max edge in px} per-texture limit
                       texture_edits              [{file, ref_size, fill_rects:[{rect:[x0,y0,x1,y1], color?}]}]
                       rotations                  static rotate "animations" [{objects, center, axis, angle,
                                                  instance?}] applied in list order (innermost joint first)
                       translations               [{objects, offset}]
                       nodes                      separate pivot nodes: props ({axis:[rear, front]} -> local +Z
                                                  along the spin axis) or turrets/guns ({pivot}), optional parent
                       groups                     static merge groups (glass, crew, interior...); the rest -> "airframe"
                       atlas                      {groups:[...], size, max_tile} pack textures of these groups
                                                  into atlases (fewer draw calls)
                       markers                    named empty nodes: [x,y,z] | {fg, parent} | {instance, local, parent}
                       origin                     [x,y,z] FG coords, or {"auto": {wing, fuselage, station, chord_frac}}
                       scale, decimate {re: ratio}, materials {roughness, metallic, glass, by_texture},
                       extra_models, preview_shots, preview_extra_glbs, preview_hide
                     Paths inside the config are relative to the aircraft root.
  --aircraft-root DIR  default: parent of the input's Models/ dir
  --fg-root DIR      folder holding FlightGear aircraft dirs (default: aircraft-root/..)
  --max-texture N    max texture edge in px (default 2048)
  --jpeg-quality N   JPEG quality for opaque textures (default 85)
  --preview PNG      render previews of the exported .glb (re-imported, EEVEE)
  --preview-views    comma list: 34,34r,top,bottom,front,side,rear and names from preview_shots
  --report JSON      write node / marker positions, bboxes, triangle counts (glTF frame)
  --list             print the object keys found (after exclusions) and exit

Coordinate frames
  AC3D file:         x aft, y up, z left   (FlightGear convention for .ac)
  FlightGear XML:    x aft, y right, z up  (= AC (x, -z, y))  <- config coords
  Output glTF:       +Z forward (nose), +Y up, +X = aircraft LEFT wing, meters.
  (Blender scene during conversion: X left, Y aft, Z up; the glTF exporter
   with +Y up turns that into the glTF frame above.)

Everything is plain data parsing -- nothing from the aircraft packages
(Nasal, shaders, effects) is executed.
"""
import json
import math
import os
import re
import sys
import tempfile
import xml.etree.ElementTree as ET

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True  # keep the repo free of __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ac3d import parse_ac  # noqa: E402


# --------------------------------------------------------------------------
# helpers: frames
# --------------------------------------------------------------------------
# AC (x aft, y up, z left)  ->  FG (x aft, y right, z up)
AC_TO_FG = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
# FG -> Blender working frame (X left, Y aft, Z up)
FG_TO_BL = Matrix(((0, -1, 0, 0), (1, 0, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
BL_TO_FG = FG_TO_BL.inverted()


def fg_to_bl(p):
    return (FG_TO_BL @ Vector((p[0], p[1], p[2], 1.0))).xyz


def bl_to_gltf(v):
    # exporter (+Y up): glTF = (x, z, -y)
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def rot_axis_angle(axis, deg):
    return Matrix.Rotation(math.radians(deg), 4, Vector(axis).normalized())


def offsets_matrix(off):
    """FlightGear <offsets>: translate * Rz(heading) * Ry(pitch) * Rx(roll)."""
    if off is None:
        return Matrix.Identity(4)
    t = Matrix.Translation((off.get("x-m", 0.0), off.get("y-m", 0.0), off.get("z-m", 0.0)))
    r = (rot_axis_angle((0, 0, 1), off.get("heading-deg", 0.0))
         @ rot_axis_angle((0, 1, 0), off.get("pitch-deg", 0.0))
         @ rot_axis_angle((1, 0, 0), off.get("roll-deg", 0.0)))
    return t @ r


def log(*a):
    print("[convert_ac]", *a, flush=True)


# --------------------------------------------------------------------------
# arguments
# --------------------------------------------------------------------------
def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    import argparse
    ap = argparse.ArgumentParser(prog="convert_ac.py")
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--config")
    ap.add_argument("--fg-root")
    ap.add_argument("--aircraft-root")
    ap.add_argument("--max-texture", type=int, default=2048)
    ap.add_argument("--jpeg-quality", type=int, default=85)
    ap.add_argument("--preview")
    ap.add_argument("--preview-views", default="34")
    ap.add_argument("--preview-size", type=int, default=1000)
    ap.add_argument("--report")
    ap.add_argument("--list", action="store_true", help="print object keys (after exclusions) and exit")
    return ap.parse_args(argv)


# --------------------------------------------------------------------------
# model loading (XML + AC)
# --------------------------------------------------------------------------
class Part:
    """One AC object placed in the FG frame."""

    def __init__(self, key, ac_obj, mats, matrix_fg, ac_dir):
        self.key = key            # "<instance>/<object name>"
        self.obj = ac_obj
        self.mats = mats
        self.matrix_fg = matrix_fg  # AC object world (incl. AC hierarchy) -> FG
        self.ac_dir = ac_dir
        self.texture_override = None
        self.force_glass = False


class Loader:
    def __init__(self, cfg, aircraft_root, fg_root):
        self.cfg = cfg
        self.aircraft_root = aircraft_root
        self.fg_root = fg_root
        self.parts = []
        self.instance_names = {}
        self.instances = {}  # label -> FG matrix of that model instance
        sm = cfg.get("submodels", {})
        self.sub_inc = [re.compile(p) for p in sm.get("include", [".*"])]
        self.sub_exc = [re.compile(p) for p in sm.get("exclude", [])]

    def resolve(self, path, base_dir):
        path = path.strip()
        if path.startswith("Aircraft/"):
            p = os.path.join(self.fg_root, path[len("Aircraft/"):])
        else:
            p = os.path.join(base_dir, path)
        return os.path.normpath(p)

    def rel(self, p):
        return os.path.relpath(p, self.aircraft_root)

    def unique_label(self, label):
        n = self.instance_names.get(label, 0)
        self.instance_names[label] = n + 1
        return label if n == 0 else "%s#%d" % (label, n)

    def load(self, path, matrix=None, label="main"):
        matrix = matrix if matrix is not None else Matrix.Identity(4)
        if path.lower().endswith(".xml"):
            self.load_xml(path, matrix, label)
        else:
            self.load_ac(path, matrix, label)

    def load_ac(self, path, matrix, label):
        if not os.path.isfile(path):
            log("WARN missing ac", path)
            return
        mats, roots = parse_ac(path)
        ac_dir = os.path.dirname(path)
        self.instances.setdefault(label, matrix)

        def walk(o, parent_m):
            local = Matrix.Translation(o.loc)
            if o.rot:
                R = o.rot
                local = local @ Matrix(((R[0], R[3], R[6], 0), (R[1], R[4], R[7], 0),
                                        (R[2], R[5], R[8], 0), (0, 0, 0, 1)))
            m = parent_m @ local
            if o.surfs and o.verts:
                self.parts.append(Part("%s/%s" % (label, o.name), o, mats,
                                       matrix @ AC_TO_FG @ m, ac_dir))
            for k in o.kids:
                walk(k, m)

        for r in roots:
            walk(r, Matrix.Identity(4))
        log("loaded", self.rel(path), "as", label)

    def load_xml(self, path, matrix, label):
        try:
            tree = ET.parse(path)
        except Exception as e:  # malformed XML in the wild
            log("WARN cannot parse", path, e)
            return
        root = tree.getroot()
        base = os.path.dirname(path)
        top_off = self.read_offsets(root.find("offsets"))
        m_self = matrix @ offsets_matrix(top_off)
        self.instances[label] = m_self
        p = root.find("path")
        if p is not None and p.text:
            self.load_ac(self.resolve(p.text, base), m_self, label)
        for sub in root.findall("model"):
            sp = sub.find("path")
            if sp is None or not sp.text:
                continue
            full = self.resolve(sp.text, base)
            rel = self.rel(full)
            if not any(r.search(rel) for r in self.sub_inc) or any(r.search(rel) for r in self.sub_exc):
                continue
            if not os.path.isfile(full):
                log("WARN missing sub-model", rel)
                continue
            name_el = sub.find("name")
            lbl = name_el.text.strip() if name_el is not None and name_el.text else \
                os.path.splitext(os.path.basename(full))[0]
            lbl = self.unique_label(lbl)
            off = self.read_offsets(sub.find("offsets"))
            self.load(full, matrix @ offsets_matrix(off), lbl)

    @staticmethod
    def read_offsets(el):
        if el is None:
            return None
        d = {}
        for c in el:
            try:
                d[c.tag] = float(c.text)
            except (TypeError, ValueError):
                pass
        return d


# --------------------------------------------------------------------------
# textures
# --------------------------------------------------------------------------
class TextureCache:
    def __init__(self, cfg, args, aircraft_root, model_name):
        self.cfg = cfg
        self.args = args
        self.aircraft_root = aircraft_root
        self.model_name = model_name
        self.cache = {}
        self.tmp = tempfile.mkdtemp(prefix="convert_ac_")
        self.edits = {os.path.normpath(os.path.join(aircraft_root, e["file"])): e
                      for e in cfg.get("texture_edits", [])}

    def find(self, part, tex):
        """Resolve an AC texture reference to a file on disk (or None)."""
        if part.texture_override:
            p = os.path.join(self.aircraft_root, part.texture_override)
            return os.path.normpath(p) if os.path.isfile(p) else None
        if not tex:
            return None
        tex = tex.replace("\\", "/")
        base = os.path.basename(tex)
        tf = self.cfg.get("texture_files", {})
        if base in tf:
            return os.path.normpath(os.path.join(self.aircraft_root, tf[base]))
        cand = os.path.normpath(os.path.join(part.ac_dir, tex))
        if os.path.isfile(cand):
            return cand
        # case-insensitive / sibling search
        d = os.path.dirname(cand)
        if os.path.isdir(d):
            for f in os.listdir(d):
                if f.lower() == os.path.basename(cand).lower():
                    return os.path.join(d, f)
        return None

    def get(self, path):
        """Returns (bpy image, alpha_mode) alpha_mode in OPAQUE/MASK/BLEND."""
        if path in self.cache:
            return self.cache[path]
        import hashlib
        with open(path, "rb") as f:
            digest = hashlib.md5(f.read()).hexdigest()
        if digest in self.cache and os.path.normpath(path) not in self.edits:
            self.cache[path] = self.cache[digest]
            return self.cache[path]
        img = bpy.data.images.load(path)
        w, h = img.size
        if w == 0 or h == 0:
            log("WARN unreadable texture", path)
            self.cache[path] = (None, "OPAQUE")
            return self.cache[path]
        mt = self.args.max_texture
        mt = min(mt, self.cfg.get("max_texture", mt))
        mt = min(mt, self.cfg.get("texture_max", {}).get(os.path.basename(path), mt))
        if max(w, h) > mt:
            s = mt / max(w, h)
            img.scale(max(1, int(w * s)), max(1, int(h * s)))
            w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(h, w, 4)
        edit = self.edits.get(os.path.normpath(path))
        if edit:
            for r in edit.get("fill_rects", []):
                # rect in source-image pixel coords, top-left origin, of a
                # reference size (ref_size) -> scale to current image size
                ref = edit.get("ref_size", [w, h])
                x0, y0, x1, y1 = r["rect"]
                sx, sy = w / ref[0], h / ref[1]
                X0, X1 = int(x0 * sx), int(math.ceil(x1 * sx))
                Y0, Y1 = h - int(math.ceil(y1 * sy)), h - int(y0 * sy)
                if "color" in r:
                    col = np.array(r["color"] + [1.0], dtype=np.float32)
                else:  # sample a ring around the rect
                    ring = np.concatenate([
                        px[max(Y0 - 3, 0):Y0, X0:X1].reshape(-1, 4),
                        px[Y1:Y1 + 3, X0:X1].reshape(-1, 4),
                        px[Y0:Y1, max(X0 - 3, 0):X0].reshape(-1, 4),
                        px[Y0:Y1, X1:X1 + 3].reshape(-1, 4)])
                    col = np.median(ring, axis=0)
                px[Y0:Y1, X0:X1] = col
            img.pixels.foreach_set(px.ravel())
        a = px[:, :, 3]
        if os.path.basename(path) in self.cfg.get("opaque_textures", []):
            a = np.ones_like(a)
        frac_transparent = float((a < 0.5).mean())
        frac_semi = float(((a >= 0.05) & (a < 0.95)).mean())
        alpha_mode = "OPAQUE"
        if frac_transparent > 0.002 or frac_semi > 0.01:
            alpha_mode = "BLEND" if frac_semi > 0.05 and frac_semi > frac_transparent else "MASK"
        stem = re.sub(r"[^A-Za-z0-9_-]+", "_", os.path.splitext(os.path.basename(path))[0])
        name = "%s_%s" % (self.model_name, stem)
        if alpha_mode == "OPAQUE":
            out = os.path.join(self.tmp, name + ".jpg")
            img.file_format = "JPEG"
        else:
            out = os.path.join(self.tmp, name + ".png")
            img.file_format = "PNG"
        try:
            img.save(filepath=out, quality=self.args.jpeg_quality)
        except TypeError:
            img.filepath_raw = out
            img.save()
        bpy.data.images.remove(img)
        img2 = bpy.data.images.load(out)
        img2.name = name
        self.cache[path] = (img2, alpha_mode)
        self.cache[digest] = self.cache[path]
        log("texture", os.path.relpath(path, self.aircraft_root), "->", os.path.basename(out),
            "%dx%d" % (w, h), alpha_mode)
        return self.cache[path]


# --------------------------------------------------------------------------
# materials
# --------------------------------------------------------------------------
class MaterialFactory:
    def __init__(self, cfg, textures):
        self.cfg = cfg
        self.tex = textures
        self.cache = {}
        self.info = {}  # material name -> dict used by the atlas packer
        mc = cfg.get("materials", {})
        self.rough = mc.get("roughness", 0.68)
        self.metal = mc.get("metallic", 0.1)
        self.by_tex = mc.get("by_texture", {})
        self.glass = mc.get("glass", {"color": [0.75, 0.8, 0.85], "alpha": 0.18, "roughness": 0.05})
        self.min_trans = mc.get("glass_min_trans", 0.3)

    def get(self, tex_path, acmat, twosided, force_glass=False):
        rgb = tuple(round(c, 3) for c in acmat.rgb)
        glass = acmat.trans >= self.min_trans or force_glass
        key = (tex_path, rgb if (not tex_path or glass) else
               tuple(round(c, 2) for c in rgb), glass, twosided)
        if key in self.cache:
            return self.cache[key]
        if tex_path:
            nm = os.path.splitext(os.path.basename(tex_path))[0]
        else:
            nm = acmat.name
        name = "%s%s%s" % (nm, "_glass" if glass else "", "_2s" if twosided else "")
        mat = bpy.data.materials.new(name)
        if mat.node_tree is None:  # Blender < 5 needs this; 5.x always has nodes
            mat.use_nodes = True
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        out_alpha_mode = "OPAQUE"
        opts = dict(self.by_tex.get(os.path.basename(tex_path), {})) if tex_path else {}
        img = None
        if tex_path:
            img, out_alpha_mode = self.tex.get(tex_path)
        if img is not None:
            tn = nt.nodes.new("ShaderNodeTexImage")
            tn.image = img
            tn.location = (-600, 300)
            col_out = tn.outputs["Color"]
            if any(c < 0.97 for c in rgb) and not glass and opts.get("tint", True):
                mix = nt.nodes.new("ShaderNodeMix")
                mix.data_type = "RGBA"
                mix.blend_type = "MULTIPLY"
                mix.inputs["Factor"].default_value = 1.0
                nt.links.new(col_out, mix.inputs[6])
                mix.inputs[7].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
                col_out = mix.outputs[2]
            nt.links.new(col_out, bsdf.inputs["Base Color"])
            if out_alpha_mode == "MASK" and not glass:
                rnd = nt.nodes.new("ShaderNodeMath")
                rnd.operation = "ROUND"
                nt.links.new(tn.outputs["Alpha"], rnd.inputs[0])
                nt.links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
            elif out_alpha_mode == "BLEND" and not glass:
                nt.links.new(tn.outputs["Alpha"], bsdf.inputs["Alpha"])
        else:
            bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        if glass:
            g = self.glass
            if img is None:
                bsdf.inputs["Base Color"].default_value = tuple(g["color"]) + (1.0,)
            bsdf.inputs["Alpha"].default_value = g.get("alpha", max(0.12, 1.0 - acmat.trans))
            bsdf.inputs["Roughness"].default_value = g.get("roughness", 0.05)
            bsdf.inputs["Metallic"].default_value = 0.0
            mat.surface_render_method = "BLENDED"
            twosided = True
        else:
            bsdf.inputs["Roughness"].default_value = opts.get("roughness", self.rough)
            bsdf.inputs["Metallic"].default_value = opts.get("metallic", self.metal)
            if out_alpha_mode == "BLEND" and img is not None:
                mat.surface_render_method = "BLENDED"
        mat.use_backface_culling = not twosided
        self.cache[key] = mat
        self.info[mat.name] = {
            "img": img, "alpha": out_alpha_mode if img is not None else "OPAQUE", "glass": glass,
            "twosided": twosided, "tint": rgb if (img is not None and opts.get("tint", True)) else (1, 1, 1),
            "color": rgb, "roughness": bsdf.inputs["Roughness"].default_value,
            "metallic": bsdf.inputs["Metallic"].default_value}
        return mat


# --------------------------------------------------------------------------
# mesh building
# --------------------------------------------------------------------------
def build_object(part, matrix_bl, matfac, textures, name):
    o = part.obj
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    vmap = {}
    tex_path = textures.find(part, o.texture)
    slots = {}
    mat_list = []
    rep = o.texrep
    off = o.texoff
    dup_faces = 0
    for s in o.surfs:
        if s.kind != 0:
            continue
        refs = []
        for r in s.refs:
            if refs and refs[-1][0] == r[0]:
                continue
            refs.append(r)
        if len(refs) > 1 and refs[0][0] == refs[-1][0]:
            refs.pop()
        if len(refs) < 3 or len({r[0] for r in refs}) < len(refs):
            continue
        vs = []
        for idx, _, _ in refs:
            if idx >= len(o.verts):
                vs = None
                break
            v = vmap.get(idx)
            if v is None:
                v = bm.verts.new(matrix_bl @ Vector(o.verts[idx]))
                vmap[idx] = v
            vs.append(v)
        if vs is None:
            continue
        try:
            f = bm.faces.new(vs)
        except ValueError:
            # duplicate face (e.g. explicit back side) -> give it own verts
            f = bm.faces.new([bm.verts.new(v.co) for v in vs])
            dup_faces += 1
        acmat = part.mats[s.mat] if s.mat < len(part.mats) else part.mats[0]
        mkey = (s.mat, s.twosided)
        if mkey not in slots:
            slots[mkey] = len(mat_list)
            mat_list.append(matfac.get(tex_path, acmat, s.twosided, part.force_glass))
        f.material_index = slots[mkey]
        f.smooth = s.smooth
        for loop, (_, u, v) in zip(f.loops, refs):
            loop[uvl].uv = (u * rep[0] + off[0], v * rep[1] + off[1])
    if not bm.faces:
        bm.free()
        return None
    # crease angle -> sharp edges
    crease = math.radians(o.crease if o.crease is not None else 61.0)
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        f1, f2 = e.link_faces
        if not (f1.smooth and f2.smooth):
            continue
        try:
            if e.calc_face_angle() > crease:
                e.smooth = False
        except ValueError:
            pass
    # flip faces if the overall transform mirrors
    if matrix_bl.to_3x3().determinant() < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    for m in mat_list:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def match_any(patterns, key):
    return any(re.fullmatch(p, key) for p in patterns)


def join_objects(objs, name):
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    target = objs[0]
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=target, object=target,
                                       selected_objects=objs, selected_editable_objects=objs):
            bpy.ops.object.join()
    target.name = name
    target.data.name = name
    return target


def merge_duplicate_materials(ob):
    """Collapse material slots that reference the same material."""
    me = ob.data
    seen = {}
    remap = []
    for i, m in enumerate(me.materials):
        if m.name not in seen:
            seen[m.name] = len(seen)
        remap.append(seen[m.name])
    if len(seen) == len(me.materials):
        return
    idx = np.empty(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get("material_index", idx)
    idx = np.array(remap, dtype=np.int32)[idx]
    uniq = []
    for m in me.materials:
        if m not in uniq:
            uniq.append(m)
    me.materials.clear()
    for m in uniq:
        me.materials.append(m)
    me.polygons.foreach_set("material_index", idx)



# --------------------------------------------------------------------------
# texture atlas (optional, per merged object) -- cuts draw calls
# --------------------------------------------------------------------------
def _img_pixels(img):
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)


def _resize(px, w, h):
    """Nearest/box resize with numpy (good enough for down-scaling tiles)."""
    H, W = px.shape[:2]
    if (W, H) == (w, h):
        return px
    ys = (np.arange(h) + 0.5) * H / h
    xs = (np.arange(w) + 0.5) * W / w
    return px[np.clip(ys.astype(int), 0, H - 1)][:, np.clip(xs.astype(int), 0, W - 1)]


def atlas_object(ob, matfac, model_name, tmpdir, size=2048, max_tile=512, pad=4, quality=85):
    me = ob.data
    nmat = len(me.materials)
    if nmat < 2:
        return
    mi = np.empty(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get("material_index", mi)
    uvl = me.uv_layers.active
    uv = np.empty(len(me.loops) * 2, dtype=np.float32)
    uvl.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    ls = np.empty(len(me.polygons), dtype=np.int32)
    lt = np.empty(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get("loop_start", ls)
    me.polygons.foreach_get("loop_total", lt)
    loop_mat = np.repeat(mi, lt)

    groups = {}
    for i, m in enumerate(me.materials):
        inf = matfac.info.get(m.name)
        if inf is None or inf["glass"] or inf["alpha"] == "BLEND":
            continue
        sel = loop_mat == i
        if not sel.any():
            continue
        if inf["img"] is not None:
            u = uv[sel]
            if u.min() < -0.02 or u.max() > 1.02:
                continue  # tiled texture -> cannot go into an atlas
        key = (inf["alpha"], inf["twosided"], round(inf["roughness"], 2), round(inf["metallic"], 2))
        groups.setdefault(key, []).append(i)

    new_index = {}
    for key, slots in groups.items():
        if len(slots) < 2:
            continue
        tiles = []
        seen_img = {}
        for i in slots:
            inf = matfac.info[me.materials[i].name]
            if inf["img"] is not None:
                tkey = (inf["img"].name, inf["tint"])
                if tkey not in seen_img:
                    px = _img_pixels(inf["img"]).copy()
                    px[:, :, :3] *= np.array(inf["tint"], dtype=np.float32)
                    seen_img[tkey] = len(tiles)
                    tiles.append(px)
                tiles_idx = seen_img[tkey]
            else:
                tkey = ("color", inf["color"])
                if tkey not in seen_img:
                    seen_img[tkey] = len(tiles)
                    tiles.append(np.ones((8, 8, 4), dtype=np.float32) *
                                 np.array(list(inf["color"]) + [1.0], dtype=np.float32))
                tiles_idx = seen_img[tkey]
            new_index.setdefault(key, {})[i] = (tiles_idx, inf["img"] is None)
        # shelf packing, shrinking tiles until everything fits
        mt = max_tile
        while True:
            dims = []
            for t in tiles:
                h, w = t.shape[:2]
                s = min(1.0, mt / max(w, h))
                dims.append((max(4, int(w * s)), max(4, int(h * s))))
            order = sorted(range(len(tiles)), key=lambda k: -dims[k][1])
            x = y = shelf_h = 0
            rects = {}
            ok = True
            for k in order:
                w, h = dims[k][0] + 2 * pad, dims[k][1] + 2 * pad
                if x + w > size:
                    x, y = 0, y + shelf_h
                    shelf_h = 0
                if y + h > size:
                    ok = False
                    break
                rects[k] = (x, y, w, h)
                x += w
                shelf_h = max(shelf_h, h)
            if ok:
                break
            mt = int(mt * 0.8)
        used_h = y + shelf_h
        H = 1
        while H < used_h:
            H *= 2
        atlas = np.zeros((H, size, 4), dtype=np.float32)
        atlas[:, :, 3] = 1.0
        for k, (x0, y0, w, h) in rects.items():
            tw, th = dims[k]
            t = _resize(tiles[k], tw, th)
            t = np.pad(t, ((pad, pad), (pad, pad), (0, 0)), mode="edge")
            atlas[y0:y0 + h, x0:x0 + w] = t
        alpha = key[0]
        name = "%s_atlas%d" % (model_name, len(bpy.data.images))
        img = bpy.data.images.new(name, size, H, alpha=(alpha != "OPAQUE"))
        img.pixels.foreach_set(atlas.ravel())
        ext = "png" if alpha != "OPAQUE" else "jpg"
        out = os.path.join(tmpdir, name + "." + ext)
        img.file_format = "PNG" if ext == "png" else "JPEG"
        try:
            img.save(filepath=out, quality=quality)
        except TypeError:
            img.filepath_raw = out
            img.save()
        bpy.data.images.remove(img)
        img = bpy.data.images.load(out)
        img.name = name
        # material for the atlas
        mat = bpy.data.materials.new(name)
        if mat.node_tree is None:
            mat.use_nodes = True
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = img
        nt.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha == "MASK":
            rnd = nt.nodes.new("ShaderNodeMath")
            rnd.operation = "ROUND"
            nt.links.new(tn.outputs["Alpha"], rnd.inputs[0])
            nt.links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
        bsdf.inputs["Roughness"].default_value = key[2]
        bsdf.inputs["Metallic"].default_value = key[3]
        mat.use_backface_culling = not key[1]
        me.materials.append(mat)
        slot = len(me.materials) - 1
        # remap UVs + material indices
        for i, (k, solid) in new_index[key].items():
            x0, y0, w, h = rects[k]
            tw, th = dims[k]
            sel = loop_mat == i
            if solid:
                uv[sel] = [(x0 + w / 2) / size, (y0 + h / 2) / H]
            else:
                u = np.clip(uv[sel], 0.0, 1.0)
                uv[sel, 0] = (x0 + pad + u[:, 0] * tw) / size
                uv[sel, 1] = (y0 + pad + u[:, 1] * th) / H
            mi[mi == i] = slot
        log("atlas %s: %d materials -> %s (%dx%d, tiles<=%dpx)" % (ob.name, len(new_index[key]), name, size, H, mt))
    uvl.data.foreach_set("uv", uv.ravel())
    me.polygons.foreach_set("material_index", mi)
    # drop now-unused slots
    used = sorted(set(mi.tolist()))
    remap = {old: new for new, old in enumerate(used)}
    mats = [me.materials[i] for i in used]
    me.materials.clear()
    for m in mats:
        me.materials.append(m)
    me.polygons.foreach_set("material_index", np.array([remap[i] for i in mi], dtype=np.int32))


# --------------------------------------------------------------------------
# origin
# --------------------------------------------------------------------------
def auto_origin(parts_objs, spec):
    """Origin at chord_frac of the wing root chord, z at the fuselage centre.

    The wing meshes are sliced with the planes |y| = station (FG frame);
    LE/TE = min/max x of the section, averaged over both wings.
    """
    wing_re = spec["wing"]
    fus_re = spec["fuselage"]
    st = spec.get("station", 1.0)
    frac = spec.get("chord_frac", 0.27)

    def section(patterns, axis, value, filt=None):
        pts = []
        for key, ob in parts_objs:
            if ob is None or not match_any(patterns, key):
                continue
            me = ob.data
            co = [BL_TO_FG @ (ob.matrix_world @ v.co) for v in me.vertices]
            for e in me.edges:
                a, b = co[e.vertices[0]], co[e.vertices[1]]
                da, db = a[axis] - value, b[axis] - value
                if da * db < 0:
                    t = da / (da - db)
                    p = a + (b - a) * t
                    if filt is None or filt(p):
                        pts.append(p)
        return pts

    les, tes = [], []
    for side in (-st, st):
        sec = section(wing_re, 1, side)
        if sec:
            les.append(min(p.x for p in sec))
            tes.append(max(p.x for p in sec))
    le, te = sum(les) / len(les), sum(tes) / len(tes)
    x0 = le + frac * (te - le)
    fus = section(fus_re, 0, x0, lambda p: abs(p.y) < 0.15)
    z0 = 0.5 * (min(p.z for p in fus) + max(p.z for p in fus)) if fus else 0.0
    log("auto origin: root LE %.3f TE %.3f chord %.3f -> x %.3f z %.3f" % (le, te, te - le, x0, z0))
    return [x0, 0.0, z0]


# --------------------------------------------------------------------------
# main conversion
# --------------------------------------------------------------------------
def convert(args):
    cfg = {}
    if args.config:
        with open(args.config) as f:
            cfg = json.load(f)
    inp = os.path.abspath(args.input)
    aircraft_root = os.path.abspath(args.aircraft_root) if args.aircraft_root else \
        (os.path.dirname(os.path.dirname(inp)) if os.path.basename(os.path.dirname(inp)) == "Models"
         else os.path.dirname(inp))
    fg_root = os.path.abspath(args.fg_root) if args.fg_root else os.path.dirname(aircraft_root)
    model_name = cfg.get("name", os.path.splitext(os.path.basename(args.output))[0])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    loader = Loader(cfg, aircraft_root, fg_root)
    loader.load(inp)
    for extra in cfg.get("extra_models", []):
        p = os.path.normpath(os.path.join(aircraft_root, extra["path"]))
        loader.load(p, offsets_matrix(extra.get("offsets")), loader.unique_label(extra["label"]))

    # exclusions
    excl = cfg.get("exclude_objects", [])
    parts = [p for p in loader.parts if not match_any(excl, p.key)]
    dropped = [p.key for p in loader.parts if match_any(excl, p.key)]
    log("parts: %d kept, %d excluded" % (len(parts), len(dropped)))
    if args.list:
        for p in parts:
            o = p.obj
            m0 = p.mats[o.surfs[0].mat] if o.surfs and o.surfs[0].mat < len(p.mats) else None
            log("  %-50s verts %6d surfs %6d tex %-28s trans %.2f" % (
                p.key, len(o.verts), len(o.surfs), o.texture, m0.trans if m0 else 0))
        sys.exit(0)

    for rule in cfg.get("texture_objects", []):
        for p in parts:
            if match_any(rule["objects"], p.key):
                p.texture_override = rule["texture"]
    for p in parts:
        p.force_glass = match_any(cfg.get("glass_objects", []), p.key)

    # static "animations" applied in FG frame (e.g. landing gear retraction)
    anim = {id(p): Matrix.Identity(4) for p in parts}
    for rot in cfg.get("rotations", []):
        c = Vector(rot["center"])
        R = Matrix.Translation(c) @ rot_axis_angle(rot["axis"], rot["angle"]) @ Matrix.Translation(-c)
        if rot.get("instance"):  # centre/axis given in that sub-model's own frame
            Mi = loader.instances.get(rot["instance"])
            if Mi is None:
                log("WARN rotation: unknown instance", rot["instance"])
                continue
            R = Mi @ R @ Mi.inverted()
        for p in parts:
            if match_any(rot["objects"], p.key):
                anim[id(p)] = R @ anim[id(p)]
    for tr in cfg.get("translations", []):
        T = Matrix.Translation(Vector(tr["offset"]))
        for p in parts:
            if match_any(tr["objects"], p.key):
                anim[id(p)] = T @ anim[id(p)]

    scale = cfg.get("scale", 1.0)
    S = Matrix.Scale(scale, 4)

    textures = TextureCache(cfg, args, aircraft_root, model_name)
    matfac = MaterialFactory(cfg, textures)

    built = []
    for i, p in enumerate(parts):
        m_bl = S @ FG_TO_BL @ anim[id(p)] @ p.matrix_fg
        ob = build_object(p, m_bl, matfac, textures, "%03d_%s" % (i, p.key))
        if ob is None:
            continue
        for pat, ratio in cfg.get("decimate", {}).items():
            if re.fullmatch(pat, p.key):
                mod = ob.modifiers.new("dec", "DECIMATE")
                mod.ratio = ratio
                with bpy.context.temp_override(object=ob, active_object=ob):
                    bpy.ops.object.modifier_apply(modifier=mod.name)
        built.append((p.key, ob))

    # origin shift (FG coords, before scale)
    origin = cfg.get("origin", [0, 0, 0])
    if isinstance(origin, dict):
        origin = auto_origin(built, origin["auto"])
    o_bl = S @ fg_to_bl(origin).to_4d()
    o_bl = o_bl.xyz
    for _, ob in built:
        ob.data.transform(Matrix.Translation(-o_bl))

    def fgp(p):  # FG point -> final Blender coords
        return (S @ fg_to_bl(p).to_4d()).xyz - o_bl

    # pivot nodes
    report = {"name": model_name, "origin_fg": origin, "nodes": {}, "markers": {}, "groups": {}}
    used = set()
    node_objs = {}
    for nd in cfg.get("nodes", []):
        members = [(k, ob) for k, ob in built if k not in used and match_any(nd["objects"], k)]
        if not members:
            log("WARN node %s matched nothing" % nd["name"])
            continue
        for k, _ in members:
            used.add(k)
        ob = join_objects([ob for _, ob in members], nd["name"])
        merge_duplicate_materials(ob)
        # pivot frame
        if "axis" in nd:  # prop: two FG points, rear -> front
            a = fgp(nd["axis"][0])
            b = fgp(nd["axis"][1])
            d = (b - a).normalized()
            # pick the axis point closest to the mesh centroid
            cen = sum((v.co for v in ob.data.vertices), Vector()) / len(ob.data.vertices)
            piv = a + d * (cen - a).dot(d)
            # node local -Y (== glTF +Z) along the spin axis
            q = Vector((0, -1, 0)).rotation_difference(d)
            M = Matrix.Translation(piv) @ q.to_matrix().to_4x4()
        else:
            piv = fgp(nd["pivot"])
            M = Matrix.Translation(piv)
        ob.data.transform(M.inverted())
        ob.matrix_world = M
        node_objs[nd["name"]] = ob
    # parenting (keep world transform)
    bpy.context.view_layer.update()
    for nd in cfg.get("nodes", []):
        if nd.get("parent") and nd["name"] in node_objs and nd["parent"] in node_objs:
            ch = node_objs[nd["name"]]
            par = node_objs[nd["parent"]]
            mw = ch.matrix_world.copy()
            ch.parent = par
            ch.matrix_parent_inverse = Matrix.Identity(4)
            ch.matrix_world = mw

    # static groups
    groups = cfg.get("groups", []) + [{"name": "airframe", "objects": [".*"]}]
    for g in groups:
        members = [(k, ob) for k, ob in built if k not in used and match_any(g["objects"], k)]
        if not members:
            continue
        for k, _ in members:
            used.add(k)
        ob = join_objects([ob for _, ob in members], g["name"])
        merge_duplicate_materials(ob)
        ac = cfg.get("atlas", {})
        if g["name"] in ac.get("groups", []):
            atlas_object(ob, matfac, model_name, textures.tmp, ac.get("size", 2048),
                         ac.get("max_tile", 512), quality=args.jpeg_quality)
        if g.get("parent") and g["parent"] in node_objs:
            bpy.context.view_layer.update()
            mw = ob.matrix_world.copy()
            ob.parent = node_objs[g["parent"]]
            ob.matrix_parent_inverse = Matrix.Identity(4)
            ob.matrix_world = mw
        node_objs[g["name"]] = ob

    # markers (empties)
    def instance_anim(label):
        for p in parts:
            if p.key.startswith(label + "/"):
                return anim[id(p)]
        return Matrix.Identity(4)

    for name, spec in cfg.get("markers", {}).items():
        if isinstance(spec, dict) and "instance" in spec:
            lbl = spec["instance"]
            if lbl not in loader.instances:
                log("WARN marker %s: unknown instance %s" % (name, lbl))
                continue
            w = instance_anim(lbl) @ loader.instances[lbl] @ Vector(spec.get("local", [0, 0, 0])).to_4d()
            pos = list(w.xyz)
        else:
            pos = spec["fg"] if isinstance(spec, dict) else spec
        e = bpy.data.objects.new(name, None)
        e.empty_display_size = 0.1
        scene.collection.objects.link(e)
        mw = Matrix.Translation(fgp(pos))
        e.matrix_world = mw
        par = spec.get("parent") if isinstance(spec, dict) else None
        if par and par in node_objs:
            e.parent = node_objs[par]
            e.matrix_parent_inverse = Matrix.Identity(4)
            e.matrix_world = mw  # keeps the world position; local = parent^-1 * world
        report["markers"][name] = {"position": bl_to_gltf(fgp(pos)),
                                   "parent": par if par in node_objs else None}

    bpy.context.view_layer.update()
    # report
    tot_tris = 0
    allmin = Vector((1e9, 1e9, 1e9))
    allmax = -allmin
    for ob in scene.objects:
        if ob.type != "MESH":
            continue
        me = ob.data
        me.calc_loop_triangles()
        tris = len(me.loop_triangles)
        tot_tris += tris
        ws = [ob.matrix_world @ v.co for v in me.vertices]
        mn = Vector((min(w.x for w in ws), min(w.y for w in ws), min(w.z for w in ws)))
        mx = Vector((max(w.x for w in ws), max(w.y for w in ws), max(w.z for w in ws)))
        allmin = Vector(map(min, allmin, mn))
        allmax = Vector(map(max, allmax, mx))
        g1, g2 = bl_to_gltf(mn), bl_to_gltf(mx)
        info = {"triangles": tris, "primitives": len(me.materials),
                "materials": [m.name for m in me.materials],
                "bbox_min": [min(a, b) for a, b in zip(g1, g2)],
                "bbox_max": [max(a, b) for a, b in zip(g1, g2)],
                "pivot": bl_to_gltf(ob.matrix_world.translation),
                "parent": ob.parent.name if ob.parent else None}
        if ob.name in [n["name"] for n in cfg.get("nodes", [])]:
            fwd = ob.matrix_world.to_3x3() @ Vector((0, -1, 0))
            info["local_z_axis"] = [round(c, 4) for c in bl_to_gltf(fwd)]
            report["nodes"][ob.name] = info
        else:
            report["groups"][ob.name] = info
    g1, g2 = bl_to_gltf(allmin), bl_to_gltf(allmax)
    report["bbox_min"] = [min(a, b) for a, b in zip(g1, g2)]
    report["bbox_max"] = [max(a, b) for a, b in zip(g1, g2)]
    report["triangles"] = tot_tris
    report["primitives"] = sum(len(o.data.materials) for o in scene.objects if o.type == "MESH")
    report["materials"] = sorted({m.name for o in scene.objects if o.type == "MESH" for m in o.data.materials})
    report["excluded_objects"] = dropped

    out = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out, export_format="GLB", export_yup=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials="EXPORT", export_image_format="AUTO",
        export_jpeg_quality=args.jpeg_quality, export_cameras=False, export_lights=False,
        export_extras=False, export_animations=False, use_selection=False)
    report["file_bytes"] = os.path.getsize(out)
    log("wrote %s (%.2f MB, %d tris, %d primitives)" % (out, report["file_bytes"] / 1e6, tot_tris,
                                                         report["primitives"]))
    if args.report:
        os.makedirs(os.path.dirname(os.path.abspath(args.report)), exist_ok=True)
        with open(args.report, "w") as f:
            json.dump(report, f, indent=1)
    return out, cfg


# --------------------------------------------------------------------------
# preview rendering (re-imports the exported .glb to validate it)
# --------------------------------------------------------------------------
def render_preview(glb, png, views, size, cfg):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=glb)
    for extra in cfg.get("preview_extra_glbs", []):  # e.g. exterior shell around a cockpit
        bpy.ops.import_scene.gltf(filepath=os.path.join(os.path.dirname(glb), extra))
    for o in list(scene.objects):
        if o.name.split(".")[0] in cfg.get("preview_hide", []):
            for c in [o] + list(o.children_recursive):
                c.hide_render = True
    obs = [o for o in scene.objects if o.type == "MESH" and not o.hide_render]
    pts = [o.matrix_world @ Vector(c) for o in obs for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr = (mn + mx) / 2
    rad = (mx - mn).length / 2

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = size
    scene.render.resolution_y = int(size * 0.7)
    scene.render.film_transparent = False
    try:
        scene.eevee.taa_render_samples = 32
    except Exception:
        pass
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("w")
    scene.world = world
    if world.node_tree is None:
        world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.65, 0.78, 1)
    bg.inputs[1].default_value = 0.9
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 4.0
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(40), 0, math.radians(-30))

    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 50
    cam.data.clip_start = 0.01
    cam.data.clip_end = 1000

    # glTF import frame in Blender: X left, -Y forward, Z up
    dirs = {
        "34": Vector((0.75, -1.0, 0.45)),     # front-left-above
        "34r": Vector((-0.8, 0.9, 0.5)),      # rear-right-above
        "top": Vector((0.0, 0.0001, 1.0)),
        "bottom": Vector((0.0, 0.0001, -1.0)),
        "front": Vector((0.0, -1.0, 0.05)),
        "side": Vector((1.0, 0.0, 0.05)),     # from the left
        "rear": Vector((0.0, 1.0, 0.1)),
    }
    base, ext = os.path.splitext(png)
    org = cfg.get("origin_resolved", [0, 0, 0])
    sc = cfg.get("scale", 1.0)

    def fg_local(p):
        return fg_to_bl([(p[k] - org[k]) * sc for k in range(3)])

    shots = {s["name"]: s for s in cfg.get("preview_shots", [])}
    for i, v in enumerate(views):
        if v in shots:
            s = shots[v]
            e, t = fg_local(s["eye"]), fg_local(s["target"])
            cam.location = e
            cam.rotation_euler = (t - e).to_track_quat("-Z", "Y").to_euler()
            cam.data.lens = s.get("lens", 24)
        elif v not in dirs:
            continue
        else:
            d = dirs[v].normalized()
            cam.data.lens = 50
            fov = 2 * math.atan(36 / 2 / 50)
            dist = rad / math.sin(fov / 2) * (0.82 if v in ("34", "34r") else 0.75)
            cam.location = ctr + d * dist
            cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = png if i == 0 else "%s_%s%s" % (base, v, ext)
        bpy.ops.render.render(write_still=True)
        log("preview", scene.render.filepath)


def main():
    args = parse_args()
    out, cfg = convert(args)
    if args.preview:
        rep = json.load(open(args.report)) if args.report else {}
        cfg["origin_resolved"] = rep.get("origin_fg", cfg.get("origin", [0, 0, 0]))
        os.makedirs(os.path.dirname(os.path.abspath(args.preview)), exist_ok=True)
        render_preview(out, os.path.abspath(args.preview), args.preview_views.split(","),
                       args.preview_size, cfg)


if __name__ == "__main__":
    main()
