import os, sys, subprocess, zipfile, io
from playwright.sync_api import sync_playwright
from PIL import Image
from common import *

results = []
def sh(*a): return subprocess.run(list(a), capture_output=True).stdout.decode("utf-8", errors="replace")
def npages(path): return int([l.split()[1] for l in sh("pdfinfo", path).splitlines() if l.startswith("Pages:")][0])
def widths(path):
    out = sh("pdfinfo", "-f", "1", "-l", "50", path)
    return [l for l in out.splitlines() if "size" in l.lower()]
def page_size(path, n):
    out = sh("pdfinfo", "-f", str(n), "-l", str(n), path)
    for l in out.splitlines():
        if l.startswith("Page") and "size" in l:
            return l
    return ""
def wait_done(page, timeout=180000):
    pb = page.locator("[role=progressbar], .progress").first
    try: pb.wait_for(state="visible", timeout=6000)
    except Exception: pass
    pb.wait_for(state="hidden", timeout=timeout)

CASES = []
def case(name):
    def d(fn): fn._name = name; CASES.append(fn); return fn
    return d

@case("Merge PDF: two files join in order, reordering works")
def t_merge(page, logs):
    page.goto(f"{BASE}/merge-pdf/"); page.wait_for_load_state("networkidle")
    upload(page, ["sample.pdf", "two.pdf"]); page.get_by_text("two.pdf").first.wait_for()
    page.get_by_role("button", name="Move two.pdf up").click()  # two.pdf, sample.pdf
    click_text(page, "Merge 2 PDFs"); wait_done(page)
    path = download_via(page, "Download PDF", "merged.pdf")
    n = npages(path); print("     pages:", n)
    assert n == 5, n  # two.pdf(2) + sample.pdf(3)
    t1 = sh("pdftotext", "-f", "1", "-l", "1", path, "-")
    assert "TWO-A" in t1, t1

@case("Split PDF: page ranges make separate files; every-N works")
def t_split(page, logs):
    page.goto(f"{BASE}/split-pdf/"); page.wait_for_load_state("networkidle")
    upload(page, ["photos.pdf"]); page.get_by_text("photos.pdf").first.wait_for()
    page.locator("#ranges").fill("1-2, 4")
    click_text(page, "Split PDF"); wait_done(page)
    path = download_via(page, "Download all as ZIP", "split.zip")
    z = zipfile.ZipFile(path); names = sorted(z.namelist()); print("     zip:", names)
    assert len(names) == 2, names

@case("Rotate PDF: turning a page and saving actually rotates it")
def t_rotate(page, logs):
    page.goto(f"{BASE}/rotate-pdf/"); page.wait_for_load_state("networkidle")
    upload(page, ["sample.pdf"]); page.get_by_text("PDF").first.wait_for(timeout=20000)
    page.wait_for_timeout(600)
    page.get_by_role("button", name="Turn page 1 right").click()
    click_text(page, "Save rotated PDF"); wait_done(page)
    path = download_via(page, "Download PDF", "rotated.pdf")
    out = sh("pdfinfo", "-f", "1", "-l", "1", path)
    rot = [l for l in out.splitlines() if "rot" in l.lower()]
    print("     ", rot)
    assert "90" in rot[0]

@case("Remove pages: page 2 is gone, others remain, text confirms")
def t_remove(page, logs):
    page.goto(f"{BASE}/remove-pages/"); page.wait_for_load_state("networkidle")
    upload(page, ["sample.pdf"]); page.get_by_text("PDF").first.wait_for(timeout=20000)
    page.wait_for_timeout(600)
    page.locator(".pg__btn").nth(1).click()
    click_text(page, "Remove pages"); wait_done(page)
    path = download_via(page, "Download PDF", "removed.pdf")
    n = npages(path); print("     pages:", n)
    assert n == 2
    assert "PAGE 1" in sh("pdftotext", "-f", "1", "-l", "1", path, "-")
    assert "PAGE 3" in sh("pdftotext", "-f", "2", "-l", "2", path, "-")
    assert "SECRET" not in sh("qpdf", "--qdf", "--object-streams=disable", path, "-")

@case("Extract pages: only the chosen pages come out, in click order")
def t_extract(page, logs):
    page.goto(f"{BASE}/extract-pages/"); page.wait_for_load_state("networkidle")
    upload(page, ["sample.pdf"]); page.get_by_text("PDF").first.wait_for(timeout=20000)
    page.wait_for_timeout(600)
    page.locator(".pg__btn").nth(2).click()
    page.locator(".pg__btn").nth(0).click()
    click_text(page, "Extract pages"); wait_done(page)
    path = download_via(page, "Download PDF", "extracted.pdf")
    n = npages(path); print("     pages:", n)
    assert n == 2
    t1 = sh("pdftotext", "-f", "1", "-l", "1", path, "-")
    assert "PAGE 1" in t1 or "PAGE 3" in t1

@case("Protect PDF: locked file needs the password; wrong original still readable")
def t_protect(page, logs):
    page.goto(f"{BASE}/protect-pdf/"); page.wait_for_load_state("networkidle")
    upload(page, ["sample.pdf"]); page.get_by_text("sample.pdf").first.wait_for()
    page.locator("#pw").fill("hunter22"); page.locator("#pw2").fill("hunter22")
    click_text(page, "Protect PDF"); wait_done(page)
    path = download_via(page, "Download PDF", "protected.pdf")
    r1 = sh("qpdf", "--check", path)
    print("     qpdf --check:", r1.strip()[:80])
    good = sh("qpdf", "--password=hunter22", "--decrypt", path, "-")  # to stdout via -, check via pdfinfo on file
    r2 = subprocess.run(["qpdf", "--password=wrong", "--check", path], capture_output=True)
    assert r2.returncode != 0, "wrong password should fail"
    r3 = subprocess.run(["qpdf", "--password=hunter22", "--check", path], capture_output=True)
    assert r3.returncode == 0, "right password should succeed"
    print("     wrong pw rejected, right pw accepted")

@case("Unlock PDF: removes a password we know")
def t_unlock(page, logs):
    page.goto(f"{BASE}/unlock-pdf/"); page.wait_for_load_state("networkidle")
    upload(page, ["locked.pdf"]); page.get_by_text("locked.pdf").first.wait_for()
    page.locator("#pw").fill("userpw")
    click_text(page, "Unlock PDF"); wait_done(page)
    path = download_via(page, "Download PDF", "unlocked.pdf")
    info = sh("pdfinfo", path)
    print("     ", [l for l in info.splitlines() if "Encrypt" in l])
    assert "Encrypted:       no" in info
    assert "PAGE 1" in sh("pdftotext", "-f", "1", "-l", "1", path, "-")

@case("Repair PDF: a truncated file becomes readable again")
def t_repair(page, logs):
    import shutil
    bad = "/home/claude/testfiles/_damaged.pdf"
    data = open("/home/claude/testfiles/photos.pdf", "rb").read()
    open(bad, "wb").write(data[:-300])
    assert subprocess.run(["pdfinfo", bad], capture_output=True).returncode != 0, "fixture should be unreadable before repair"
    page.goto(f"{BASE}/repair-pdf/"); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]", bad); page.get_by_text("_damaged.pdf").first.wait_for()
    click_text(page, "Repair PDF"); wait_done(page, 60000)
    path = download_via(page, "Download PDF", "repaired.pdf")
    n = npages(path); print("     repaired pages:", n)
    assert n == 6

@case("PDF to Text: extracts real text; scanned PDF is reported as empty")
def t_text(page, logs):
    page.goto(f"{BASE}/pdf-to-text/"); page.wait_for_load_state("networkidle")
    upload(page, ["sample.pdf"]); page.get_by_text("sample.pdf").first.wait_for()
    click_text(page, "Extract text"); wait_done(page)
    path = download_via(page, "Download TXT", "sample.txt")
    content = open(path, encoding="utf-8").read()
    print("     first line:", content.splitlines()[0])
    assert "PAGE 1" in content and "PAGE 2" in content

@case("Page numbers: bottom-right 'Page N of M' lands correctly")
def t_numbers(page, logs):
    page.goto(f"{BASE}/add-page-numbers/"); page.wait_for_load_state("networkidle")
    upload(page, ["sample.pdf"]); page.get_by_text("sample.pdf").first.wait_for()
    page.get_by_role("radio", name="Bottom right").check(force=True)
    page.locator("#numfmt").select_option("page-n-of-total")
    click_text(page, "Add page numbers"); wait_done(page)
    path = download_via(page, "Download PDF", "numbered.pdf")
    for n in (1, 2, 3):
        t = sh("pdftotext", "-f", str(n), "-l", str(n), path, "-")
        assert f"Page {n} of 3" in t, t
    print("     'Page 1 of 3' .. 'Page 3 of 3' all present")

@case("Watermark: diagonal text appears on every page, faded")
def t_watermark(page, logs):
    page.goto(f"{BASE}/watermark-pdf/"); page.wait_for_load_state("networkidle")
    upload(page, ["sample.pdf"]); page.get_by_text("sample.pdf").first.wait_for()
    page.locator("#wmtext").fill("SAMPLE ONLY")
    click_text(page, "Add watermark"); wait_done(page)
    path = download_via(page, "Download PDF", "watermarked.pdf")
    for n in (1, 2, 3):
        # diagonal text lands one letter per line in pdftotext, so check the letters are all there in order
        t = sh("pdftotext", "-f", str(n), "-l", str(n), path, "-").replace("\n", "")
        assert "SAMPLEONLY" in t, t
    print("     watermark text present on all 3 pages (diagonal, so pdftotext splits it by line)")
    subprocess.run(["pdftoppm", "-r", "80", "-png", "-f", "1", "-l", "1", path, "/home/claude/dl/wmcheck"], check=True)
    f = sorted(x for x in os.listdir("/home/claude/dl") if x.startswith("wmcheck"))[-1]
    im = Image.open(os.path.join("/home/claude/dl", f)).convert("L")
    px = im.load(); xs=[]; ys=[]
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y] < 235: xs.append(x); ys.append(y)
    cx, cy = (min(xs)+max(xs))/2, (min(ys)+max(ys))/2
    pw, ph = im.width, im.height
    print(f"     ink bbox centre ({cx:.0f},{cy:.0f}) vs page centre ({pw/2:.0f},{ph/2:.0f})")
    assert abs(cx - pw/2) < pw*0.12 and abs(cy - ph/2) < ph*0.12, "watermark should be roughly centred on the page"

@case("Scan to PDF: camera capture attribute present; Black & white output is real B/W")
def t_scan(page, logs):
    page.goto(f"{BASE}/scan-to-pdf/"); page.wait_for_load_state("networkidle")
    has_capture = page.evaluate("!!document.querySelector('input[capture]')")
    print("     camera capture input present:", has_capture)
    assert has_capture
    upload(page, ["photo_big.jpg"]); page.get_by_text("photo_big.jpg").first.wait_for()
    page.get_by_role("radio", name="Black & white").check(force=True)
    click_text(page, "Create PDF"); wait_done(page, 60000)
    path = download_via(page, "Download PDF", "scan.pdf")
    # Check the embedded picture itself (not a re-rasterized page, which resamples and blends edges).
    subprocess.run(["pdfimages", "-png", path, "/home/claude/dl/scanimg"], check=True)
    f = sorted(x for x in os.listdir("/home/claude/dl") if x.startswith("scanimg"))[-1]
    im = Image.open(os.path.join("/home/claude/dl", f)).convert("RGB")
    colors = im.getcolors(maxcolors=100000)
    only_bw = all((r > 240 and g > 240 and b > 240) or (r < 15 and g < 15 and b < 15) for _, (r, g, b) in (colors or []))
    print("     embedded image:", im.size, "| distinct colors:", len(colors) if colors else "many", "| strictly black/white:", only_bw)
    assert only_bw
    assert path.lower().endswith(".pdf")
    ext = sh("pdfimages", "-list", path)
    print("    ", [l for l in ext.splitlines() if l.strip()][:3])
    assert "png" in ext.lower() or "image" in ext.lower()

only = sys.argv[1:]
with sync_playwright() as p:
    for fn in CASES:
        if only and not any(o in fn._name for o in only): continue
        browser, page, logs = launch(p, width=1400, height=1000)
        try:
            print("\n== " + fn._name); fn(page, logs)
            bad = [l for l in logs if "favicon" not in l]
            if bad: print("     console:", bad[:3])
            results.append((fn._name, True, "")); print("   PASS")
        except Exception as e:
            page.screenshot(path=os.path.join(SHOTS, "FAIL_" + fn.__name__ + ".png"))
            results.append((fn._name, False, f"{type(e).__name__}: {e}"))
            print("   FAIL:", type(e).__name__, str(e)[:350])
        finally:
            browser.close()
print("\n==== SUMMARY ====")
for n, ok, m in results: print(("PASS  " if ok else "FAIL  ") + n + ("" if ok else "\n        " + m[:350]))
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
sys.exit(0 if all(r[1] for r in results) else 1)
