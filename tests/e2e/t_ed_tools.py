import os, sys, subprocess, traceback
from playwright.sync_api import sync_playwright
from PIL import Image
from ed_common import *

A4W, A4H = 595.28, 841.89
results = []

def scr(page, i, x, y, wpt=A4W):
    """Point (x, y) in PDF points on displayed page i -> viewport pixels (scrolls it into view first)."""
    page.evaluate("""([i, y, wpt]) => { const s = document.querySelector('.ed__scroll'); const p = document.querySelectorAll('.page')[i];
        const z = p.offsetWidth / wpt; s.scrollTop = p.offsetTop + y * z - s.clientHeight / 2; }""", [i, y, wpt])
    page.wait_for_timeout(150)
    b = page.locator(".page").nth(i).bounding_box(); z = b["width"] / wpt
    return b["x"] + x * z, b["y"] + y * z

def show_page(page, i):
    page.evaluate("""(i) => { const s = document.querySelector('.ed__scroll'); const p = document.querySelectorAll('.page')[i]; s.scrollTop = p.offsetTop - 16; }""", i)
    page.wait_for_timeout(700)

def drag(page, a, b, steps=10):
    page.mouse.move(*a); page.mouse.down(); page.mouse.move(*b, steps=steps); page.mouse.up()

def dragp(page, i, a, b, wpt=A4W, steps=10):
    """Drag from point a to point b (PDF points, displayed page i), scrolled so both are visible."""
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    scr(page, i, mid[0], mid[1], wpt)                       # centre the drag area
    pa = scr_no_scroll(page, i, a[0], a[1], wpt); pb = scr_no_scroll(page, i, b[0], b[1], wpt)
    drag(page, pa, pb, steps)

def scr_no_scroll(page, i, x, y, wpt=A4W):
    b = page.locator(".page").nth(i).bounding_box(); z = b["width"] / wpt
    return b["x"] + x * z, b["y"] + y * z

def click_at(page, i, x, y, wpt=A4W):
    page.mouse.click(*scr(page, i, x, y, wpt))

def raster(pdf, n, name):
    prefix = os.path.join(DL, name)
    subprocess.run(["pdftoppm", "-r", "72", "-png", "-f", str(n), "-l", str(n), pdf, prefix], check=True)
    cands = [f for f in os.listdir(DL) if f.startswith(name) and f.endswith(".png")]
    return Image.open(os.path.join(DL, sorted(cands)[-1])).convert("RGB")

def bbox_of(img, pred, region=None):
    x0, y0, x1, y1 = region or (0, 0, img.width, img.height)
    px = img.load(); xs = []; ys = []
    for y in range(y0, min(y1, img.height)):
        for x in range(x0, min(x1, img.width)):
            if pred(*px[x, y]): xs.append(x); ys.append(y)
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None

def diff_bbox(out_img, src_img, pred=lambda r, g, b: r < 110 and g < 110 and b < 110):
    po, ps = out_img.load(), src_img.load(); xs = []; ys = []
    for y in range(min(out_img.height, src_img.height)):
        for x in range(min(out_img.width, src_img.width)):
            if pred(*po[x, y]) and not pred(*ps[x, y]): xs.append(x); ys.append(y)
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None

red = lambda r, g, b: r > 180 and g < 90 and b < 90
dark = lambda r, g, b: r < 110 and g < 110 and b < 110

def near(a, b, tol): return abs(a - b) <= tol

def case(name):
    def deco(fn):
        fn._name = name; CASES.append(fn); return fn
    return deco
CASES = []

@case("text: typed text is real text, exactly where it was clicked")
def t_text(page, logs):
    open_editor(page, "sample.pdf", 3); show_page(page, 0)
    tool(page, "Text"); click_at(page, 0, 72, 300)
    page.keyboard.type("Hello Fitsize"); page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    out = download_pdf(page, "ed_text.pdf")
    assert "Hello Fitsize" in page_text(out, 1), "text missing/not selectable"
    assert "This is the original text on page 1." in page_text(out, 1), "original text lost"
    bb = sh("pdftotext", "-f", "1", "-l", "1", "-bbox", out, "-")
    import re
    m = re.search(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">Hello</word>', bb)
    x0, y0, x1, y1 = map(float, m.groups())
    print(f"     'Hello' bbox: x {x0:.1f}-{x1:.1f}  y {y0:.1f}-{y1:.1f}   (clicked at x=72, y=300)")
    assert near(x0, 72, 3), f"x off: {x0}"
    assert 288 <= y0 <= 300 and 298 <= y1 <= 312, f"y off: {y0}-{y1}"

@case("shapes: a filled box lands on the exact same spot on 0/90/180/270 degree pages")
def t_rot_shapes(page, logs):
    open_editor(page, "rot.pdf", 4)
    print("     page sizes on screen:", [(round(b['width']), round(b['height'])) for b in [page.locator('.page').nth(k).bounding_box() for k in range(4)]])
    boxes = [(100, 200, 250, 300), (100, 200, 250, 300), (100, 200, 250, 300), (100, 200, 250, 300)]
    dims = [(A4W, A4H), (A4H, A4W), (A4W, A4H), (A4H, A4W)]
    for i in range(4):
        show_page(page, i)
        tool(page, "Shapes"); page.get_by_label("Fill").check()
        x0, y0, x1, y1 = boxes[i]; wpt = dims[i][0]
        dragp(page, i, (x0, y0), (x1, y1), wpt)
        page.wait_for_timeout(150)
    out = download_pdf(page, "ed_rotshape.pdf")
    for i in range(4):
        img = raster(out, i + 1, f"rs{i}")
        bb = bbox_of(img, red)
        print(f"     page {i+1} ({img.width}x{img.height}) red box at {bb}  expected (100,200)-(250,300)")
        assert bb, "no red found"
        assert all(near(a, b, 3) for a, b in zip(bb, (100, 200, 250, 300))), f"misplaced on page {i+1}: {bb}"

@case("text: typed text is upright and in the right place on rotated pages")
def t_rot_text(page, logs):
    open_editor(page, "rot.pdf", 4)
    dims = [(A4W, A4H), (A4H, A4W), (A4W, A4H), (A4H, A4W)]
    for i in range(4):
        show_page(page, i); tool(page, "Text")
        click_at(page, i, 100, 400, dims[i][0]); page.keyboard.type("ROTTEST"); page.keyboard.press("Escape"); page.wait_for_timeout(150)
    out = download_pdf(page, "ed_rottext.pdf")
    for i in range(4):
        img = raster(out, i + 1, f"rt{i}")
        src = raster(os.path.join(FILES, "rot.pdf"), i + 1, f"rtsrc{i}")
        bb = diff_bbox(img, src)
        print(f"     page {i+1} ({img.width}x{img.height}): NEW ink at {bb}  (expect x from ~100, y ~ 392-412, ~55pt wide)")
        assert bb and near(bb[0], 100, 4) and 385 <= bb[1] <= 400 and 400 <= bb[3] <= 413, f"page {i+1}: {bb}"
        assert 40 <= bb[2] - bb[0] <= 75, f"page {i+1} text width {bb[2]-bb[0]} (upright text ~55pt)"

@case("redact: hidden text is really gone; other pages keep selectable text")
def t_redact(page, logs):
    open_editor(page, "sample.pdf", 3); show_page(page, 1)
    tool(page, "Redact")
    dragp(page, 1, (90, 220), (215, 255))
    out = download_pdf(page, "ed_redact.pdf")
    assert "SECRET" not in page_text(out, 2), "secret still extractable from page 2"
    raw = sh("qpdf", "--qdf", "--object-streams=disable", out, "-")
    assert "SECRET" not in raw, "secret still present inside the file"
    assert page_text(out, 2).strip() == "", "flattened page should have no text layer"
    assert "PAGE 1" in page_text(out, 1) and "PAGE 3" in page_text(out, 3), "other pages should keep text"
    img = raster(out, 2, "rd")
    assert bbox_of(img, lambda r, g, b: r < 25 and g < 25 and b < 25, (100, 226, 200, 246)), "black box not burned in"
    print("     page 2 flattened, 'SECRET-12345' absent from the whole file, black box present")

@case("whiteout: covers visually but the text stays (and the app says so)")
def t_whiteout(page, logs):
    open_editor(page, "sample.pdf", 3); show_page(page, 0)
    tool(page, "Whiteout")
    assert "still inside the file" in page.inner_text(".ed__hint")
    dragp(page, 0, (66, 145), (330, 170))
    out = download_pdf(page, "ed_white.pdf")
    img = raster(out, 1, "wo")
    assert bbox_of(img, dark, (70, 150, 320, 168)) is None, "text still visible through whiteout"
    assert "original text" in page_text(out, 1), "(expected) text remains extractable"
    print("     visually white, text still extractable, as documented")

@case("draw + highlight + tick + cross + ellipse + arrow all reach the file")
def t_marks(page, logs):
    open_editor(page, "sample.pdf", 3); show_page(page, 0)
    tool(page, "Draw"); page.get_by_role("radio", name="Pen colour #dc2626").click()
    dragp(page, 0, (300, 400), (390, 440), A4W, 12)
    tool(page, "Highlight"); dragp(page, 0, (72, 60), (300, 90))
    tool(page, "Tick / cross"); click_at(page, 0, 400, 500)
    tool(page, "Tick / cross"); page.get_by_role("radio", name="Cross").check(force=True); click_at(page, 0, 450, 500)
    tool(page, "Shapes"); page.get_by_role("radio", name="Circle").check(force=True); dragp(page, 0, (100, 600), (200, 680))
    tool(page, "Shapes"); page.get_by_role("radio", name="Arrow").check(force=True); dragp(page, 0, (300, 700), (450, 700))
    n = page.locator(".ann").count(); print("     marks on page:", n); assert n == 6, n
    out = download_pdf(page, "ed_marks.pdf")
    img = raster(out, 1, "mk")
    assert bbox_of(img, red, (290, 390, 400, 450)), "freehand red line missing"
    assert bbox_of(img, lambda r, g, b: r > 240 and g > 225 and b < 215 and r - b > 30, (80, 62, 290, 88)), "yellow highlight missing"
    assert bbox_of(img, lambda r, g, b: g > 100 and r < 60 and b < 100, (390, 488, 425, 520)), "green tick missing"
    assert bbox_of(img, dark, (440, 690, 470, 710)) or bbox_of(img, red, (440, 690, 470, 710)), "arrow head missing"

@case("picture + signature are placed and saved as images")
def t_images(page, logs):
    open_editor(page, "sample.pdf", 3); show_page(page, 0)
    with page.expect_file_chooser() as fc: tool(page, "Picture")
    fc.value.set_files(os.path.join(FILES, "alpha.png")); page.wait_for_timeout(600)
    assert page.locator('.ann[data-ann="image"]').count() == 1
    tool(page, "Sign"); dlg = page.get_by_role("dialog"); dlg.wait_for()
    c = dlg.locator("canvas.sigpad").bounding_box()
    drag(page, (c["x"] + 60, c["y"] + 70), (c["x"] + 200, c["y"] + 40), 15)
    dlg.get_by_role("button", name="Add to page").click(); page.wait_for_timeout(500)
    assert page.locator('.ann[data-ann="image"]').count() == 2, "signature not placed"
    out = download_pdf(page, "ed_images.pdf")
    listing = sh("pdfimages", "-list", out)
    print("     " + listing.strip().replace("\n", "\n     "))
    assert len([l for l in listing.splitlines()[2:] if l.strip()]) >= 2, "expected 2 images in the PDF"

@case("non-Latin text (rupee sign + Hindi) is saved and visible; normal text stays real")
def t_unicode(page, logs):
    open_editor(page, "sample.pdf", 3); show_page(page, 0)
    tool(page, "Text"); click_at(page, 0, 72, 400); page.keyboard.type("₹500 नमस्ते"); page.keyboard.press("Escape")
    tool(page, "Text"); click_at(page, 0, 72, 450); page.keyboard.type("Plain text"); page.keyboard.press("Escape")
    out = download_pdf(page, "ed_unicode.pdf")
    img = raster(out, 1, "uc"); bb = bbox_of(img, dark, (60, 385, 400, 420))
    print("     unicode ink bbox:", bb); assert bb and bb[2] - bb[0] > 40, "unicode text not drawn"
    img.crop((60, 380, 300, 470)).resize((720, 270)).save(os.path.join(SHOTS, "ed_unicode_crop.png"))
    assert "Plain text" in page_text(out, 1), "plain text should be selectable"

@case("pages: rotate, delete, reorder, blank page, merge another PDF — and deleted content is truly gone")
def t_pages(page, logs):
    open_editor(page, "sample.pdf", 3)
    items = page.locator(".thumbitem")
    items.nth(0).get_by_role("button", name="Rotate page 1").click()               # page1 rotated
    items.nth(2).get_by_role("button", name="Delete page 3").click()               # PAGE 3 deleted
    page.wait_for_function("() => document.querySelectorAll('.thumbitem').length === 2")
    page.locator(".thumbitem").nth(1).get_by_role("button", name="Move page 2 up").click()   # order: PAGE2, PAGE1
    page.locator(".addpages summary").click(); page.get_by_role("button", name="Blank page").click()
    page.wait_for_function("() => document.querySelectorAll('.thumbitem').length === 3")
    with page.expect_file_chooser() as fc:
        page.locator(".addpages summary").click(); page.get_by_role("button", name="Pages from another PDF").click()
    fc.value.set_files(os.path.join(FILES, "two.pdf"))
    page.wait_for_function("() => document.querySelectorAll('.thumbitem').length === 5", timeout=20000)
    out = download_pdf(page, "ed_pages.pdf")
    n = npages(out); texts = [page_text(out, k).strip().split("\n")[0][:12] for k in range(1, n + 1)]
    print("     page count:", n, "| first line of each:", texts)
    assert n == 5
    assert "PAGE 2" in texts[0] and texts[1] == "" and "TWO-A" in texts[2] and "TWO-B" in texts[3] and "PAGE 1" in texts[4], texts
    rots = [l.split()[-1] for l in sh("pdfinfo", "-f", "1", "-l", "5", out).splitlines() if "rot:" in l]
    print("     rotations:", rots); assert rots[4] == "90" and rots[0] == "0", rots
    assert "PAGE 3" not in sh("qpdf", "--qdf", "--object-streams=disable", out, "-"), "deleted page content still inside file"

@case("undo / redo / delete key / arrow-key nudge")
def t_undo(page, logs):
    open_editor(page, "sample.pdf", 3); show_page(page, 0)
    tool(page, "Text"); click_at(page, 0, 100, 300); page.keyboard.type("UndoMe"); page.keyboard.press("Escape")
    assert page.locator('.ann[data-ann="text"]').count() == 1
    page.get_by_role("button", name="Undo").click(); page.wait_for_timeout(100)
    assert page.locator('.ann[data-ann="text"]').count() == 0, "undo failed"
    page.get_by_role("button", name="Redo").click(); page.wait_for_timeout(100)
    assert page.locator('.ann[data-ann="text"]').count() == 1, "redo failed"
    a = page.locator('.ann[data-ann="text"]').first; x0 = a.bounding_box()["x"]
    a.click(); page.keyboard.press("Shift+ArrowRight"); page.wait_for_timeout(100)
    x1 = page.locator('.ann[data-ann="text"]').first.bounding_box()["x"]
    assert x1 > x0 + 3, f"nudge failed {x0}->{x1}"
    page.keyboard.press("Delete"); page.wait_for_timeout(100)
    assert page.locator('.ann[data-ann="text"]').count() == 0, "delete key failed"
    page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    assert page.locator('.ann[data-ann="text"]').count() == 1, "ctrl+z failed"

@case("dragging moves a mark, one drag = one undo step")
def t_move(page, logs):
    open_editor(page, "sample.pdf", 3); show_page(page, 0)
    tool(page, "Shapes"); dragp(page, 0, (200, 500), (300, 560))
    a = page.locator('.ann[data-ann="box"]').first; b0 = a.bounding_box()
    drag(page, (b0["x"] + b0["width"] / 2, b0["y"] + b0["height"] / 2), (b0["x"] + b0["width"] / 2 + 80, b0["y"] + b0["height"] / 2 + 40), 15)
    b1 = page.locator('.ann[data-ann="box"]').first.bounding_box()
    assert near(b1["x"] - b0["x"], 80, 3) and near(b1["y"] - b0["y"], 40, 3), (b0, b1)
    page.get_by_role("button", name="Undo").click(); page.wait_for_timeout(100)
    b2 = page.locator('.ann[data-ann="box"]').first.bounding_box()
    assert near(b2["x"], b0["x"], 1) and near(b2["y"], b0["y"], 1), "one undo should put it back"

@case("locked PDF gives a clear message, and a non-PDF is refused")
def t_errors(page, logs):
    page.goto(f"{BASE}/edit-pdf/"); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]", os.path.join(FILES, "locked.pdf"))
    page.locator(".notice--error").wait_for(timeout=15000)
    print("     ->", page.locator(".notice--error").inner_text())
    assert "password" in page.locator(".notice--error").inner_text()
    page.set_input_files("input[type=file]", os.path.join(FILES, "photo_med.png"))
    page.get_by_text("Please choose a PDF").first.wait_for(timeout=5000)

only = sys.argv[1:] 
with sync_playwright() as p:
    for fn in CASES:
        if only and not any(o in fn._name for o in only): continue
        browser, page, logs = launch(p, width=1400, height=1000)
        try:
            print(f"\n== {fn._name}"); fn(page, logs)
            bad = [l for l in logs if "favicon" not in l]
            if bad: print("     console:", bad[:3])
            results.append((fn._name, True, ""))
            print("   PASS")
        except Exception as e:
            page.screenshot(path=os.path.join(SHOTS, "FAIL_" + fn.__name__ + ".png"))
            results.append((fn._name, False, f"{type(e).__name__}: {e}"))
            print("   FAIL:", type(e).__name__, str(e)[:400])
        finally:
            browser.close()
print("\n==== SUMMARY ====")
for n, ok, msg in results: print(("PASS  " if ok else "FAIL  ") + n + ("" if ok else f"\n        {msg[:300]}"))
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
sys.exit(0 if all(r[1] for r in results) else 1)
