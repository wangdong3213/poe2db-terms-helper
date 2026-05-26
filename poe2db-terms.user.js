// ==UserScript==
// @name         PoE2DB 术语白名单助手
// @namespace    https://poe2db.tw/
// @version      1.0.1
// @description  只在白名单网站中高亮 Poe2DB 术语，支持直接显示指定语言和可选三语悬浮对照。
// @author       Codex
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      poe2db.tw
// @connect      cdn.poe2db.tw
// ==/UserScript==

/*
添加网站：
- 非白名单网站不会显示悬浮入口，也不会扫描页面。
- Tampermonkey 菜单 -> Poe2DB 术语：添加当前网站。
- Tampermonkey 菜单 -> Poe2DB 术语：编辑白名单，可以批量添加。
- 每行一个域名、通配域名或 URL 前缀，例如：
  poe.ninja
  https://mobalytics.gg/poe-2
  *.example.com
*/

(function () {
  "use strict";

  const APP_NAME = "PoE2DB 术语白名单助手";
  const APP_VERSION = "1.0.1";
  const NS = "poe2dbwl";
  const TERM_CLASS = `${NS}-term`;

  const STORAGE = {
    settings: `${NS}:settings:v1`,
    dictionary: `${NS}:dictionary:v1`,
  };

  const LANGS = {
    en: { label: "EN", name: "英语", poe: "us" },
    tw: { label: "繁", name: "繁体", poe: "tw" },
    cn: { label: "简", name: "简体", poe: "cn" },
  };

  const DEFAULT_ENABLED_SITES = ["poe.ninja", "https://mobalytics.gg/poe-2"];
  const DEFAULT_SOURCE_PAGES = [
    "Gem",
    "Skill_Gems",
    "Support_Gems",
    "Spirit_Gems",
    "Lineage_Supports",
    "Heightened_Curse",
    "Blink",
    "Keywords",
    "Modifiers",
    "Items",
    "Unique_item",
    "Waystones",
    "Quest",
    "Ascendancy_class",
    "Crafting",
    "Liquid_Emotions",
    "Endgame",
    "Act",
  ];

  const DEFAULT_SETTINGS = {
    enabledSites: DEFAULT_ENABLED_SITES,
    displayMode: "inline",
    targetLanguage: "cn",
    highlightTerms: true,
    showTooltip: false,
    mutationScan: true,
    dictionaryTtlMs: 7 * 24 * 60 * 60 * 1000,
    maxMatcherTerms: 7000,
    panelPosition: "br",
    defaultSitesVersion: 1,
    sourcePagesVersion: 1,
    sourcePages: DEFAULT_SOURCE_PAGES,
  };

  const PANEL_POSITIONS = ["br", "bl", "tr", "tl"];
  const PANEL_LABELS = {
    br: "右下角",
    bl: "左下角",
    tr: "右上角",
    tl: "左上角",
  };

  const BAD_TERMS = new Set([
    "poe2db",
    "poedb",
    "path of exile",
    "path of exile wiki",
    "patreon",
    "search",
    "us english",
    "tw 繁體中文",
    "cn 简体中文",
    "update cookie preferences",
  ]);

  const COMMON_ENGLISH_STOPWORDS = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
  ]);

  const SEED_TERMS = [
    ["Attack", "攻擊", "攻击"],
    ["Spell", "法術", "法术"],
    ["Skill", "技能", "技能"],
    ["Support", "輔助", "辅助"],
    ["Gem", "寶石", "宝石"],
    ["Projectile", "投射物", "投射物"],
    ["Melee", "近戰", "近战"],
    ["Minion", "召喚物", "召唤物"],
    ["Fire", "火焰", "火焰"],
    ["Cold", "冰冷", "冰冷"],
    ["Lightning", "閃電", "闪电"],
    ["Chaos", "混沌", "混沌"],
    ["Physical", "物理", "物理"],
    ["Resistance", "抗性", "抗性"],
    ["Energy Shield", "能量護盾", "能量护盾"],
    ["Armour", "護甲", "护甲"],
    ["Evasion", "閃避值", "闪避值"],
    ["Life", "生命", "生命"],
    ["Mana", "魔力", "魔力"],
    ["Spirit", "精魂", "精魂"],
    ["Chain", "連鎖", "连锁"],
    ["Pierce", "穿透", "穿透"],
    ["Fork", "分裂", "分裂"],
    ["Grenade", "擲彈", "掷弹"],
    ["Crossbow", "十字弓", "十字弓"],
    ["Bow", "弓", "弓"],
    ["Strike", "打擊", "打击"],
    ["Combo", "連擊", "连击"],
    ["Ignite", "點燃", "点燃"],
    ["Freeze", "冰凍", "冰冻"],
    ["Shock", "感電", "感电"],
    ["Poison", "中毒", "中毒"],
    ["Bleeding", "流血", "流血"],
    ["Stun", "暈眩", "眩晕"],
    ["Leap Slam", "躍擊", "跃击"],
    ["Fireball", "火球", "火球"],
    ["Spark", "電球", "电球"],
    ["Heightened Curse", "增強詛咒", "强效诅咒"],
    ["Blink", "閃現", "闪现"],
  ].map(([en, tw, cn], index) => ({ id: `seed-${index}`, en, tw, cn, source: "seed" }));

  const state = {
    settings: loadSettings(),
    enabledHere: false,
    started: false,
    dictionary: null,
    matcher: null,
    idToEntry: new Map(),
    panelHost: null,
    panelRoot: null,
    statusNode: null,
    tooltip: null,
    observer: null,
    scanTimer: null,
    pendingRoots: new Set(),
    suppressObserverUntil: 0,
  };

  init();

  function init() {
    state.enabledHere = isCurrentSiteEnabled();
    registerMenuCommands();

    if (!state.enabledHere) {
      console.info(`[${APP_NAME}] 当前网站不在白名单中，脚本不显示入口、不扫描页面。`);
      return;
    }

    startForCurrentSite();
  }

  function startForCurrentSite() {
    if (state.started) return;
    state.started = true;

    injectStyles();
    createTooltip();
    createPanel();
    loadDictionary({ force: false })
      .then(() => scanPage())
      .then(() => startMutationObserver())
      .catch((error) => setStatus(`初始化失败：${error.message || error}`));
  }

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== "function") return;

    GM_registerMenuCommand(
      state.enabledHere ? "Poe2DB 术语：停用当前网站" : "Poe2DB 术语：添加当前网站",
      () => setCurrentSiteEnabled(!state.enabledHere),
    );
    GM_registerMenuCommand("Poe2DB 术语：编辑白名单", openSiteSettings);

    if (state.enabledHere) {
      GM_registerMenuCommand("Poe2DB 术语：扫描本页", () => scanPage());
      GM_registerMenuCommand("Poe2DB 术语：刷新词库", () => refreshDictionary());
      GM_registerMenuCommand("Poe2DB 术语：切换显示方式", cycleDisplayMode);
      GM_registerMenuCommand("Poe2DB 术语：移动悬浮窗", cyclePanelPosition);
    }
  }

  function createPanel() {
    const host = document.createElement("div");
    host.id = `${NS}-panel-host`;
    document.documentElement.appendChild(host);

    const root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    root.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        .wrap {
          position: fixed;
          z-index: 2147483000;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #ecf4ff;
        }
        .wrap.br { right: 16px; bottom: 16px; }
        .wrap.bl { left: 16px; bottom: 16px; }
        .wrap.tr { right: 16px; top: 16px; }
        .wrap.tl { left: 16px; top: 16px; }
        .toggle {
          min-width: 62px;
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 8px;
          background: #132033;
          color: #f6d56f;
          font-weight: 700;
          font-size: 13px;
          line-height: 1;
          padding: 10px 12px;
          cursor: pointer;
          box-shadow: 0 12px 28px rgba(0,0,0,.36);
        }
        .panel {
          width: 292px;
          margin-bottom: 8px;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 8px;
          background: rgba(13, 20, 33, .96);
          box-shadow: 0 18px 45px rgba(0,0,0,.38);
          overflow: hidden;
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255,255,255,.1);
        }
        .title {
          font-weight: 700;
          font-size: 13px;
        }
        .version {
          color: #91a3bd;
          font-size: 11px;
        }
        .body {
          padding: 10px 12px 12px;
          display: grid;
          gap: 9px;
          font-size: 12px;
        }
        label {
          display: flex;
          align-items: center;
          gap: 8px;
          line-height: 1.3;
        }
        input[type="checkbox"] {
          width: 15px;
          height: 15px;
          accent-color: #d7b95d;
        }
        select, button {
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,.18);
          background: #172338;
          color: #ecf4ff;
          font-size: 12px;
          padding: 7px 8px;
        }
        select { width: 100%; }
        button { cursor: pointer; }
        button:hover { background: #20304d; }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .subhead {
          color: #91a3bd;
          font-size: 11px;
          margin-bottom: 4px;
        }
        .status {
          min-height: 32px;
          border-top: 1px solid rgba(255,255,255,.1);
          padding-top: 8px;
          color: #b7c6da;
          font-size: 11px;
          line-height: 1.35;
        }
        .hidden { display: none; }
      </style>
      <div class="wrap ${panelPositionClass()}">
        <div class="panel hidden" data-role="panel">
          <div class="head">
            <div>
              <div class="title">PoE2DB 术语</div>
              <div class="version">白名单版 v${escapeHtml(APP_VERSION)}</div>
            </div>
            <button type="button" data-action="collapse">收起</button>
          </div>
          <div class="body">
            <label><input type="checkbox" data-setting="highlightTerms">高亮术语</label>
            <label><input type="checkbox" data-setting="showTooltip">显示三语小窗</label>
            <div>
              <div class="subhead">术语显示方式</div>
              <select data-setting="displayMode">
                <option value="inline">直接显示指定语言</option>
                <option value="tooltip">保留原文，仅高亮</option>
              </select>
            </div>
            <div>
              <div class="subhead">直接显示语言</div>
              <select data-setting="targetLanguage">
                <option value="cn">简体</option>
                <option value="tw">繁体</option>
                <option value="en">英语</option>
              </select>
            </div>
            <div class="grid">
              <button type="button" data-action="scan">扫描本页</button>
              <button type="button" data-action="refresh">刷新词库</button>
              <button type="button" data-action="sites">白名单</button>
              <button type="button" data-action="move">换位置</button>
              <button type="button" data-action="disable">停用本站</button>
            </div>
            <div class="status" data-role="status"></div>
          </div>
        </div>
        <button type="button" class="toggle" data-action="expand">PoE2</button>
      </div>
    `;

    state.panelHost = host;
    state.panelRoot = root;
    state.statusNode = root.querySelector('[data-role="status"]');
    updatePanelValues();
    bindPanelEvents(root);
    setStatus("正在加载 Poe2DB 词库...");
  }

  function bindPanelEvents(root) {
    root.addEventListener("click", (event) => {
      const button = event.target && event.target.closest("[data-action]");
      if (!button) return;

      const action = button.getAttribute("data-action");
      if (action === "expand") setPanelCollapsed(false);
      if (action === "collapse") setPanelCollapsed(true);
      if (action === "scan") scanPage();
      if (action === "refresh") refreshDictionary();
      if (action === "sites") openSiteSettings();
      if (action === "move") cyclePanelPosition();
      if (action === "disable") setCurrentSiteEnabled(false);
    });

    root.addEventListener("change", (event) => {
      const target = event.target;
      if (!target || !target.matches("[data-setting]")) return;

      const key = target.getAttribute("data-setting");
      if (key === "highlightTerms") {
        state.settings.highlightTerms = target.checked;
        saveSettings();
        rerenderTerms();
      }
      if (key === "showTooltip") {
        state.settings.showTooltip = target.checked;
        if (!target.checked) hideTooltip();
        saveSettings();
      }
      if (key === "displayMode") {
        state.settings.displayMode = target.value === "tooltip" ? "tooltip" : "inline";
        saveSettings();
        rerenderTerms();
      }
      if (key === "targetLanguage") {
        state.settings.targetLanguage = LANGS[target.value] ? target.value : "cn";
        saveSettings();
        if (state.settings.displayMode === "inline") rerenderTerms();
      }
    });
  }

  function setPanelCollapsed(collapsed) {
    const panel = state.panelRoot && state.panelRoot.querySelector('[data-role="panel"]');
    if (panel) panel.classList.toggle("hidden", Boolean(collapsed));
  }

  function updatePanelValues() {
    if (!state.panelRoot) return;

    const wrap = state.panelRoot.querySelector(".wrap");
    if (wrap) {
      wrap.classList.remove(...PANEL_POSITIONS);
      wrap.classList.add(panelPositionClass());
    }

    setCheckbox('[data-setting="highlightTerms"]', state.settings.highlightTerms);
    setCheckbox('[data-setting="showTooltip"]', state.settings.showTooltip);

    const mode = state.panelRoot.querySelector('[data-setting="displayMode"]');
    if (mode) mode.value = state.settings.displayMode;

    const language = state.panelRoot.querySelector('[data-setting="targetLanguage"]');
    if (language) language.value = state.settings.targetLanguage;
  }

  function setCheckbox(selector, checked) {
    const node = state.panelRoot && state.panelRoot.querySelector(selector);
    if (node) node.checked = Boolean(checked);
  }

  async function refreshDictionary() {
    if (!state.enabledHere) return;
    setStatus("正在刷新 Poe2DB 词库...");
    await loadDictionary({ force: true });
    await scanPage();
  }

  async function loadDictionary({ force }) {
    const cached = loadCachedDictionary();
    const now = Date.now();
    const fresh =
      cached &&
      Array.isArray(cached.entries) &&
      cached.entries.length > 0 &&
      now - Number(cached.fetchedAt || 0) < state.settings.dictionaryTtlMs;

    if (!force && fresh) {
      setDictionary(cached, "cache");
      setStatus(dictionaryStatusText());
      return cached;
    }

    try {
      const dictionary = await fetchDictionaryFromPoe2db();
      gmSet(STORAGE.dictionary, JSON.stringify(dictionary));
      setDictionary(dictionary, "online");
      setStatus(dictionaryStatusText());
      return dictionary;
    } catch (error) {
      if (cached && Array.isArray(cached.entries) && cached.entries.length > 0) {
        setDictionary(cached, "fallback-cache");
        setStatus(`在线刷新失败，已使用缓存：${error.message || error}`);
        return cached;
      }

      const seed = {
        version: APP_VERSION,
        fetchedAt: now,
        source: "seed",
        entries: SEED_TERMS,
      };
      setDictionary(seed, "seed");
      setStatus(`在线词库不可用，暂用内置词库：${error.message || error}`);
      return seed;
    }
  }

  function loadCachedDictionary() {
    const raw = gmGet(STORAGE.dictionary, null);
    return raw ? safeJsonParse(raw, null) : null;
  }

  function setDictionary(dictionary, mode) {
    const entries = normalizeDictionaryEntries(mergeSeedTerms(dictionary.entries || []));
    state.dictionary = { ...dictionary, entries, mode };
    state.idToEntry = new Map(entries.map((entry) => [entry.id, entry]));
    state.matcher = buildMatcher(entries);
  }

  async function fetchDictionaryFromPoe2db() {
    const records = new Map();
    const pages = uniqueStrings((state.settings.sourcePages || DEFAULT_SOURCE_PAGES).map(normalizeSourcePagePath));
    const jobs = [];

    for (const page of pages) {
      for (const [lang, meta] of Object.entries(LANGS)) {
        jobs.push(async () => {
          const encodedPage = page.split("/").map(encodeURIComponent).join("/");
          const url = `https://poe2db.tw/${meta.poe}/${encodedPage}`;
          const html = await requestText(url);
          parsePoe2dbPage(html, lang, records, page);
        });
      }
    }

    await asyncPool(4, jobs, (done, total) => {
      if (done % 6 === 0 || done === total) setStatus(`正在生成词库 ${done}/${total}...`);
    });

    const entries = mergeSeedTerms(buildEntriesFromRecords(records));
    if (entries.length < 30) throw new Error(`词库结果过少：${entries.length}`);

    return {
      version: APP_VERSION,
      source: "poe2db",
      fetchedAt: Date.now(),
      sourcePages: pages,
      entries,
    };
  }

  function parsePoe2dbPage(html, lang, records, page) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    addPageTitleRecords(doc, lang, records, page);

    doc.querySelectorAll("[data-i18n]").forEach((element) => {
      addRecord(records, `i18n:${element.getAttribute("data-i18n")}`, lang, element.textContent);
    });

    doc.querySelectorAll("[data-keyword]").forEach((element) => {
      addRecord(records, `keyword:${element.getAttribute("data-keyword")}`, lang, element.textContent);
    });

    doc.querySelectorAll("a[href]").forEach((element) => {
      const key = normalizePoeHref(element.getAttribute("href"));
      if (!key) return;
      addRecord(records, `href:${key}`, lang, element.textContent);
      addRecord(records, `title:${key}`, lang, element.getAttribute("title"));
    });

    doc.querySelectorAll("[data-i18n-tw], [data-i18n-cn]").forEach((element, index) => {
      const key = inlineElementKey(element, index);
      addRecord(records, key, lang, element.textContent);
      addRecord(records, key, "tw", element.getAttribute("data-i18n-tw"));
      addRecord(records, key, "cn", element.getAttribute("data-i18n-cn"));
    });
  }

  function addPageTitleRecords(doc, lang, records, page) {
    const key = normalizeSourcePagePath(page);
    if (!key) return;

    [
      doc.querySelector('meta[property="og:title"]')?.getAttribute("content"),
      doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content"),
      doc.querySelector("h1")?.textContent,
      doc.querySelector(".itemName")?.textContent,
      doc.querySelector("title")?.textContent,
    ].forEach((text) => addRecord(records, `page:${key}`, lang, cleanPoePageTitle(text)));
  }

  function cleanPoePageTitle(value) {
    return cleanTerm(String(value || "").replace(/\s+-\s+.*$/, ""));
  }

  function inlineElementKey(element, index) {
    const href = element.getAttribute("href");
    const normalizedHref = href ? normalizePoeHref(href) : "";
    if (normalizedHref) return `inline:${normalizedHref}`;

    const i18n = element.getAttribute("data-i18n");
    if (i18n) return `inline-i18n:${i18n}`;

    return `inline-text:${cleanTerm(element.textContent).toLowerCase()}:${index}`;
  }

  function addRecord(records, key, lang, rawText) {
    if (!key || !LANGS[lang]) return;
    const text = cleanTerm(rawText);
    if (!isUsefulTerm(text)) return;

    if (!records.has(key)) records.set(key, {});
    const record = records.get(key);
    if (!record[lang] || text.length > record[lang].length) record[lang] = text;
  }

  function buildEntriesFromRecords(records) {
    const entries = [];

    for (const [key, record] of records.entries()) {
      const en = cleanTerm(record.en);
      const tw = cleanTerm(record.tw);
      const cn = cleanTerm(record.cn);
      const values = [en, tw, cn].filter(Boolean);
      const distinct = new Set(values.map(normalizeVariant));

      if (values.length < 2 || distinct.size < 2) continue;
      entries.push({
        id: `poe2db-${hashText(`${key}|${en}|${tw}|${cn}`)}`,
        en,
        tw,
        cn,
        source: key,
      });
    }

    return mergeDuplicateEntries(entries);
  }

  function mergeSeedTerms(entries) {
    return mergeDuplicateEntries([...(entries || []), ...SEED_TERMS]);
  }

  function mergeDuplicateEntries(entries) {
    const byPrimary = new Map();
    const byAnyVariant = new Map();

    for (const entry of entries || []) {
      const variants = entryVariants(entry);
      if (!variants.length) continue;

      let mergeKey = normalizeVariant(entry.en) || normalizeVariant(entry.tw) || normalizeVariant(entry.cn) || variants[0];
      for (const variant of variants) {
        if (byAnyVariant.has(variant)) {
          mergeKey = byAnyVariant.get(variant);
          break;
        }
      }

      if (!byPrimary.has(mergeKey)) {
        byPrimary.set(mergeKey, { ...entry, id: entry.id || `entry-${hashText(mergeKey)}` });
      } else {
        const existing = byPrimary.get(mergeKey);
        existing.en = preferTerm(existing.en, entry.en);
        existing.tw = preferTerm(existing.tw, entry.tw);
        existing.cn = preferTerm(existing.cn, entry.cn);
        existing.source = `${existing.source || ""},${entry.source || ""}`.replace(/^,|,$/g, "");
      }

      for (const variant of variants) byAnyVariant.set(variant, mergeKey);
    }

    return [...byPrimary.values()].map((entry, index) => ({ ...entry, id: entry.id || `entry-${index}` }));
  }

  function normalizeDictionaryEntries(entries) {
    return mergeDuplicateEntries(entries)
      .map((entry, index) => ({
        id: entry.id || `entry-${index}`,
        en: cleanTerm(entry.en),
        tw: cleanTerm(entry.tw),
        cn: cleanTerm(entry.cn),
        source: entry.source || "",
      }))
      .filter((entry) => {
        const values = [entry.en, entry.tw, entry.cn].filter(Boolean);
        return values.length >= 2 && new Set(values.map(normalizeVariant)).size >= 2;
      });
  }

  function buildMatcher(entries) {
    const variantToEntryId = new Map();
    const variants = [];

    for (const entry of entries) {
      for (const term of [entry.en, entry.tw, entry.cn]) {
        const cleaned = cleanTerm(term);
        if (!isUsefulTerm(cleaned, true)) continue;

        const normalized = normalizeVariant(cleaned);
        if (variantToEntryId.has(normalized)) continue;

        variantToEntryId.set(normalized, entry.id);
        variants.push(cleaned);
      }
    }

    variants.sort((a, b) => b.length - a.length || a.localeCompare(b));

    let cap = Math.min(variants.length, Number(state.settings.maxMatcherTerms || 7000));
    let regex = null;
    while (cap > 0) {
      try {
        regex = new RegExp(variants.slice(0, cap).map(escapeRegExp).join("|"), "giu");
        break;
      } catch (error) {
        cap = Math.floor(cap / 2);
      }
    }

    return {
      regex,
      variantToEntryId,
      termCount: entries.length,
      variantCount: cap,
    };
  }

  async function scanPage() {
    if (!state.enabledHere) return;
    if (!document.body) return;

    if (!state.dictionary || !state.matcher) await loadDictionary({ force: false });

    clearTermHighlights(document.body);
    if (state.settings.highlightTerms) scanRoot(document.body);
    setStatus(dictionaryStatusText());
  }

  function rerenderTerms() {
    if (!document.body) return;
    clearTermHighlights(document.body);
    if (state.settings.highlightTerms) scanRoot(document.body);
    setStatus(dictionaryStatusText());
  }

  function scanRoot(root) {
    if (!root || !state.matcher || !state.matcher.regex) return;
    state.suppressObserverUntil = Date.now() + 800;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (node.nodeValue.trim().length > 1000) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => highlightTextNode(node));
  }

  function highlightTextNode(node) {
    if (!node.parentNode) return false;

    const text = node.nodeValue;
    const matches = findTermMatches(text);
    if (!matches.length) return false;

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const match of matches) {
      if (match.start > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, match.start)));

      const span = document.createElement("span");
      span.className = TERM_CLASS;
      span.classList.add("notranslate");
      span.dataset.termId = match.entry.id;
      span.dataset.original = match.raw;
      span.dataset.poe2dbTerm = "1";
      span.dataset.immersiveTranslateIgnore = "1";
      span.setAttribute("translate", "no");
      if (state.settings.displayMode === "inline") span.classList.add(`${NS}-direct`);
      span.textContent = displayTextForMatch(match);
      fragment.appendChild(span);
      cursor = match.end;
    }

    if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
    node.parentNode.replaceChild(fragment, node);
    return true;
  }

  function findTermMatches(text) {
    if (!state.matcher || !state.matcher.regex || !text) return [];

    const matches = [];
    const regex = state.matcher.regex;
    regex.lastIndex = 0;

    let match;
    while ((match = regex.exec(text))) {
      const raw = match[0];
      const start = match.index;
      const end = start + raw.length;

      if (!raw) {
        regex.lastIndex += 1;
        continue;
      }
      if (!passesBoundaryCheck(text, raw, start, end)) continue;

      const entryId = state.matcher.variantToEntryId.get(normalizeVariant(raw));
      const entry = state.idToEntry.get(entryId);
      if (!entry) continue;
      if (matches.length && start < matches[matches.length - 1].end) continue;

      matches.push({ start, end, raw, entry });
    }

    return matches;
  }

  function displayTextForMatch(match) {
    if (state.settings.displayMode !== "inline") return match.raw;
    return termTextForTarget(match.entry, state.settings.targetLanguage) || match.raw;
  }

  function clearTermHighlights(root) {
    if (!root) return;
    state.suppressObserverUntil = Date.now() + 1000;

    root.querySelectorAll(`.${TERM_CLASS}`).forEach((span) => {
      const text = span.dataset.original || span.textContent || "";
      span.replaceWith(document.createTextNode(text));
    });

    root.normalize();
  }

  function startMutationObserver() {
    if (!state.settings.mutationScan || state.observer || !document.body) return;

    state.observer = new MutationObserver((mutations) => {
      if (Date.now() < state.suppressObserverUntil) return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) collectMutationRoot(node);
      }

      if (!state.pendingRoots.size) return;

      clearTimeout(state.scanTimer);
      state.scanTimer = setTimeout(() => {
        const roots = Array.from(state.pendingRoots).filter((root) => root && root.isConnected && !shouldSkipElement(root));
        state.pendingRoots.clear();

        if (!state.enabledHere || !state.settings.highlightTerms || Date.now() < state.suppressObserverUntil) return;
        roots.forEach((root) => scanRoot(root));
      }, 1600);
    });

    state.observer.observe(document.body, { childList: true, subtree: true });
  }

  function collectMutationRoot(node) {
    if (!node) return;

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (shouldSkipElement(node) || isImmersiveTranslateElement(node)) return;
      state.pendingRoots.add(compactScanRoot(node));
      return;
    }

    if (node.nodeType === Node.TEXT_NODE && node.nodeValue && node.nodeValue.trim()) {
      const parent = node.parentElement;
      if (!parent || shouldSkipElement(parent) || isImmersiveTranslateElement(parent)) return;
      state.pendingRoots.add(compactScanRoot(parent));
    }
  }

  function compactScanRoot(element) {
    const popup = element.closest('[role="tooltip"], [data-tippy-root], .tippy-box, .tooltip, .popover, [data-radix-popper-content-wrapper]');
    if (popup && !shouldSkipElement(popup)) return popup;
    return element.closest("p, li, td, th, dd, dt, blockquote, figcaption") || element;
  }

  function createTooltip() {
    const tooltip = document.createElement("div");
    tooltip.id = `${NS}-tooltip`;
    tooltip.hidden = true;
    document.documentElement.appendChild(tooltip);
    state.tooltip = tooltip;

    document.addEventListener("mouseover", handleTermMouseOver, true);
    document.addEventListener("mousemove", handleTermMouseMove, true);
    document.addEventListener("mouseout", handleTermMouseOut, true);
  }

  function handleTermMouseOver(event) {
    const term = event.target && event.target.closest && event.target.closest(`.${TERM_CLASS}`);
    if (!term || !state.settings.showTooltip) return;

    const entry = state.idToEntry.get(term.dataset.termId);
    if (!entry) return;

    state.tooltip.innerHTML = tooltipHtml(entry);
    positionTooltip(event);
    state.tooltip.hidden = false;
  }

  function handleTermMouseMove(event) {
    if (!state.tooltip || state.tooltip.hidden) return;
    positionTooltip(event);
  }

  function handleTermMouseOut(event) {
    const term = event.target && event.target.closest && event.target.closest(`.${TERM_CLASS}`);
    if (term) hideTooltip();
  }

  function hideTooltip() {
    if (state.tooltip) state.tooltip.hidden = true;
  }

  function tooltipHtml(entry) {
    return `
      <div class="${NS}-tip-title">${escapeHtml(entry.en || entry.tw || entry.cn)}</div>
      <div><b>EN</b><span>${escapeHtml(entry.en || "-")}</span></div>
      <div><b>繁</b><span>${escapeHtml(entry.tw || "-")}</span></div>
      <div><b>简</b><span>${escapeHtml(entry.cn || "-")}</span></div>
    `;
  }

  function positionTooltip(event) {
    const tooltip = state.tooltip;
    if (!tooltip) return;

    const gap = 16;
    const width = Math.min(tooltip.offsetWidth || 220, 300);
    const height = tooltip.offsetHeight || 96;
    const term = event.target && event.target.closest && event.target.closest(`.${TERM_CLASS}`);
    const hostPopup = term ? closestHostPopup(term) : null;
    const termRect = term ? term.getBoundingClientRect() : null;

    let x = event.clientX - width - gap;
    let y = event.clientY + gap;

    if (hostPopup) {
      const popupRect = hostPopup.getBoundingClientRect();
      x = popupRect.left - width - gap;
      y = Math.min(Math.max(event.clientY + gap, popupRect.top + 8), popupRect.bottom - height - 8);
    } else if (termRect) {
      x = termRect.left - width - gap;
      y = termRect.bottom + gap;
    }

    if (x < 8 && !hostPopup && event.clientX + width + gap < window.innerWidth - 8) {
      x = event.clientX + gap;
    }
    if (y + height > window.innerHeight - 8) y = event.clientY - height - gap;

    tooltip.style.left = `${Math.max(8, x)}px`;
    tooltip.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
  }

  function closestHostPopup(element) {
    const popup = element.closest(
      [
        '[role="tooltip"]',
        "[data-tippy-root]",
        ".tippy-box",
        ".tooltip",
        ".popover",
        "[data-radix-popper-content-wrapper]",
      ].join(","),
    );

    return popup && !popup.closest(`#${NS}-tooltip, #${NS}-panel-host`) ? popup : null;
  }

  function injectStyles() {
    if (document.getElementById(`${NS}-style`)) return;

    const style = document.createElement("style");
    style.id = `${NS}-style`;
    style.textContent = `
      .${TERM_CLASS} {
        color: inherit !important;
        background: rgba(246, 210, 92, .22) !important;
        border-bottom: 1px dotted rgba(246, 210, 92, .82) !important;
        border-radius: 3px !important;
        padding: 0 2px !important;
        text-decoration: none !important;
      }
      .${TERM_CLASS}.${NS}-direct {
        color: #f6d56f !important;
        font-weight: 650 !important;
      }
      #${NS}-tooltip {
        position: fixed;
        z-index: 2147483001;
        max-width: 300px;
        padding: 10px 12px;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 8px;
        background: rgba(11, 17, 28, .97);
        color: #edf5ff;
        box-shadow: 0 16px 38px rgba(0,0,0,.38);
        font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }
      #${NS}-tooltip .${NS}-tip-title {
        color: #f2d36c;
        font-weight: 700;
        margin-bottom: 4px;
      }
      #${NS}-tooltip div:not(.${NS}-tip-title) {
        display: grid;
        grid-template-columns: 2.2em minmax(0, 1fr);
        gap: 6px;
      }
      #${NS}-tooltip b { color: #91a3bd; }
    `;
    document.documentElement.appendChild(style);
  }

  function shouldSkipElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;
    if (element.closest(`#${NS}-panel-host, #${NS}-tooltip, .${TERM_CLASS}`)) return true;
    if (element.closest("script, style, noscript, textarea, input, select, option, button, code, pre, kbd, samp, svg, canvas")) return true;
    if (element.closest("[contenteditable='true'], [aria-hidden='true']")) return true;
    if (isImmersiveTranslateElement(element)) return true;
    return false;
  }

  function isImmersiveTranslateElement(element) {
    return Boolean(
      element &&
        element.closest(
          [
            "[class*='immersive-translate']",
            "[id*='immersive-translate']",
            "[data-immersive-translate]",
            "[data-immersive-translate-walked]",
            "[data-immersive-translate-paragraph]",
          ].join(","),
        ),
    );
  }

  function setCurrentSiteEnabled(enabled) {
    const host = location.hostname;
    const list = uniqueStrings(state.settings.enabledSites || []);
    const withoutCurrent = list.filter((pattern) => !sameHostPattern(pattern, host));

    state.settings.enabledSites = enabled ? uniqueStrings([...withoutCurrent, host]) : withoutCurrent;
    saveSettings();

    if (enabled) {
      alert(`已加入白名单：${host}\n页面将刷新并启用 Poe2DB 术语助手。`);
      location.reload();
      return;
    }

    teardown();
    alert(`已从白名单移除：${host}\n此页面不再显示 Poe2DB 入口。`);
  }

  function openSiteSettings() {
    const current = uniqueStrings(state.settings.enabledSites || []).join("\n");
    const input = prompt(
      [
        "Poe2DB 术语白名单",
        "每行一个域名、通配域名或 URL 前缀。",
        "示例：",
        "poe.ninja",
        "https://mobalytics.gg/poe-2",
        "*.example.com",
      ].join("\n"),
      current,
    );

    if (input === null) return;

    state.settings.enabledSites = uniqueStrings(
      input
        .split(/\r?\n|,/)
        .map((value) => value.trim())
        .filter(Boolean),
    );
    saveSettings();

    const nowEnabled = isCurrentSiteEnabled();
    if (nowEnabled && !state.started) {
      alert("当前页面已加入白名单，页面将刷新并启用。");
      location.reload();
      return;
    }
    if (!nowEnabled && state.started) {
      teardown();
      alert("当前页面已不在白名单中，入口已移除。");
      return;
    }

    setStatus("白名单已保存。");
  }

  function cycleDisplayMode() {
    state.settings.displayMode = state.settings.displayMode === "inline" ? "tooltip" : "inline";
    saveSettings();
    rerenderTerms();
  }

  function cyclePanelPosition() {
    const current = panelPositionClass();
    const nextIndex = (PANEL_POSITIONS.indexOf(current) + 1) % PANEL_POSITIONS.length;
    state.settings.panelPosition = PANEL_POSITIONS[nextIndex];
    saveSettings();
    updatePanelValues();
    setStatus(`悬浮入口已移动到${PANEL_LABELS[state.settings.panelPosition]}。`);
  }

  function teardown() {
    state.enabledHere = false;
    state.started = false;
    if (state.observer) state.observer.disconnect();
    state.observer = null;
    clearTimeout(state.scanTimer);
    state.pendingRoots.clear();
    hideTooltip();
    if (document.body) clearTermHighlights(document.body);
    if (state.tooltip) state.tooltip.remove();
    if (state.panelHost) state.panelHost.remove();
    state.tooltip = null;
    state.panelHost = null;
    state.panelRoot = null;
    state.statusNode = null;
  }

  function isCurrentSiteEnabled() {
    return siteMatches(location.href, state.settings.enabledSites || []);
  }

  function siteMatches(currentUrl, patterns) {
    const current = parseCurrentSite(currentUrl);
    if (!current) return false;
    return (patterns || []).some((pattern) => matchSitePattern(current, pattern));
  }

  function matchSitePattern(current, pattern) {
    const parsed = parseSitePattern(pattern);
    if (!parsed.host) return false;
    if (!hostMatchesPattern(current.host, parsed.host)) return false;
    if (!parsed.path) return true;
    return pathMatchesPrefix(current.path, parsed.path);
  }

  function sameHostPattern(pattern, host) {
    const parsed = parseSitePattern(pattern);
    return Boolean(parsed.host && hostMatchesPattern(String(host || "").toLowerCase(), parsed.host));
  }

  function parseCurrentSite(value) {
    try {
      const url = new URL(String(value || location.href), location.href);
      return { host: url.hostname.toLowerCase(), path: normalizeSitePath(url.pathname) };
    } catch (error) {
      return null;
    }
  }

  function parseSitePattern(pattern) {
    const raw = String(pattern || "").trim().toLowerCase();
    if (!raw) return { host: "", path: "" };
    if (raw === "*") return { host: "*", path: "" };

    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const url = new URL(withScheme);
      const rawWithoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
      return {
        host: url.hostname,
        path: normalizeSitePath(url.pathname === "/" && !/[/?#]/.test(rawWithoutScheme) ? "" : url.pathname),
      };
    } catch (error) {
      return {
        host: raw.replace(/\/.*$/, ""),
        path: normalizeSitePath(raw.includes("/") ? raw.replace(/^[^/]+/, "") : ""),
      };
    }
  }

  function hostMatchesPattern(host, pattern) {
    if (!pattern) return false;
    if (pattern === "*") return true;
    if (pattern === host) return true;
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1);
      return host.endsWith(suffix) || host === suffix.slice(1);
    }
    return false;
  }

  function normalizeSitePath(pathname) {
    const path = String(pathname || "").split(/[?#]/)[0].replace(/\/+$/g, "");
    return path && path !== "/" ? path : "";
  }

  function pathMatchesPrefix(currentPath, patternPath) {
    if (!patternPath) return true;
    if (currentPath === patternPath) return true;
    return currentPath.startsWith(`${patternPath}/`);
  }

  function loadSettings() {
    const raw = gmGet(STORAGE.settings, null);
    const parsed = raw ? safeJsonParse(raw, {}) : {};
    const settings = { ...DEFAULT_SETTINGS, ...parsed };

    if (!Array.isArray(settings.enabledSites)) settings.enabledSites = [];
    if (!Array.isArray(settings.sourcePages)) settings.sourcePages = DEFAULT_SOURCE_PAGES;

    if (settings.defaultSitesVersion < 1) {
      settings.enabledSites = uniqueStrings([...DEFAULT_ENABLED_SITES, ...settings.enabledSites]);
      settings.defaultSitesVersion = 1;
    }
    if (settings.sourcePagesVersion < 1) {
      settings.sourcePages = uniqueStrings([...settings.sourcePages, ...DEFAULT_SOURCE_PAGES]);
      settings.sourcePagesVersion = 1;
    }

    settings.enabledSites = uniqueStrings(settings.enabledSites);
    settings.sourcePages = uniqueStrings(settings.sourcePages.map(normalizeSourcePagePath));
    if (!["inline", "tooltip"].includes(settings.displayMode)) settings.displayMode = "inline";
    if (!LANGS[settings.targetLanguage]) settings.targetLanguage = "cn";
    if (!PANEL_POSITIONS.includes(settings.panelPosition)) settings.panelPosition = "br";

    gmSet(STORAGE.settings, JSON.stringify(settings));
    return settings;
  }

  function saveSettings() {
    gmSet(STORAGE.settings, JSON.stringify(state.settings));
    updatePanelValues();
  }

  function setStatus(text) {
    if (state.statusNode) state.statusNode.textContent = text;
  }

  function dictionaryStatusText() {
    if (!state.dictionary) return "词库未加载。";
    const fetchedAt = state.dictionary.fetchedAt ? new Date(state.dictionary.fetchedAt).toLocaleString() : "未知时间";
    const source =
      state.dictionary.mode === "online"
        ? "在线"
        : state.dictionary.mode === "fallback-cache"
          ? "缓存兜底"
          : state.dictionary.mode === "cache"
            ? "缓存"
            : "内置";
    return `${source}词库：${state.dictionary.entries.length} 条术语，${state.matcher ? state.matcher.variantCount : 0} 个匹配项，更新时间 ${fetchedAt}`;
  }

  function panelPositionClass() {
    return PANEL_POSITIONS.includes(state.settings.panelPosition) ? state.settings.panelPosition : "br";
  }

  function termTextForTarget(entry, target) {
    if (target === "en") return entry.en || entry.tw || entry.cn;
    if (target === "tw") return entry.tw || entry.en || entry.cn;
    if (target === "cn") return entry.cn || entry.tw || entry.en;
    return entry.cn || entry.tw || entry.en;
  }

  function requestText(url, options = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || "GET",
        url,
        headers: options.headers || {},
        data: options.data,
        timeout: options.timeout || 30000,
        onload(response) {
          if (response.status >= 200 && response.status < 300) {
            resolve(response.responseText || "");
          } else {
            reject(new Error(`HTTP ${response.status} ${url}`));
          }
        },
        onerror(error) {
          reject(new Error(error && error.message ? error.message : `请求失败：${url}`));
        },
        ontimeout() {
          reject(new Error(`请求超时：${url}`));
        },
      });
    });
  }

  async function asyncPool(limit, jobs, progress) {
    let index = 0;
    let done = 0;
    const workers = new Array(Math.min(limit, jobs.length)).fill(null).map(async () => {
      while (index < jobs.length) {
        const current = index;
        index += 1;
        try {
          await jobs[current]();
        } catch (error) {
          console.warn(`[${APP_NAME}] 词库来源失败`, error);
        } finally {
          done += 1;
          if (progress) progress(done, jobs.length);
        }
      }
    });

    await Promise.all(workers);
  }

  function cleanTerm(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
      .trim()
      .replace(/^[\s"'“”‘’()[\]{}<>:：,，.。;；|/\\-]+/, "")
      .replace(/[\s"'“”‘’()[\]{}<>:：,，.。;；|/\\-]+$/, "");
  }

  function isUsefulTerm(value, forMatcher) {
    const text = cleanTerm(value);
    if (!text) return false;
    if (text.length < 2 || text.length > 80) return false;
    if (/^\d+([.,]\d+)?%?$/.test(text)) return false;
    if (/^https?:\/\//i.test(text)) return false;
    if (BAD_TERMS.has(text.toLowerCase())) return false;
    if (forMatcher && COMMON_ENGLISH_STOPWORDS.has(text.toLowerCase())) return false;
    if (/[{}<>]/.test(text)) return false;

    const wordCount = (text.match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;
    const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
    if (wordCount > 8 && cjkCount === 0) return false;
    if (cjkCount > 32) return false;
    if ((text.match(/[.!?。！？]/g) || []).length > 1) return false;

    return true;
  }

  function normalizePoeHref(href) {
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return "";

    try {
      const url = new URL(href, "https://poe2db.tw/us/");
      if (!/(^|\.)poe2db\.tw$/i.test(url.hostname)) return "";

      return safeDecodeURIComponent(url.pathname)
        .replace(/^\/(us|tw|cn)\//i, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/+/g, "/");
    } catch (error) {
      return "";
    }
  }

  function normalizeSourcePagePath(page) {
    return safeDecodeURIComponent(String(page || ""))
      .trim()
      .replace(/^https?:\/\/poe2db\.tw\/(us|tw|cn)\//i, "")
      .replace(/^\/?(us|tw|cn)\//i, "")
      .replace(/^\/+|\/+$/g, "")
      .replace(/\/+/g, "/");
  }

  function normalizeVariant(value) {
    return cleanTerm(value).toLocaleLowerCase();
  }

  function entryVariants(entry) {
    return uniqueStrings([entry.en, entry.tw, entry.cn].map(normalizeVariant).filter(Boolean));
  }

  function preferTerm(current, next) {
    const a = cleanTerm(current);
    const b = cleanTerm(next);
    if (!a) return b;
    if (!b) return a;
    return b.length > a.length ? b : a;
  }

  function passesBoundaryCheck(text, raw, start, end) {
    if (!/[A-Za-z0-9]/.test(raw)) return true;

    const before = text[start - 1] || "";
    const after = text[end] || "";
    return !isAsciiWordChar(before) && !isAsciiWordChar(after);
  }

  function isAsciiWordChar(char) {
    return /[A-Za-z0-9_'’-]/.test(char);
  }

  function uniqueStrings(values) {
    return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function hashText(value) {
    const text = String(value || "");
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(36);
  }

  function gmGet(key, fallback) {
    try {
      if (typeof GM_getValue === "function") return GM_getValue(key, fallback);
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw;
    } catch (error) {
      return fallback;
    }
  }

  function gmSet(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
        return;
      }
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`[${APP_NAME}] 保存失败`, error);
    }
  }
})();
