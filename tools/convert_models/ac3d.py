"""Minimal, tolerant AC3D (.ac, "AC3Db") parser -- pure Python, no bpy.

Returns a tree of AcObject with vertices / surfaces in the object's local frame,
plus the file's material list. Tolerates the quirks found in FlightGear models:
wrong `numsurf` counts (surfaces are read greedily while lines start with SURF),
`kids` counts that run past EOF, unknown tokens (url, subdiv, hidden, locked,
folded, crease, texrep, texoff, data ...).
"""
import shlex


class AcMaterial:
    def __init__(self, line):
        toks = shlex.split(line)
        self.name = toks[1]
        vals = {}
        i = 2
        while i < len(toks):
            k = toks[i]
            n = 3 if k in ("rgb", "amb", "emis", "spec") else 1
            try:
                vals[k] = [float(x) for x in toks[i + 1:i + 1 + n]]
            except ValueError:
                vals[k] = [0.0] * n
            i += 1 + n
        self.rgb = vals.get("rgb", [1, 1, 1])
        self.emis = vals.get("emis", [0, 0, 0])
        self.spec = vals.get("spec", [0.5, 0.5, 0.5])
        self.shi = vals.get("shi", [64])[0]
        self.trans = vals.get("trans", [0])[0]


class AcSurface:
    __slots__ = ("flags", "mat", "refs")

    def __init__(self, flags, mat, refs):
        self.flags = flags
        self.mat = mat
        self.refs = refs  # list of (vertex index, u, v)

    @property
    def kind(self):
        return self.flags & 0x0F  # 0 polygon, 1 closed line, 2 line

    @property
    def smooth(self):
        return bool(self.flags & 0x10)

    @property
    def twosided(self):
        return bool(self.flags & 0x20)


class AcObject:
    def __init__(self, otype):
        self.type = otype
        self.name = ""
        self.texture = None
        self.texrep = (1.0, 1.0)
        self.texoff = (0.0, 0.0)
        self.rot = None  # 3x3 row-major list of 9 floats
        self.loc = (0.0, 0.0, 0.0)
        self.crease = None
        self.hidden = False
        self.verts = []
        self.surfs = []
        self.kids = []

    def walk(self):
        yield self
        for k in self.kids:
            yield from k.walk()


class _Reader:
    def __init__(self, text):
        self.lines = text.splitlines()
        self.i = 0

    def peek(self):
        j = self.i
        while j < len(self.lines):
            s = self.lines[j].strip()
            if s:
                return s
            j += 1
        return None

    def next(self):
        while self.i < len(self.lines):
            s = self.lines[self.i].strip()
            self.i += 1
            if s:
                return s
        return None


def _parse_object(rd, header):
    obj = AcObject(header.split()[1] if len(header.split()) > 1 else "poly")
    while True:
        line = rd.next()
        if line is None:
            return obj
        parts = line.split(None, 1)
        key = parts[0]
        rest = parts[1] if len(parts) > 1 else ""
        if key == "name":
            obj.name = rest.strip().strip('"')
        elif key == "data":
            n = int(rest)
            got = 0
            while got < n and rd.i < len(rd.lines):
                got += len(rd.lines[rd.i]) + 1
                rd.i += 1
        elif key == "texture":
            obj.texture = rest.strip().strip('"')
        elif key == "texrep":
            obj.texrep = tuple(float(x) for x in rest.split()[:2])
        elif key == "texoff":
            obj.texoff = tuple(float(x) for x in rest.split()[:2])
        elif key == "rot":
            obj.rot = [float(x) for x in rest.split()[:9]]
        elif key == "loc":
            obj.loc = tuple(float(x) for x in rest.split()[:3])
        elif key == "crease":
            obj.crease = float(rest.split()[0])
        elif key == "hidden":
            obj.hidden = True
        elif key == "numvert":
            n = int(rest)
            for _ in range(n):
                v = rd.next().split()
                obj.verts.append((float(v[0]), float(v[1]), float(v[2])))
        elif key == "numsurf":
            # read greedily: some exporters write a wrong count
            while True:
                p = rd.peek()
                if p is None or not p.startswith("SURF"):
                    break
                s = rd.next()
                flags = int(s.split()[1], 0)
                mat = 0
                p = rd.peek()
                if p.startswith("mat"):
                    mat = int(rd.next().split()[1])
                r = rd.next()
                nref = int(r.split()[1])
                refs = []
                for _ in range(nref):
                    t = rd.next().split()
                    u = float(t[1]) if len(t) > 1 else 0.0
                    vv = float(t[2]) if len(t) > 2 else 0.0
                    refs.append((int(t[0]), u, vv))
                obj.surfs.append(AcSurface(flags, mat, refs))
        elif key == "kids":
            for _ in range(int(rest)):
                p = rd.peek()
                if p is None or not p.startswith("OBJECT"):
                    break
                obj.kids.append(_parse_object(rd, rd.next()))
            return obj
        # url, subdiv, locked, folded, ... ignored


def parse_ac(path):
    with open(path, encoding="latin-1") as f:
        text = f.read()
    rd = _Reader(text)
    hdr = rd.next()
    if not hdr or not hdr.startswith("AC3D"):
        raise ValueError("not an AC3D file: %s" % path)
    mats, roots = [], []
    while True:
        line = rd.next()
        if line is None:
            break
        if line.startswith("MATERIAL"):
            mats.append(AcMaterial(line))
        elif line.startswith("OBJECT"):
            roots.append(_parse_object(rd, line))
    return mats, roots


def world_transforms(obj, parent_rot=None, parent_loc=(0.0, 0.0, 0.0)):
    """Yield (obj, rot3x3 rows, loc) with accumulated parent transforms.

    AC3D: child vertices are in child frame; v_parent = rot * v + loc.
    """
    R = obj.rot or [1, 0, 0, 0, 1, 0, 0, 0, 1]
    # AC3D stores rot such that v' = v * M (row vectors) in most exporters;
    # FlightGear/OSG treats it as a column-major matrix -> same as v' = M^T v.
    Rm = [[R[0], R[3], R[6]], [R[1], R[4], R[7]], [R[2], R[5], R[8]]]
    if parent_rot is None:
        parent_rot = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    # world = P * (Rm * v + loc) + ploc
    W = [[sum(parent_rot[i][k] * Rm[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    lw = [sum(parent_rot[i][k] * obj.loc[k] for k in range(3)) + parent_loc[i] for i in range(3)]
    yield obj, W, lw
    for k in obj.kids:
        yield from world_transforms(k, W, lw)
