/* ===================================================================
   THE AI LAB REPORT — dashboard behaviour
   Renders the KPI cards, charts, evidence list, all-labs table, the
   disclosure matrix, method, citations and the row drawer.
   Data lives in data.js: COMPANIES / RELEASES / SOURCES.
   =================================================================== */
(function () {
  "use strict";

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };
  var fmt = function (n) { return Number(n).toLocaleString("en-US"); };
  var money = function (b) {
    if (b >= 1000) { var t = b / 1000; return "$" + (t >= 10 ? Math.round(t) : Math.round(t * 10) / 10) + "T"; }
    return "$" + fmt(Math.round(b)) + "B";
  };
  var median = function (arr) {
    var v = arr.slice().sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var shortDate = function (iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? (Number(m[3]) + " " + MONTHS[Number(m[2]) - 1]) : (iso || "");
  };

  if (typeof COMPANIES === "undefined") return;
  var C = COMPANIES;
  var REL = (typeof RELEASES !== "undefined") ? RELEASES : [];
  var SRC = (typeof SOURCES !== "undefined") ? SOURCES : [];
  var SRC_BY_KEY = {};
  SRC.forEach(function (s) { SRC_BY_KEY[s.key] = s; });
  var byId = function (id) {
    for (var i = 0; i < C.length; i++) { if (C[i].id === id) return C[i]; }
    return null;
  };
  var cut = (typeof CUTOFF !== "undefined") ? CUTOFF : "2026-09-25";

  /* ---- Derived stats — computed here so data.js stays raw values only ---- */
  var scored = C.filter(function (c) { return c.capability != null; });
  var capMedian = median(scored.map(function (c) { return c.capability; }));
  var capLead = scored.slice().sort(function (a, b) { return b.capability - a.capability; })[0];
  var priced = C.filter(function (c) { return c.valuation != null; });
  var pricedTop = priced.slice().sort(function (a, b) { return b.valuation - a.valuation; })[0];
  var proxies = C.filter(function (c) { return c.parentCap != null; });
  var openCo = C.filter(function (c) { return c.open; });
  var openFlag = C.filter(function (c) { return c.flagshipOpen; });
  var S = {
    labs: C.length,
    capMedian: capMedian,
    capLead: capLead,
    capGap: capLead ? capLead.capability - capMedian : 0,
    priced: priced.length,
    pricedTop: pricedTop,
    proxies: proxies,
    openCo: openCo.length,
    openFlag: openFlag.length,
    powerDis: C.filter(function (c) { return c.computeGw != null; }).length,
    waterDis: C.filter(function (c) { return c.waterMld != null; }).length
  };

  var regionOf = function (c) {
    if (c.cc === "CN") return "China";
    if (c.cc === "US") return "USA";
    return "Europe";
  };
  var staffText = function (c) {
    if (c.staffShow) return c.staffShow;
    if (c.staff == null) return "ND";
    var pre = (c.staffStatus === "Estimate") ? "~" : "";
    var suf = (c.id === "meta") ? "+" : "";
    return pre + fmt(c.staff) + suf;
  };
  var capText = function (c) { return (c.capability == null) ? "ND" : String(c.capability); };
  var ndChip = function (t) { return '<span class="nd">' + esc(t || "ND") + "</span>"; };
  var icon = function (id, cls) { return '<svg class="ic ' + (cls || "") + '"><use href="#' + id + '"/></svg>'; };
  /* ---- KPI cards ---- */
  var shortName = function (c) {
    return c.name.replace("Google DeepMind", "DeepMind").replace("Mistral AI", "Mistral");
  };
  var countUp = function (el) {
    var target = parseFloat(el.getAttribute("data-count"));
    if (isNaN(target) || el.getAttribute("data-done")) return;
    el.setAttribute("data-done", "1");
    var pre = el.getAttribute("data-pre") || "";
    var suf = el.getAttribute("data-suf") || "";
    if (!window.requestAnimationFrame) { el.textContent = pre + fmt(target) + suf; return; }
    var t0 = null, DUR = 700, settled = false;
    var step = function (ts) {
      if (settled) return;
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / DUR);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + fmt(Math.round(target * e)) + suf;
      if (p < 1) { requestAnimationFrame(step); }
    };
    el.textContent = pre + "0" + suf;
    requestAnimationFrame(step);
    /* Safety net: land on the exact value even if rAF stalls (headless, background tabs) */
    setTimeout(function () { settled = true; el.textContent = pre + fmt(target) + suf; }, DUR + 250);
  };

  var renderKpis = function () {
    var box = $("#overview");
    if (!box) return;

    var pillOrder = C.slice().sort(function (a, b) {
      if (a.capability == null) return 1;
      if (b.capability == null) return -1;
      return b.capability - a.capability;
    });
    var pills = pillOrder.map(function (c) {
      var cls = (c === S.capLead) ? " on" : ((c.capability == null) ? " off" : "");
      return '<button class="pill-lab' + cls + '" type="button" data-open="' + c.id + '" title="' + esc(c.model) + '">' +
        "<span>" + esc(shortName(c)) + "</span><b>" + capText(c) + "</b></button>";
    }).join("");

    var miniRows = priced.slice().sort(function (a, b) { return b.valuation - a.valuation; }).map(function (c) {
      return "<li><span>" + esc(shortName(c)) + '</span><span class="d">' + esc(shortDate(c.valuationAsOf)) + "</span><b>" +
        esc(c.valuationLabel || money(c.valuation)) + "</b></li>";
    }).join("");

    box.innerHTML =
      '<article class="card kpi">' +
        '<div class="kpi-top"><span class="ic-tile bolt">' + icon("i-bolt") + '</span><span class="kpi-lbl">Model quality</span><span class="chip">Capability index</span></div>' +
        '<div class="kpi-row"><span class="kpi-val" data-count="' + S.capLead.capability + '">0</span></div>' +
        '<p class="kpi-sub2">How good each lab\'s best model is, scored 0–100 by an independent testing lab. ' + esc(S.capLead.name) + ' leads with ' + esc(S.capLead.model) + ', ' + S.capGap + ' points above the middle of the group.</p>' +
        '<div class="pills">' + pills + "</div>" +
        '<div class="kpi-foot"><span class="kpi-sub">Source: Artificial Analysis · scores read ' + esc(cut) + '</span><a class="link" href="#ranking">See the ranking' + icon("i-chev-right") + "</a></div>" +
      "</article>" +

      '<article class="card kpi">' +
        '<div class="kpi-top"><span class="ic-tile coins">' + icon("i-coins") + '</span><span class="kpi-lbl">Company value</span><span class="chip">' + S.priced + " of " + S.labs + " priced</span></div>" +
        '<div class="kpi-row"><span class="kpi-val" data-count="' + S.pricedTop.valuation + '" data-pre="$" data-suf="B">$0B</span><span class="delta">' + icon("i-up", "ic-sm") + "largest round</span></div>" +
        '<p class="kpi-sub2">What investors paid for a slice of each company — the latest price tag, not a stock-market value. Three labs have one: ' + esc(shortName(priced[0])) + " " + esc(priced[0].valuationLabel) + ", " + esc(shortName(priced[1])) + " " + esc(priced[1].valuationLabel) + ", " + esc(shortName(priced[2])) + " " + esc(priced[2].valuationLabel) + ".</p>" +
        '<ul class="mini-list">' + miniRows + "</ul>" +
        '<div class="kpi-foot"><span class="kpi-sub">Two more sit inside public parents — their figures are shown for reference</span><a class="link" href="#labs">All seven labs' + icon("i-chev-right") + "</a></div>" +
      "</article>" +

      '<article class="card kpi">' +
        '<div class="kpi-top"><span class="ic-tile drop">' + icon("i-drop") + '</span><span class="kpi-lbl">Water use of AI</span><span class="chip">Worldwide</span></div>' +
        '<div class="kpi-row"><span class="kpi-val">313–765<em> bn litres</em></span><span class="delta flat">midpoint ≈539 bn</span></div>' +
        '<p class="kpi-sub2">Estimated water used each year by AI systems and the data centres behind them, across the whole world — about 82.5–202.0 billion US gallons.</p>' +
        '<div class="kpi-foot"><span class="kpi-sub">Worldwide estimate, not a single company figure</span><a class="link" href="#water">Water breakdown' + icon("i-chev-right") + "</a></div>" +
      "</article>";
  };
  /* ---- Charts ---- */
  var hasChart = (typeof window.Chart !== "undefined");
  var LINE = "#EDEAE6", INK = "#191A1C", INK3 = "#9C9EA3", ACC = "#EE6A2F";
  var hatch = function (stroke, fill) {
    var c = document.createElement("canvas");
    c.width = 10; c.height = 10;
    var x = c.getContext("2d");
    x.fillStyle = fill || "#FFFFFF"; x.fillRect(0, 0, 10, 10);
    x.strokeStyle = stroke; x.lineWidth = 2.2;
    for (var i = -10; i <= 10; i += 5) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 10, 10); x.stroke(); }
    return x.createPattern(c, "repeat");
  };
  var chartFallback = function () {
    $$(".chart-box").forEach(function (b) {
      if (!b.querySelector("canvas")) return;
      b.innerHTML = '<p class="chart-fallback">Charts need the Chart.js CDN — the tables below carry the same numbers.</p>';
    });
  };

  /* Ranking chart — one bar per lab; hatched = a different instrument */
  var PWR = {
    openai: { v: 10, show: ">10 GW", kind: "lead", basis: "Secured infrastructure milestone" },
    meta: { v: 7, show: "7 GW — parent scope", kind: "alt", basis: "Meta overall infrastructure, not AI-only" },
    anthropic: { v: 5, show: "5 GW", kind: "std", basis: "Contractual upper bound with AWS" },
    mistral: { v: 1, show: "1 GW — 2030 plan", kind: "alt", basis: "Future plan, not committed today" }
  };
  var RANK_NOTE = {
    capability: "Model quality scores come from Artificial Analysis; Mistral's flagship is not scored at present.",
    power: "Each figure is shown at the stage its owner reports: a milestone passed, a signed contract, a parent company's fleet, or a long-term plan.",
    staff: "Headcounts cover different things — a whole company, an estimate, an AI division or a team milestone.",
    value: "Hatched bars show a parent company's market value, included for context."
  };
  var rankRows = function (key) {
    var rows = [];
    if (key === "capability") {
      C.forEach(function (c) {
        rows.push(c.capability == null
          ? { c: c, v: null, show: "Not scored", basis: "Artificial Analysis — no current score for " + c.model, kind: "none" }
          : { c: c, v: c.capability, show: c.capability + " / 100", basis: "Artificial Analysis v4.3.2 — " + c.model,
              kind: (c === S.capLead) ? "lead" : "std" });
      });
      rows.sort(function (a, b) { return (b.v == null ? -1 : b.v) - (a.v == null ? -1 : a.v); });
    } else if (key === "power") {
      C.forEach(function (c) {
        var p = PWR[c.id];
        rows.push(p ? { c: c, v: p.v, show: p.show, basis: p.basis, kind: p.kind }
                    : { c: c, v: null, show: "Not reported", basis: "No published capacity figure", kind: "none" });
      });
      rows.sort(function (a, b) { return (b.v == null ? -1 : b.v) - (a.v == null ? -1 : a.v); });
    } else if (key === "staff") {
      rows = C.filter(function (c) { return c.staff != null; })
        .sort(function (a, b) { return b.staff - a.staff; }).map(function (c, i) {
          return { c: c, v: c.staff, show: fmt(c.staff), basis: (c.staffStatus || "") + " — " + (c.staffScope || ""),
                   kind: i === 0 ? "lead" : "std" };
        });
    } else {
      C.forEach(function (c) {
        if (c.valuation != null) {
          rows.push({ c: c, v: c.valuation, show: c.valuationLabel || money(c.valuation),
                      basis: c.valuationType || "", kind: (c === S.pricedTop) ? "lead" : "std" });
        } else if (c.parentCap != null) {
          rows.push({ c: c, v: c.parentCap, show: money(c.parentCap) + " (parent)",
                      basis: (c.parentName || "Parent") + " market capitalisation", kind: "alt" });
        } else {
          rows.push({ c: c, v: null, show: "Not disclosed", basis: c.valuationStatus || "No priced valuation", kind: "none" });
        }
      });
      rows.sort(function (a, b) { return (b.v == null ? -1 : b.v) - (a.v == null ? -1 : a.v); });
    }
    return rows;
  };
  var rankChart = null;
  var rankTick = { capability: "", power: " GW", staff: "", value: "B" };
  var paintRank = function (key) {
    if (!rankChart) return;
    var rows = rankRows(key);
    var ptn = hatch("#F0A176", "#FFF8F4");
    rankChart.data.labels = rows.map(function (r) { return shortName(r.c); });
    rankChart.data.datasets[0].data = rows.map(function (r) { return r.v; });
    rankChart.data.datasets[0].backgroundColor = rows.map(function (r) {
      if (r.v == null) return "rgba(0,0,0,0)";
      if (r.kind === "lead") return ACC;
      if (r.kind === "alt") return ptn;
      return "#DCD8D2";
    });
    rankChart.$meta = rows;
    rankChart.options.scales.x.ticks.callback = function (v) {
      return (key === "value" ? "$" + fmt(v) : fmt(v)) + rankTick[key];
    };
    rankChart.update();
    var n = $("#rankNote");
    if (n) n.textContent = RANK_NOTE[key];
    $$("#rankTabs button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-m") === key);
    });
  };
  var makeRank = function () {
    var el = $("#rankChart");
    if (!el || !hasChart) return;
    var thin = window.matchMedia("(max-width:640px)").matches;
    rankChart = new Chart(el.getContext("2d"), {
      type: "bar",
      data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 7, borderSkipped: false, barThickness: thin ? 14 : 18 }] },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        animation: { duration: 420 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1B1C1E", padding: 11, cornerRadius: 10, displayColors: false,
            titleFont: { weight: 600, size: 12.5 }, bodyFont: { size: 11.5 }, bodySpacing: 4,
            callbacks: {
              label: function (ctx) {
                var m = (ctx.chart.$meta || [])[ctx.dataIndex] || {};
                return [m.show || "", m.basis || ""].filter(Boolean);
              }
            }
          }
        },
        scales: {
          x: { beginAtZero: true, grid: { color: LINE }, border: { display: false }, ticks: { color: INK3, font: { size: 11 }, maxTicksLimit: 5 } },
          y: { grid: { display: false }, border: { display: false }, ticks: { color: INK, font: { size: 12, weight: "600" }, autoSkip: false } }
        }
      }
    });
  };

  /* Open-weights gauge */
  var makeMix = function () {
    var el = $("#mixChart");
    if (!el || !hasChart) return;
    new Chart(el.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: ["Open-weight flagship", "Closed flagship"],
        datasets: [{ data: [S.openFlag, S.labs - S.openFlag], backgroundColor: [ACC, "#EFECE7"], borderWidth: 0, hoverOffset: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "76%", rotation: -90,
        animation: { duration: 420 },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: "#1B1C1E", padding: 10, cornerRadius: 10, displayColors: false }
        }
      }
    });
    var big = $("#mixBig");
    if (big) big.textContent = S.openFlag + "/" + S.labs;
    var lg = $("#mixLegend");
    if (lg) {
      lg.innerHTML = [
        { cls: "acc", t: "Open-weight flagship", v: S.openFlag + " / " + S.labs },
        { cls: "slate", t: "Closed flagship", v: (S.labs - S.openFlag) + " / " + S.labs },
        { cls: "hatch", t: "Ships some models", v: S.openCo + " / " + S.labs }
      ].map(function (r) {
        return '<li class="no-gl"><i class="sw ' + r.cls + '"></i>' + esc(r.t) + "<b>" + esc(r.v) + "</b></li>";
      }).join("");
    }
  };
  /* Disclosure coverage chart */
  var FIELDS = [
    ["model", "Model"], ["hq", "HQ"], ["founded", "Founded"], ["open", "Open posture"], ["staff", "Staff"],
    ["valuation", "Valuation"], ["capability", "Capability"], ["compute", "Compute"], ["water", "Water"]
  ];
  var counts = function (fieldKey) {
    var y = 0, p = 0, n = 0;
    C.forEach(function (c) {
      var v = c.disclosure[fieldKey];
      if (v === "y") { y++; } else if (v === "p") { p++; } else { n++; }
    });
    return { y: y, p: p, n: n };
  };
  var makeQuality = function () {
    var el = $("#qualityChart");
    if (!el || !hasChart) return;
    var rows = FIELDS.map(function (f) { return counts(f[0]); });
    new Chart(el.getContext("2d"), {
      type: "bar",
      data: {
        labels: FIELDS.map(function (f) { return f[1]; }),
        datasets: [
          { label: "Reported", data: rows.map(function (r) { return r.y; }), backgroundColor: "#3F4145", barThickness: 13, stack: "s", borderRadius: 6, borderSkipped: false },
          { label: "Partial", data: rows.map(function (r) { return r.p; }), backgroundColor: "#F3B27F", barThickness: 13, stack: "s" },
          { label: "Not reported", data: rows.map(function (r) { return r.n; }), backgroundColor: hatch("#E2DED8", "#FFFFFF"), barThickness: 13, stack: "s" }
        ]
      },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "rectRounded", color: "#6E7075", font: { size: 11.5 }, padding: 14 } },
          tooltip: { backgroundColor: "#1B1C1E", padding: 10, cornerRadius: 10, displayColors: false }
        },
        scales: {
          x: { stacked: true, max: 7, grid: { color: LINE }, border: { display: false }, ticks: { stepSize: 1, color: INK3, font: { size: 11 } } },
          y: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: INK, font: { size: 12, weight: "600" } } }
        }
      }
    });
  };

  /* Power evidence list — company rows, basis chips, ND rows hatched */
  var BASIS_SHORT = { openai: "Secured milestone", meta: "Parent scope", anthropic: "Contract · AWS", mistral: "2030 plan" };
  var renderLoad = function () {
    var box = $("#loadList");
    if (!box) return;
    var order = C.slice().sort(function (a, b) {
      var av = PWR[a.id] ? PWR[a.id].v : -1, bv = PWR[b.id] ? PWR[b.id].v : -1;
      return bv - av;
    });
    box.innerHTML = order.map(function (c) {
      var p = PWR[c.id];
      var barCls = p ? (p.kind === "alt" ? "hatch" : (p.kind === "std" ? "alt" : "")) : "hatch";
      var bars = '<i class="' + barCls + '" style="width:' + (p ? Math.round((p.v / 10) * 100) : 0) + '%"></i>';
      return '<li data-open="' + c.id + '" tabindex="0" role="button" aria-label="' + esc(c.name + " — power detail") + '">' +
        '<span class="evi-lab"><span class="evi-mono">' + esc(c.mono) + "</span>" + esc(shortName(c)) + "</span>" +
        '<span class="evi-bar">' + bars + "</span>" +
        '<span class="evi-val">' + (p ? esc(p.show.split(" — ")[0]) : ndChip("ND")) + "</span>" +
        '<span class="evi-basis">' + esc(p ? BASIS_SHORT[c.id] : "Not reported") + "</span></li>";
    }).join("");
    var chip = $("#loadChip");
    if (chip) {
      var labLevel = C.filter(function (c) { return PWR[c.id] && PWR[c.id].kind !== "alt"; }).length;
      chip.textContent = labLevel + " company-reported";
    }
  };

  /* Release chips, grouped by date */
  var renderFeed = function () {
    var box = $("#feedList");
    if (!box) return;
    box.innerHTML = REL.map(function (r) {
      var c = byId(r.id) || { mono: "—", name: r.id };
      return '<div class="crow"><span class="crow-when">' + esc(shortDate(r.date).toUpperCase()) + "</span>" +
        '<div class="crow-list"><button class="rel-chip" type="button" data-open="' + esc(r.id) + '">' +
        '<span class="evi-mono">' + esc(c.mono) + "</span><b>" + esc(c.name) + "</b>" +
        '<span class="rel-txt">' + esc(r.headline) + "</span>" +
        '<span class="rel-tag ' + esc(r.tagCls) + '">' + esc(r.tag) + "</span></button></div></div>";
    }).join("");
  };
  /* ---- All-labs table ---- */
  var state = { filter: "all", q: "" };
  var FILTERS = [
    { k: "all", label: "All" }, { k: "open", label: "Open" }, { k: "closed", label: "Closed" },
    { k: "USA", label: "USA" }, { k: "Europe", label: "Europe" }, { k: "China", label: "China" }
  ];
  var renderFilters = function () {
    var seg = $("#labFilters");
    if (!seg) return;
    seg.innerHTML = FILTERS.map(function (f) {
      return '<button type="button" data-f="' + f.k + '"' + (f.k === state.filter ? ' class="active"' : "") + ">" + esc(f.label) + "</button>";
    }).join("");
  };
  var visible = function () {
    var q = state.q.toLowerCase();
    return C.filter(function (c) {
      var f = state.filter;
      if (f === "open" && !c.open) return false;
      if (f === "closed" && c.open) return false;
      if (f !== "all" && f !== "open" && f !== "closed" && regionOf(c) !== f) return false;
      if (!q) return true;
      return [c.name, c.model, c.hq, c.country, c.tagline].join(" ").toLowerCase().indexOf(q) > -1;
    });
  };
  var renderTable = function () {
    var body = $("#labBody");
    if (!body) return;
    var rows = visible();
    body.innerHTML = rows.map(function (c) {
      var valueCell = c.valuation != null
        ? '<span title="' + esc(c.valuationType || "") + '">' + esc(c.valuationLabel || money(c.valuation)) + "</span>"
        : (c.parentCap != null
            ? '<span title="Parent-company market capitalisation, shown for reference">' + esc(money(c.parentCap)) + " †</span>"
            : ndChip("ND"));
      return '<tr data-open="' + c.id + '" tabindex="0">' +
        '<td><span class="lab-cell"><span class="lab-mono">' + esc(c.mono) + "</span><span class=\"lab-text\"><span class=\"lab-name\">" + esc(c.name) + 
          '<span class="cc">' + esc(c.cc) + "</span></span><span class=\"lab-model\">" + esc(c.model) +  "</span></span></span></td>" +
        '<td class="num">' + (c.capability == null ? ndChip("ND") : String(c.capability)) + "</td>" +
        '<td class="num">' + (c.computeShow ? esc(c.computeShow) : ndChip("ND")) + "</td>" +
        '<td class="num">' + ndChip("ND") + "</td>" +
        '<td class="num">' + esc(staffText(c)) + "</td>" +
        '<td class="num">' + valueCell + "</td>" +
        '<td><span class="wchips"><span class="wchip ' + (c.flagshipOpen ? "on" : "off") + '" title="' +
          esc(c.openNote || "") + '">' + (c.flagshipOpen ? "Yes" : "No") + '</span><small class="wmeta">' +
          (c.flagshipOpen ? "open-weight flagship" : (c.open ? "some open models" : "no open models")) +
          "</small></span></td>" +
        '<td class="num row-x">' + icon("i-chev-right") + "</td></tr>";
    }).join("");
    var lc = $("#labCount");
    if (lc) lc.textContent = rows.length;
  };
  /* ---- Row drawer ---- */
  var drawer = $("#drawer"), drawerBody = $("#drawerBody"), lastFocus = null;
  var openDrawer = function (id) {
    var c = byId(id);
    if (!c || !drawer || !drawerBody) return;
    lastFocus = document.activeElement;
    var kv = [
      ["Flagship", esc(c.model) + (c.modelDate ? "<small>launched " + esc(shortDate(c.modelDate)) + "</small>" : "")],
      ["Capability", c.capability == null
        ? ndChip("ND") + "<small>no current score</small>"
        : c.capability + " / 100<small>Artificial Analysis v4.3.2</small>"],
      ["Power", (c.computeShow ? esc(c.computeShow) : ndChip("ND")) + (c.computeBasis ? "<small>" + esc(c.computeBasis) + "</small>" : "")],
      ["Water", ndChip("ND") + "<small>not reported per site</small>"],
      ["Staff", esc(staffText(c)) + (c.staffStatus ? "<small>" + esc(c.staffStatus) + (c.staffAsOf ? " · " + esc(c.staffAsOf) : "") + "</small>" : "")],
      ["Value", (c.valuation != null ? esc(c.valuationLabel || money(c.valuation))
          : (c.parentCap != null ? esc(money(c.parentCap)) + " †" : ndChip("ND"))) +
        (c.parentCap != null ? "<small>" + esc(c.parentName) + " market capitalisation</small>"
          : (c.valuationType ? "<small>" + esc(c.valuationType) + "</small>" : "<small>" + esc(c.valuationStatus || "") + "</small>"))]
    ];
    var notes = [
      ["Flagship", c.modelNote],
      ["Capability basis", c.capabilityNote],
      ["Compute basis", c.computeNote],
      ["Water", c.waterNote],
      ["Staff", c.staffNote],
      ["Valuation", c.valuationNote],
      ["Open weights", c.openNote],
      ["Training cost", (c.trainingCost == null ? "Not published for the current flagship. " : esc(c.trainingCost)) +
        (c.trainingHist ? "Historical reference: " + c.trainingHist + " — " : "") + (c.trainingHistNote || "")],
      ["Datacenters", c.datacenters]
    ];
    drawerBody.innerHTML =
      '<div class="drawer-head"><span class="lab-mono">' + esc(c.mono) + '</span><div><h3 id="drawerName">' + esc(c.name) +
        '</h3><p class="drawer-sub">' + esc(c.tagline) + "</p></div></div>" +
      '<p class="drawer-sub">' + esc(c.entity) + " · " + esc(c.hq) + " · founded " + c.founded +
        (c.foundedNote ? " (" + esc(c.foundedNote) + ")" : "") + "</p>" +
      '<ul class="drawer-kv">' + kv.map(function (r) { return "<li><span>" + r[0] + "</span><b>" + r[1] + "</b></li>"; }).join("") + "</ul>" +
      notes.filter(function (n) { return n[1]; }).map(function (n) {
        return '<div class="dnote"><b>' + n[0] + "</b><p>" + esc(n[1]) + "</p></div>";
      }).join("") +
      '<div class="dstrip">' + FIELDS.map(function (f) {
        var v = c.disclosure[f[0]];
        var cls = v === "y" ? "y" : (v === "p" ? "p" : "n");
        var txt = v === "y" ? "Y" : (v === "p" ? "P" : "\u2013");
        return '<i class="mx ' + cls + '" title="' + esc(f[1]) + ": " +
          (v === "y" ? "reported" : v === "p" ? "partial" : "not reported") + '">' + txt + "</i>";
      }).join("") + "</div>" +
      '<div class="drawer-src"><h4>Sources</h4><ul>' + (c.sources || []).map(function (k) {
        var s = SRC_BY_KEY[k];
        if (!s) return "";
        return "<li><b>" + esc(s.publisher) + "</b> · " + esc(s.date) + " — " +
          (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + "</a>" : esc(s.title)) + "</li>";
      }).join("") + "</ul></div>";
    glossWrap(drawerBody);
    drawer.classList.add("on");
    drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };
  var closeDrawer = function () {
    if (!drawer) return;
    drawer.classList.remove("on");
    drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) { lastFocus.focus(); }
  };
  /* ---- Disclosure matrix ---- */
  var mxCell = function (v) {
    var cls = v === "y" ? "y" : (v === "p" ? "p" : "n");
    var txt = v === "y" ? "Y" : (v === "p" ? "P" : "\u2013");
    return '<i class="mx ' + cls + '">' + txt + "</i>";
  };
  var renderMatrix = function () {
    var head = $("#mxHead"), body = $("#mxBody");
    if (!head || !body) return;
    head.innerHTML = '<th scope="col">Lab</th>' + FIELDS.map(function (f) {
      return '<th scope="col" class="num">' + esc(f[1]) + "</th>";
    }).join("");
    body.innerHTML = C.map(function (c) {
      return '<tr><td><span class="lab-cell"><span class="lab-mono">' + esc(c.mono) + "</span><span><b>" +
        esc(shortName(c)) + "</b></span></span></td>" +
        FIELDS.map(function (f) { return '<td class="num">' + mxCell(c.disclosure[f[0]]) + "</td>"; }).join("") + "</tr>";
    }).join("");
  };

  /* ---- Method ---- */
  var METHOD = [
    ["Scope", "Seven labs, data as of 2026-09-25. The seven are not equivalent organizations — Google DeepMind and Meta AI sit inside public parents, OpenAI, Anthropic and Mistral are private, and xAI now sits inside a post-combination structure — so each row carries its own definition."],
    ["Model quality", "Scores come from the Artificial Analysis Intelligence Index v4.3.2 (agents 30 · coding 20 · scientific reasoning 20 · general 30), read on 2026-09-25. Mistral's flagship is not currently scored."],
    ["Computing power", "Electricity capacity is quoted at the stage each owner reports it: a milestone passed (OpenAI, more than 10 GW), a signed contract (Anthropic, up to 5 GW with AWS), a parent-company fleet (Meta, 7 GW) or a long-term plan (Mistral, up to 1 GW by 2030). Because the stages differ, the figures are never added together."],
    ["Water", "Water use is estimated worldwide at 312.5–764.6 billion litres a year (82.5–202.0 billion US gallons; midpoint ≈538.6 billion litres), covering all AI and data-centre facilities. Per-company water figures are not part of this dataset."],
    ["Company value", "Three labs have a published price from a financing round (OpenAI $852B · Anthropic $965B · Mistral >€21B). Alphabet and Meta Platforms are shown at their market capitalisation for context. Euros are counted 1:1 with dollars."],
    ["Staff", "Headcounts cover different things by design — a whole company, a third-party estimate, an AI division or a team milestone — and the label travels with each figure."],
    ["Open weights", "Two questions are tracked separately: whether a company ships downloadable models at all, and whether its current flagship is downloadable. Five companies ship some open models; Mistral and DeepSeek have open-weight flagships."],
    ["Training cost", "Historical compute-cost references are listed for context: GPT-4 ≈$78.35M · Gemini Ultra ≈$191.4M · Llama 2 70B ≈$3.93M · DeepSeek-V3 $5.576M (2.788M H800 GPU-hours × $2)."],
    ["Data centres", "Region, zone and facility counts come from each operator's own published figures. Cloud regions and zones are commonly published; physical building counts are published less often."]
  ];
  var renderMethod = function () {
    var box = $("#methList");
    if (!box) return;
    box.innerHTML = METHOD.map(function (m) { return "<li><b>" + m[0] + "</b> — " + m[1] + "</li>"; }).join("");
  };

  /* ---- Works cited ---- */
  var renderCites = function () {
    var box = $("#citeList");
    if (!box) return;
    box.innerHTML = SRC.map(function (s) {
      var title = s.url
        ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener"><b>' + esc(s.title) + "</b></a>"
        : "<b>" + esc(s.title) + "</b>";
      return '<li class="cite" data-pri="' + (s.primary ? "1" : "0") + '">' +
        '<span class="cite-key">' + esc(s.key) + "</span>" +
        "<div>" + title +
        "<p>" + esc(s.supports) + "</p>" +
        '<span class="cite-meta"><span class="cite-tag ' + (s.primary ? "pri" : "sec") + '">' +
        (s.primary ? "Primary" : "Reporting") + "</span>" + esc(s.publisher) + " · " + esc(s.date) + "</span></div></li>";
    }).join("");
    var n = $("#srcCount"), p = $("#priCount");
    if (n) n.textContent = SRC.length;
    if (p) p.textContent = SRC.filter(function (s) { return s.primary; }).length;
  };
  /* ---- Data-centre infrastructure table ---- */
  var renderInfra = function () {
    var body = $("#infraBody");
    if (!body) return;
    body.innerHTML = INFRA.map(function (r) {
      var kindCls = r.kind === "Lab-run" ? "kind-chip lab" : "kind-chip";
      var cell = function (v) { return '<td class="num">' + (v ? esc(v) : ndChip("ND")) + "</td>"; };
      return "<tr><td><b>" + esc(r.name) + "</b></td>" +
        '<td><span class="' + kindCls + '">' + esc(r.kind) + "</span></td>" +
        cell(r.regions) + cell(r.zones) +
        cell(r.sites) +
        '<td class="note-cell">' + esc(r.note) + "</td></tr>";
    }).join("");
  };

  /* ---- Worldwide water estimate ---- */
  var renderWater = function () {
    var note = $("#waterNote"), graph = $("#waterGraph"), big = $("#waterRange");
    if (big) big.textContent = Math.round(GLOBAL_WATER.lo) + "–" + Math.round(GLOBAL_WATER.hi);
    if (note) note.textContent = GLOBAL_WATER.note;
    if (graph) {
      var max = 800, pct = function (v) { return Math.round((v / max) * 1000) / 10; };
      graph.innerHTML =
        '<div class="wrange-track"></div>' +
        '<div class="wrange-fill" style="left:' + pct(GLOBAL_WATER.lo) + "%;width:" +
          (pct(GLOBAL_WATER.hi) - pct(GLOBAL_WATER.lo)) + '%"></div>' +
        '<div class="wrange-mark" data-l="midpoint ≈539" style="left:' + pct(GLOBAL_WATER.mid) + '%"></div>' +
        '<div class="wrange-lab" style="left:' + pct(GLOBAL_WATER.lo) + '%">313</div>' +
        '<div class="wrange-lab" style="left:' + pct(GLOBAL_WATER.hi) + '%">765</div>' +
        '<div class="wrange-lab start" style="left:0">0</div>' +
        '<div class="wrange-lab end" style="right:0">800 bn litres / year</div>';
    }
  };

  /* ---- Glossary section ---- */
  var renderGlossary = function () {
    var box = $("#glList"), chip = $("#glCount");
    if (!box) return;
    box.innerHTML = GLOSSARY.map(function (g) {
      return '<li class="gl-item"><b>' + esc(g.term) + "</b><p>" + esc(g.def) + "</p>" +
        (g.wiki ? '<a href="' + esc(g.wiki) + '" target="_blank" rel="noopener">Read on Wikipedia' + icon("i-link") + "</a>" : "") +
        "</li>";
    }).join("");
    if (chip) chip.textContent = GLOSSARY.length + " terms";
  };
  /* ---- Glossary hover cards: wrap dotted terms, show a plain-English note ---- */
  var GL_BY_KEY = {};
  GLOSSARY.forEach(function (g) { GL_BY_KEY[g.key] = g; });
  var glosEl = document.getElementById("glos");
  var glTimer = null;
  var GL_LIMIT = 3;
  var showGlos = function (el) {
    var g = GL_BY_KEY[el.getAttribute("data-gl")];
    if (!g || !glosEl) return;
    glosEl.innerHTML = "<b>" + esc(g.term) + "</b><p>" + esc(g.def) + "</p>" +
      (g.wiki ? '<a href="' + esc(g.wiki) + '" target="_blank" rel="noopener">Read on Wikipedia' + icon("i-link") + "</a>" : "");
    glosEl.classList.add("on");
    glosEl.setAttribute("aria-hidden", "false");
    var r = el.getBoundingClientRect(), w = glosEl.offsetWidth, h = glosEl.offsetHeight;
    var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    var top = r.top - h - 10;
    if (top < 8) { top = r.bottom + 10; }
    glosEl.style.left = left + "px";
    glosEl.style.top = top + "px";
  };
  var hideGlos = function () {
    if (!glosEl) return;
    glosEl.classList.remove("on");
    glosEl.setAttribute("aria-hidden", "true");
  };
  if (glosEl) {
    glosEl.addEventListener("mouseenter", function () { clearTimeout(glTimer); });
    glosEl.addEventListener("mouseleave", hideGlos);
  }
  document.addEventListener("mouseover", function (e) {
    var t = e.target && e.target.closest ? e.target.closest(".gl") : null;
    if (!t) return;
    clearTimeout(glTimer);
    showGlos(t);
  });
  document.addEventListener("mouseout", function (e) {
    var t = e.target && e.target.closest ? e.target.closest(".gl") : null;
    if (!t) return;
    clearTimeout(glTimer);
    glTimer = setTimeout(hideGlos, 160);
  });
  document.addEventListener("focusin", function (e) {
    var t = e.target && e.target.closest ? e.target.closest(".gl") : null;
    if (t) showGlos(t);
  });
  document.addEventListener("focusout", function (e) {
    if (e.target && e.target.closest && e.target.closest(".gl")) { hideGlos(); }
  });
  window.addEventListener("scroll", hideGlos, { passive: true });

  var glossWrap = function (root) {
    root = root || document.querySelector(".page");
    if (!root || !window.NodeFilter || !document.createTreeWalker) return;
    var budget = {};
    GLOSSARY.forEach(function (g) { budget[g.key] = GL_LIMIT; });
    var terms = GLOSSARY.map(function (g) {
      return { g: g, re: new RegExp("\\b(?:" + g.rx + ")\\b", "i") };
    }).sort(function (a, b) { return b.g.rx.length - a.g.rx.length; });
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.replace(/\s+/g, "")) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        if (!p || !p.tagName) return NodeFilter.FILTER_REJECT;
        var tag = p.tagName.toUpperCase();
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "CANVAS" || tag === "TEXTAREA" || tag === "TITLE") {
          return NodeFilter.FILTER_REJECT;
        }
        if (p.closest && (p.closest(".gl") || p.closest(".gl-list") || p.closest(".no-gl"))) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) { nodes.push(walker.currentNode); }
    nodes.forEach(function (node) {
      var txt = node.nodeValue, best = null, i, m;
      for (i = 0; i < terms.length; i++) {
        var t = terms[i];
        if (budget[t.g.key] <= 0) continue;
        m = t.re.exec(txt);
        if (!m) continue;
        if (!best || m.index < best.m.index || (m.index === best.m.index && m[0].length > best.m[0].length)) {
          best = { t: t, m: m };
        }
      }
      if (!best) return;
      var bm = best.m, bg = best.t.g;
      var hit = bm[0], before = txt.slice(0, bm.index), after = txt.slice(bm.index + hit.length);
      var span = document.createElement("span");
      span.className = "gl";
      span.setAttribute("data-gl", bg.key);
      span.setAttribute("tabindex", "0");
      span.textContent = hit;
      var parent = node.parentNode;
      if (before) parent.insertBefore(document.createTextNode(before), node);
      parent.insertBefore(span, node);
      if (after) parent.insertBefore(document.createTextNode(after), node);
      parent.removeChild(node);
      budget[bg.key] -= 1;
    });
  };

  /* ---- Events & init ---- */

  var SECTIONS = [
    ["overview", "Summary"], ["ranking", "Model ranking"], ["mix", "Open vs closed"], ["load", "Power & water"],
    ["infra", "Data centres"], ["water", "Water"], ["labs", "The seven labs"], ["feed", "What changed"],
    ["quality", "Data coverage"], ["glossary", "Glossary"], ["works", "Sources"], ["method", "Method"]
  ];
  var renderMnav = function () {
    var n = $("#mnav");
    if (!n) return;
    n.innerHTML = SECTIONS.map(function (s) {
      return '<a class="mnav-item" href="#' + s[0] + '">' + esc(s[1]) + "</a>";
    }).join("");
  };

  document.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    if (e.target.closest(".gl") || e.target.closest(".gl-list")) return;
    var open = e.target.closest("[data-open]");
    if (open) { openDrawer(open.getAttribute("data-open")); return; }
    var f = e.target.closest("#labFilters button");
    if (f) { state.filter = f.getAttribute("data-f"); renderFilters(); renderTable(); return; }
    var m = e.target.closest("#rankTabs button");
    if (m) { paintRank(m.getAttribute("data-m")); return; }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeDrawer();
      var sh = $(".shell");
      if (sh) sh.classList.remove("nav-open");
      return;
    }
    if (e.key === "Enter" && e.target && e.target.closest) {
      var t = e.target.closest('[data-open][tabindex]');
      if (t) { e.preventDefault(); openDrawer(t.getAttribute("data-open")); }
    }
  });

  if (drawer) {
    drawer.addEventListener("click", function (e) { if (e.target === drawer) { closeDrawer(); } });
  }
  var drawerX = $("#drawerX");
  if (drawerX) drawerX.addEventListener("click", closeDrawer);

  var sideToggle = $("#sideToggle"), shell = $(".shell");
  if (sideToggle && shell) {
    sideToggle.addEventListener("click", function () { shell.classList.toggle("collapsed"); });
  }
  var menuBtn = $("#menuBtn"), sideX = $("#sideX"), sideVeil = $("#sideVeil");
  var closeNav = function () { if (shell) shell.classList.remove("nav-open"); };
  var openNav = function () { if (shell) shell.classList.add("nav-open"); };
  if (menuBtn) menuBtn.addEventListener("click", function () {
    if (shell.classList.contains("nav-open")) { closeNav(); } else { openNav(); }
  });
  if (sideX) sideX.addEventListener("click", closeNav);
  if (sideVeil) sideVeil.addEventListener("click", closeNav);
  $$(".side-nav .nav-item").forEach(function (a) {
    a.addEventListener("click", function () {
      if (window.matchMedia("(max-width:1024px)").matches) closeNav();
    });
  });
  var labq = $("#labq");
  if (labq) {
    labq.addEventListener("input", function () { state.q = labq.value; renderTable(); });
  }
  var gq = $("#q");
  if (gq) {
    gq.addEventListener("input", function () {
      state.q = gq.value;
      if (labq) labq.value = gq.value;
      renderTable();
      if (gq.value.length > 1) {
        var el = $("#labs");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    gq.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        gq.value = ""; state.q = "";
        if (labq) labq.value = "";
        renderTable();
        gq.blur();
      }
    });
  }

  var jump = function (sel) {
    var el = document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  var mb = $("#methodBtn"), wb = $("#worksBtn"), pb = $("#provTopBtn");
  if (mb) mb.addEventListener("click", function () { jump("#method"); });
  if (wb) wb.addEventListener("click", function () { jump("#works"); });
  if (pb) pb.addEventListener("click", function () { jump("#quality"); });

  var sf = $("#srcFilter");
  if (sf) {
    sf.addEventListener("click", function () {
      var next = sf.getAttribute("aria-pressed") !== "true";
      sf.setAttribute("aria-pressed", String(next));
      sf.textContent = next ? "All sources" : "Primary only";
      $$("#citeList .cite").forEach(function (li) {
        li.classList.toggle("hide", next && li.getAttribute("data-pri") === "0");
      });
    });
  }

  var ex = $("#exportBtn");
  if (ex) {
    ex.addEventListener("click", function () {
      var head = ["Lab", "Country", "Flagship", "Capability (AA v4.3.2)", "Power", "Power basis", "Water (MLD)",
        "Staff", "Staff scope", "Value", "Value basis", "Company open", "Flagship open"];
      var rows = [head.join(",")].concat(C.map(function (c) {
        var cols = [
          c.name, c.country, c.model, c.capability == null ? "ND" : c.capability,
          c.computeShow || "ND", c.computeBasis || "ND",
          c.waterMld == null ? "ND" : c.waterMld, staffText(c), c.staffScope || "ND",
          c.valuationLabel || (c.parentCap != null ? money(c.parentCap) + " (parent market capitalisation)" : "ND"),
          c.valuationType || (c.parentCap != null ? "Parent-company market capitalisation" : (c.valuationStatus || "ND")),
          c.open ? "Some open models" : "None", c.flagshipOpen ? "Open" : "Closed"
        ];
        return cols.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(",");
      }));
      var blob = new Blob(["\ufeff" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "ai-lab-report-" + cut + ".csv";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      ex.classList.add("done");
      ex.innerHTML = icon("i-check", "ic-sm") + "Saved";
      setTimeout(function () {
        ex.classList.remove("done");
        ex.innerHTML = icon("i-download", "ic-sm") + "Export CSV";
      }, 1500);
    });
  }
  /* ---- Boot ---- */
  var init = function () {
    var upd = $("#updChip"), updP = $("#updDate"), sm = $("#sideMeta"), nc = $("#navCount");
    if (upd) upd.textContent = cut;
    if (updP) updP.textContent = cut;
    if (sm) sm.textContent = S.labs + " labs · " + SRC.length + " sources";
    if (nc) nc.textContent = S.labs;

    renderKpis();
    var tabs = $("#rankTabs");
    if (tabs) {
      tabs.innerHTML = [["capability", "Capability"], ["power", "Power"], ["staff", "Staff"], ["value", "Value"]]
        .map(function (m) { return '<button type="button" data-m="' + m[0] + '">' + m[1] + "</button>"; }).join("");
    }
    if (!hasChart) chartFallback();
    makeRank();
    paintRank("capability");
    makeMix();
    makeQuality();
    renderFilters();
    renderTable();
    renderLoad();
    renderFeed();
    renderMatrix();
    renderMethod();
    renderCites();
    renderInfra();
    renderWater();
    renderGlossary();
    renderMnav();
    glossWrap();

    var animate = function () {
      $$(".kpi-val[data-count]").forEach(function (el) { countUp(el); });
    };
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { countUp(e.target); io.unobserve(e.target); } });
      }, { rootMargin: "0px 0px -5% 0px" });
      $$(".kpi-val[data-count]").forEach(function (el) { io.observe(el); });
      setTimeout(animate, 1400);
    } else { animate(); }
  };

  var spy = function () {
    if (!("IntersectionObserver" in window)) return;
    var map = {};
    $$(".side-nav .nav-item").forEach(function (a) {
      var href = a.getAttribute("href") || "";
      if (href.charAt(0) === "#") { map[href.slice(1)] = a; }
    });
    var obs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var a = map[e.target.id];
        if (!a) return;
        $$(".side-nav .nav-item").forEach(function (x) { x.classList.remove("active"); });
        a.classList.add("active");
        $$(".mnav-item").forEach(function (x) {
          x.classList.toggle("on", x.getAttribute("href") === "#" + e.target.id);
        });
      });
    }, { rootMargin: "-42% 0px -52% 0px" });
    SECTIONS.forEach(function (s) {
      var el = document.getElementById(s[0]);
      if (el) obs.observe(el);
    });
  };

  var reveal = function () {
    var cards = $$(".card").filter(function (el) { return !el.classList.contains("kpi"); });
    if (!("IntersectionObserver" in window)) return;
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); ro.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -6% 0px" });
    cards.forEach(function (c) { c.classList.add("rv"); ro.observe(c); });
    setTimeout(function () { cards.forEach(function (c) { c.classList.add("in"); }); }, 1600);
  };

  init();
  spy();
  reveal();

  if (document.fonts && document.fonts.ready && rankChart) {
    document.fonts.ready.then(function () { rankChart.update(); });
  }










})();
