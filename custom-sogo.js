// redirect to mailcow login form
document.addEventListener('DOMContentLoaded', function () {
    var loginForm = document.forms.namedItem("loginForm");
    if (loginForm) {
        window.location.href = '/user';
    }
});
// logout function
function mc_logout() {
    fetch("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "logout=1"
    }).then(() => window.location.href = '/');
}

// Custom SOGo JS

// Change the visible font-size in the editor, this does not change the font of a html message by default
// Редактор есть не на каждой странице. Без этой проверки обращение к нему
// роняло весь файл с "CKEDITOR is not defined", и всё, что ниже, не выполнялось.
if (typeof CKEDITOR !== "undefined") {
  CKEDITOR.addCss("body {font-size: 16px !important}");
}

// Enable scayt by default
//CKEDITOR.config.scayt_autoStartup = true;

// ── Значки отправителей ──────────────────────────────────────────────────────
// SOGo по умолчанию просит картинку у gravatar.com, а если её нет — рисует
// «монстра» или узор, никак не связанные с отправителем.
//
// Здесь служба Gravatar подменяется своей, и порядок такой:
//   1. есть логотип домена — показываем его (логотипы вшиты в конец файла
//      скриптом sender-logos.py, скачиваются один раз и хранятся у нас);
//   2. иначе рисуем кружок с первой буквой;
//   3. у отправителей с собственного домена в углу ставится апостроф —
//      так видно, что письмо пришло от организации, а не с личной почты
//      вроде mail.ru или gmail.
//
// Наружу при чтении почты не уходит ни одного запроса: и логотипы, и кружки
// отдаются прямо из этого файла. Цвет кружка выводится из адреса, поэтому у
// одного отправителя он всегда одинаковый.
//
// Фотографии настоящих контактов идут мимо этой службы и не затрагиваются.
(function () {
  'use strict';

  var COLORS = [
    '#D32F2F', '#C2185B', '#7B1FA2', '#512DA8', '#303F9F', '#1976D2',
    '#0288D1', '#0097A7', '#00796B', '#388E3C', '#689F38', '#AFB42B',
    '#F57C00', '#E64A19', '#5D4037', '#455A64'
  ];

  var FREEMAIL = {
    'mail.ru': 1, 'yandex.ru': 1, 'ya.ru': 1, 'gmail.com': 1, 'googlemail.com': 1,
    'bk.ru': 1, 'inbox.ru': 1, 'list.ru': 1, 'rambler.ru': 1, 'mail.com': 1,
    'outlook.com': 1, 'hotmail.com': 1, 'live.com': 1, 'icloud.com': 1, 'me.com': 1,
    'proton.me': 1, 'protonmail.com': 1, 'yahoo.com': 1, 'internet.ru': 1
  };

  // Служебные приставки: от них буква бесполезна — 'info@shop.example'
  // давал бы I вместо V. В таких случаях берём первую букву домена.
  var GENERIC = {
    'info': 1, 'noreply': 1, 'no-reply': 1, 'donotreply': 1, 'do-not-reply': 1,
    'support': 1, 'sales': 1, 'sale': 1, 'mail': 1, 'mailer': 1, 'mailer-daemon': 1,
    'news': 1, 'newsletter': 1, 'notify': 1, 'notification': 1, 'notifications': 1,
    'admin': 1, 'office': 1, 'hello': 1, 'service': 1, 'help': 1, 'feedback': 1,
    'team': 1, 'robot': 1, 'subscribe': 1, 'sub': 1, 'order': 1, 'orders': 1,
    'shop': 1, 'post': 1, 'client': 1, 'clients': 1, 'reply': 1, 'bot': 1,
    'noreplay': 1, 'no-replay': 1, 'autoreply': 1, 'auto-reply': 1, 'auto': 1, 'alert': 1, 'alerts': 1, 'update': 1, 'updates': 1, 'digest': 1,
    'promo': 1, 'marketing': 1, 'contact': 1, 'contacts': 1, 'webmaster': 1, 'abuse': 1, 'security': 1, 'billing': 1, 'invoice': 1, 'account': 1,
    'accounts': 1, 'careers': 1, 'hr': 1, 'press': 1, 'partner': 1, 'partners': 1, 'events': 1, 'event': 1, 'webinar': 1, 'offers': 1, 'deals': 1,
    'rassylka': 1, 'enews': 1, 'email': 1, 'noanswer': 1, 'nobody': 1
  };

  function split(raw) {
    var name = '', addr = String(raw || ''), x = addr.indexOf('<'), y;
    if (x >= 0) {
      y = addr.indexOf('>', x);
      if (y > x) { name = addr.substring(0, x); addr = addr.substring(x + 1, y); }
    }
    return { name: name.replace(/"/g, '').trim(), addr: addr.trim() };
  }

  function registrable(addr) {
    var at = addr.lastIndexOf('@');
    if (at < 0) return '';
    var host = addr.substring(at + 1).toLowerCase().replace(/\.+$/, '');
    var parts = host.split('.');
    return parts.length >= 2 ? parts.slice(-2).join('.') : host;
  }

  function hostOf(addr) {
    var at = addr.lastIndexOf('@');
    if (at < 0) return '';
    var h = addr.substring(at + 1).toLowerCase();
    while (h.length && h.charAt(h.length - 1) === '.') { h = h.substring(0, h.length - 1); }
    return h;
  }

  function firstLetter(s) {
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (/[0-9A-Za-zА-Яа-яЁё]/.test(c)) return c.toUpperCase();
    }
    return '';
  }

  function colorOf(s) {
    var h = 0, i;
    for (i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) % 100000; }
    return COLORS[h % COLORS.length];
  }

  // Разбиваем строку на слова: буквы и цифры собираем, всё прочее — разделители.
  // Так «Валерий Михайлович С.» даёт три слова, а «a.stepanova» — два.
  function wordsOf(s) {
    var out = [], cur = '', i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      if (/[0-9A-Za-zА-Яа-яЁё]/.test(c)) { cur += c; }
      else if (cur) { out.push(cur); cur = ''; }
    }
    if (cur) { out.push(cur); }
    return out;
  }

  // Человек или служба. У людей показываем инициалы, у служб — логотип фирмы.
  // Признак службы сильнее имени: «VK WorkSpace <info@service.example>» — это служба,
  // хотя в имени два слова. А «Валерий Михайлович С. <vm@example.com>» — человек,
  // хотя в адресе всего одно короткое слово.
  // Признаки фирмы в имени отправителя: «QNAP Systems, Inc.» — не человек,
  // хотя слов в имени три.
  var COMPANY = {
    'inc': 1, 'llc': 1, 'ltd': 1, 'limited': 1, 'gmbh': 1, 'corp': 1, 'corporation': 1,
    'company': 1, 'plc': 1, 'llp': 1, 'srl': 1, 'ag': 1, 'bv': 1, 'group': 1, 'systems': 1,
    'technologies': 1, 'software': 1, 'solutions': 1, 'bank': 1, 'store': 1,
    'ооо': 1, 'оао': 1, 'зао': 1, 'пао': 1, 'ао': 1, 'ип': 1, 'банк': 1, 'группа': 1,
    'компания': 1, 'сервис': 1, 'магазин': 1
  };

  // Служебная приставка может быть частью адреса: 'enews-noreply' целиком в
  // списке не числится, поэтому разбираем адрес на части и смотрим каждую.
  function isGenericLocal(local) {
    if (GENERIC[local]) { return true; }
    var parts = local.split(/[^0-9a-zA-Zа-яА-ЯёЁ]+/), i;
    for (i = 0; i < parts.length; i++) {
      var w = parts[i] ? parts[i].toLowerCase().replace(/[0-9]+$/, '') : '';
      if (w && GENERIC[w]) { return true; }
    }
    return false;
  }

  function looksCompany(name) {
    var w = wordsOf(name), i;
    for (i = 0; i < w.length; i++) {
      if (COMPANY[w[i].toLowerCase()]) { return true; }
    }
    return false;
  }

  function isPerson(name, local) {
    if (isGenericLocal(local)) { return false; }
    if (looksCompany(name)) { return false; }
    if (wordsOf(name).length >= 2) { return true; }
    var parts = wordsOf(local);
    return parts.length >= 2 && parts[parts.length - 1].length >= 3;
  }

  // Инициалы: два слова — две буквы, одно — одна.
  function initials(name, local) {
    var src = wordsOf(name);
    if (src.length < 1) { src = wordsOf(local); }
    if (src.length >= 2) {
      return (firstLetter(src[0]) + firstLetter(src[1])).toUpperCase();
    }
    return src.length ? firstLetter(src[0]) : '';
  }

  function avatarUrl(email, size) {
    try {
      var p = split(email);
      if (!p.addr && !p.name) { return ''; }

      var host = hostOf(p.addr);
      var dom = registrable(p.addr);
      var logos = window.__senderLogos || {};
      var avatars = window.__senderAvatars || {};
      var inits = window.__senderInitials || {};

      // 1. Фотография самого человека, если она у нас есть, — точнее всего.
      var mail = p.addr.toLowerCase();
      if (mail && avatars[mail]) { return avatars[mail]; }

      var at = p.addr.indexOf('@');
      var local = at > 0 ? p.addr.substring(0, at).toLowerCase() : '';
      // Готовые инициалы с сервера важнее догадок по адресу: SOGo в карточке
      // письма передаёт адрес без имени, и выходила одна буква вместо двух.
      var known = mail ? inits[mail] : '';
      var person = known ? true : isPerson(p.name, local);

      // 2. Логотип — только для служебных адресов. У живого человека логотип его
      //    работодателя неинформативен: все сотрудники выглядели бы одинаково.
      if (!person) {
        if (host && logos[host]) { return logos[host]; }
        if (dom && logos[dom]) { return logos[dom]; }
      }

      // 3. Иначе кружок с буквами.
      var letter = known || (person ? initials(p.name, local) : '');
      if (!letter) {
        letter = firstLetter(p.name);
      }
      if (!letter) {
        letter = (local && isGenericLocal(local) && dom) ? firstLetter(dom) : firstLetter(p.addr);
      }
      if (!letter) { letter = '?'; }

      var s = size || 48;
      var fontSize = letter.length > 1 ? 38 : 48;
      var badge = '';
      if (dom && !FREEMAIL[dom]) {
        badge = '<circle cx="76" cy="76" r="22" fill="#ffffff"/>' +
                '<text x="76" y="77" dy="0.35em" text-anchor="middle" fill="' + colorOf(p.addr.toLowerCase()) + '"' +
                ' font-family="Roboto, Helvetica, Arial, sans-serif" font-size="30" font-weight="700">&#10003;</text>';
      }
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 100 100">' +
                '<circle cx="50" cy="50" r="50" fill="' + colorOf(p.addr.toLowerCase()) + '"/>' +
                '<text x="50" y="50" dy="0.35em" text-anchor="middle" fill="#ffffff"' +
                ' font-family="Roboto, Helvetica, Arial, sans-serif" font-size="' + fontSize + '" font-weight="500">' +
                letter + '</text>' + badge + '</svg>';
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } catch (e) { return ''; }
  }

  function install(mod) {
    if (!mod || mod.__senderAvatars) return false;
    mod.__senderAvatars = true;
    mod.decorator('Gravatar', ['$delegate', function () { return avatarUrl; }]);
    if (window.console) console.info('sender-avatars: подмена значков установлена');
    return true;
  }

  function hook(ng) {
    if (!ng || ng.__senderAvatarsHooked) return;
    try { if (install(ng.module('SOGo.Common'))) return; } catch (e) { /* модуля ещё нет */ }
    ng.__senderAvatarsHooked = true;
    var orig = ng.module;
    ng.module = function (name) {
      var mod = orig.apply(this, arguments);
      if (name === 'SOGo.Common' && arguments.length > 1) { try { install(mod); } catch (e) {} }
      return mod;
    };
  }

  if (window.angular) {
    hook(window.angular);
  } else {
    var held;
    try {
      Object.defineProperty(window, 'angular', {
        configurable: true,
        get: function () { return held; },
        set: function (v) { held = v; hook(v); }
      });
    } catch (e) { /* не вышло — значки останутся прежними, ничего не сломается */ }
  }
})();

// >>> SENDER-LOGOS BEGIN (собирается скриптом sender-logos.py, руками не править)
window.__senderLogos = {};
window.__senderLogos = {};
window.__senderLogos = {};
// <<< SENDER-LOGOS END

// ---------------------------------------------------------------------------
// Боковая панель (09.10.2026): компактная шапка и свои значки у папок.
//
// Шапка занимала высоту md-tall — около 128 пикселей ради аватара и двух строк.
// У всех обычных папок значок был один, 'folder'. Текст названий размывался
// из-за сдвига через transform: он создаёт слой композиции, и буквы теряют
// резкость; заменён на отрицательный отступ.
// ---------------------------------------------------------------------------
(function () {
  var CSS = [
    /* Шапка в одну строку: в исходнике аватар стоял над именем, и блок
       занимал 128 пикселей фиксированной высоты. */
    'md-sidenav md-toolbar.md-tall{display:flex!important;flex-direction:row;align-items:center;height:auto!important;min-height:0!important;max-height:none!important;padding:7px 10px}',
    'md-sidenav md-toolbar.md-tall>sg-avatar-image{flex:none;margin:0 10px 0 0;display:flex;align-items:center}',
    /* Класс md-tile-left задаёт коробку 64x64 с отступом 12px внутри —
       из-за неё аватар 36px стоял в пустом поле, а текст уезжал вправо. */
    'md-sidenav md-toolbar.md-tall .md-tile-left{width:auto!important;height:auto!important;min-width:0!important;padding:0!important;border-radius:0;display:flex;align-items:center}',
    'md-sidenav md-toolbar.md-tall>div{flex:1 1 auto;min-width:0;align-self:center}',
    'md-sidenav md-toolbar.md-tall .sg-md-title{font-size:15px;line-height:19px;margin:0}',
    'md-sidenav md-toolbar.md-tall .md-caption{font-size:12px;line-height:16px;margin:0;opacity:.9}',
    'md-sidenav md-toolbar.md-tall .md-icon-button{width:32px;height:32px;padding:4px;margin:0}',
    'md-sidenav sg-avatar-image img,md-sidenav sg-avatar-image .sg-avatar{width:36px!important;height:36px!important;display:block}',
    /* Строки учётных записей. Высоту держит ещё и невидимый ::before
       с min-height:40px — без него правка не действует. */
    'md-sidenav .sg-account-section md-list{padding:0}',
    'md-sidenav .sg-account-section md-list.md-dense md-list-item:not(.sg-mailbox-list-item),md-sidenav .sg-account-section md-list.md-dense md-list-item:not(.sg-mailbox-list-item) .md-list-item-inner{min-height:32px!important;height:auto!important}',
    'md-sidenav .sg-account-section md-list.md-dense md-list-item .sg-no-wrap{font-size:14px}',
    /* Строки папок обязаны быть ровно 40px: столько заложено в md-item-size
       виртуального списка. Ниже — и снизу остаётся пустота, выше — строки
       наезжают друг на друга. */
    'md-sidenav .sg-mailbox-list-item,md-sidenav .sg-mailbox-list-item .md-list-item-inner{min-height:40px!important;height:40px!important}',
    /* Без min-height:0 раскрытый раздел не ужимается меньше своего
       содержимого и выталкивает нижние ящики за край панели. */
    'md-sidenav md-content{min-height:0!important}',
    'md-sidenav .sg-account-section{min-height:0!important}',
    'md-sidenav .sg-account-section md-virtual-repeat-container{min-height:0!important}',
    'md-sidenav .sg-account-section md-list.md-dense md-list-item:not(.sg-mailbox-list-item)::before,md-sidenav .sg-account-section md-list.md-dense md-list-item:not(.sg-mailbox-list-item) .md-list-item-inner::before{min-height:32px!important}',
    'md-sidenav .sg-quota{padding:0 8px 2px!important}',
    'md-sidenav .sg-quota .sg-md-caption{font-size:10px;line-height:12px}',
    /* Папки: сдвиг через transform размывал буквы, заменён отступом. */
    '.sg-mailbox-list-item .sg-item-name{-webkit-transform:none;transform:none;margin-left:-8px;font-size:13px}',
    '.sg-mailbox-list-item .sg-item-name md-icon{font-size:20px;width:20px;height:20px;min-width:20px;min-height:20px;line-height:20px}',
    /* Список писем в одну строку, как в mail.ru. В исходнике строка в два
       этажа: сверху отправитель и дата, снизу тема и размер. Приём простой:
       у верхнего блока ставим display:contents — он перестаёт быть коробкой,
       и его дети (отправитель, дата) становятся соседями темы в одном ряду.
       Дальше расставляем их порядком: отправитель, тема, дата. */
    '.view-list .sg-message-list-item .sg-tile-content .sg-md-subhead{display:contents !important}',
    '.view-list .sg-message-list-item .sg-tile-content .sg-md-subhead>div:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}',
    '.view-list .sg-message-list-item .sg-tile-content .sg-tile-date{white-space:nowrap;font-size:12px;font-weight:500;opacity:1}',
    /* Размер письма остаётся, но бледным: он нужен изредка и не должен
       спорить за внимание с датой и темой. */
    '.view-list .sg-message-list-item .sg-tile-size{flex:0 0 auto;margin-left:10px;opacity:.45;font-weight:300}',
    '.view-list .sg-message-list-item .sg-tile-subject{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.view-list .sg-message-list-item sg-avatar-image img{width:32px !important;height:32px !important}'
  ].join('');

  try {
    var st = document.createElement('style');
    st.type = 'text/css';
    st.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(st);
  } catch (e) { /* без оформления обойдёмся */ }

  // Значок по названию папки. Порядок важен: срабатывает первое совпадение,
  // поэтому «Рассылки» стоят раньше «Новостей» (иначе Newsletters попали бы
  // в новости), а «По работе (заказчики)» раньше «Заказов».
  // Все имена сверены со шрифтом MaterialIcons-Regular.ttf, список в
  // /root/material-icons.txt: отсутствующее имя выводится в строке словом.
  var RULES = [
    [/рассылк|newsletter|подписк/i, 'markunread_mailbox'],
    [/новост|news/i, 'chrome_reader_mode'],
    [/игр[аыоу]?\b|games?\b/i, 'videogame_asset'],
    [/госписьм|госуслуг|public\s*service|налог|пфр|суд\b/i, 'account_balance'],
    [/чек|receipt/i, 'receipt'],
    [/коммунал|счет|счёт|оплат|платеж|платёж|invoice|bill/i, 'payment'],
    [/киви|qiwi|кошел|wallet|банк|bank/i, 'account_balance_wallet'],
    [/учёб|учеб|школ|school|курс|студ/i, 'school'],
    [/соц|social|вконтакт|facebook|telegram/i, 'people'],
    [/себе|tomyself|myself|заметк/i, 'person'],
    [/документ|договор|docs\b|document/i, 'description'],
    [/работ|work\b|заказчик|клиент/i, 'work'],
    [/заказ|order|покупк|магазин|shop|store|маркет/i, 'shopping_cart'],
    [/такси|taxi/i, 'local_taxi'],
    [/заявк|request|тикет|ticket|обращен/i, 'assignment'],
    [/proxmo|server|сервер|хостинг|hosting|домен/i, 'dns'],
    [/виасат|viasat|телевид/i, 'tv'],
    [/1\s*[сc]\b/i, 'business'],
    [/путеш|travel|авиа|flight|билет|отел/i, 'flight'],
    [/фото|photo/i, 'photo_camera'],
    [/музык|music/i, 'music_note'],
    [/авто|машин/i, 'directions_car'],
    [/здоров|медиц|клиник|health|аптек/i, 'local_hospital'],
    [/реклам|промо|promo|скидк|акци/i, 'local_offer'],
    [/моё|мое|личн|важн|favor|favour/i, 'star'],
    [/инфо|info/i, 'info']
  ];

  function iconFor(name) {
    var s = String(name || ''), i;
    for (i = 0; i < RULES.length; i++) {
      if (RULES[i][0].test(s)) { return RULES[i][1]; }
    }
    return '';
  }

  function installMailer(mod) {
    if (!mod || mod.__folderIcons) return false;
    mod.__folderIcons = true;
    mod.decorator('Mailbox', ['$delegate', function (Mailbox) {
      var orig = Mailbox.prototype.init;
      if (orig && !orig.__folderIconsPatched) {
        Mailbox.prototype.init = function () {
          var r = orig.apply(this, arguments);
          try {
            // Трогаем только обычные папки: у «Входящих», «Отправленных»
            // и прочих особых значки свои и к месту.
            if (this.$icon === 'folder') {
              var ic = iconFor(this.$displayName || this.name);
              if (ic) { this.$icon = ic; }
            }
          } catch (e) {}
          return r;
        };
        Mailbox.prototype.init.__folderIconsPatched = true;
      }
      return Mailbox;
    }]);
    if (window.console) console.info('folder-icons: значки папок подключены');
    return true;
  }

  function hookMailer(ng) {
    if (!ng || ng.__folderIconsHooked) return;
    try { if (installMailer(ng.module('SOGo.MailerUI'))) return; } catch (e) { /* модуля ещё нет */ }
    ng.__folderIconsHooked = true;
    var orig = ng.module;
    ng.module = function (name) {
      var mod = orig.apply(this, arguments);
      if (name === 'SOGo.MailerUI' && arguments.length > 1) { try { installMailer(mod); } catch (e) {} }
      return mod;
    };
  }

  if (window.angular) {
    hookMailer(window.angular);
  } else {
    // Выше по файлу значки отправителей уже повесили свой перехват на window.angular.
    // Его надо продолжить, а не перекрыть: иначе аватары отключатся молча.
    var prev = Object.getOwnPropertyDescriptor(window, 'angular');
    try {
      if (prev && prev.set) {
        Object.defineProperty(window, 'angular', {
          configurable: true,
          get: prev.get,
          set: function (v) { prev.set.call(window, v); hookMailer(v); }
        });
      } else {
        var held;
        Object.defineProperty(window, 'angular', {
          configurable: true,
          get: function () { return held; },
          set: function (v) { held = v; hookMailer(v); }
        });
      }
    } catch (e) {}
  }
})();

// ---------------------------------------------------------------------------
// Порядок папок (09.10.2026).
//
// В SOGo переставить папки нельзя: список приходит с сервера по алфавиту,
// латиница перед кириллицей. Здесь в меню ящика добавляется пункт
// «Настроить порядок…», открывающий окно с деревом папок — их можно
// перетаскивать. Порядок хранится в этом браузере (localStorage); на сервер
// ничего не пишется, в телефоне и других клиентах останется алфавитный.
//
// Как это работает: Account.prototype.$flattenMailboxes обходит массивы
// account.$mailboxes и mailbox.children. Достаточно пересортировать их перед
// обходом — панель перестроится сама, вложенность сохранится.
// ---------------------------------------------------------------------------
(function () {
  var KEY = 'sogoFolderOrder.v1';

  function allSaved() {
    try { return JSON.parse(window.localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }

  function savedFor(accountId) {
    return allSaved()[accountId] || null;
  }

  function store(accountId, map) {
    var all = allSaved();
    if (map) { all[accountId] = map; } else { delete all[accountId]; }
    try { window.localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {}
  }

  // Сортируем один уровень: что записано — по записи, остальное следом,
  // в прежнем порядке. Так новая папка не теряется, а встаёт в конец.
  function sortLevel(list, saved, parentKey) {
    if (!list || !list.length || !saved) { return; }
    var want = saved[parentKey];
    if (!want || !want.length) { return; }
    var pos = {}, orig = {}, i;
    for (i = 0; i < want.length; i++) { pos[want[i]] = i; }
    for (i = 0; i < list.length; i++) { orig[list[i].path] = i; }
    list.sort(function (a, b) {
      var pa = pos.hasOwnProperty(a.path) ? pos[a.path] : 1000 + orig[a.path];
      var pb = pos.hasOwnProperty(b.path) ? pos[b.path] : 1000 + orig[b.path];
      return pa - pb;
    });
  }

  function applyOrder(account) {
    var saved = savedFor(account.id);
    if (!saved || !account.$mailboxes) { return; }
    var walk = function (list, key) {
      sortLevel(list, saved, key);
      for (var i = 0; i < list.length; i++) {
        if (list[i].children && list[i].children.length) { walk(list[i].children, list[i].path); }
      }
    };
    walk(account.$mailboxes, '');
  }

  function injector() {
    try { return window.angular.element(document.body).injector(); } catch (e) { return null; }
  }

  function accounts() {
    var inj = injector();
    if (!inj) { return []; }
    try { return inj.get('Account').$accounts || []; } catch (e) { return []; }
  }

  function refresh() {
    var inj = injector(), list = accounts(), i;
    for (i = 0; i < list.length; i++) {
      applyOrder(list[i]);
      try { list[i].$flattenMailboxes({ reload: true }); } catch (e) {}
    }
    try {
      var rs = inj.get('$rootScope');
      if (rs.$$phase) { rs.$applyAsync(); } else { rs.$apply(); }
    } catch (e) {}
  }

  // ---- окно настройки -----------------------------------------------------

  function row(mailbox) {
    var li = document.createElement('li');
    li.setAttribute('draggable', 'true');
    li.dataset.path = mailbox.path;
    li.style.cssText = 'list-style:none;margin:0;padding:0';

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;padding:5px 8px;margin:2px 0;' +
      'border:1px solid #d7d7d7;border-radius:3px;background:#fff;cursor:grab;font-size:13px';

    var ic = document.createElement('span');
    ic.textContent = mailbox.$icon || 'folder';
    ic.style.cssText = 'font-family:"Material Icons";font-size:19px;color:#5f6368;flex:none;margin-right:8px';

    var nm = document.createElement('span');
    nm.textContent = mailbox.$displayName || mailbox.name;
    nm.style.cssText = 'flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

    var grip = document.createElement('span');
    grip.textContent = 'drag_handle';
    grip.style.cssText = 'font-family:"Material Icons";font-size:18px;color:#c0c0c0;flex:none';

    head.appendChild(ic);
    head.appendChild(nm);
    head.appendChild(grip);
    li.appendChild(head);

    if (mailbox.children && mailbox.children.length) {
      li.appendChild(level(mailbox.children, mailbox.path));
    }
    return li;
  }

  function level(list, parentKey) {
    var ul = document.createElement('ul'), i;
    ul.dataset.parent = parentKey;
    ul.style.cssText = 'list-style:none;margin:0 0 0 ' + (parentKey ? '22px' : '0') + ';padding:0';
    for (i = 0; i < list.length; i++) { ul.appendChild(row(list[i])); }
    return ul;
  }

  var dragged = null;

  function closestRow(node) {
    while (node && node !== document) {
      if (node.nodeType === 1 && node.tagName === 'LI' && node.dataset && node.dataset.path) { return node; }
      node = node.parentNode;
    }
    return null;
  }

  function wireDrag(root) {
    root.addEventListener('dragstart', function (e) {
      var li = closestRow(e.target);
      if (!li) { return; }
      dragged = li;
      li.style.opacity = '0.4';
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', li.dataset.path); } catch (x) {}
    });
    root.addEventListener('dragend', function () {
      if (dragged) { dragged.style.opacity = ''; }
      dragged = null;
    });
    root.addEventListener('dragover', function (e) {
      if (!dragged) { return; }
      var li = closestRow(e.target);
      // Переставлять можно только внутри своего уровня: иначе папка уехала бы
      // к чужому родителю, а на сервере осталась бы на месте.
      if (!li || li === dragged || li.parentNode !== dragged.parentNode) { return; }
      e.preventDefault();
      var box = li.getBoundingClientRect();
      var after = (e.clientY - box.top) > box.height / 2;
      li.parentNode.insertBefore(dragged, after ? li.nextSibling : li);
    });
    root.addEventListener('drop', function (e) { e.preventDefault(); });
  }

  function collect(root) {
    var out = {}, uls = root.querySelectorAll('ul[data-parent]'), i, j;
    if (root.tagName === 'UL') {
      uls = Array.prototype.slice.call(uls);
      uls.unshift(root);
    }
    for (i = 0; i < uls.length; i++) {
      var key = uls[i].dataset.parent, names = [];
      for (j = 0; j < uls[i].children.length; j++) {
        var li = uls[i].children[j];
        if (li.dataset && li.dataset.path) { names.push(li.dataset.path); }
      }
      if (names.length) { out[key] = names; }
    }
    return out;
  }

  function button(text, primary) {
    var b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'border:0;background:' + (primary ? '#00897b' : 'transparent') + ';color:' +
      (primary ? '#fff' : '#555') + ';padding:8px 14px;border-radius:3px;cursor:pointer;font-size:13px';
    return b;
  }

  function dialog() {
    var list = accounts(), i;
    if (!list.length) { return; }

    var back = document.createElement('div');
    back.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);' +
      'z-index:200;display:flex;align-items:center;justify-content:center';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fafafa;border-radius:4px;box-shadow:0 8px 30px rgba(0,0,0,.35);' +
      'width:460px;max-width:92vw;max-height:86vh;display:flex;flex-direction:column;' +
      'font-family:Roboto,Helvetica,Arial,sans-serif';

    var head = document.createElement('div');
    head.style.cssText = 'padding:14px 16px 6px;font-size:17px;font-weight:500';
    head.textContent = 'Порядок папок';

    var hint = document.createElement('div');
    hint.style.cssText = 'padding:0 16px 10px;font-size:12px;color:#666;line-height:16px';
    hint.textContent = 'Перетащите папку на новое место. Переставлять можно внутри своего уровня, ' +
      'вложенные переедут вместе с родителем. Порядок сохраняется в этом браузере.';

    var body = document.createElement('div');
    body.style.cssText = 'overflow:auto;padding:0 16px 8px;flex:1 1 auto';

    var holders = [];
    for (i = 0; i < list.length; i++) {
      var acc = list[i];
      if (!acc.$mailboxes || !acc.$mailboxes.length) { continue; }
      var cap = document.createElement('div');
      cap.textContent = acc.name;
      cap.style.cssText = 'margin:12px 0 4px;font-size:11px;color:#888;letter-spacing:.5px;text-transform:uppercase';
      body.appendChild(cap);
      var holder = level(acc.$mailboxes, '');
      body.appendChild(holder);
      holders.push({ account: acc, root: holder });
    }
    wireDrag(body);

    var foot = document.createElement('div');
    foot.style.cssText = 'padding:6px 12px 12px;display:flex;justify-content:flex-end';

    var reset = button('Сбросить'), cancel = button('Отмена'), save = button('Сохранить', true);
    foot.appendChild(reset);
    foot.appendChild(cancel);
    foot.appendChild(save);

    function close() { try { document.body.removeChild(back); } catch (e) {} }

    cancel.onclick = close;
    back.onclick = function (e) { if (e.target === back) { close(); } };
    reset.onclick = function () {
      for (var k = 0; k < holders.length; k++) { store(holders[k].account.id, null); }
      close();
      window.location.reload();
    };
    save.onclick = function () {
      for (var k = 0; k < holders.length; k++) {
        store(holders[k].account.id, collect(holders[k].root));
      }
      close();
      refresh();
    };

    box.appendChild(head);
    box.appendChild(hint);
    box.appendChild(body);
    box.appendChild(foot);
    back.appendChild(box);
    document.body.appendChild(back);
  }

  // ---- пункт в меню ящика -------------------------------------------------
  //
  // Меню собирается шаблоном на сервере, а шаблоны лежат в томе, который
  // контейнер переписывает при запуске. Поэтому пункт добавляется к готовому
  // меню в момент его появления, а не правкой шаблона.

  function decorate(menu) {
    if (!menu || menu.__folderOrder) { return; }
    var buttons = menu.querySelectorAll('button'), text = '', i;
    for (i = 0; i < buttons.length; i++) { text += ' ' + (buttons[i].textContent || ''); }
    if (!/Clean mailbox|New Folder|Создать папку|Очистить/i.test(text)) { return; }
    menu.__folderOrder = true;
    menu.classList.add('sg-order-menu');

    var sample = menu.querySelector('md-menu-item');
    var item = sample ? sample.cloneNode(true) : document.createElement('md-menu-item');
    var btn = item.querySelector('button');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'md-button';
      item.appendChild(btn);
    }
    btn.textContent = 'Настроить порядок…';
    btn.removeAttribute('ng-click');
    btn.removeAttribute('aria-label');
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      try {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      } catch (x) {}
      setTimeout(dialog, 60);
    };
    item.appendChild(btn);
    menu.appendChild(item);
  }

  try {
    var css = document.createElement('style');
    css.appendChild(document.createTextNode(
      'md-menu-content.sg-order-menu{height:auto !important;max-height:none !important}'));
    (document.head || document.documentElement).appendChild(css);

    new MutationObserver(function (recs) {
      var i, j, n, m;
      for (i = 0; i < recs.length; i++) {
        for (j = 0; j < recs[i].addedNodes.length; j++) {
          n = recs[i].addedNodes[j];
          if (!n || n.nodeType !== 1) { continue; }
          if (n.tagName === 'MD-MENU-CONTENT') { decorate(n); }
          else if (n.querySelector) {
            m = n.querySelector('md-menu-content');
            if (m) { decorate(m); }
          }
        }
      }
    }).observe(document.body || document.documentElement, { childList: true, subtree: true });
  } catch (e) { /* без пункта меню окно всё равно доступно через sgFolderOrder() */ }

  // ---- подмена сортировки -------------------------------------------------

  function installOrder(mod) {
    if (!mod || mod.__folderOrder) { return false; }
    mod.__folderOrder = true;
    mod.decorator('Account', ['$delegate', function (Account) {
      var orig = Account.prototype.$flattenMailboxes;
      if (orig && !orig.__folderOrderPatched) {
        Account.prototype.$flattenMailboxes = function () {
          try { applyOrder(this); } catch (e) {}
          return orig.apply(this, arguments);
        };
        Account.prototype.$flattenMailboxes.__folderOrderPatched = true;
      }
      return Account;
    }]);
    if (window.console) { console.info('folder-order: порядок папок подключён'); }
    return true;
  }

  function hookOrder(ng) {
    if (!ng || ng.__folderOrderHooked) { return; }
    try { if (installOrder(ng.module('SOGo.MailerUI'))) { return; } } catch (e) { /* модуля ещё нет */ }
    ng.__folderOrderHooked = true;
    var orig = ng.module;
    ng.module = function (name) {
      var mod = orig.apply(this, arguments);
      if (name === 'SOGo.MailerUI' && arguments.length > 1) { try { installOrder(mod); } catch (e) {} }
      return mod;
    };
  }

  // Окно можно открыть и руками, если пункт меню почему-то не появился.
  window.sgFolderOrder = dialog;

  if (window.angular) {
    hookOrder(window.angular);
  } else {
    var prev = Object.getOwnPropertyDescriptor(window, 'angular');
    try {
      if (prev && prev.set) {
        Object.defineProperty(window, 'angular', {
          configurable: true,
          get: prev.get,
          set: function (v) { prev.set.call(window, v); hookOrder(v); }
        });
      } else {
        var held;
        Object.defineProperty(window, 'angular', {
          configurable: true,
          get: function () { return held; },
          set: function (v) { held = v; hookOrder(v); }
        });
      }
    } catch (e) {}
  }
})();

// ---------------------------------------------------------------------------
// Колонки, окно письма и кнопки панели (10.10.2026, переписано).
//
// Окно письма имеет три положения, кнопка на верхней панели их перебирает:
//   справа (как у SOGo по умолчанию) → снизу → выключено → снова справа.
// Разделители колонок тянутся мышью; в положении «снизу» разделитель между
// списком и письмом становится горизонтальным. Ширины и высота запоминаются
// в этом браузере.
//
// Отдельное окно письма (UIxMailPopupView) мы не трогаем: там свой вид, и
// наши правила только мешали бы. Признак — адрес, а НЕ window.opener:
// у обычной вкладки, открытой из соседней, он тоже выставлен, и раньше из-за
// этого весь блок молча отключался.
// ---------------------------------------------------------------------------
(function () {
  try {
    if (/UIxMailPopupView/.test(window.location.pathname)) { return; }
  } catch (e) { return; }

  var KEY = 'sogoPanes.v2';
  var SIDE_MIN = 150, SIDE_MAX = 560;
  var LIST_MIN = 240, LIST_MAX = 1000;
  var ROWS_MIN = 20, ROWS_MAX = 85;      // высота списка в процентах, режим «снизу»
  var MODES = ['right', 'bottom', 'off'];

  function load() {
    try { return JSON.parse(window.localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  var state = load();
  if (MODES.indexOf(state.pane) < 0) { state.pane = 'right'; }

  var sheet = null, hSide = null, hList = null, dragging = null, pending = false;
  var measured = 320, measuredList = 420;

  function sideEl() { return document.querySelector('md-sidenav.md-sidenav-left'); }
  function listEl() { return document.querySelector('.view-list'); }
  function detailEl() { return document.querySelector('#detailView'); }
  function bottom() { return state.pane === 'bottom'; }

  function applyMode() {
    var b = document.body;
    if (!b) { return; }
    b.classList.remove('sg-pane-right', 'sg-pane-bottom', 'sg-pane-off');
    b.classList.add('sg-pane-' + state.pane);
  }

  // Сохранённая ширина может не влезть в нынешнее окно — например, его
  // уменьшили или перетащили на другой монитор. Тогда колонки выталкивают
  // друг друга за край, поэтому ширины урезаются по окну.
  function clamp() {
    var W = window.innerWidth || 1200, changed = false, sMax, sv, left, lMax, lv;
    if (state.side) {
      sMax = Math.min(SIDE_MAX, Math.round(W * 0.4));
      sv = Math.max(SIDE_MIN, Math.min(sMax, state.side));
      if (sv !== state.side) { state.side = sv; changed = true; }
    }
    if (state.list) {
      left = state.side || 320;
      lMax = Math.min(LIST_MAX, Math.max(LIST_MIN, W - left - 320));
      lv = Math.max(LIST_MIN, Math.min(lMax, state.list));
      if (lv !== state.list) { state.list = lv; changed = true; }
    }
    if (state.rows) {
      state.rows = Math.max(ROWS_MIN, Math.min(ROWS_MAX, state.rows));
    }
    return changed;
  }

  function paint() {
    if (!sheet) { return; }
    var css = '', rows = state.rows || 55;

    if (state.side) {
      css += 'md-sidenav.md-sidenav-left{width:' + state.side + 'px !important;min-width:' + state.side +
             'px !important;max-width:' + state.side + 'px !important;flex:0 0 ' + state.side + 'px !important}';
    }
    // Ширина списка нужна только когда письмо справа: в других положениях
    // список занимает всю ширину.
    if (state.list) {
      css += 'body.sg-mail.sg-pane-right .view-list{width:' + state.list + 'px !important;min-width:' + state.list +
             'px !important;max-width:' + state.list + 'px !important;flex:0 0 ' + state.list + 'px !important}';
    }

    // Свёртывание колонок в SOGo считается долями ширины ЭКРАНА
    // (md-sidenav -20vw, .view-list -37.5vw), а не их собственной шириной.
    // Стоит сузить колонку — и разница утягивает всю раскладку влево.
    css += 'md-sidenav.md-locked-open.sg-close,md-sidenav.md-locked-open.md-sidenav-left.sg-close{margin-right:-' +
           (state.side || measured) + 'px !important}';
    css += '.view-list.view-list--close{margin-right:-' + (state.list || measuredList) + 'px !important}';

    // Положение «выключено».
    css += 'body.sg-pane-off:not(.popup) #detailView{display:none !important}';
    css += 'body.sg-pane-off:not(.popup) .view-list{flex:1 1 auto !important;width:auto !important;max-width:none !important}';

    // Положение «снизу»: тот же ряд разворачиваем в столбец.
    css += 'body.sg-pane-bottom:not(.popup) div[layout="row"].sg-block-print{flex-direction:column !important}';
    css += 'body.sg-pane-bottom:not(.popup) .view-list{width:auto !important;min-width:0 !important;max-width:none !important;' +
           'height:' + rows + '% !important;flex:0 0 ' + rows + '% !important}';
    css += 'body.sg-pane-bottom:not(.popup) #detailView{width:auto !important;max-width:none !important;' +
           'flex:1 1 auto !important;min-height:0 !important}';

    // Пока тянем — отключаем плавность, иначе колонка догоняет курсор.
    css += 'body.sg-resizing md-sidenav,body.sg-resizing .view-list,body.sg-resizing #detailView{transition:none !important}';
    // Флекс-элемент не ужимается меньше содержимого, пока не сказать прямо.
    css += 'body.sg-mail #detailView{min-width:0 !important}';
    css += 'body.sg-mail .view-list{min-width:0}';
    // Только текущий ящик: раскрытый раздел помечен классом md-flex,
    // остальные прячем целиком. Класс sg-one-ok ставит tick() и только
    // когда раскрытый раздел есть, иначе спрятались бы все.
    css += 'body.sg-one-account.sg-one-ok md-sidenav .sg-account-section:not(.md-flex){display:none !important}';

    sheet.textContent = css;
  }

  function put(h, el, horizontal) {
    if (!h) { return; }
    if (!el) { h.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) { h.style.display = 'none'; return; }
    h.style.display = 'block';
    if (horizontal) {
      h.style.cursor = 'row-resize';
      h.style.left = r.left + 'px';
      h.style.width = r.width + 'px';
      h.style.top = (r.bottom - 3) + 'px';
      h.style.height = '7px';
    } else {
      h.style.cursor = 'col-resize';
      h.style.left = (r.right - 3) + 'px';
      h.style.width = '7px';
      h.style.top = r.top + 'px';
      h.style.height = r.height + 'px';
    }
  }

  function place() {
    put(hSide, sideEl(), false);
    put(hList, state.pane === 'off' ? null : listEl(), bottom());
  }

  function later() {
    if (pending) { return; }
    pending = true;
    window.requestAnimationFrame(function () { pending = false; tick(); });
  }

  function handle(kind) {
    var h = document.createElement('div');
    h.dataset.kind = kind;
    h.style.cssText = 'position:fixed;z-index:60;display:none;background:transparent;transition:background .15s';
    h.addEventListener('mouseenter', function () { h.style.background = 'rgba(0,0,0,.14)'; });
    h.addEventListener('mouseleave', function () { if (!dragging) { h.style.background = 'transparent'; } });
    h.addEventListener('mousedown', function (e) {
      var el = kind === 'side' ? sideEl() : listEl();
      if (!el) { return; }
      var r = el.getBoundingClientRect();
      dragging = {
        kind: kind,
        horizontal: kind === 'list' && bottom(),
        x: e.clientX, y: e.clientY,
        w: r.width, h: r.height,
        parent: el.parentNode ? el.parentNode.getBoundingClientRect().height : r.height
      };
      document.body.classList.add('sg-resizing');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = dragging.horizontal ? 'row-resize' : 'col-resize';
      e.preventDefault();
    });
    h.addEventListener('dblclick', function () {
      if (kind === 'side') { delete state.side; }
      else if (bottom()) { delete state.rows; }
      else { delete state.list; }
      save(); paint(); place();
    });
    document.body.appendChild(h);
    return h;
  }

  function onMove(e) {
    if (!dragging) { return; }
    if (dragging.horizontal) {
      var h = dragging.h + (e.clientY - dragging.y);
      var pct = Math.round(h / (dragging.parent || 1) * 100);
      state.rows = Math.max(ROWS_MIN, Math.min(ROWS_MAX, pct));
    } else if (dragging.kind === 'side') {
      state.side = Math.max(SIDE_MIN, Math.min(SIDE_MAX, Math.round(dragging.w + (e.clientX - dragging.x))));
    } else {
      state.list = Math.max(LIST_MIN, Math.min(LIST_MAX, Math.round(dragging.w + (e.clientX - dragging.x))));
    }
    paint();
    place();
  }

  function onUp() {
    if (!dragging) { return; }
    dragging = null;
    document.body.classList.remove('sg-resizing');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    save();
    place();
    relayout();
  }

  // Списки в SOGo виртуальные: сколько строк рисовать, считается по высоте
  // контейнера и пересчитывается по событию resize. Меняя раскладку сами,
  // мы обязаны его послать, иначе снизу остаётся пустота.
  function relayout() {
    var fire = function () {
      try { window.dispatchEvent(new Event('resize')); }
      catch (e) {
        var ev = document.createEvent('Event');
        ev.initEvent('resize', true, false);
        window.dispatchEvent(ev);
      }
    };
    var recount = function () {
      var list = document.querySelectorAll('md-virtual-repeat-container'), i, c;
      for (i = 0; i < list.length; i++) {
        try {
          c = window.angular.element(list[i]).controller('mdVirtualRepeatContainer');
          if (c && c.updateSize) { c.updateSize(); }
          if (c && c.repeater && c.repeater.containerUpdated) { c.repeater.containerUpdated(); }
        } catch (e) {}
      }
    };
    fire(); recount();
    window.setTimeout(function () { fire(); recount(); }, 150);
    window.setTimeout(function () { fire(); recount(); }, 600);
    window.setTimeout(function () { fire(); recount(); }, 1200);
  }

  // ---- кнопка положения окна письма --------------------------------------

  function addModeButton() {
    var anchor = document.querySelector('[ng-click="toggleLeft()"]');
    if (!anchor || anchor.__panesDone) { return; }
    anchor.__panesDone = true;

    var btn = anchor.cloneNode(true);
    btn.removeAttribute('ng-click');
    btn.removeAttribute('aria-hidden');
    btn.removeAttribute('aria-label');
    var tip = btn.querySelector('md-tooltip');
    while (tip) { tip.parentNode.removeChild(tip); tip = btn.querySelector('md-tooltip'); }
    var icon = btn.querySelector('md-icon');

    function sync() {
      var names = { right: 'vertical_split', bottom: 'horizontal_split', off: 'view_headline' };
      var hints = {
        right: 'Окно письма справа — нажмите, чтобы перенести вниз',
        bottom: 'Окно письма снизу — нажмите, чтобы убрать',
        off: 'Окно письма убрано, письма открываются двойным щелчком — нажмите, чтобы вернуть справа'
      };
      if (icon) { icon.textContent = names[state.pane]; }
      btn.title = hints[state.pane];
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      state.pane = MODES[(MODES.indexOf(state.pane) + 1) % MODES.length];
      save(); applyMode(); sync(); paint(); place(); relayout();
    });

    sync();
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  }

  // ---- кнопка «только текущий ящик» --------------------------------------

  function addAccountsButton() {
    var bar = document.querySelector('md-sidenav md-toolbar.md-tall');
    if (!bar || bar.__panesAcc) { return; }
    var gear = bar.querySelector('.md-icon-button');
    if (!gear) { return; }
    bar.__panesAcc = true;

    var btn = gear.cloneNode(true);
    btn.removeAttribute('ng-href');
    btn.removeAttribute('ng-hide');
    btn.removeAttribute('aria-label');
    var tip = btn.querySelector('md-tooltip');
    while (tip) { tip.parentNode.removeChild(tip); tip = btn.querySelector('md-tooltip'); }
    var icon = btn.querySelector('md-icon');

    function sync() {
      var one = document.body.classList.contains('sg-one-account');
      if (icon) { icon.textContent = one ? 'unfold_more' : 'unfold_less'; }
      btn.title = one ? 'Показать все ящики' : 'Оставить только текущий ящик — папкам больше места';
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      document.body.classList.toggle('sg-one-account');
      state.oneAccount = document.body.classList.contains('sg-one-account');
      save(); sync(); tick(); relayout();
    });

    sync();
    gear.parentNode.insertBefore(btn, gear);
  }

  // ---- письмо отдельным окном по двойному щелчку --------------------------

  function popup() {
    var tries = 0;
    (function spin() {
      var b = document.querySelector('[ng-click="viewer.openInPopup()"]');
      if (b) { b.click(); return; }
      if (++tries < 30) { window.setTimeout(spin, 80); }
    })();
  }

  function rowOf(node) {
    while (node && node !== document) {
      if (node.nodeType === 1 && node.classList && node.classList.contains('sg-message-list-item')) { return node; }
      node = node.parentNode;
    }
    return null;
  }

  function tick() {
    var sn = sideEl(), lt = listEl(), redraw = false, w;
    if (sn && !sn.classList.contains('sg-close')) {
      w = Math.round(sn.getBoundingClientRect().width);
      if (w > 40 && w !== measured) { measured = w; redraw = true; }
    }
    if (lt && !lt.classList.contains('view-list--close') && !bottom()) {
      w = Math.round(lt.getBoundingClientRect().width);
      if (w > 40 && w !== measuredList) { measuredList = w; redraw = true; }
    }
    if (redraw) { paint(); }

    if (detailEl()) { document.body.classList.add('sg-mail'); }
    else { document.body.classList.remove('sg-mail'); }

    if (document.querySelector('.sg-account-section.md-flex')) {
      document.body.classList.add('sg-one-ok');
    } else {
      document.body.classList.remove('sg-one-ok');
    }

    addModeButton();
    addAccountsButton();
    place();
  }

  // Если раскладку совсем перекосило: sgPanesReset() в консоли браузера.
  window.sgPanesReset = function () {
    try { window.localStorage.removeItem(KEY); } catch (e) {}
    window.location.reload();
  };

  // SOGo открывает письмо окном 680x520 — цифры зашиты в его коде, а код
  // лежит в томе, который контейнер переписывает при запуске. Поэтому
  // перехватываем само открытие окна и подставляем размер по экрану.
  (function () {
    var nativeOpen = window.open;
    if (!nativeOpen || nativeOpen.__sgSized) { return; }
    var patched = function (url, name, features) {
      try {
        if (features && /UIxMailPopupView/.test(String(url))) {
          var aw = (window.screen && window.screen.availWidth) || 1280;
          var ah = (window.screen && window.screen.availHeight) || 800;
          var w = Math.max(900, Math.min(1500, Math.round(aw * 0.72)));
          var h = Math.max(600, Math.min(1000, Math.round(ah * 0.82)));
          features = String(features)
            .replace(/width=\d+/, 'width=' + w)
            .replace(/height=\d+/, 'height=' + h) +
            ',left=' + Math.round((aw - w) / 2) + ',top=' + Math.round((ah - h) / 2);
        }
      } catch (e) {}
      return nativeOpen.call(window, url, name, features);
    };
    patched.__sgSized = true;
    window.open = patched;
  })();

  function boot() {
    sheet = document.createElement('style');
    (document.head || document.documentElement).appendChild(sheet);

    applyMode();
    if (state.oneAccount) { document.body.classList.add('sg-one-account'); }

    hSide = handle('side');
    hList = handle('list');

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    window.addEventListener('resize', function () { if (clamp()) { save(); paint(); } later(); });
    window.addEventListener('scroll', later, true);

    document.addEventListener('dblclick', function (e) {
      if (!rowOf(e.target)) { return; }
      e.preventDefault();
      popup();
    }, true);

    try {
      new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}

    clamp();
    paint();
    tick();
    window.setTimeout(tick, 800);
    window.setTimeout(tick, 2500);
    relayout();
  }

  if (document.body) { boot(); }
  else { document.addEventListener('DOMContentLoaded', boot); }
})();


// ---------------------------------------------------------------------------
// Вторая строка в списке писем: начало текста серым (09.10.2026).
//
// У SOGo этого текста нет: сервер отдаёт в список только заголовки. Поэтому
// для каждой видимой строки письмо запрашивается отдельно, облегчённым
// адресом viewplain — он отдаёт {subject, content} без вложений и разметки.
//
// Чтобы не завалить сервер:
//   - запрашиваем только то, что видно на экране, и только в широком окне;
//   - не больше двух запросов разом, очередь сбрасывается при прокрутке;
//   - полученное лежит в памяти вкладки, повторно письмо не качается.
//
// Отметку «прочитано» SOGo ставит отдельным запросом markMessageRead, так что
// чтение текста её не меняет — проверено по счётчику непрочитанных.
// ---------------------------------------------------------------------------
(function () {
  try {
    if (/UIxMailPopupView/.test(window.location.pathname)) { return; }
  } catch (e) { return; }

  var CACHE = {};          // ключ письма -> отрывок
  var FLYING = {};         // что уже в пути: иначе строка, пока пустая,
                           // попадёт в очередь второй раз (видно в журнале)
  var queue = [];
  var active = 0;
  var MAX_PARALLEL = 2;
  var MAX_LEN = 400;       // столько символов храним, на экран влезет меньше
  var MIN_WIDTH = 520;     // уже этого вторая строка только мешает
  var timer = null, pending = false;

  function ng() { return window.angular; }

  function ctrlOf(row) {
    try { return ng().element(row).controller('sgMessageListItem'); }
    catch (e) { return null; }
  }

  function keyOf(m) {
    return [m.accountId, m.$mailbox && m.$mailbox.path, m.uid].join('/');
  }

  function listEl() { return document.querySelector('.view-list'); }

  function wideEnough() {
    var el = listEl();
    return !!el && el.getBoundingClientRect().width >= MIN_WIDTH;
  }

  // Из текста письма убираем цитаты, подписи-разделители и лишние пробелы:
  // в одну строку всё равно влезет немного, пусть это будет самое начало.
  function tidy(text) {
    text = String(text || '');
    if (window.sgFixMojibake) { text = window.sgFixMojibake(text); }
    // У писем без текстовой части viewplain отдаёт саму разметку.
    if (/<[a-z!][^>]*>/i.test(text)) {
      text = text.replace(/<(style|script)[\s\S]*?<\/>/gi, ' ')
                 .replace(/<!--[\s\S]*?-->/g, ' ')
                 .replace(/<[^>]*>/g, ' ')
                 .replace(/&nbsp;/gi, ' ')
                 .replace(/&quot;/gi, '"')
                 .replace(/&lt;/gi, '<')
                 .replace(/&gt;/gi, '>')
                 .replace(/&#(\d+);/g, function (all, code) { return String.fromCharCode(parseInt(code, 10)); })
                 .replace(/&amp;/gi, '&');
    }
    var lines = text.split(/\r?\n/), out = [], i, l;
    for (i = 0; i < lines.length && out.join(' ').length < MAX_LEN; i++) {
      l = lines[i].trim();
      if (!l) { continue; }
      if (l.charAt(0) === '>') { continue; }
      if (/^--\s*$/.test(l)) { break; }
      out.push(l);
    }
    return out.join(' ').replace(/\s+/g, ' ').substring(0, MAX_LEN);
  }

  function boxOf(row) {
    var content = row.querySelector('.sg-tile-content');
    if (!content) { return null; }
    var box = content.querySelector('.sg-preview');
    if (!box) {
      box = document.createElement('div');
      box.className = 'sg-preview';
      content.appendChild(box);
    }
    return box;
  }

  // Запрос viewplain заставляет сервер отдать тело письма, а IMAP при этом
  // ставит метку «прочитано». Поэтому у непрочитанного письма метку сразу
  // возвращаем обратно: иначе письма «сгорали» от одного лишь пролистывания.
  function restoreUnread(message) {
    var inj, Message, rs;
    try { inj = window.angular.element(document.body).injector(); } catch (e) { return; }
    if (!inj) { return; }
    try { Message = inj.get('Message'); } catch (e) { return; }
    if (!Message || !Message.$$resource || !message.$absolutePath) { return; }
    try {
      Message.$$resource.fetch(message.$absolutePath(), 'markMessageUnread').then(function () {
        message.isread = false;
        try {
          rs = inj.get('$rootScope');
          if (rs.$$phase) { rs.$applyAsync(); } else { rs.$apply(); }
        } catch (e) {}
      });
    } catch (e) {}
  }

  function pump() {
    while (active < MAX_PARALLEL && queue.length) {
      (function (job) {
        active++;
        var wasUnread = (job.message.isread === false || job.message.isread === 0);
        FLYING[job.key] = true;
        var done = function () {
          delete FLYING[job.key];
          active--;
          pump();
        };
        try {
          job.message.$plainContent().then(function (data) {
            var text = tidy(data && (data.content || data.body || data));
            CACHE[job.key] = text;
            if (wasUnread) { restoreUnread(job.message); }
            paintRows();
            done();
          }, function () {
            // Не получилось — запоминаем пустую строку, чтобы не долбить снова.
            CACHE[job.key] = '';
            if (wasUnread) { restoreUnread(job.message); }
            done();
          });
        } catch (e) { CACHE[job.key] = ''; done(); }
      })(queue.shift());
    }
  }

  function paintRows() {
    var rows = document.querySelectorAll('.view-list md-list-item.sg-message-list-item');
    var wide = wideEnough();
    var i, row, ctrl, m, box, key;
    queue.length = 0;
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      box = boxOf(row);
      if (!box) { continue; }
      if (!wide) { box.textContent = ''; continue; }
      ctrl = ctrlOf(row);
      m = ctrl && ctrl.message;
      if (!m || !m.uid) { box.textContent = ''; continue; }
      key = keyOf(m);
      if (CACHE[key] !== undefined) {
        if (box.getAttribute('data-key') !== key || box.textContent !== CACHE[key]) {
          box.textContent = CACHE[key];
          box.setAttribute('data-key', key);
        }
      } else {
        if (box.getAttribute('data-key') !== key) {
          box.textContent = '';
          box.setAttribute('data-key', key);
        }
        if (!FLYING[key]) { queue.push({ message: m, key: key }); }
      }
    }
    pump();
  }

  function later() {
    if (pending) { return; }
    pending = true;
    window.requestAnimationFrame(function () {
      pending = false;
      try { paintRows(); } catch (e) {}
    });
  }

  function boot() {
    var css = document.createElement('style');
    css.appendChild(document.createTextNode([
      /* Строка письма становится сеткой: сверху отправитель, тема и дата,
         снизу во всю ширину — начало текста серым. */
      '.view-list .sg-message-list-item .sg-tile-content{display:grid !important;',
      'grid-template-columns:200px 1fr auto;grid-template-rows:auto auto;',
      'align-items:center;column-gap:14px;row-gap:1px;overflow:hidden}',
      '.view-list .sg-message-list-item .sg-tile-content .sg-md-subhead>div:first-child{grid-column:1;grid-row:1}',
      '.view-list .sg-message-list-item .sg-tile-content .sg-md-body{grid-column:2;grid-row:1;margin-left:0}',
      '.view-list .sg-message-list-item .sg-tile-content .sg-tile-date{grid-column:3;grid-row:1;justify-self:end}',
      /* Тонкая линия под каждым письмом. Не border у самой строки:
         он съел бы пиксель высоты, а она должна совпадать с расчётной,
         иначе список разъедется. Поэтому вставка внутрь. */
      '.view-list .sg-message-list-item{box-shadow:inset 0 -1px 0 rgba(0,0,0,.07)}',
      '.view-list .sg-message-list-item .sg-preview{grid-column:1 / -1;grid-row:2;',
      'font-size:12px;line-height:15px;opacity:.62;overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap;min-width:0}'
    ].join('')));
    (document.head || document.documentElement).appendChild(css);

    document.addEventListener('scroll', later, true);
    window.addEventListener('resize', later);
    try {
      new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    timer = window.setInterval(later, 1500);
    later();
  }

  // Открыть доступ для проверки и отключения на ходу.
  window.sgPreviewOff = function () {
    if (timer) { window.clearInterval(timer); timer = null; }
    var rows = document.querySelectorAll('.sg-preview'), i;
    for (i = 0; i < rows.length; i++) { rows[i].textContent = ''; }
  };

  if (document.body) { boot(); }
  else { document.addEventListener('DOMContentLoaded', boot); }
})();

// ---------------------------------------------------------------------------
// Починка испорченных кодировок в теме и тексте письма (09.10.2026).
//
// Две разные беды, обе от отправителей:
//
// 1. UTF-8, прочитанный как Latin-1: «Ð°Ñ€Ñ…Ð¸Ð²» вместо «архив». Байты целы.
//    Важно: порча бывает ВПЕРЕМЕШКУ с нормальным текстом — часть темы
//    расшифрована верно, часть нет. Поэтому чиним не строку целиком, а каждый
//    подряд идущий кусок «высоких» символов отдельно.
//
// 2. Тема, разрезанная посреди буквы: отправитель нарушил RFC 2047 и порвал
//    двухбайтовый символ между двумя =?utf-8?B?...?= кусками. SOGo
//    расшифровывает куски поодиночке и теряет символ; Mail.ru склеивает байты
//    и читает верно. Если в теме есть знак потери, запрашиваем исходник
//    письма и разбираем заголовок снисходительно — так же, как Mail.ru.
// ---------------------------------------------------------------------------
(function () {
  var BAD = '�';
  var busy = {}, done = {}, active = 0;

  // Порча бывает вперемешку с нормальным текстом, поэтому чиним каждый
  // подряд идущий кусок «высоких» символов отдельно.
  //
  // Отдельный случай — кусок, начинающийся с обломка разрезанной буквы:
  // строгая расшифровка на нём спотыкается и кусок остаётся кракозябрами.
  // Тогда обломок отбрасываем: саму букву вернуть нельзя (её байт потерян
  // ещё при разборе), но весь остальной текст прочитается.
  function decodeRun(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) { return null; }
  }

  // Признак UTF-8, прочитанного как Latin-1: в русском тексте почти каждый
  // второй байт — D0 или D1. У windows-1251 байты разбросаны по всему C0-FF.
  function looksUtf8(bytes) {
    var n = 0, i;
    for (i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0xD0 || bytes[i] === 0xD1) { n++; }
    }
    return n >= bytes.length * 0.3;
  }

  // windows-1251 берём только если вышел связный русский текст: иначе так
  // «расшифровался» бы и немецкий, и французский.
  // windows-1251 принимаем осторожно: иначе немецкое «Grüße» (две умляутные
  // буквы подряд) превратится в «ьЯe». Поэтому требуем сразу трёх признаков:
  // кусок не короче трёх букв, почти весь кириллический, в нём есть гласная,
  // и он не начинается с «ь», «ъ» или «ы» — с них русские слова не начинаются.
  function decode1251(bytes) {
    if (bytes.length < 3) { return null; }
    try {
      var s = new TextDecoder('windows-1251').decode(bytes);
      var cyr = (s.match(/[А-яЁё]/g) || []).length;
      if (cyr < s.length * 0.7) { return null; }
      if (!/[аеёиоуыэюяАЕЁИОУЫЭЮЯ]/.test(s)) { return null; }
      if (/^[ьъыЬЪЫ]/.test(s)) { return null; }
      return s;
    } catch (e) { return null; }
  }
  // Одиночные байты windows-1251 между латиницей и цифрами: «1Ñ» вместо
  // «1С», «è» вместо «и». Правило для кусков их не ловит — оно требует двух
  // испорченных символов подряд. Чиним только когда в строке уже есть русский
  // текст: это надёжный признак, что строка русская, а не немецкая.
  function fixStray1251(s) {
    if (!/[А-яЁё]/.test(s)) { return s; }
    return s.replace(/[-ÿ]/g, function (ch) {
      try {
        var d = new TextDecoder('windows-1251').decode(new Uint8Array([ch.charCodeAt(0) & 0xFF]));
        return /[А-яЁё]/.test(d) ? d : ch;
      } catch (e) { return ch; }
    });
  }
  function fixMojibake(str) {
    if (!str) { return str; }
    var fixed = String(str).replace(/[-ÿ]{2,}/g, function (run) {
      var bytes = new Uint8Array(run.length), i, cut, r;
      for (i = 0; i < run.length; i++) { bytes[i] = run.charCodeAt(i) & 0xFF; }

      r = decodeRun(bytes);
      if (r !== null) { return r; }

      // Обломок разрезанной буквы в начале: саму букву не вернуть, но
      // остальное прочитается.
      if (looksUtf8(bytes)) {
        for (cut = 1; cut < bytes.length && cut < 4; cut++) {
          if (bytes[cut] < 0xC0) { continue; }
          r = decodeRun(bytes.subarray(cut));
          if (r !== null) { return r; }
        }
      }

      r = decode1251(bytes);
      if (r !== null) { return r; }

      return run;   // не наш случай — текст настоящий, не трогаем
    });
    return fixStray1251(fixed);
  }
  window.sgFixMojibake = fixMojibake;

  // ---- снисходительный разбор заголовка ----------------------------------

  function bytesFromBase64(s) {
    var bin = window.atob(s.replace(/\s+/g, '')), out = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i) & 0xFF; }
    return out;
  }

  function bytesFromQuoted(s) {
    var out = [], i, c;
    s = s.replace(/_/g, ' ');
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      if (c === '=' && i + 2 < s.length) { out.push(parseInt(s.substr(i + 1, 2), 16) & 0xFF); i += 2; }
      else { out.push(s.charCodeAt(i) & 0xFF); }
    }
    return new Uint8Array(out);
  }

  function decodeBytes(list, charset) {
    var total = 0, i, pos = 0, all;
    for (i = 0; i < list.length; i++) { total += list[i].length; }
    all = new Uint8Array(total);
    for (i = 0; i < list.length; i++) { all.set(list[i], pos); pos += list[i].length; }
    try { return new TextDecoder(charset || 'utf-8').decode(all); }
    catch (e) {
      try { return new TextDecoder('utf-8').decode(all); } catch (x) { return ''; }
    }
  }

  // Отличие от строгого разбора: байты соседних кусков складываются в общую
  // кучу и расшифровываются разом, поэтому разрезанная буква срастается.
  function decodeHeader(raw) {
    var re = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;
    var out = '', group = [], charset = '', last = 0, m, between;

    function flush() {
      if (group.length) { out += decodeBytes(group, charset); group = []; }
    }

    while ((m = re.exec(raw)) !== null) {
      between = raw.substring(last, m.index);
      if (group.length && !/^\s*$/.test(between)) { flush(); out += between; }
      else if (!group.length) { out += between; }
      if (group.length && charset.toLowerCase() !== m[1].toLowerCase()) { flush(); }
      charset = m[1];
      group.push(m[2].toUpperCase() === 'B' ? bytesFromBase64(m[3]) : bytesFromQuoted(m[3]));
      last = m.index + m[0].length;
    }
    flush();
    out += raw.substring(last);
    return out;
  }
  window.sgDecodeHeader = decodeHeader;

  function subjectFromSource(src) {
    var lines = String(src || '').split(/\r?\n/), i, acc = null;
    for (i = 0; i < lines.length; i++) {
      if (acc !== null) {
        if (/^[ \t]/.test(lines[i])) { acc += ' ' + lines[i].trim(); continue; }
        break;
      }
      if (/^subject:/i.test(lines[i])) { acc = lines[i].replace(/^subject:\s*/i, ''); }
      else if (lines[i] === '') { break; }
    }
    return acc === null ? '' : decodeHeader(acc).trim();
  }

  function injector() {
    try { return window.angular.element(document.body).injector(); } catch (e) { return null; }
  }

  function asText(data) {
    if (typeof data === 'string') { return data; }
    if (!data) { return ''; }
    var keys = ['source', 'content', 'raw', 'rawSource', 'message', 'text'], i;
    for (i = 0; i < keys.length; i++) {
      if (typeof data[keys[i]] === 'string') { return data[keys[i]]; }
    }
    return '';
  }

  function repair(message, key) {
    var inj = injector();
    if (!inj || active > 0) { return; }
    var Message;
    try { Message = inj.get('Message'); } catch (e) { return; }
    if (!Message || !Message.$$resource) { return; }
    busy[key] = true;
    active++;
    Message.$$resource.post(message.id, 'viewsource').then(function (data) {
      active--;
      delete busy[key];
      var mended = subjectFromSource(asText(data));
      if (mended && mended.indexOf(BAD) < 0) {
        done[key] = true;
        try {
          var rs = inj.get('$rootScope');
          message.subject = mended;
          if (rs.$$phase) { rs.$applyAsync(); } else { rs.$apply(); }
        } catch (e) {}
      }
    }, function () { active--; delete busy[key]; });
  }

  // ---- проходы по странице ------------------------------------------------

  function scanList() {
    var rows = document.querySelectorAll('.view-list md-list-item.sg-message-list-item');
    var i, ctrl, m, key, mended, rs;
    for (i = 0; i < rows.length; i++) {
      try { ctrl = window.angular.element(rows[i]).controller('sgMessageListItem'); } catch (e) { ctrl = null; }
      m = ctrl && ctrl.message;
      if (!m || !m.uid || !m.subject) { continue; }

      mended = fixMojibake(m.subject);
      if (mended !== m.subject) {
        try {
          rs = window.angular.element(document.body).injector().get('$rootScope');
          m.subject = mended;
          if (rs.$$phase) { rs.$applyAsync(); } else { rs.$apply(); }
        } catch (e) {}
        continue;
      }

      // За исходником идём не только при знаке потери, но и когда после
      // починки остались «высокие» символы: значит часть байтов SOGo
      // потерял при разборе, и вернуть их можно только из самого письма.
      if (m.subject.indexOf(BAD) < 0 && !/[-ÿ]/.test(m.subject)) { continue; }
      key = [m.accountId, m.$mailbox && m.$mailbox.path, m.uid].join('/');
      if (done[key] || busy[key]) { continue; }
      repair(m, key);
      return;   // по одному за проход: таких писем единицы
    }
  }

  // Тема и текст видны не только в списке: есть открытое письмо и отдельное
  // окно. Там правим текст прямо на месте — только узлы, где порча есть
  // и расшифровывается.
  function fixVisibleText() {
    var root = document.body;
    if (!root || !window.document.createTreeWalker) { return; }
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var node, val, mended, n = 0;
    while ((node = walker.nextNode()) && n < 500) {
      val = node.nodeValue;
      if (!val || val.length < 2 || !/[\u0080-ÿ]{2,}/.test(val)) { continue; }
      mended = fixMojibake(val);
      if (mended !== val) { node.nodeValue = mended; n++; }
    }
  }

  // ---- диагностика --------------------------------------------------------

  window.sgShowSubject = function (n) {
    var rows = document.querySelectorAll('.view-list md-list-item.sg-message-list-item');
    var ctrl = null, m = null, i = n || 0, s, codes = [], j, c;
    try { ctrl = window.angular.element(rows[i]).controller('sgMessageListItem'); } catch (e) {}
    m = ctrl && ctrl.message;
    if (!m) { return 'письма на этом месте нет'; }
    s = String(m.subject || '');
    for (j = 0; j < Math.min(s.length, 70); j++) {
      c = s.charCodeAt(j);
      codes.push(c > 126 || c < 32 ? 'U+' + c.toString(16).toUpperCase() : s.charAt(j));
    }
    console.log('тема          :', s);
    console.log('коды символов :', codes.join(' '));
    console.log('знак потери   :', s.indexOf(BAD) >= 0);
    console.log('куски 80-FF   :', /[\u0080-ÿ]{2,}/.test(s));
    console.log('после починки :', fixMojibake(s));
    return s;
  };

  function boot() {
    window.setInterval(function () {
      try { scanList(); } catch (e) {}
      try { fixVisibleText(); } catch (e) {}
    }, 2000);
    window.setTimeout(fixVisibleText, 500);
  }

  if (document.body) { boot(); }
  else { document.addEventListener('DOMContentLoaded', boot); }
})();

// ---------------------------------------------------------------------------
// Итог непрочитанных по свёрнутым папкам (10.10.2026).
//
// SOGo показывает счётчик только у самой папки. Если папка свёрнута, её
// вложенные не видны, и непрочитанные в них незаметны: у «1С» пусто, хотя
// внутри в «1с инфо» лежит 142 письма. Здесь у свёрнутой папки рисуется
// общий итог по всему её содержимому.
//
// Сами числа приходят с сервера: настройка SOGoMailFetchAllUnseenCountFolders
// заставляет SOGo запрашивать счётчики сразу по всем папкам, а не только по
// открытым.
// ---------------------------------------------------------------------------
(function () {
  try {
    if (/UIxMailPopupView/.test(window.location.pathname)) { return; }
  } catch (e) { return; }

  // Счётчики непрочитанных SOGo по умолчанию запрашивает только для
  // «Входящих» и уже открытых папок. Настройка SOGoMailFetchAllUnseenCountFolders
  // это меняет, но её значение сравнивается строго с числом 1, поэтому надёжнее
  // попросить счётчики самим — у службы Account есть ровно такой вызов.
  function refreshAllCounts() {
    var inj, Account, ids = [];
    try { inj = window.angular.element(document.body).injector(); } catch (e) { return; }
    if (!inj) { return; }
    try { Account = inj.get('Account'); } catch (e) { return; }
    if (!Account || !Account.$accounts || !Account.refreshUnseenCount) { return; }
    try {
      Account.$accounts.forEach(function (acc) {
        var all = acc.$flattenMailboxes ? acc.$flattenMailboxes({ all: true }) : [];
        all.forEach(function (mb) { if (mb && mb.id) { ids.push(mb.id); } });
      });
      if (ids.length) { Account.refreshUnseenCount(ids); }
    } catch (e) {}
  }
  function sumUnseen(mailbox) {
    var total = mailbox.unseenCount || 0, i;
    if (mailbox.children && mailbox.children.length) {
      for (i = 0; i < mailbox.children.length; i++) {
        total += sumUnseen(mailbox.children[i]);
      }
    }
    return total;
  }

  function tick() {
    var rows = document.querySelectorAll('md-sidenav .sg-mailbox-list-item');
    var i, ctrl, mb, name, badge, own, total;
    for (i = 0; i < rows.length; i++) {
      name = rows[i].querySelector('.sg-item-name');
      if (!name) { continue; }
      badge = name.querySelector('.sg-sum-badge');
      ctrl = null;
      try { ctrl = window.angular.element(rows[i]).controller('sgMailboxListItem'); } catch (e) {}
      mb = ctrl && ctrl.mailbox;

      // Итог нужен только свёрнутой папке с вложенными: у раскрытой и так
      // видно каждую, у одиночной сумма равна её собственному счётчику.
      if (!mb || !mb.children || !mb.children.length || mb.$expanded) {
        if (badge) { badge.parentNode.removeChild(badge); }
        continue;
      }
      own = mb.unseenCount || 0;
      total = sumUnseen(mb);
      if (total <= own) {
        if (badge) { badge.parentNode.removeChild(badge); }
        continue;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'sg-sum-badge';
        name.appendChild(badge);
      }
      if (badge.textContent !== String(total)) { badge.textContent = String(total); }
    }
  }
  function boot() {
    var css = document.createElement('style');
    css.appendChild(document.createTextNode(
      '.sg-sum-badge{margin-left:6px;padding:0 6px;border-radius:9px;font-size:11px;' +
      'font-weight:600;line-height:17px;background:rgba(0,0,0,.10);color:inherit;opacity:.75;flex:none}'));
    (document.head || document.documentElement).appendChild(css);
    window.setInterval(function () { try { tick(); } catch (e) {} }, 1500);
    window.setTimeout(tick, 800);
    window.setTimeout(refreshAllCounts, 2500);
    window.setInterval(refreshAllCounts, 300000);
  }

  if (document.body) { boot(); }
  else { document.addEventListener('DOMContentLoaded', boot); }
})();

// ---------------------------------------------------------------------------
// Плотность верхних панелей (10.10.2026).
//
// 1. В дате убран год, цифра дня уменьшена, верхняя панель подогнана по
//    высоте под шапку панели папок — чтобы зелёные полосы шли в один уровень.
// 2. Панель с названием папки: убрана лишняя пустота.
// 3. В строке «14415 сообщений» рядом показывается число непрочитанных
//    жирным, а отступы строки уменьшены.
// ---------------------------------------------------------------------------
(function () {
  try {
    if (/UIxMailPopupView/.test(window.location.pathname) || window.opener) { return; }
  } catch (e) { return; }

  var BAR = 50;   // высота шапки панели папок: отступы 7+7 плюс аватар 36

  function paintCss() {
    var css = document.createElement('style');
    css.appendChild(document.createTextNode([
      /* Дата: год лишний, он и так понятен из писем. */
      '.sg-year{display:none !important}',
      '.sg-date-group{font-size:11px !important;line-height:1.15 !important;padding:0 6px !important}',
      '.sg-date-today{font-size:32px !important;line-height:' + BAR + 'px !important;margin-left:4px !important}',
      /* Верхняя панель в один уровень с шапкой папок. */
      'md-toolbar.toolbar-main{min-height:' + BAR + 'px !important;height:' + BAR + 'px !important;max-height:' + BAR + 'px !important}',
      'md-toolbar.toolbar-main .md-toolbar-tools{height:' + BAR + 'px !important;min-height:' + BAR + 'px !important;max-height:' + BAR + 'px !important;padding:0 8px !important}',
      /* Панель с названием папки — без пустоты снизу. */
      '.view-list md-toolbar:not(.md-tall){min-height:52px !important;height:52px !important}',
      '.view-list md-toolbar:not(.md-tall) .md-toolbar-tools,',
      '.view-list md-toolbar:not(.md-tall) .sg-toolbar-auto{height:52px !important;min-height:52px !important}',
      /* Строка со счётчиком сообщений. */
      '#messagesList .md-subheader{min-height:0 !important}',
      '#messagesList .md-subheader .md-subheader-inner,',
      '#messagesList .md-subheader ._md-subheader-inner{padding:5px 12px !important}',
      '#messagesList .md-subheader .sg-unseen-total{font-weight:700;margin-left:5px;cursor:pointer;text-decoration:underline;text-underline-offset:2px}'
    ].join('')));
    (document.head || document.documentElement).appendChild(css);
  }

  // Число непрочитанных берём у выбранной папки: её строка в панели помечена
  // классом sg-selected, а само письмо-счётчик лежит в её контроллере.
  // Число непрочитанных берём у самой службы SOGo: она помнит выбранную
  // папку (Mailbox.selectedFolder). Прежний способ — искать подсвеченную
  // строку в панели — подводил, когда класс подсветки ещё не проставлен.
  function selectedUnseen() {
    var inj, Mailbox, row, c;
    try { inj = window.angular.element(document.body).injector(); } catch (e) { inj = null; }
    if (inj) {
      try {
        Mailbox = inj.get('Mailbox');
        if (Mailbox && Mailbox.selectedFolder) {
          return Mailbox.selectedFolder.unseenCount || 0;
        }
      } catch (e) {}
    }
    row = document.querySelector('md-sidenav .sg-mailbox-list-item.sg-selected');
    if (!row) { return 0; }
    try {
      c = window.angular.element(row).controller('sgMailboxListItem');
      return (c && c.mailbox && c.mailbox.unseenCount) || 0;
    } catch (e) { return 0; }
  }
  // Щелчок по числу включает показ только непрочитанных — то же, что
  // галочка в меню фильтра: ставим $unseenOnly и просим папку перечитать
  // список тем же запросом, что и штатная галочка.
  function toggleUnseenOnly(e) {
    e.preventDefault();
    e.stopPropagation();
    var inj, Mailbox, folder, rs;
    try { inj = window.angular.element(document.body).injector(); } catch (x) { return; }
    if (!inj) { return; }
    try {
      Mailbox = inj.get('Mailbox');
      folder = Mailbox && Mailbox.selectedFolder;
      if (!folder || !folder.$filter) { return; }
      folder.$unseenOnly = folder.$unseenOnly ? 0 : 1;
      folder.$filter(Mailbox.$query);
      rs = inj.get('$rootScope');
      if (rs.$$phase) { rs.$applyAsync(); } else { rs.$apply(); }
    } catch (x) {}
  }

  function tick() {
    // md-subheader — директива с заменой элемента: в готовой странице это
    // div с классом md-subheader, самого тега нет. Плюс Angular Material
    // держит «прилипающую» копию строки, поэтому обновляем все найденные.
    var subs = document.querySelectorAll('#messagesList .md-subheader');
    var n = selectedUnseen(), i, host, badge, text;
    for (i = 0; i < subs.length; i++) {
      host = subs[i].querySelector('.md-truncate');
      if (!host) { continue; }
      badge = host.querySelector('.sg-unseen-total');
      if (!n) {
        if (badge) { badge.parentNode.removeChild(badge); }
        continue;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'sg-unseen-total';
        badge.title = 'Показать только непрочитанные';
        badge.addEventListener('click', toggleUnseenOnly);
        host.appendChild(badge);
      }
      text = '/ ' + n;
      if (badge.textContent !== text) { badge.textContent = text; }
    }
  }

  // Проверка: sgCountDebug() в консоли покажет, что скрипт видит.
  window.sgCountDebug = function () {
    var subs = document.querySelectorAll('#messagesList .md-subheader'), i;
    console.log('строк-заголовков найдено:', subs.length);
    for (i = 0; i < subs.length; i++) {
      console.log('  ' + i + ':', JSON.stringify((subs[i].textContent || '').trim().slice(0, 60)),
                  '| место для числа:', !!subs[i].querySelector('.md-truncate'));
    }
    console.log('непрочитанных у выбранной папки:', selectedUnseen());
    return selectedUnseen();
  };
  function boot() {
    paintCss();
    window.setInterval(function () { try { tick(); } catch (e) {} }, 1500);
    window.setTimeout(tick, 900);
  }

  if (document.body) { boot(); }
  else { document.addEventListener('DOMContentLoaded', boot); }
})();

// ---------------------------------------------------------------------------
// Фон панелей (10.10.2026).
//
// Рисуем прямо в стилях: переход цвета плюс еле заметный узор из точек,
// вшитый как SVG в сам текст правила. Ничего не грузится со стороны, нечему
// пропадать при обновлении SOGo и нечего хранить в томе, который контейнер
// переписывает при запуске.
//
// Поменять цвета — три значения в TOP ниже. Узор можно убрать, оставив
// в DOTS пустую строку.
// ---------------------------------------------------------------------------
(function () {
  try {
    if (/UIxMailPopupView/.test(window.location.pathname)) { return; }
  } catch (e) { return; }

  // Три опорных цвета полосы: слева темнее, справа светлее.
  var TOP = ['#005b4f', '#00796b', '#2a9d8f'];

  // Узор: редкие светлые точки. Кодируем прямо в адресе, как data-URI.
  var DOTS = 'url("data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">' +
      '<circle cx="4" cy="4" r="1.2" fill="rgba(255,255,255,0.10)"/>' +
      '<circle cx="18" cy="14" r="1.2" fill="rgba(255,255,255,0.07)"/>' +
      '</svg>') + '")';

  function boot() {
    var band = DOTS + ',linear-gradient(100deg,' + TOP[0] + ' 0%,' + TOP[1] + ' 52%,' + TOP[2] + ' 100%)';
    var css = document.createElement('style');
    css.appendChild(document.createTextNode([
      /* Верхняя панель и шапка папок — одна непрерывная полоса. */
      'md-toolbar.toolbar-main{background:' + band + ' !important;background-attachment:fixed !important}',
      'md-sidenav md-toolbar.md-tall{background:' + band + ' !important;background-attachment:fixed !important}',
      /* Панель папок: чуть тёплый оттенок вместо ровного серого. */
      'md-sidenav.md-sidenav-left{background:linear-gradient(180deg,#eef3f2 0%,#e7edec 100%) !important}',
      /* Строка выбранной папки на таком фоне читается хуже — подчёркиваем. */
      'md-sidenav .sg-mailbox-list-item.sg-selected{background:rgba(0,121,107,.14) !important}',
      /* Полоса квоты и подписи остаются читаемыми. */
      'md-sidenav md-toolbar.md-tall .sg-md-title,md-sidenav md-toolbar.md-tall .md-caption{text-shadow:0 1px 1px rgba(0,0,0,.25)}'
    ].join('')));
    (document.head || document.documentElement).appendChild(css);
  }

  if (document.body) { boot(); }
  else { document.addEventListener('DOMContentLoaded', boot); }
})();
