import os, subprocess, json
from common import *

def wait_ready(page, n_pages=None):
    """Editor open and the first page canvas has real pixels."""
    page.locator(".ed").wait_for(timeout=60000)
    page.wait_for_function("""() => { const c = document.querySelector('.page__canvas'); return c && c.width > 50; }""", timeout=60000)
    if n_pages: page.wait_for_function(f"() => document.querySelectorAll('.page').length === {n_pages}", timeout=20000)

def open_editor(page, name, n_pages=None):
    page.goto(f"{BASE}/edit-pdf/"); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]", os.path.join(FILES, name))
    wait_ready(page, n_pages)
    page.wait_for_timeout(400)

def tool(page, label):
    page.locator(".tool-btn", has_text=label).first.click()

def page_box(page, i):
    """Bounding box of the i-th page overlay in viewport pixels + the zoom (css px per pt)."""
    b = page.locator(".page").nth(i).bounding_box()
    return b

def pt_to_screen(page, i, x_pt, y_pt):
    b = page_box(page, i)
    size = page.evaluate("(i) => { const p = document.querySelectorAll('.page')[i]; return [p.offsetWidth, p.offsetHeight]; }", i)
    # zoom = css px per point; page pt size read from stored aspect: derive from A4 default passed by caller
    return b

def scroll_to_page(page, i):
    page.evaluate("(i) => { const p = document.querySelectorAll('.page')[i]; p.scrollIntoView({block:'center'}); }", i)
    page.wait_for_timeout(500)

def zoom_of(page, i=0):
    """css px per point, using the page's rendered width and the known point width passed via data."""
    return page.evaluate("(i) => document.querySelectorAll('.page')[i].offsetWidth", i)

def download_pdf(page, save_as):
    with page.expect_download(timeout=90000) as d:
        page.get_by_role("button", name="Download PDF").click()
    path = os.path.join(DL, save_as); d.value.save_as(path)
    page.locator(".ed__busy").wait_for(state="hidden", timeout=60000)
    return path

def sh(*args):
    return subprocess.run(list(args), capture_output=True).stdout.decode("utf-8", errors="replace")

def npages(path):
    return int([l.split()[1] for l in sh("pdfinfo", path).splitlines() if l.startswith("Pages:")][0])

def page_text(path, n):
    return sh("pdftotext", "-f", str(n), "-l", str(n), "-layout", path, "-")
