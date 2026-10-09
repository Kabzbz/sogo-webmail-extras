#!/usr/bin/env python3
# Значки отправителей и получателей для SOGo.
#
# Раз в сутки проходит по почте и держит у себя две картотеки:
#   • логотипы доменов — для организаций;
#   • фотографии по конкретному адресу — для живых людей.
#
# Всё скачанное хранится локально и повторно не запрашивается. При чтении почты
# наружу не уходит ни одного запроса: картинки вшиты прямо в custom-sogo.js.
#
# ОТКУДА БЕРЁМ ФОТОГРАФИИ ЛЮДЕЙ. Служба Mail.ru отвечает на любой адрес, даже
# выдуманный, — но на неизвестные рисует заглушку. Отличаем по доле самого
# частого цвета: у нарисованного кружка фон занимает 92-94% поля, у настоящей
# фотографии — 3-36%. Порог 80% разделяет их чисто (проверено 08.10.2026).
# У Яндекса подобной службы нет: на любой адрес возвращается одна и та же
# картинка, отпечаток совпадает до байта — брать там нечего.
#
# ЖУРНАЛ ПОПЫТОК. Неудачные поиски записываются с датой и повторяются не раньше
# чем через RETRY_DAYS. Иначе каждую ночь дёргали бы чужие службы впустую по
# сотне адресов, у которых фотографии просто нет.

import base64, datetime, hashlib, io, json, os, re, shutil, ssl, subprocess, sys, time, urllib.request
from email.header import decode_header, make_header
from email.utils import getaddresses
from PIL import Image, ImageDraw, ImageFont

CACHE_DIR = "/var/lib/sender-logos"
CACHE = os.path.join(CACHE_DIR, "logos.json")
JS_SRC = "/opt/mailcow-dockerized/data/conf/sogo/custom-sogo.js"
JS_LIVE = "/var/lib/docker/volumes/mailcowdockerized_sogo-web-vol-1/_data/WebServerResources/js/custom-sogo.js"
BEGIN_MARK = "// >>> SENDER-LOGOS BEGIN"
BEGIN = BEGIN_MARK + " (собирается скриптом sender-logos.py, руками не править)"
END = "// <<< SENDER-LOGOS END"

DAYS = 60            # за какой срок смотрим почту ради доменов
ADDR_DAYS = 90       # и ради адресов людей
TOP = 60             # столько доменов берём по частоте в любом случае
MIN_MSGS = 2         # и дополнительно все домены, от которых писем не меньше
ADDR_MIN_MSGS = 2    # адрес берём, если переписка не разовая
INIT_MAX = 2000      # инициалов можно много: запись весит байтов тридцать
ADDR_MAX = 250       # сколько фотографий людей держим
NEW_PER_RUN = 120    # не больше стольких новых поисков за ночь
RETRY_DAYS = 90      # повтор неудачного поиска не раньше чем через три месяца
REFRESH_DAYS = 90    # и обновление уже найденного — вдруг фирма сменила логотип
MAX_ICON = 25000
MAX_TOTAL = 950000   # предел на все картинки вместе: при 700 КБ запас кончился
FLAT_MAX = 0.80      # доля главного цвета, выше которой это заглушка, а не фото

ALWAYS = """mosreg.ru instagram.com vk.com gosuslugi.ru nalog.gov.ru nalog.ru sberbank.ru
qnap.com proxmox.com mts.ru megafon.ru beeline.ru tele2.ru dns-shop.ru citilink.ru
lamoda.ru eldorado.ru wildberries.ru aliexpress.com sbermarket.ru samokat.ru vkusvill.ru
perekrestok.ru pyaterochka.ru magnit.ru rzd.ru aeroflot.ru pochta.ru cdek.ru dpd.ru
boxberry.ru kaspersky.ru 1cfresh.com kontur.ru mos.ru ag.mos.ru gosuslugi.ru
pfr.gov.ru fns.gov.ru sfr.gov.ru rosreestr.gov.ru mvd.ru""".split()

# Узлы, которым нужен свой значок, хотя домен целиком мы пропускаем.
HOST_ICONS = {"corp.mail.ru": "mail.ru", "biz.mail.ru": "mail.ru"}

# У служебного домена значок берём у основного бренда.
ALIASES = {"otp-bank.ru": "otpbank.ru", "checkkontur.ru": "kontur.ru"}

FREEMAIL = set("""mail.ru yandex.ru ya.ru gmail.com googlemail.com bk.ru inbox.ru list.ru
rambler.ru mail.com outlook.com hotmail.com live.com icloud.com me.com proton.me
protonmail.com yahoo.com internet.ru""".split())

# Свои домены: для них значок не ищется, рисуются инициалы.
OWN = ("example.com",)


def log(msg):
    print(msg)
    subprocess.run(["logger", "-t", "sender-logos", msg], check=False)


def ssl_ctx():
    c = ssl.create_default_context()
    c.check_hostname = False
    c.verify_mode = ssl.CERT_NONE
    return c


def get(url, limit=200000):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; sender-logos/1.0)"})
    with urllib.request.urlopen(req, timeout=12, context=ssl_ctx()) as r:
        return (r.headers.get("Content-Type") or "").lower(), r.read(limit), r.geturl()


def as_data_uri(ct, data, url):
    if not data or len(data) < 150 or len(data) > MAX_ICON:
        return None
    if "image" not in ct and not url.lower().endswith(".ico"):
        return None
    if "svg" in ct:
        mime = "image/svg+xml"
    elif "png" in ct:
        mime = "image/png"
    elif "jpeg" in ct or "jpg" in ct:
        mime = "image/jpeg"
    else:
        mime = "image/x-icon"
    return "data:%s;base64,%s" % (mime, base64.b64encode(data).decode())


def open_image(uri):
    head, b64 = uri.split(",", 1)
    if "svg" in head:
        return None
    return Image.open(io.BytesIO(base64.b64decode(b64)))


def to_png_uri(im):
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def flat_share(data):
    """Какую долю поля занимает самый частый цвет.

    Это и отличает нарисованную заглушку от фотографии: у кружка с буквой фон
    занимает почти всё, у снимка — малую часть."""
    try:
        im = Image.open(io.BytesIO(data)).convert("RGB")
        px = im.size[0] * im.size[1]
        cs = im.getcolors(maxcolors=200000)
        if not cs or px == 0:
            return 1.0
        return max(c for c, _ in cs) / float(px)
    except Exception:
        return 1.0


def badged(uri):
    """Впечатываем нашу галочку в правый нижний угол.

    Наложить её поверх в разметке нельзя: браузер не рисует вложенную картинку
    внутри SVG — проверено. Поэтому метка попадает прямо в файл значка."""
    try:
        im = open_image(uri)
        if im is None:
            return uri
        im = im.convert("RGBA")
        im.thumbnail((32, 32), Image.LANCZOS)
        w, h = im.size
        d = ImageDraw.Draw(im)
        r = 7
        cx, cy = w - r - 1, h - r - 1
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 255))
        d.line([(cx - 3, cy), (cx - 1, cy + 3), (cx + 4, cy - 4)], fill=(29, 122, 76, 255), width=2)
        return to_png_uri(im)
    except Exception:
        return uri


def shrink(uri):
    """Приводим значок к 32 пикселям и формату PNG."""
    try:
        im = open_image(uri)
        if im is None:
            return uri
        try:
            im.seek(im.n_frames - 1)
        except Exception:
            pass
        im = im.convert("RGBA")
        im.thumbnail((32, 32), Image.LANCZOS)
        out = to_png_uri(im)
        return out if len(out) < len(uri) else uri
    except Exception:
        return uri


def from_page(domain):
    """Значок, объявленный в разметке самого сайта (там, где нет favicon.ico)."""
    rel_icon = re.compile("rel=[\"']?[^\"'>]*icon", re.I)
    href_re = re.compile("href=[\"']([^\"']+)[\"']", re.I)
    size_re = re.compile("sizes=[\"']?([0-9]+)", re.I)
    for base in ("https://%s/" % domain, "https://www.%s/" % domain):
        try:
            ct, data, final = get(base, 300000)
            if "html" not in ct:
                continue
            html = data.decode("utf-8", "replace")
            best = None
            for tag in re.findall("<link[^>]+>", html, re.I):
                if not rel_icon.search(tag):
                    continue
                m = href_re.search(tag)
                if not m:
                    continue
                href = m.group(1).strip()
                if href.startswith("//"):
                    href = "https:" + href
                elif href.startswith("/"):
                    href = "https://" + domain + href
                elif not href.startswith("http"):
                    href = base + href
                ms = size_re.search(tag)
                size = int(ms.group(1)) if ms else 0
                if best is None or size > best[0]:
                    best = (size, href)
            if best:
                ct2, data2, url2 = get(best[1], MAX_ICON + 1)
                img = as_data_uri(ct2, data2, url2)
                if img:
                    return img
        except Exception:
            continue
    return None


def fetch_domain_icon(domain):
    for u in ["https://icons.duckduckgo.com/ip3/%s.ico" % domain,
              "https://favicon.yandex.net/favicon/v2/%s?size=64" % domain,
              "https://www.google.com/s2/favicons?domain=%s&sz=128" % domain,
              "https://%s/favicon.ico" % domain,
              "https://www.%s/favicon.ico" % domain]:
        try:
            ct, data, final = get(u, MAX_ICON + 1)
            img = as_data_uri(ct, data, final)
            if img:
                return img
        except Exception:
            continue
    img = from_page(domain)
    if img:
        return img
    # Последняя попытка: служба Mail.ru знает логотипы части организаций.
    # Отвечает она на любой домен, поэтому ответ проверяем так же, как для
    # людей: доля главного цвета выше порога — это нарисованная заглушка.
    try:
        ct, data, final = get('https://filin.mail.ru/pic?email=info@%s&width=180&height=180' % domain, 200000)
        if data and len(data) > 400 and flat_share(data) <= FLAT_MAX:
            return as_data_uri(ct, data, final)
    except Exception:
        pass
    return None


def fetch_person_photo(address):
    """Фотография человека по адресу.

    Два источника. Gravatar — общепринятый, с ключом d=404 он честно отвечает
    «нет такой», поэтому проверять содержимое не нужно. Служба Mail.ru отвечает
    на любой адрес, в том числе на list.ru, bk.ru и inbox.ru, но неизвестным
    рисует заглушку — её отбрасываем по доле главного цвета.

    У Яндекса такой службы нет: кружок с буквой он рисует прямо в своём
    интерфейсе, хранимой картинки не существует, и на любой адрес возвращается
    одна и та же заглушка. У Google выдачи фотографии по адресу почты тоже нет."""
    md5 = hashlib.md5(address.strip().lower().encode()).hexdigest()
    try:
        ct, data, final = get("https://www.gravatar.com/avatar/%s?s=180&d=404" % md5, 200000)
        uri = as_data_uri(ct, data, final)
        if uri:
            return shrink(uri)
    except Exception:
        pass                 # 404 означает, что фотографии просто нет
    try:
        ct, data, final = get("https://filin.mail.ru/pic?email=%s&width=180&height=180" % address, 200000)
    except Exception:
        return None
    if not data or len(data) < 400:
        return None
    if flat_share(data) > FLAT_MAX:
        return None          # нарисованная заглушка, а не фотография
    uri = as_data_uri(ct, data, final) or ("data:image/png;base64," + base64.b64encode(data).decode())
    return shrink(uri)



# ── Аватары сотрудников: инициалы плюс значок фирмы в углу ────────────────────
#
# Логотип домена у живого человека неинформативен — все сотрудники выглядели бы
# одинаково. Но и голые буквы теряют связь с фирмой. Поэтому рисуем кружок с
# инициалами, а логотип ставим маленьким значком в угол.
#
# Собирать это приходится здесь, а не в браузере: вложенную картинку внутри SVG
# браузер не отображает (проверено), а холст рисовать некогда — адрес значка
# нужен сразу.

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
COLORS = ["#D32F2F", "#C2185B", "#7B1FA2", "#512DA8", "#303F9F", "#1976D2",
          "#0288D1", "#0097A7", "#00796B", "#388E3C", "#689F38", "#AFB42B",
          "#F57C00", "#E64A19", "#5D4037", "#455A64"]


def color_of(text):
    """Тот же расчёт, что и в custom-sogo.js, чтобы цвета совпадали."""
    h = 0
    for ch in text:
        h = (h * 31 + ord(ch)) % 100000
    return COLORS[h % len(COLORS)]


def words_of(s):
    out, cur = [], ""
    for ch in s:
        if ch.isalnum():
            cur += ch
        elif cur:
            out.append(cur)
            cur = ""
    if cur:
        out.append(cur)
    return out


def generic_local(local):
    """Служебная приставка может быть частью адреса: enews-noreply."""
    if local in GENERIC:
        return True
    parts = re.split("[^0-9a-zA-Zа-яА-Я]+", local.lower())
    return any(re.sub("[0-9]+$", "", p) in GENERIC for p in parts if p)


def looks_company(name):
    return any(w.lower() in COMPANY for w in words_of(name))


def is_person(name, local):
    if generic_local(local):
        return False
    if looks_company(name):
        return False
    if len(words_of(name)) >= 2:
        return True
    parts = words_of(local)
    return len(parts) >= 2 and len(parts[-1]) >= 3


def initials_of(name, local):
    src = words_of(name) or words_of(local)
    if len(src) >= 2:
        return (src[0][0] + src[1][0]).upper()
    return src[0][0].upper() if src else ""


def render_person(address, name, logo_uri):
    """Кружок с инициалами и значком фирмы в правом нижнем углу."""
    try:
        letters = initials_of(name, address.split("@")[0])
        if not letters:
            return None
        size = 64
        im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.ellipse([0, 0, size - 1, size - 1], fill=color_of(address.lower()))
        fs = 30 if len(letters) == 1 else 24
        font = ImageFont.truetype(FONT_PATH, fs)
        bb = d.textbbox((0, 0), letters, font=font)
        d.text(((size - (bb[2] - bb[0])) / 2 - bb[0], (size - (bb[3] - bb[1])) / 2 - bb[1]),
               letters, font=font, fill=(255, 255, 255, 255))
        # Значок в углу ставим всегда. Если логотип векторный, рисовальщик его
        # не откроет — тогда вместо картинки галочка вместо логотипа, но пометка
        # остаётся: по ней видно, что письмо от организации.
        r = 13
        cx, cy = size - r - 1, size - r - 1
        logo = open_image(logo_uri) if logo_uri else None
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 255),
                  outline=(176, 176, 176, 255), width=1)
        if logo is None:
            d.line([(cx - 5, cy), (cx - 2, cy + 4), (cx + 5, cy - 5)], fill=(29, 122, 76, 255), width=2)
        else:
            if True:
                logo = logo.convert("RGBA")
                logo.thumbnail((20, 20), Image.LANCZOS)
                im.paste(logo, (cx - logo.size[0] // 2, cy - logo.size[1] // 2), logo)
        return to_png_uri(im)
    except Exception:
        return None


GENERIC = set("""info noreply no-reply donotreply do-not-reply support sales sale mail mailer
mailer-daemon news newsletter notify notification notifications admin office hello service
help feedback team robot subscribe sub order orders shop post client clients reply bot
noreplay no-replay autoreply auto-reply auto alert alerts update updates digest
promo marketing contact contacts webmaster abuse security billing invoice account
accounts careers hr press partner partners events event webinar offers deals
rassylka enews email noanswer nobody""".split())

# Признаки фирмы в имени отправителя: «QNAP Systems, Inc.» — не человек.
COMPANY = set("""inc llc ltd limited gmbh corp corporation company plc llp srl ag bv group
systems technologies software solutions bank store ооо оао зао пао ао ип банк группа
компания сервис магазин""".split())


def mailboxes():
    r = subprocess.run(["docker", "exec", "mailcowdockerized-dovecot-mailcow-1",
                        "doveadm", "user", "*"], capture_output=True, text=True, timeout=120)
    return [l.strip() for l in r.stdout.splitlines() if "@" in l]


def registrable(host):
    p = host.lower().strip(".").split(".")
    return ".".join(p[-2:]) if len(p) >= 2 else host.lower()


def scan():
    """Домены, адреса и имена собеседников: и от кого пришло, и кому отправляли.

    Имя нужно для инициалов, поэтому заголовок разбираем по правилам почты, а не
    поиском подстроки: в письмах имя закодировано вида =?UTF-8?B?...?=."""
    since = time.strftime("%d-%b-%Y", time.localtime(time.time() - ADDR_DAYS * 86400))
    dom_counts, addr_counts, addr_names = {}, {}, {}
    for box in mailboxes():
        try:
            r = subprocess.run(["docker", "exec", "mailcowdockerized-dovecot-mailcow-1",
                                "doveadm", "fetch", "-u", box, "hdr.from hdr.to", "mailbox", "*",
                                "SINCE", since],
                               capture_output=True, text=True, timeout=1200, errors="replace")
        except subprocess.TimeoutExpired:
            log("ящик %s читается слишком долго, пропускаю" % box)
            continue
        for line in r.stdout.splitlines():
            low = line.lower()
            if not (low.startswith("hdr.from:") or low.startswith("hdr.to:")):
                continue
            try:
                pairs = getaddresses([line.split(":", 1)[1]])
            except Exception:
                continue
            for nm, ad in pairs:
                ad = (ad or "").strip().lower()
                if "@" not in ad or " " in ad:
                    continue
                host = ad.split("@")[-1]
                dom = registrable(host)
                if dom in OWN:
                    continue
                addr_counts[ad] = addr_counts.get(ad, 0) + 1
                if nm and ad not in addr_names:
                    try:
                        nm = str(make_header(decode_header(nm)))
                    except Exception:
                        pass
                    nm = nm.strip().strip('"')
                    if nm and "@" not in nm:
                        addr_names[ad] = nm
                if dom not in FREEMAIL:
                    dom_counts[dom] = dom_counts.get(dom, 0) + 1
    return dom_counts, addr_counts, addr_names


def write_js(logos, avatars, inits):
    nl = chr(10)
    block = (BEGIN + nl +
             "window.__senderLogos = " + json.dumps(logos, ensure_ascii=False, sort_keys=True) + ";" + nl +
             "window.__senderAvatars = " + json.dumps(avatars, ensure_ascii=False, sort_keys=True) + ";" + nl +
             "window.__senderInitials = " + json.dumps(inits, ensure_ascii=False, sort_keys=True) + ";" + nl +
             END)
    if not os.path.exists(JS_SRC):
        log("нет файла %s — значки не обновлены" % JS_SRC)
        return
    with open(JS_SRC, encoding="utf-8") as f:
        s = f.read()
    i, j = s.find(BEGIN_MARK), s.find(END)
    if i >= 0 and j > i:
        s = s[:i] + block + s[j + len(END):]
    else:
        s = s.rstrip() + nl + nl + block + nl
    with open(JS_SRC, "w", encoding="utf-8") as f:
        f.write(s)
    if os.path.isdir(os.path.dirname(JS_LIVE)):
        shutil.copyfile(JS_SRC, JS_LIVE)
    else:
        log("тома sogo-web нет — правку увидят только после перезапуска SOGo")


def load_cache():
    if not os.path.exists(CACHE):
        return {"logos": {}, "avatars": {}, "drawn": {}, "tried": {}, "stamp": {}}
    try:
        d = json.load(open(CACHE, encoding="utf-8"))
    except Exception:
        return {"logos": {}, "avatars": {}, "drawn": {}, "tried": {}, "stamp": {}}
    if "logos" not in d:                      # старый плоский вид: домен -> картинка
        d = {"logos": d, "avatars": {}, "drawn": {}, "tried": {}, "stamp": {}}
    d.setdefault("avatars", {})
    d.setdefault("drawn", {})
    d.setdefault("stamp", {})
    d.setdefault("tried", {})
    return d


def stale(book, key, days=RETRY_DAYS):
    """Пора ли повторять неудачный поиск."""
    when = book.get(key)
    if not when:
        return True
    try:
        d = datetime.date.fromisoformat(when)
    except Exception:
        return True
    return (datetime.date.today() - d).days >= days


def main():
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache = load_cache()
    logos, avatars, tried = cache["logos"], cache["avatars"], cache["tried"]
    # Собираем заново, а не продолжаем прошлый: аватары всё равно
    # перерисовываются каждый прогон, зато устаревшие записи не живут вечно.
    # Так ушёл QS у enews-noreply@example.com, когда адрес признали служебным.
    drawn_cache = {}
    stamp = cache["stamp"]
    # Разовый разбор старого хранилища: наши рисунки 64 на 64, а скачанные
    # фотографии ужаты до 32 — по размеру их и различаем.
    for k in list(avatars):
        try:
            if open_image(avatars[k]).size == (64, 64):
                avatars.pop(k)
        except Exception:
            pass
    today = datetime.date.today().isoformat()

    # Тому, что уже найдено, ставим сегодняшнее число: обновлять их прямо
    # сейчас незачем, пусть ждут своего срока.
    for k in list(logos) + list(avatars):
        stamp.setdefault(k, today)

    dom_counts, addr_counts, addr_names = scan()
    if not dom_counts and not addr_counts:
        log("собеседников не нашлось — doveadm не ответил; файл не трогаю")
        return 1

    # --- домены организаций ---
    ordered = sorted(dom_counts.items(), key=lambda kv: -kv[1])
    doms = [d for d, _ in ordered[:TOP]] + [d for d, c in ordered[TOP:] if c >= MIN_MSGS]
    for d in ALWAYS:
        if d not in doms:
            doms.append(d)
    for h in HOST_ICONS:
        if h not in doms:
            doms.append(h)

    budget = NEW_PER_RUN
    new_logos = 0
    for d in doms:
        if d in logos or budget <= 0 or not stale(tried, d):
            continue
        budget -= 1
        src = HOST_ICONS.get(d) or ALIASES.get(d, d)
        icon = fetch_domain_icon(src)
        if icon:
            logos[d] = badged(shrink(icon))
            stamp[d] = today
            new_logos += 1
            tried.pop(d, None)
        else:
            tried[d] = today

    # --- фотографии людей ---
    people = [a for a, c in sorted(addr_counts.items(), key=lambda kv: -kv[1])
              if c >= ADDR_MIN_MSGS][:ADDR_MAX * 3]
    new_photos = 0
    for a in people:
        if a in avatars or budget <= 0 or not stale(tried, a):
            continue
        if len(avatars) >= ADDR_MAX:
            break
        budget -= 1
        photo = fetch_person_photo(a)
        if photo:
            avatars[a] = photo
            stamp[a] = today
            new_photos += 1
            tried.pop(a, None)
        else:
            tried[a] = today

    # --- обновление того, что лежит давно ---
    #
    # Логотипы меняются редко, поэтому найденное не трогаем совсем. Но раз в три
    # месяца перепроверяем: вдруг фирма сменила знак. Если новый не отдали —
    # оставляем старый и откладываем ещё на три месяца.
    refreshed = 0
    for key in list(logos) + list(avatars):
        if budget <= 0:
            break
        if not stale(stamp, key, REFRESH_DAYS):
            continue
        budget -= 1
        if "@" in key:
            fresh = fetch_person_photo(key)
            if fresh:
                avatars[key] = fresh
                refreshed += 1
        else:
            src = HOST_ICONS.get(key) or ALIASES.get(key, key)
            icon = fetch_domain_icon(src)
            if icon:
                logos[key] = badged(shrink(icon))
                refreshed += 1
        stamp[key] = today

    # --- аватары сотрудников: инициалы плюс значок фирмы ---
    #
    # Только для людей на корпоративных доменах, у которых есть логотип. Живая
    # фотография всегда важнее, поэтому её не перерисовываем.
    drawn = 0
    for a in people:
        if a in avatars:
            continue   # настоящая фотография важнее рисунка
        host = a.split("@")[-1]
        dom = registrable(host)
        if dom in FREEMAIL:
            continue
        local = a.split("@")[0]
        if not is_person(addr_names.get(a, ""), local):
            continue
        logo = logos.get(host) or logos.get(dom)
        if not logo:
            continue
        pic = render_person(a, addr_names.get(a, ""), logo)
        if pic:
            drawn_cache[a] = pic
            drawn += 1

    # --- что отдаём браузеру, с оглядкой на общий объём ---
    out_logos, out_avatars, total = {}, {}, 0
    for d in doms:
        v = logos.get(d)
        if v and total + len(v) <= MAX_TOTAL:
            out_logos[d] = v
            total += len(v)
    for a in people:
        v = avatars.get(a) or drawn_cache.get(a)
        if v and total + len(v) <= MAX_TOTAL:
            out_avatars[a] = v
            total += len(v)

    json.dump({"logos": logos, "avatars": avatars, "drawn": drawn_cache, "tried": tried, "stamp": stamp},
              open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)
    # Инициалы для браузера. В карточке письма SOGo передаёт нашей функции
    # только адрес, без имени, и из ivan.petrov@example.com получалась одна буква K
    # вместо АК. Имя у нас есть из заголовков — отдаём готовые инициалы.
    inits = {}
    for a, _ in sorted(addr_counts.items(), key=lambda kv: -kv[1])[:INIT_MAX]:
        nm = addr_names.get(a, '')
        if not nm:
            continue
        loc = a.split('@')[0]
        if not is_person(nm, loc):
            continue
        two = initials_of(nm, loc)
        if two:
            inits[a] = two

    write_js(out_logos, out_avatars, inits)
    log("логотипов %d (+%d), фотографий %d (+%d), обновлено %d, нарисовано %d, объём %d КБ, отложено %d" %
        (len(out_logos), new_logos, len(out_avatars), new_photos, refreshed, drawn, total // 1024, len(tried)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
