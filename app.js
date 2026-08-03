(function () {
  "use strict";

  var STORAGE_KEY = "ledger_expenses_v1";
  var DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
  var MONTH_NAMES = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
  ];

  // ---------- storage ----------

  function loadEntries() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  var entries = loadEntries();

  // ---------- date helpers (local time, not UTC) ----------

  function toLocalDateStr(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function dateStrToDate(s) {
    var parts = s.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function startOfWeek(d) {
    var day = d.getDay(); // 0 = Sun
    var diff = day === 0 ? -6 : 1 - day; // Monday as start
    var monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    return monday;
  }

  function formatShort(d) {
    return MONTH_NAMES[d.getMonth()] + " " + d.getDate();
  }

  // ---------- DOM refs ----------

  var todayDateEl = document.getElementById("todayDate");
  var todayTotalEl = document.getElementById("todayTotal");
  var entryForm = document.getElementById("entryForm");
  var amountInput = document.getElementById("amount");
  var categoryInput = document.getElementById("category");
  var noteInput = document.getElementById("note");
  var entryListEl = document.getElementById("entryList");
  var entryCountEl = document.getElementById("entryCount");
  var emptyStateEl = document.getElementById("emptyState");
  var statusMsgEl = document.getElementById("statusMsg");

  var weekTotalEl = document.getElementById("weekTotal");
  var weekRangeEl = document.getElementById("weekRange");
  var monthTotalEl = document.getElementById("monthTotal");
  var monthRangeEl = document.getElementById("monthRange");
  var weekChartEl = document.getElementById("weekChart");
  var categoryBreakdownEl = document.getElementById("categoryBreakdown");
  var summaryEmptyEl = document.getElementById("summaryEmpty");

  var tabButtons = document.querySelectorAll(".tab-btn");
  var tabPanels = document.querySelectorAll(".tab-panel");

  // ---------- tabs ----------

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabButtons.forEach(function (b) { b.classList.remove("active"); });
      tabPanels.forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "summary") renderSummary();
    });
  });

  // ---------- header date ----------

  function renderHeaderDate() {
    var now = new Date();
    var weekday = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][now.getDay()];
    todayDateEl.textContent = weekday + ", " + formatShort(now);
  }

  // ---------- form submit ----------

  entryForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0) {
      setStatus("Enter an amount greater than 0.");
      amountInput.focus();
      return;
    }
    var now = new Date();
    var entry = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      ts: now.getTime(),
      date: toLocalDateStr(now),
      amount: Math.round(amount * 100) / 100,
      category: categoryInput.value,
      note: noteInput.value.trim()
    };
    entries.push(entry);
    saveEntries(entries);

    entryForm.reset();
    categoryInput.value = "Food";
    amountInput.focus();

    setStatus("Saved $" + entry.amount.toFixed(2) + " to " + entry.category + ".");
    renderAll();
  });

  // ---------- delete ----------

  entryListEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".entry-delete");
    if (!btn) return;
    var id = btn.dataset.id;
    if (!window.confirm("Remove this expense?")) return;
    entries = entries.filter(function (en) { return en.id !== id; });
    saveEntries(entries);
    setStatus("Removed.");
    renderAll();
  });

  // ---------- render: entry list ----------

  function renderEntryList() {
    var sorted = entries.slice().sort(function (a, b) { return b.ts - a.ts; });
    var todayStr = toLocalDateStr(new Date());

    entryListEl.innerHTML = "";
    entryCountEl.textContent = entries.length + (entries.length === 1 ? " entry" : " entries");

    if (sorted.length === 0) {
      emptyStateEl.style.display = "block";
    } else {
      emptyStateEl.style.display = "none";
    }

    sorted.slice(0, 100).forEach(function (en) {
      var li = document.createElement("li");
      li.className = "entry-row";

      var dateTag = en.date === todayStr ? "" : formatShort(dateStrToDate(en.date)) + " — ";
      var noteText = dateTag + (en.note || "");

      li.innerHTML =
        '<div class="entry-main">' +
          '<div class="entry-category">' + escapeHtml(en.category) + "</div>" +
          (noteText ? '<div class="entry-note">' + escapeHtml(noteText) + "</div>" : "") +
        "</div>" +
        '<div class="entry-amount">$' + en.amount.toFixed(2) + "</div>" +
        '<button class="entry-delete" data-id="' + en.id + '" aria-label="Delete">&times;</button>';

      entryListEl.appendChild(li);
    });

    var todayTotal = entries
      .filter(function (en) { return en.date === todayStr; })
      .reduce(function (sum, en) { return sum + en.amount; }, 0);
    todayTotalEl.textContent = todayTotal.toFixed(2);
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- render: summary ----------

  function renderSummary() {
    var now = new Date();
    var monday = startOfWeek(now);
    var sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

    var weekEntries = entries.filter(function (en) {
      var d = dateStrToDate(en.date);
      return d >= monday && d <= sunday;
    });
    var weekTotal = weekEntries.reduce(function (s, en) { return s + en.amount; }, 0);
    weekTotalEl.textContent = weekTotal.toFixed(2);
    weekRangeEl.textContent = formatShort(monday) + " – " + formatShort(sunday);

    var monthEntries = entries.filter(function (en) {
      var d = dateStrToDate(en.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    var monthTotal = monthEntries.reduce(function (s, en) { return s + en.amount; }, 0);
    monthTotalEl.textContent = monthTotal.toFixed(2);
    monthRangeEl.textContent = MONTH_NAMES[now.getMonth()] + " " + now.getFullYear();

    // last 7 days bar chart (oldest -> newest, today included)
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      var dStr = toLocalDateStr(d);
      var total = entries
        .filter(function (en) { return en.date === dStr; })
        .reduce(function (s, en) { return s + en.amount; }, 0);
      days.push({ date: d, total: total });
    }
    var maxDay = Math.max.apply(null, days.map(function (x) { return x.total; }).concat([0.01]));

    weekChartEl.innerHTML = "";
    days.forEach(function (day) {
      var col = document.createElement("div");
      col.className = "bar-col";
      var pct = Math.max((day.total / maxDay) * 100, day.total > 0 ? 4 : 0);
      col.innerHTML =
        '<div class="bar-fill" style="height:' + pct + '%"></div>' +
        '<div class="bar-label">' + DOW_LABELS[day.date.getDay()] + "</div>";
      weekChartEl.appendChild(col);
    });

    // category breakdown (this month)
    var byCategory = {};
    monthEntries.forEach(function (en) {
      byCategory[en.category] = (byCategory[en.category] || 0) + en.amount;
    });
    var cats = Object.keys(byCategory).sort(function (a, b) { return byCategory[b] - byCategory[a]; });
    var maxCat = cats.length ? byCategory[cats[0]] : 0;

    categoryBreakdownEl.innerHTML = "";
    cats.forEach(function (cat) {
      var row = document.createElement("div");
      row.className = "category-row";
      var pct = maxCat ? (byCategory[cat] / maxCat) * 100 : 0;
      row.innerHTML =
        '<div class="category-row-top"><span>' + escapeHtml(cat) + '</span><span>$' +
        byCategory[cat].toFixed(2) + "</span></div>" +
        '<div class="category-bar-track"><div class="category-bar-fill" style="width:' + pct + '%"></div></div>';
      categoryBreakdownEl.appendChild(row);
    });

    summaryEmptyEl.style.display = monthEntries.length === 0 ? "block" : "none";
  }

  // ---------- status bar ----------

  var statusTimer = null;
  function setStatus(msg) {
    statusMsgEl.textContent = msg;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      statusMsgEl.textContent = "Ready.";
    }, 3000);
  }

  // ---------- render all ----------

  function renderAll() {
    renderHeaderDate();
    renderEntryList();
    renderSummary();
  }

  renderAll();

  // ---------- PWA service worker ----------

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.js").catch(function () {});
    });
  }
})();
