#!/usr/bin/env python3
"""
Fetches exact Google Scholar metrics (All & Since 2021 Citations, h-index, i10-index)
and full publication lists (all 90+ articles, conference papers, chapters, etc.)
for every lab member in data.js who has a verified `links.scholar` URL (`user=...`),
and writes them to `scholar_cache.js`.
"""
import json, re, time
from pathlib import Path
from scholarly import scholarly

ROOT = Path(__file__).parent
DATA_JS = ROOT / "data.js"
CACHE_JS = ROOT / "scholar_cache.js"

def extract_scholar_users(js_text):
    users = {}
    # Find each person block with id and scholar link
    for m in re.finditer(r'\{id:\s*"([^"]+)"[^\n]*?\n(?:[^\n]*?\n){0,8}?[^\n]*?scholar:\s*"https://scholar\.google\.com/citations\?[^"]*?user=([A-Za-z0-9_-]+)"', js_text):
        pid, uid = m.group(1), m.group(2)
        users[pid] = uid
    return users

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

    for pid, uid in users.items():
        print(f"Fetching Google Scholar profile for {pid} ({uid})...")
        try:
            author = scholarly.search_author_id(uid)
            author = scholarly.fill(author, sections=["basics", "indices", "publications"])
            pubs = []
            for p in author.get("publications", []):
                bib = p.get("bib", {})
                title = bib.get("title", "").strip()
                if not title:
                    continue
                year_raw = bib.get("pub_year") or bib.get("year")
                try:
                    year = int(year_raw)
                except Exception:
                    year = 0
                venue = bib.get("citation") or bib.get("journal") or bib.get("venue") or bib.get("booktitle") or ""
                authors_str = bib.get("author", "")
                if " and " in authors_str:
                    a_list = [x.strip() for x in authors_str.split(" and ") if x.strip()]
                elif "," in authors_str:
                    a_list = [x.strip() for x in authors_str.split(",") if x.strip()]
                else:
                    a_list = [authors_str] if authors_str else []
                cites = p.get("num_citations", 0)
                pub_id = p.get("author_pub_id", "")
                gs_url = f"https://scholar.google.com/citations?view_op=view_citation&hl=en&user={uid}&citation_for_view={pub_id}" if pub_id else ""
                is_conf = bool(re.search(r"abstract|meeting|conference|egu|agu|symposium|workshop|proceedings", venue, re.I))
                pubs.append({
                    "year": year,
                    "date": str(year) if year else "",
                    "title": title,
                    "authors": a_list,
                    "venue": venue,
                    "cites": cites,
                    "type": "Conference contribution" if is_conf else "Article",
                    "url": gs_url
                })
            pubs.sort(key=lambda x: (x.get("year") or 0, x.get("cites") or 0), reverse=True)
            existing[pid] = {
                "scholarId": uid,
                "updated": time.strftime("%Y-%m-%d"),
                "citations": author.get("citedby", 0),
                "citationsRecent": author.get("citedby5y", 0),
                "hindex": author.get("hindex", 0),
                "hindexRecent": author.get("hindex5y", 0),
                "i10index": author.get("i10index", 0),
                "i10indexRecent": author.get("i10index5y", 0),
                "publications": pubs
            }
            print(f"  -> {pid}: {len(pubs)} publications, {existing[pid]['citations']} citations")
            time.sleep(2)
        except Exception as e:
            print(f"  -> Warning: failed to fetch {pid} ({uid}): {e}")

    CACHE_JS.write_text("const SCHOLAR_CACHE = " + json.dumps(existing, indent=2) + ";\n", encoding="utf-8")
    print("Saved scholar_cache.js")

if __name__ == "__main__":
    main()
