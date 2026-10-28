#!/usr/bin/env python3
"""
Zero-dependency Google Scholar Profile & Publication Sync Script.
Uses only Python's standard library (urllib, html.parser, re, json) — no pip packages needed!
Fetches exact Google Scholar metrics (All & Since 2021 Citations, h-index, i10-index)
and all publications (paginating 0..100, 100..200) for every member in data.js with a `links.scholar` user ID.
"""
import html, json, re, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
DATA_JS = ROOT / "data.js"
CACHE_JS = ROOT / "scholar_cache.js"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

def extract_scholar_users(js_text):
    users = {}
    for chunk in js_text.split('{id: "')[1:]:
        pid = chunk.split('"', 1)[0]
        m = re.search(r'scholar:\s*"https://scholar\.google\.com/citations\?[^"]*?user=([A-Za-z0-9_-]+)', chunk)
        if m:
            users[pid] = m.group(1)
    return users

KNOWN_JOURNALS = re.compile(
    r"journal|bulletin|tectonophysics|tectonics|geophysics,\s*geosystems|letters|reports|"
    r"physics of the earth|physics and chemistry|soil dynamics|geomatics|seismica|precambrian|"
    r"gondwana|solid earth|natural hazards|geologica acta|current science|eos|pure and applied|"
    r"lithos|earth and planetary science|rev\.|reviews|annals|international|seismological|ier|ieee|nature|science",
    re.I
)

def classify_pub(title, venue):
    t = (title or "").strip()
    v = (venue or "").strip()
    tv = f"{t} {v}"
    if re.search(r"\b(thesis|dissertation)\b|^kharagpur\b|indian institute of technology", v, re.I):
        return "Thesis"
    if not v or re.search(r"\b(preprint|arxiv|essoar|authorea|research\s*square|ssrn|biorxiv|eartharxiv)\b", tv, re.I):
        return "Preprint"
    if re.search(r"\b(abstracts?|meeting|conference|general assembly|symposium|workshop|proceedings|session|egu\d{2}|agu\d{2}|epsc|iugg)\b|\?", v, re.I):
        return "Conference contribution"
    if re.search(r"^a review of\b|\breview:\b|\breview article\b", t, re.I):
        return "Review article"
    if re.search(r"\b(book|chapter|handbook|encyclopedia|springer\s+nature|agu\s+monograph|elsevier\s+book|special\s+publication|memoir|himalayan\s+natural\s+hazards)\b", v, re.I):
        return "Chapter"
    if re.match(r"^[A-Za-z][A-Za-z\s:,\-&]+,\s*\d+\s*[-–]\s*\d+\s*$", v) and not KNOWN_JOURNALS.search(v):
        return "Chapter"
    return "Article"

def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()

def fetch_url(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="replace")

def fetch_scholar_author(uid):
    metrics = {}
    pubs = []
    for cstart in (0, 100, 200):
        url = f"https://scholar.google.com/citations?hl=en&user={uid}&cstart={cstart}&pagesize=100&sortby=pubdate"
        page = fetch_url(url)
        if cstart == 0:
            # Parse gsc_rsb_std cells: [citations_all, citations_5y, hindex_all, hindex_5y, i10_all, i10_5y]
            cells = [int(x) for x in re.findall(r'class="gsc_rsb_std">(\d+)<', page) if x.isdigit()]
            if len(cells) >= 6:
                metrics = {
                    "citations": cells[0],
                    "citationsRecent": cells[1],
                    "hindex": cells[2],
                    "hindexRecent": cells[3],
                    "i10index": cells[4],
                    "i10indexRecent": cells[5],
                }
            elif len(cells) >= 3:
                metrics = {"citations": cells[0], "hindex": cells[1], "i10index": cells[2]}

        rows = re.findall(r'<tr class="gsc_a_tr">(.*?)</tr>', page, re.S)
        if not rows:
            break
        added = 0
        for row in rows:
            if "gsc_a_e" in row:
                continue
            t_m = re.search(r'<a[^>]*class="gsc_a_at"[^>]*>(.*?)</a>', row, re.S)
            href_m = re.search(r'<a[^>]*href="([^"]*)"[^>]*class="gsc_a_at"', row, re.S) or re.search(r'<a[^>]*class="gsc_a_at"[^>]*href="([^"]*)"', row, re.S)
            if not t_m:
                continue
            title = strip_tags(t_m.group(1))
            href = html.unescape(href_m.group(1)) if href_m else ""
            gs_url = ("https://scholar.google.com" + href) if href.startswith("/") else href

            grays = [strip_tags(g) for g in re.findall(r'<div class="gs_gray">(.*?)</div>', row, re.S)]
            authors_str = grays[0] if len(grays) > 0 else ""
            venue_str = grays[1] if len(grays) > 1 else ""
            venue_str = re.sub(r",\s*(19|20)\d{2}\s*$", "", venue_str).strip()

            c_m = re.search(r'class="gsc_a_ac[^"]*"[^>]*>(\d+)<', row)
            cites = int(c_m.group(1)) if c_m else 0

            y_m = re.search(r'class="gsc_a_h gsc_a_hc[^"]*"[^>]*>(\d{4})<', row) or re.search(r'class="gsc_a_y"[^>]*>.*?(\d{4}).*?</span>', row, re.S)
            year = int(y_m.group(1)) if y_m else 0

            a_list = [a.strip() for a in authors_str.split(",") if a.strip() and a.strip() != "..."]
            ptype = classify_pub(title, venue_str)
            if ptype == "Preprint" and not venue_str:
                venue_str = "Preprint"

            pubs.append({
                "year": year,
                "date": str(year) if year else "",
                "title": title,
                "authors": a_list,
                "venue": venue_str,
                "cites": cites,
                "type": ptype,
                "url": gs_url
            })
            added += 1
        if added < 100:
            break
        time.sleep(1.5)

    # Keep Google Scholar exact sortby=pubdate order (only sort by year desc while preserving original table rank)
    for idx, item in enumerate(pubs):
        item["gsRank"] = idx
    pubs.sort(key=lambda x: (-(x.get("year") or 0), x.get("gsRank", 0)))
    return metrics, pubs

def main():
    text = DATA_JS.read_text(encoding="utf-8")
    users = extract_scholar_users(text)
    print(f"Found {len(users)} members with Google Scholar IDs:", users)

    existing = {}
    if CACHE_JS.exists():
        raw = CACHE_JS.read_text(encoding="utf-8")
        idx = raw.find("{")
        if idx != -1:
            try:
                existing = json.loads(raw[idx:].rstrip().rstrip(";"))
            except Exception:
                existing = {}

    import sys
    force_all = "--all" in sys.argv
    existing = {k: v for k, v in existing.items() if users.get(k) == v.get("scholarId")}
    for pid, uid in users.items():
        if not force_all and pid in existing and len(existing[pid].get("publications", [])) > 0:
            print(f"Skipping {pid} ({uid}) — already synced ({len(existing[pid]['publications'])} pubs). Pass --all to refresh.")
            continue
        print(f"Fetching Google Scholar profile for {pid} ({uid})...")
        try:
            metrics, pubs = fetch_scholar_author(uid)
            if not pubs and not metrics:
                print(f"  -> Warning: empty response (possible Google CAPTCHA) for {pid}")
                continue
            existing[pid] = {
                "scholarId": uid,
                "updated": time.strftime("%Y-%m-%d"),
                **metrics,
                "publications": pubs
            }
            print(f"  -> {pid}: {len(pubs)} publications, {metrics.get('citations', 0)} citations (h-index: {metrics.get('hindex', 0)})")
            time.sleep(2)
        except Exception as e:
            print(f"  -> Error fetching {pid} ({uid}): {e}")

    CACHE_JS.write_text("const SCHOLAR_CACHE = " + json.dumps(existing, indent=2) + ";\n", encoding="utf-8")
    print("Successfully updated scholar_cache.js!")

if __name__ == "__main__":
    main()
