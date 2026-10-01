from playwright.sync_api import sync_playwright
from common import *

def desc(page):
    return page.evaluate("""() => { const e = document.activeElement; if (!e) return 'none';
      const label = e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].innerText.trim().slice(0,30)) || e.innerText?.trim().slice(0,30) || '';
      return e.tagName.toLowerCase() + (e.type ? '['+e.type+']' : '') + ' "' + label + '"'; }""")

with sync_playwright() as p:
    browser, page, logs = launch(p)
    page.goto(f"{BASE}/compress-pdf/"); page.wait_for_load_state("networkidle")
    seen = []
    for i in range(14):
        page.keyboard.press("Tab"); seen.append(desc(page))
        if seen[-1].startswith("input[file]"): break
    print("Tab order:", " > ".join(seen))
    assert seen[-1].startswith("input[file]"), "file input reachable by keyboard"
    ring = page.evaluate("getComputedStyle(document.querySelector('.drop')).borderColor")
    print("dropzone border while focused:", ring, "(accent = rgb(35, 64, 217))")
    with page.expect_file_chooser(timeout=5000) as fc:
        page.keyboard.press("Enter") if False else page.keyboard.press("Space")
    fc.value.set_files(f"{FILES}/text.pdf")
    page.get_by_text("text.pdf").first.wait_for()
    print("opened file chooser with Space and chose a file: OK")

    # size box, unit radios (arrow keys), advanced checkbox (space)
    page.locator("input[type=number]").first.focus()
    page.keyboard.press("Control+A"); page.keyboard.type("500")
    page.keyboard.press("Tab")            # -> KB radio (checked one gets focus)
    print("after size box, Tab goes to:", desc(page))
    page.keyboard.press("ArrowRight")     # KB -> MB
    print("ArrowRight changed unit to:", page.get_by_role("radio", name="MB", exact=True).is_checked() and "MB" or "not MB")
    adv = page.get_by_label("Advanced settings"); adv.focus(); page.keyboard.press("Space")
    print("Space toggled Advanced:", adv.is_checked(), "| size box hidden:", page.get_by_text("Make it smaller than").count() == 0)
    # every button/input has an accessible name?
    nameless = page.evaluate("""() => [...document.querySelectorAll('button, input, select')].filter(e => {
        const n = e.getAttribute('aria-label') || (e.labels && e.labels.length) || e.innerText?.trim() || e.getAttribute('title');
        return !n; }).map(e => e.outerHTML.slice(0,80))""")
    print("controls with no accessible name:", nameless or "none")
    print("LOGS:", logs[:4])
    browser.close()
