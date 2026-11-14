"""
Build docs/data/map.json and docs/data/graph.json from:
  - private/library.json  (from tools/fetch_playlists.py)
  - src/taxonomy.py       (hand-curated genre taxonomy)

Run from project root: python src/build_data.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from taxonomy import TAXONOMY

LIB_PATH = Path("private/library.json")
MAP_OUT = Path("docs/data/map.json")
GRAPH_OUT = Path("docs/data/graph.json")

# Merge these names into a canonical name in the library.
NAME_ALIASES = {
    "Ye": "Kanye West",
    "Kanye": "Kanye West",
    "Jay-Z": "JAY-Z",
    "Jay Z": "JAY-Z",
    "JAŸ-Z": "JAY-Z",
    "JAŸ-Z": "JAY-Z",
}

# Artists always included regardless of weight (underground/internet rap).
ALWAYS_INCLUDE_FAMS = {"INTERNET RAP"}


def norm_name(s):
    """Normalize for fuzzy matching: lowercase + collapse apostrophe variants."""
    return (s.lower()
            .replace('’', "'").replace('‘', "'")
            .replace('ʼ', "'").replace('`', "'")
           )


def load_library():
    """Return dict name -> artist, with aliases merged in."""
    artists = json.loads(LIB_PATH.read_text(encoding="utf-8"))
    by_name = {}
    by_norm = {}  # normalized key -> canonical name
    for a in artists:
        key = a["name"].strip()
        canonical = NAME_ALIASES.get(key)
        if canonical:
            if canonical in by_name:
                by_name[canonical]["weight"] += a["weight"]
                for pl, cnt in a.get("counts", {}).items():
                    by_name[canonical]["counts"][pl] = (
                        by_name[canonical]["counts"].get(pl, 0) + cnt
                    )
            continue
        by_name[key] = a
        by_norm[norm_name(key)] = key
    # second pass: build a normalized lookup for fuzzy matching
    load_library._norm = by_norm
    return by_name


def fuzzy_lookup(lib, name):
    """Find an artist by exact name, then case-insensitive, then apostrophe-insensitive."""
    if name in lib:
        return lib[name]
    nk = norm_name(name)
    canonical = load_library._norm.get(nk)
    if canonical:
        return lib.get(canonical)
    return None


def build_map(lib):
    """Return (fams list, set of placed artist names)."""
    fams = []
    placed = set()

    for fam_name, clusters in TAXONOMY.items():
        force_include = fam_name in ALWAYS_INCLUDE_FAMS
        fam_clusters = []

        for cl_name, cl_data in clusters.items():
            cl_subs = []

            for si, (sg_name, artist_names) in enumerate(cl_data["subgroups"].items()):
                sg_artists = []

                for name in artist_names:
                    info = fuzzy_lookup(lib, name)

                    w = info["weight"] if info else 1
                    sp = info.get("spotify_url", "") if info else ""
                    placed.add(name)

                    sg_artists.append({
                        "n": name,
                        "w": w,
                        "al": None,
                        "bc": None,
                        "i": None,
                        "sp": sp or None,
                    })

                if sg_artists:
                    cl_subs.append({
                        "n": sg_name,
                        "si": si,
                        "a": sorted(sg_artists, key=lambda x: -x["w"]),
                    })

            if cl_subs:
                fam_clusters.append({
                    "n": cl_name,
                    "col": cl_data["color"],
                    "cap": cl_data["caption"],
                    "s": cl_subs,
                })

        if fam_clusters:
            fams.append({"n": fam_name, "c": fam_clusters})

    return fams, placed


def build_graph(lib, fams, placed):
    """Build graph.json. Nodes only for now — Deezer edges added later."""
    nodes = []
    idx = {}

    # Map artists first (flags = inMap|played = 6)
    for fam in fams:
        for cl in fam["c"]:
            for sg in cl["s"]:
                for a in sg["a"]:
                    if a["n"] not in idx:
                        idx[a["n"]] = len(nodes)
                        nodes.append([a["n"], None, 0, a["w"], 6])

    # Remaining library artists (flags = played = 4)
    for name, info in lib.items():
        if name not in idx and info["weight"] >= 2:
            idx[name] = len(nodes)
            nodes.append([name, None, 0, info["weight"], 4])

    return {"n": nodes, "e": [], "r": {}}


def main():
    if not LIB_PATH.exists():
        print(f"ERROR: {LIB_PATH} not found. Run tools/fetch_playlists.py first.")
        sys.exit(1)

    MAP_OUT.parent.mkdir(parents=True, exist_ok=True)
    Path("docs/art").mkdir(parents=True, exist_ok=True)

    print("Loading library...")
    lib = load_library()
    print(f"  {len(lib)} unique artists (after alias merge)")

    print("\nBuilding map.json...")
    fams, placed = build_map(lib)

    total_on_map = sum(len(sg["a"]) for f in fams for cl in f["c"] for sg in cl["s"])
    print(f"  {total_on_map} artists on the map across {len(fams)} families")
    for f in fams:
        cnt = sum(len(sg["a"]) for cl in f["c"] for sg in cl["s"])
        print(f"    {f['n']}: {cnt}")

    # Warn about high-weight unplaced artists
    unplaced = [
        (name, a["weight"])
        for name, a in lib.items()
        if name not in placed and a["weight"] >= 5
    ]
    unplaced.sort(key=lambda x: -x[1])
    if unplaced:
        print(f"\n  !! {len(unplaced)} artists with 5+ tracks NOT in taxonomy:")
        for name, w in unplaced[:30]:
            print(f"       {w:3d}  {name}")
    else:
        print("\n  All artists with 5+ tracks are placed.")

    MAP_OUT.write_text(
        json.dumps({"fams": fams}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"\nSaved → {MAP_OUT}")

    print("\nBuilding graph.json...")
    graph = build_graph(lib, fams, placed)
    print(f"  {len(graph['n'])} nodes, {len(graph['e'])} edges")
    GRAPH_OUT.write_text(
        json.dumps(graph, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Saved → {GRAPH_OUT}")

    print("\nDone! Run 'python -m http.server 8080 --directory docs' to preview locally.")


if __name__ == "__main__":
    main()
