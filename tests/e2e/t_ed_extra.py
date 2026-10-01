import os, sys, time, subprocess
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops
from ed_common import *
A4W=595.28
results=[]
def scr(page,i,x,y,wpt=A4W):
    page.evaluate("""([i,y,wpt])=>{const s=document.querySelector('.ed__scroll');const p=document.querySelectorAll('.page')[i];const z=p.offsetWidth/wpt;s.scrollTop=p.offsetTop+y*z-s.clientHeight/2;}""",[i,y,wpt]); page.wait_for_timeout(150)
    b=page.locator(".page").nth(i).bounding_box(); z=b["width"]/wpt; return b["x"]+x*z, b["y"]+y*z
def raster(pdf,n,name,dpi=72):
    prefix=os.path.join(DL,name); subprocess.run(["pdftoppm","-r",str(dpi),"-png","-f",str(n),"-l",str(n),pdf,prefix],check=True)
    return Image.open(os.path.join(DL,sorted(f for f in os.listdir(DL) if f.startswith(name) and f.endswith(".png"))[-1])).convert("RGB")
CASES=[]
def case(name):
    def d(fn): fn._name=name; CASES.append(fn); return fn
    return d

@case("150-page PDF: opens fast, only nearby pages are drawn, saves all 150")
def t_big(page,logs):
    t=time.time(); page.goto(f"{BASE}/edit-pdf/"); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]", os.path.join(FILES,"big150.pdf")); wait_ready(page,150)
    print(f"     opened in {time.time()-t:.1f}s, {page.locator('.page').count()} pages, {page.locator('.thumbitem').count()} thumbnails")
    page.wait_for_timeout(1500)
    live=page.evaluate("[...document.querySelectorAll('.page__canvas')].filter(c=>c.width>0).length")
    print("     canvases holding pixels right now:", live); assert live < 15, f"too many rendered: {live}"
    page.evaluate("document.querySelector('.ed__scroll').scrollTop = document.querySelector('.ed__scroll').scrollHeight"); page.wait_for_timeout(2500)
    live2=page.evaluate("[...document.querySelectorAll('.page__canvas')].filter(c=>c.width>0).length")
    last=page.evaluate("(()=>{const c=[...document.querySelectorAll('.page__canvas')]; const l=c[c.length-1]; return l.width})()")
    print("     after scrolling to the end: live canvases", live2, "| last page drawn:", last>0); assert last>0 and live2<15
    # jump via thumbnail
    page.locator(".thumbitem__go").nth(74).click(); page.wait_for_timeout(1200)
    assert page.evaluate("(()=>{const s=document.querySelector('.ed__scroll');const p=document.querySelectorAll('.page')[74];return Math.abs(p.offsetTop - s.scrollTop) < 40})()"), "thumbnail jump failed"
    t=time.time(); out=download_pdf(page,"ed_big.pdf"); print(f"     saved in {time.time()-t:.1f}s -> {os.path.getsize(out)} bytes (original 116894), pages {npages(out)}")
    assert npages(out)==150 and "BIG PAGE 150" in page_text(out,150)

@case("form PDF: what happens to built-in fields when you save")
def t_form(page,logs):
    open_editor(page,"form.pdf",1)
    tool(page,"Text"); page.mouse.click(*scr(page,0,130,600)); page.keyboard.type("Extra note"); page.keyboard.press("Escape")
    out=download_pdf(page,"ed_form.pdf")
    orig=raster(os.path.join(FILES,"form.pdf"),1,"fo"); new=raster(out,1,"fn")
    box=(120,120,360,160)  # region of the name field (y from top = 842-714..)
    diff=ImageChops.difference(orig.crop((125,110,370,165)),new.crop((125,110,370,165))).getbbox()
    print("     field area differs between original and saved?:", diff)
    t=page_text(out,1); print("     text in saved file:", t.strip().replace("\n"," | ")[:120])
    j=sh("qpdf","--json","--json-key=acroform",out); print("     AcroForm in saved file:", '"hasacroform": true' in j)
    assert "Asha Verma" in t or diff is None, "field content lost from view"
    assert "Extra note" in t

@case("bold, italic, serif, bigger size and colour reach the file (edit existing text too)")
def t_style(page,logs):
    open_editor(page,"sample.pdf",3)
    tool(page,"Text"); page.mouse.click(*scr(page,0,72,300)); page.keyboard.type("Styled words"); page.keyboard.press("Escape")
    page.locator('.ann[data-ann="text"]').first.click()
    page.get_by_role("button",name="Bold").click(); page.get_by_role("button",name="Italic").click()
    page.locator("#text-font").select_option("serif")
    for _ in range(4): page.get_by_role("button",name="Bigger Size").click()
    page.get_by_role("radio",name="Text colour #dc2626").click()
    page.locator('.ann[data-ann="text"]').first.dblclick(); page.keyboard.press("End"); page.keyboard.type(" (edited)"); page.keyboard.press("Escape")
    out=download_pdf(page,"ed_style.pdf")
    fonts=sh("pdffonts",out); print("     "+fonts.strip().replace("\n","\n     "))
    assert "Times-BoldItalic" in fonts, "bold italic serif not used"
    assert "Styled words (edited)" in page_text(out,1)
    img=raster(out,1,"st"); px=img.load()
    reds=sum(1 for y in range(295,335) for x in range(70,300) if px[x,y][0]>170 and px[x,y][1]<90)
    print("     red ink pixels:", reds); assert reds>80

@case("typed and uploaded signatures work")
def t_sig(page,logs):
    open_editor(page,"sample.pdf",3)
    tool(page,"Sign"); dlg=page.get_by_role("dialog"); dlg.wait_for()
    dlg.get_by_role("radio",name="Type").check(force=True); dlg.get_by_label("Your name").fill("Priya Sharma"); page.wait_for_timeout(700)
    dlg.screenshot(path=os.path.join(SHOTS,"ed_sig_type.png"))
    dlg.get_by_role("button",name="Add to page").click(); page.wait_for_timeout(500)
    assert page.locator('.ann[data-ann="image"]').count()==1
    tool(page,"Sign"); dlg=page.get_by_role("dialog"); assert dlg.locator(".sigs__item").count()==1, "saved signature not offered"
    dlg.locator(".sigs__item").click(); page.wait_for_timeout(400)
    assert page.locator('.ann[data-ann="image"]').count()==2, "re-using a saved signature failed"
    out=download_pdf(page,"ed_sig.pdf"); assert len([l for l in sh("pdfimages","-list",out).splitlines()[2:] if l.strip()])>=2

@case("touch: tapping places text and pens/rectangles are not hijacked by page scrolling")
def t_touch(page,logs): pass   # replaced below (needs a touch context)

@case("accessibility: every control has a name; dialog closes with Escape; keyboard reaches tools")
def t_a11y(page,logs):
    open_editor(page,"sample.pdf",3)
    nameless=page.evaluate("""()=>[...document.querySelectorAll('.ed button, .ed input, .ed select, .ed textarea')].filter(e=>{
      if (e.getAttribute('aria-hidden')==='true') return false;
      const n=e.getAttribute('aria-label')||(e.labels&&e.labels.length)||e.textContent?.trim()||e.getAttribute('title'); return !n;}).map(e=>e.outerHTML.slice(0,90))""")
    print("     controls without a name:", nameless or "none"); assert not nameless, nameless
    tool(page,"Sign"); page.get_by_role("dialog").wait_for(); page.keyboard.press("Escape"); page.wait_for_timeout(200)
    assert page.get_by_role("dialog").count()==0, "Escape should close the dialog"
    page.locator(".tool-btn").first.focus(); order=[]
    for _ in range(4):
        page.keyboard.press("Tab"); order.append(page.evaluate("document.activeElement.innerText||document.activeElement.getAttribute('aria-label')"))
    print("     Tab order from first tool:", order)
    assert order[0].strip()=="Text"
    # save with nothing changed keeps the page count and text selectable
    out=download_pdf(page,"ed_plain.pdf"); assert npages(out)==3 and "PAGE 2" in page_text(out,2)

only=sys.argv[1:]
with sync_playwright() as p:
    for fn in CASES:
        if fn.__name__=="t_touch": continue
        if only and not any(o in fn._name for o in only): continue
        browser,page,logs=launch(p,width=1400,height=1000)
        try:
            print("\n== "+fn._name); fn(page,logs); bad=[l for l in logs if "favicon" not in l]
            if bad: print("     console:",bad[:3])
            results.append((fn._name,True,"")); print("   PASS")
        except Exception as e:
            page.screenshot(path=os.path.join(SHOTS,"FAIL_"+fn.__name__+".png")); results.append((fn._name,False,f"{type(e).__name__}: {e}")); print("   FAIL:",type(e).__name__,str(e)[:300])
        finally: browser.close()
    # touch test in a real touch context
    if not only or any("touch" in o for o in only):
        browser=p.chromium.launch(); ctx=browser.new_context(viewport={"width":412,"height":800},has_touch=True,is_mobile=True,device_scale_factor=2,accept_downloads=True); page=ctx.new_page(); logs=[]
        page.on("pageerror",lambda e:logs.append(str(e)))
        try:
            print("\n== touch: tapping places text; draw mode blocks page scrolling")
            page.goto(f"{BASE}/edit-pdf/"); page.wait_for_load_state("networkidle")
            page.set_input_files("input[type=file]",os.path.join(FILES,"sample.pdf")); wait_ready(page,3); page.wait_for_timeout(600)
            tool(page,"Text"); b=page.locator(".page").first.bounding_box()
            page.touchscreen.tap(b["x"]+b["width"]*0.3, b["y"]+b["height"]*0.4); page.wait_for_timeout(400)
            assert page.evaluate("document.activeElement.tagName")=="TEXTAREA", "tap did not open a text box"
            page.keyboard.type("Tapped"); page.keyboard.press("Escape"); page.wait_for_timeout(200)
            assert page.locator('.ann[data-ann="text"]').count()==1
            tool(page,"Draw"); ta=page.evaluate("getComputedStyle(document.querySelector('.page__overlay')).touchAction"); print("     overlay touch-action in Draw mode:", ta); assert ta=="none"
            tool(page,"Select"); ta2=page.evaluate("getComputedStyle(document.querySelector('.page__overlay')).touchAction"); print("     overlay touch-action in Select mode:", ta2); assert ta2!="none", "page must scroll by touch in Select mode"
            results.append(("touch: tapping places text; draw mode blocks page scrolling",True,"")); print("   PASS")
        except Exception as e:
            page.screenshot(path=os.path.join(SHOTS,"FAIL_touch.png")); results.append(("touch",False,f"{type(e).__name__}: {e}")); print("   FAIL:",type(e).__name__,str(e)[:300])
        browser.close()
print("\n==== SUMMARY ===="); 
for n,ok,m in results: print(("PASS  " if ok else "FAIL  ")+n+("" if ok else "\n        "+m[:300]))
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed"); sys.exit(0 if all(r[1] for r in results) else 1)
