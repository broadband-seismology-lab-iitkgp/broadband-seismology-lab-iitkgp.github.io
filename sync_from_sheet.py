#!/usr/bin/env python3
"""
Syncs lab member profiles, photos, and Google Scholar publications from the Google Form's
linked Google Sheet (either via Published CSV URL in LAB.sheetCsvUrl or a local responses.csv file),
then automatically runs sync_scholar.py for any newly added Google Scholar links!
"""
import csv, io, json, re, subprocess, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
DATA_JS = ROOT / "data.js"
PHOTOS_DIR = ROOT / "photos"
PHOTOS_DIR.mkdir(exist_ok=True)

def norm_name(s):
    return re.sub(r"\s+", " ", re.sub(r"prof\.|dr\.|[^a-z ]", "", s.lower())).strip()

def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"prof\.|dr\.", "", s.lower()).strip()).strip("-")

def convert_drive_photo_url(url):
    url = (url or "").strip()
    if not url:
        return ""
    # Extract Google Drive file ID from /file/d/<ID>/view or ?id=<ID>
    m = re.search(r"/file/d/([A-Za-z0-9_-]{15,})", url) or re.search(r"[?&]id=([A-Za-z0-9_-]{15,})", url)
    if m:
        fid = m.group(1)
        return f"https://drive.google.com/thumbnail?id={fid}&sz=w500"
    return url

def download_photo_if_drive(url, pid):
    url = (url or "").strip()
    if not url:
        return ""
    m = re.search(r"/file/d/([A-Za-z0-9_-]{15,})", url) or re.search(r"[?&]id=([A-Za-z0-9_-]{15,})", url)
    dl_url = f"https://drive.google.com/uc?export=download&id={m.group(1)}" if m else url
    try:
        req = urllib.request.Request(dl_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = r.read()
            if len(data) > 1000 and (data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n" or b"WEBP" in data[:16]):
                out = PHOTOS_DIR / f"{pid}.jpg"
                out.write_bytes(data)
                print(f"  -> Downloaded photo to photos/{pid}.jpg ({len(data)} bytes)")
                return f"photos/{pid}.jpg"
    except Exception as e:
        print(f"  -> Using direct thumbnail URL for {pid} ({e})")
    return convert_drive_photo_url(url)

def main():
    csv_source = sys.argv[1] if len(sys.argv) > 1 else ""
    if not csv_source:
        # Check if responses.csv exists in folder
        local_csv = ROOT / "responses.csv"
        if local_csv.exists():
            csv_source = str(local_csv)
        else:
            print("Usage: python3 sync_from_sheet.py <google-sheet-csv-url-or-local-responses.csv>")
            return

    if csv_source.startswith("http"):
        req = urllib.request.Request(csv_source, headers={"User-Agent": "Mozilla/5.0"})
        raw_csv = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", errors="replace")
    else:
        raw_csv = Path(csv_source).read_text(encoding="utf-8", errors="replace")

    reader = list(csv.DictReader(io.StringIO(raw_csv)))
    print(f"Loaded {len(reader)} form responses.")

    # Read current data.js via node to get structured objects cleanly, update them, and write back
    helper_js = """
    const fs = require('fs');
    eval(fs.readFileSync('data.js', 'utf8') + '; global.OUT = {LAB, PEOPLE, PUBLICATIONS};');
    console.log(JSON.stringify(global.OUT));
    """
    out_json = subprocess.check_output(["node", "-e", helper_js], cwd=ROOT).decode("utf-8")
    state = json.loads(out_json)
    people = state["PEOPLE"]

    def pick(row, substr):
        for k, v in row.items():
            if k and substr.lower() in k.lower():
                return (v or "").strip()
        return ""

    for row in reader:
        name = pick(row, "Full Name")
        if not name:
            continue
        pid = slugify(name)
        target = next((p for p in people if p["id"] == pid or norm_name(p["name"]) == norm_name(name)), None)
        if not target:
            target = {
                "id": pid,
                "name": name,
                "role": "PhD Scholar",
                "group": "student",
                "status": "active",
                "photo": "",
                "position": "PhD Scholar, Dept. of Geology and Geophysics, IIT Kharagpur",
                "email": "",
                "bio": "",
                "interests": ["Seismology"],
                "links": {"scholar": "", "researchgate": "", "orcid": "", "web": ""}
            }
            people.append(target)
            print(f"Added new lab member: {name} ({pid})")
        else:
            print(f"Updating existing lab member: {target['name']} ({target['id']})")

        status_raw = pick(row, "Status in Lab")
        grad_year = pick(row, "Graduation Year")
        if "Alumni" in status_raw:
            target["status"] = "alumni"
            deg = "MS" if "MS" in status_raw else "PhD"
            target["degree"] = deg
            if grad_year.isdigit():
                target["gradYear"] = int(grad_year)
                target["role"] = f"{deg} Graduate ({grad_year})"
            else:
                target["role"] = f"{deg} Graduate"
        elif "Principal Investigator" in status_raw:
            target["group"] = "pi"
            target["status"] = "active"
            target["role"] = "Principal Investigator"
        elif status_raw:
            target["status"] = "active"
            target["role"] = "MS Scholar" if "MS" in status_raw else ("Postdoctoral Fellow" if "Postdoc" in status_raw else "PhD Scholar")

        pos = pick(row, "Current Position")
        if pos:
            target["position"] = pos

        thesis = pick(row, "Thesis Title")
        if thesis:
            target["thesis"] = thesis
            if target.get("status") == "alumni":
                target["bio"] = f"Thesis: {thesis}"

        bio = pick(row, "Short Biography")
        if bio:
            target["bio"] = bio

        kw = pick(row, "Research Interests")
        if kw:
            target["interests"] = [x.strip() for x in kw.split(",") if x.strip()]
            target["area"] = ", ".join(target["interests"][:3])

        email = pick(row, "Public Email") or pick(row, "Email Address")
        if email:
            target["email"] = email

        links = target.setdefault("links", {"scholar": "", "researchgate": "", "orcid": "", "web": ""})
        sc = pick(row, "Google Scholar")
        if sc:
            links["scholar"] = sc
        orc = pick(row, "ORCID")
        if orc:
            if re.match(r"^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$", orc):
                orc = "https://orcid.org/" + orc
            links["orcid"] = orc
        rg = pick(row, "ResearchGate")
        if rg:
            links["researchgate"] = rg
        web = pick(row, "Personal Website")
        if web:
            links["web"] = web

        photo_url = pick(row, "Profile Photo")
        if photo_url:
            target["photo"] = download_photo_if_drive(photo_url, target["id"])

    # Write updated data.js
    new_js = (
        "// EDIT THIS FILE to update the website. status: \"active\" | \"alumni\"\n"
        f"const LAB = {json.dumps(state['LAB'], indent=2)};\n\n"
        f"const PEOPLE = {json.dumps(people, indent=2)};\n\n"
        f"const PUBLICATIONS = {json.dumps(state['PUBLICATIONS'], indent=2)};\n"
    )
    DATA_JS.write_text(new_js, encoding="utf-8")
    print("Updated data.js! Running sync_scholar.py for any newly added Google Scholar profiles...")
    subprocess.run([sys.executable, str(ROOT / "sync_scholar.py")], cwd=ROOT)

if __name__ == "__main__":
    main()
