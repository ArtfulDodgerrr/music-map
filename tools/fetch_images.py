"""
Fetch artist images for all artists on the map and save to docs/art/.
Uses the Deezer public API — no API key required.
Deezer search: https://api.deezer.com/search/artist?q=<name>&limit=1

Run from project root: python tools/fetch_images.py
"""

import json
import re
import time
import urllib.request
import urllib.parse
from pathlib import Path

MAP_PATH  = Path("docs/data/map.json")
ART_DIR   = Path("docs/art")

HEADERS = {"User-Agent": "music-map-builder/1.0"}


def slug(name):
    s = name.lower().replace(" ", "_")
    s = re.sub(r"[^\w-]", "", s)
    return s or "artist"


def deezer_image(name):
    """Return (image_url, picture_xl) for the top Deezer artist match, or None."""
    q = urllib.parse.quote(name)
    url = f"https://api.deezer.com/search/artist?q={q}&limit=1"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        hits = data.get("data") or []
        if hits:
            a = hits[0]
            # picture_xl is 1000x1000, picture_big is 500x500, picture_medium is 250x250
            img = a.get("picture_medium") or a.get("picture_big") or a.get("picture")
            return img
    except Exception as e:
        print(f"  WARN {name}: {e}")
    return None


def map_artists(fams):
    names = []
    for fam in fams:
        for cl in fam["c"]:
            for sg in cl["s"]:
                for a in sg["a"]:
                    names.append(a["n"])
    return names


def main():
    ART_DIR.mkdir(parents=True, exist_ok=True)
    map_data = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    names = map_artists(map_data["fams"])
    print(f"Fetching images for {len(names)} artists via Deezer…")

    fname_map = {}
    for i, name in enumerate(names, 1):
        fname = slug(name) + ".jpg"
        dest = ART_DIR / fname
        if dest.exists():
            fname_map[name] = fname
            print(f"  [{i}/{len(names)}] skip (cached)  {name}")
            continue

        img_url = deezer_image(name)
        if not img_url:
            print(f"  [{i}/{len(names)}] NOT FOUND       {name}")
            continue

        try:
            req = urllib.request.Request(img_url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=10) as r:
                dest.write_bytes(r.read())
            fname_map[name] = fname
            print(f"  [{i}/{len(names)}] ok              {name}")
        except Exception as e:
            print(f"  [{i}/{len(names)}] DOWNLOAD FAIL   {name}: {e}")

        time.sleep(0.3)   # polite pause — Deezer rate limit is generous but not unlimited

    # Patch "i" field in map.json
    patched = 0
    for fam in map_data["fams"]:
        for cl in fam["c"]:
            for sg in cl["s"]:
                for a in sg["a"]:
                    fn = fname_map.get(a["n"])
                    if fn:
                        a["i"] = fn
                        patched += 1

    MAP_PATH.write_text(
        json.dumps(map_data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"\nDone. {patched}/{len(names)} artists have images. Reload the site to see them.")


if __name__ == "__main__":
    main()
