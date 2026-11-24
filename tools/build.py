#!/usr/bin/env python3
"""BTC Intelligence 构建工具（V26）

用法
  python3 tools/build.py split  源文件.html  输出目录
      把单文件网页拆成：index.html + assets/（样式、图表库、种子数据、脚本，文件名带内容哈希）
      并把资源清单写入 sw.js。内容不变的文件哈希不变，浏览器无需重新下载。
  python3 tools/build.py join   输出目录  合并后的单文件.html
      把拆分后的网站合并回单文件，便于整体修改。

只使用 Python 标准库。
"""
import re
import hashlib, os, re, sys, shutil

def h(data): return hashlib.sha256(data.encode('utf-8')).hexdigest()[:10]

def minify_css(css):
    """V27.4：保守压缩样式——去注释；空白合并成一个空格；去掉 { } ; , 两侧的空白和 } 前多余的分号。
    不碰冒号两侧（「a :hover」与「a:hover」含义不同）、不碰 calc() 里的 + -。引号里的内容原样保留。"""
    out, i, n = [], 0, len(css)
    buf = []
    def flush():
        t = "".join(buf); buf.clear()
        t = re.sub(r"\s+", " ", t)
        t = re.sub(r"\s*([{};,])\s*", r"\1", t)
        t = t.replace(";}", "}")
        out.append(t)
    while i < n:
        c = css[i]
        if css.startswith("/*", i):
            j = css.find("*/", i + 2); i = n if j < 0 else j + 2; continue
        if c in "\"'":
            flush(); j = i + 1
            while j < n and css[j] != c:
                j += 2 if css[j] == "\\" else 1
            out.append(css[i:j + 1]); i = j + 1; continue
        buf.append(c); i += 1
    flush()
    return "".join(out).strip() + "\n"


def split(src, out):
    s = open(src, encoding='utf-8').read()
    os.makedirs(os.path.join(out, 'assets'), exist_ok=True)
    assets = []
    optional = []  # V26.4：按需下载、但需在版本切换时保留的资源（英文对照表）
    def emit(name, ext, data, precache=True):
        fn = f'assets/{name}.{h(data)}.{ext}'
        with open(os.path.join(out, fn), 'w', encoding='utf-8') as f: f.write(data)
        if precache: assets.append(fn)
        else: optional.append(fn)
        return fn
    # 1. 样式：<head> 内全部 <style> 按顺序合并为一个文件
    head_end = s.index('</head>')
    styles = list(re.finditer(r'<style[^>]*>(.*?)</style>\s*', s[:head_end], re.S))
    css = '\n'.join(m.group(1).strip('\n') for m in styles) + '\n'
    css = minify_css(css)
    css_fn = emit('app', 'css', css)
    for i, m in enumerate(reversed(styles)):
        tag = f'<link rel="stylesheet" href="{css_fn}" data-inline="css" />\n' if i == len(styles) - 1 else ''
        s = s[:m.start()] + tag + s[m.end():]
    # 2. 图表库：原为延迟注入的 text/plain 块，改为普通脚本文件
    m = re.search(r'<script id="lwcVendor" type="text/plain">(.*?)</script>', s, re.S)
    vendor_fn = emit('lightweight-charts', 'js', m.group(1), precache=False) if m else None
    if m:
        lwc_loader = (
            f'<script data-inline="vendor">window.LWC_SRC="{vendor_fn}";'
            '(function(){var p=false;function load(){if(p||window.LightweightCharts)return;p=true;'
            'var sc=document.createElement("script");sc.src=window.LWC_SRC;sc.async=true;'
            'sc.onload=function(){try{window.dispatchEvent(new Event("resize"))}catch(e){}};'
            'document.head.appendChild(sc)}window.__loadLwc=load;'
            'function trig(){load()}["pointerdown","touchstart","keydown"].forEach(function(ev){window.addEventListener(ev,trig,{once:true,passive:true})});'
            'if(typeof requestIdleCallback==="function")requestIdleCallback(load,{timeout:1400});else setTimeout(load,1100);})();</script>'
        )
        s = s[:m.start()] + lwc_loader + s[m.end():]
    # 3. 主脚本与扩展脚本（<body> 内无属性的内联 <script>）
    body_start = s.index('<body')
    scripts = [m for m in re.finditer(r'<script>(.*?)</script>', s[body_start:], re.S)]
    pieces = []
    ext_codes = []
    ext_slot = None
    for idx, m in enumerate(scripts):
        code = m.group(1)
        tags = ''
        if idx == 0:
            seed = re.search(r'\nconst CYCLE_SEED=\{.*?\};\n', code, re.S)
            if seed:
                seed_fn = emit('seed-cycle', 'js', seed.group(0).strip() + '\n')
                code = code[:seed.start()] + '\n/*CYCLE_SEED*/\n' + code[seed.end():]  # 记下原位置，join 时放回
                tags += f'<script src="{seed_fn}" data-inline="seed"></script>\n'
            tags += f'<script src="{emit("app", "js", code)}" data-inline="app"></script>'
        elif code.lstrip().startswith('window.I18N_EN='):
            # V26.4：英文对照表只在切换到英文时下载（不预缓存，首次使用后由 Service Worker 缓存）
            tags = f'<script>window.I18N_SRC="{emit("i18n-en", "js", code, precache=False)}"</script>'
        elif 'window.BTCInsight={' in code:
            # 保持 BTCInsight 独立成文件，便于 tests/reliability_test.mjs 单独沙箱加载
            tags = f'<script src="{emit("insight", "js", code)}" data-inline="ext"></script>'
        else:
            # V27.12.3：合并其余扩展脚本为单个文件，减少移动端请求与 SW 预缓存开销
            ext_codes.append(code)
            ext_slot = len(pieces)
            tags = ''
        pieces.append((body_start + m.start(), body_start + m.end(), tags))
    if ext_codes and ext_slot is not None:
        ext_fn = emit("ext-bundle", "js", "\n;/*EXT_SEP*/\n".join(ext_codes), precache=False)
        a, b, _ = pieces[ext_slot]
        ext_loader = (
            f'<script data-inline="ext">window.EXT_SRC="{ext_fn}";'
            '(function(){var p=false;function load(){if(p)return;p=true;'
            'var sc=document.createElement("script");sc.src=window.EXT_SRC;sc.async=true;document.body.appendChild(sc)}'
            'window.__loadExt=load;'
            '["pointerdown","touchstart","keydown","hashchange"].forEach(function(ev){window.addEventListener(ev,load,{once:true,passive:true})});'
            'if(typeof requestIdleCallback==="function")requestIdleCallback(load,{timeout:800});else setTimeout(load,600);})();</script>'
        )
        pieces[ext_slot] = (a, b, ext_loader)
    for a, b, tags in reversed(pieces): s = s[:a] + tags + s[b:]
    with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8') as f: f.write(s)
    # 4. Service Worker：写入资源清单
    sw_src = os.path.join(os.path.dirname(src), 'sw.js')
    if not os.path.exists(sw_src):  # 合并源码放在 source/ 时，使用仓库根目录的 sw.js
        sw_src = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(src))), 'sw.js')
    sw = open(sw_src, encoding='utf-8').read()
    lst = '[\n' + ''.join(f'  "./{a}",\n' for a in assets) + ']'
    sw = re.sub(r'/\*ASSETS\*/.*?/\*END\*/', '/*ASSETS*/' + lst + '/*END*/', sw, flags=re.S)
    olst = '[' + ', '.join(f'"./{a}"' for a in optional) + ']'
    sw = re.sub(r'/\*OPTIONAL\*/.*?/\*OEND\*/', '/*OPTIONAL*/' + olst + '/*OEND*/', sw, flags=re.S)
    with open(os.path.join(out, 'sw.js'), 'w', encoding='utf-8') as f: f.write(sw)
    print('\n'.join(assets))

def join(dist, dst):
    s = open(os.path.join(dist, 'index.html'), encoding='utf-8').read()
    def read(fn): return open(os.path.join(dist, fn), encoding='utf-8').read()
    s = re.sub(r'<link rel="stylesheet" href="([^"]+)" data-inline="css" />', lambda m: '<style>\n' + read(m.group(1)) + '</style>', s)
    s = re.sub(r'<script[^>]*data-inline="vendor"[^>]*>window\.LWC_SRC="([^"]+)".*?</script>', lambda m: '<script id="lwcVendor" type="text/plain">' + read(m.group(1)) + '</script>', s, flags=re.S)
    s = re.sub(r'<script src="([^"]+)" data-inline="vendor"></script>', lambda m: '<script id="lwcVendor" type="text/plain">' + read(m.group(1)) + '</script>', s)
    seed = re.search(r'<script src="([^"]+)" data-inline="seed"></script>\n', s)
    seed_code = read(seed.group(1)) if seed else ''
    if seed: s = s[:seed.start()] + s[seed.end():]
    def app(m):
        code = read(m.group(1))
        if '\n/*CYCLE_SEED*/\n' in code: return '<script>' + code.replace('\n/*CYCLE_SEED*/\n', '\n' + seed_code, 1) + '</script>'
        return '<script>\n' + seed_code + code + '</script>'
    s = re.sub(r'<script src="([^"]+)" data-inline="app"></script>', app, s)
    # V26.4：英文对照表还原为内联脚本
    s = re.sub(r'<script>window\.I18N_SRC="([^"]+)"</script>', lambda m: '<script>' + read(m.group(1)) + '</script>', s)
    def join_ext(m):
        parts = read(m.group(1)).split('\n;/*EXT_SEP*/\n')
        return '\n'.join('<script>' + p + '</script>' for p in parts)
    s = re.sub(r'<script[^>]*data-inline="ext"[^>]*>window\.EXT_SRC="([^"]+)".*?</script>', join_ext, s, flags=re.S)
    s = re.sub(r'<script src="([^"]+)" data-inline="ext"></script>', join_ext, s)
    with open(dst, 'w', encoding='utf-8') as f: f.write(s)

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    if mode == 'split': split(sys.argv[2], sys.argv[3])
    elif mode == 'join': join(sys.argv[2], sys.argv[3])
    else: print(__doc__)
