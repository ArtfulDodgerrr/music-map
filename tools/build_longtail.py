"""
Build docs/data/map2.json for the long-tail music map.

Artists: weight >= 3, not already on the main map.
Genre tags: MusicBrainz public API (no key, 1 req/sec).
Images: Deezer public API (no key, skips already-downloaded files).

Run from project root: python tools/build_longtail.py
"""

import json
import re
import time
import urllib.request
import urllib.parse
from pathlib import Path
from collections import defaultdict

MAP_PATH    = Path("docs/data/map.json")
LIB_PATH    = Path("private/library.json")
MAP2_OUT    = Path("docs/data/map2.json")
GRAPH2_OUT  = Path("docs/data/graph2.json")
ART_DIR     = Path("docs/art")

WEIGHT_MIN  = 3   # minimum tracks to appear on the long-tail map

# Same aliases as build_data.py — these are merged into canonical names on the main map
# so the long tail should exclude them too
NAME_ALIASES = {
    "Ye": "Kanye West",
    "Kanye": "Kanye West",
    "Jay-Z": "JAY-Z",
    "Jay Z": "JAY-Z",
    "JAŸ-Z": "JAY-Z",
}

HEADERS = {
    "User-Agent": "music-map-longtail/1.0 ( https://github.com/ArtfulDodgerrr/music-map )"
}

# ── Genre tag → (family, cluster) ────────────────────────────────────────────
TAG_MAP = {
    # Hip-Hop / Rap
    "trap":                  ("RAP & HIP-HOP", "Trap"),
    "drill":                 ("RAP & HIP-HOP", "Drill"),
    "cloud rap":             ("RAP & HIP-HOP", "Cloud Rap"),
    "soundcloud rap":        ("RAP & HIP-HOP", "Cloud Rap"),
    "pluggnb":               ("RAP & HIP-HOP", "Cloud Rap"),
    "plugg":                 ("RAP & HIP-HOP", "Cloud Rap"),
    "mumble rap":            ("RAP & HIP-HOP", "New Wave"),
    "phonk":                 ("RAP & HIP-HOP", "New Wave"),
    "hip-hop":               ("RAP & HIP-HOP", "Hip-Hop"),
    "hip hop":               ("RAP & HIP-HOP", "Hip-Hop"),
    "rap":                   ("RAP & HIP-HOP", "Rap"),
    "gangsta rap":           ("RAP & HIP-HOP", "Rap"),
    "mafioso rap":           ("RAP & HIP-HOP", "Rap"),
    "crunk":                 ("RAP & HIP-HOP", "Rap"),
    "conscious hip hop":     ("RAP & HIP-HOP", "Lyrical"),
    "political hip hop":     ("RAP & HIP-HOP", "Lyrical"),
    "jazz rap":              ("RAP & HIP-HOP", "Lyrical"),
    "boom bap":              ("RAP & HIP-HOP", "Lyrical"),
    "east coast hip hop":    ("RAP & HIP-HOP", "Lyrical"),
    "underground hip-hop":   ("RAP & HIP-HOP", "Underground"),
    "underground hip hop":   ("RAP & HIP-HOP", "Underground"),
    "underground rap":       ("RAP & HIP-HOP", "Underground"),
    "lo-fi hip hop":         ("RAP & HIP-HOP", "Underground"),
    # R&B / Soul
    "r&b":                   ("R&B & SOUL", "R&B"),
    "rnb":                   ("R&B & SOUL", "R&B"),
    "rhythm and blues":      ("R&B & SOUL", "R&B"),
    "contemporary r&b":      ("R&B & SOUL", "R&B"),
    "pop r&b":               ("R&B & SOUL", "R&B"),
    "soul":                  ("R&B & SOUL", "Soul"),
    "neo soul":              ("R&B & SOUL", "Neo-Soul"),
    "neo-soul":              ("R&B & SOUL", "Neo-Soul"),
    "quiet storm":           ("R&B & SOUL", "Soul"),
    "new jack swing":        ("R&B & SOUL", "Soul"),
    "funk":                  ("R&B & SOUL", "Soul"),
    "motown":                ("R&B & SOUL", "Soul"),
    # Electronic
    "electronic":            ("ELECTRONIC", "Electronic"),
    "electronica":           ("ELECTRONIC", "Electronic"),
    "idm":                   ("ELECTRONIC", "IDM"),
    "ambient":               ("ELECTRONIC", "Ambient"),
    "house":                 ("ELECTRONIC", "Dance"),
    "edm":                   ("ELECTRONIC", "Dance"),
    "techno":                ("ELECTRONIC", "Dance"),
    "drum and bass":         ("ELECTRONIC", "Dance"),
    "dubstep":               ("ELECTRONIC", "Dance"),
    "glitch":                ("ELECTRONIC", "IDM"),
    "hyperpop":              ("ELECTRONIC", "Hyperpop"),
    # Pop
    "pop":                   ("POP", "Pop"),
    "indie pop":             ("POP", "Indie Pop"),
    "synth-pop":             ("POP", "Synth-Pop"),
    "dream pop":             ("POP", "Indie Pop"),
    "electropop":            ("POP", "Synth-Pop"),
    # Rock / Indie
    "rock":                  ("ROCK & INDIE", "Rock"),
    "indie":                 ("ROCK & INDIE", "Indie"),
    "indie rock":            ("ROCK & INDIE", "Indie"),
    "alternative rock":      ("ROCK & INDIE", "Alternative"),
    "alternative":           ("ROCK & INDIE", "Alternative"),
    "psychedelic rock":      ("ROCK & INDIE", "Alternative"),
    "punk":                  ("ROCK & INDIE", "Rock"),
    "metal":                 ("ROCK & INDIE", "Rock"),
    "shoegaze":              ("ROCK & INDIE", "Alternative"),
    # Jazz / World
    "jazz":                  ("JAZZ & WORLD", "Jazz"),
    "smooth jazz":           ("JAZZ & WORLD", "Jazz"),
    "post-bop":              ("JAZZ & WORLD", "Jazz"),
    "folk":                  ("JAZZ & WORLD", "Folk"),
    "singer-songwriter":     ("JAZZ & WORLD", "Folk"),
    "reggae":                ("JAZZ & WORLD", "Reggae"),
    "dancehall":             ("JAZZ & WORLD", "Reggae"),
    "afrobeats":             ("JAZZ & WORLD", "World"),
    "afrobeat":              ("JAZZ & WORLD", "World"),
    "amapiano":              ("JAZZ & WORLD", "World"),
    "latin":                 ("JAZZ & WORLD", "Latin"),
    "bossa nova":            ("JAZZ & WORLD", "Latin"),
    "cumbia":                ("JAZZ & WORLD", "Latin"),
    "blues":                 ("JAZZ & WORLD", "Blues"),
    "gospel":                ("JAZZ & WORLD", "Gospel"),
    "classical":             ("JAZZ & WORLD", "Classical"),
}

# colors per family / cluster
FAM_COLORS = {
    "RAP & HIP-HOP": "#ff9500",
    "R&B & SOUL":    "#cc44ff",
    "ELECTRONIC":    "#00ccaa",
    "POP":           "#ff5599",
    "ROCK & INDIE":  "#88cc44",
    "JAZZ & WORLD":  "#ffcc44",
    "MISC":          "#8899aa",
}

CLUSTER_COLORS = {
    # Rap
    "Trap":        "#ff4500",
    "Drill":       "#cc1100",
    "Cloud Rap":   "#9966ff",
    "New Wave":    "#ff7733",
    "Hip-Hop":     "#ff9500",
    "Rap":         "#ffaa33",
    "Lyrical":     "#cc8800",
    "Underground": "#aa7700",
    # R&B
    "R&B":         "#cc44ff",
    "Soul":        "#aa22cc",
    "Neo-Soul":    "#ee44dd",
    # Electronic
    "Electronic":  "#00ccaa",
    "IDM":         "#00ffcc",
    "Ambient":     "#44ccbb",
    "Dance":       "#00aaff",
    "Hyperpop":    "#ff44ff",
    # Pop
    "Pop":         "#ff5599",
    "Indie Pop":   "#ff88bb",
    "Synth-Pop":   "#ff44aa",
    # Rock
    "Rock":        "#88cc44",
    "Indie":       "#aad966",
    "Alternative": "#77bb33",
    # Jazz/World
    "Jazz":        "#ffcc44",
    "Folk":        "#ffdd77",
    "Reggae":      "#44bb88",
    "World":       "#ffaa33",
    "Latin":       "#ff9933",
    "Blues":       "#cc8822",
    "Gospel":      "#ddaa55",
    "Classical":   "#ccbb66",
    # Misc
    "Long Tail":   "#8899aa",
}

FAM_CAPTIONS = {
    "RAP & HIP-HOP": "trap · drill · lyrical · underground",
    "R&B & SOUL":    "r&b · soul · neo-soul",
    "ELECTRONIC":    "electronic · dance · ambient · idm",
    "POP":           "pop · indie pop · synth-pop",
    "ROCK & INDIE":  "rock · indie · alternative",
    "JAZZ & WORLD":  "jazz · folk · reggae · world",
    "MISC":          "unclassified long tail",
}


def slug(name):
    s = name.lower().replace(" ", "_")
    s = re.sub(r"[^\w-]", "", s)
    return s or "artist"


def mb_lookup(name):
    """Return (family, cluster) from MusicBrainz tags, or None."""
    q = urllib.parse.quote(f'artist:"{name}"')
    url = f"https://musicbrainz.org/ws/2/artist?query={q}&fmt=json&limit=5"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        artists = data.get("artists") or []
        # Find best name match
        name_lo = name.lower()
        best = None
        for a in artists:
            if a.get("name", "").lower() == name_lo:
                best = a
                break
        if not best and artists:
            best = artists[0]
        if not best:
            return None
        # Check if we need to do a second lookup for tags
        tags = best.get("tags") or []
        if not tags and best.get("id"):
            # Try lookup with tags
            mbid = best["id"]
            url2 = f"https://musicbrainz.org/ws/2/artist/{mbid}?inc=tags&fmt=json"
            req2 = urllib.request.Request(url2, headers=HEADERS)
            try:
                with urllib.request.urlopen(req2, timeout=10) as r2:
                    data2 = json.loads(r2.read())
                tags = data2.get("tags") or []
                time.sleep(1.1)
            except Exception:
                pass
        # Sort tags by count descending
        tags_sorted = sorted(tags, key=lambda t: t.get("count", 0), reverse=True)
        for tag in tags_sorted:
            tname = tag.get("name", "").lower()
            if tname in TAG_MAP:
                return TAG_MAP[tname]
        # Partial match
        for tag in tags_sorted[:10]:
            tname = tag.get("name", "").lower()
            for key, val in TAG_MAP.items():
                if key in tname:
                    return val
        return None
    except Exception as e:
        print(f"    MB error for {name}: {e}")
        return None


def deezer_artist(name):
    """Return (image_url, deezer_id) or (None, None)."""
    q = urllib.parse.quote(name)
    url = f"https://api.deezer.com/search/artist?q={q}&limit=1"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        hits = data.get("data") or []
        if hits:
            a = hits[0]
            img = a.get("picture_medium") or a.get("picture_big") or a.get("picture")
            return img, a.get("id")
    except Exception as e:
        print(f"    Deezer error for {name}: {e}")
    return None, None


def download_image(name, url):
    """Download image to docs/art/<slug>.jpg. Returns filename or None."""
    fname = slug(name) + ".jpg"
    dest = ART_DIR / fname
    if dest.exists():
        return fname
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as r:
            dest.write_bytes(r.read())
        return fname
    except Exception as e:
        print(f"    Image download failed for {name}: {e}")
        return None


def build_map2(artists_with_data):
    """
    artists_with_data: list of dicts with keys:
      name, weight, sp, fam_cl (family, cluster), img_file
    Returns fams structure for map2.json.
    """
    # Group: family → cluster → [artists]
    grouped = defaultdict(lambda: defaultdict(list))
    for a in artists_with_data:
        fam, cl = a["fam_cl"]
        grouped[fam][cl].append(a)

    # Sort families by artist count descending
    fam_order = sorted(grouped.keys(), key=lambda f: -sum(len(v) for v in grouped[f].values()))

    fams = []
    for fam in fam_order:
        clusters = grouped[fam]
        # Sort clusters by count
        cl_order = sorted(clusters.keys(), key=lambda c: -len(clusters[c]))
        fam_clusters = []
        for cl in cl_order:
            artists = sorted(clusters[cl], key=lambda a: -a["weight"])
            col = CLUSTER_COLORS.get(cl, FAM_COLORS.get(fam, "#888888"))
            fam_clusters.append({
                "n": cl,
                "col": col,
                "cap": f"{fam.lower()} · {cl.lower()}",
                "s": [{
                    "n": cl,
                    "si": 0,
                    "a": [{
                        "n": a["name"],
                        "w": a["weight"],
                        "al": None,
                        "bc": None,
                        "i": a.get("img_file"),
                        "sp": a.get("sp") or None,
                    } for a in artists],
                }],
            })
        fams.append({
            "n": fam,
            "c": fam_clusters,
        })
    return fams


def main():
    ART_DIR.mkdir(parents=True, exist_ok=True)

    lib = json.loads(LIB_PATH.read_text(encoding="utf-8"))
    map_data = json.loads(MAP_PATH.read_text(encoding="utf-8"))

    # Build set of artists already on the main map
    on_map = set()
    for fam in map_data["fams"]:
        for cl in fam["c"]:
            for sg in cl["s"]:
                for a in sg["a"]:
                    on_map.add(a["n"])

    # Filter to long-tail artists, excluding alias duplicates already on the main map
    alias_targets = set(NAME_ALIASES.values())  # canonical names that ARE on the map
    tail = [
        a for a in lib
        if a["name"] not in on_map
        and NAME_ALIASES.get(a["name"]) not in alias_targets
        and a["weight"] >= WEIGHT_MIN
    ]
    tail.sort(key=lambda a: -a["weight"])
    print(f"{len(tail)} long-tail artists (weight >= {WEIGHT_MIN}, not on main map)")
    print(f"Top 5 by weight: {[(a['name'], a['weight']) for a in tail[:5]]}")

    results = []
    for i, a in enumerate(tail, 1):
        name = a["name"]
        print(f"[{i}/{len(tail)}] {name} (w={a['weight']})")

        # 1. MusicBrainz genre
        fam_cl = mb_lookup(name)
        if fam_cl:
            print(f"      → {fam_cl[0]} / {fam_cl[1]}")
        else:
            fam_cl = ("RAP & HIP-HOP", "Long Tail")
            print(f"      → no tag found, default: RAP & HIP-HOP / Long Tail")
        time.sleep(1.1)  # MusicBrainz rate limit: 1 req/sec

        # 2. Deezer image
        img_url, _ = deezer_artist(name)
        img_file = None
        if img_url:
            img_file = download_image(name, img_url)
        time.sleep(0.3)

        results.append({
            "name": name,
            "weight": a["weight"],
            "sp": a.get("spotify_url", "") or None,
            "fam_cl": fam_cl,
            "img_file": img_file,
        })

    # Build map structure
    fams = build_map2(results)

    total = sum(len(sg["a"]) for f in fams for cl in f["c"] for sg in cl["s"])
    print(f"\n{total} artists across {len(fams)} families:")
    for f in fams:
        cnt = sum(len(sg["a"]) for cl in f["c"] for sg in cl["s"])
        print(f"  {f['n']}: {cnt}")

    MAP2_OUT.parent.mkdir(parents=True, exist_ok=True)
    MAP2_OUT.write_text(
        json.dumps({"fams": fams}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"\nSaved → {MAP2_OUT}")

    # Build graph2.json (nodes only, no edges yet)
    nodes = []
    for a in results:
        nodes.append([a["name"], None, 0, a["weight"], 4])
    graph2 = {"n": nodes, "e": [], "r": {}}
    GRAPH2_OUT.write_text(
        json.dumps(graph2, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Saved → {GRAPH2_OUT}")
    print("\nDone!")


if __name__ == "__main__":
    main()
