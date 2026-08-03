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

  function formatMD(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return m + "/" + day;
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
  var printAreaEl = document.getElementById("printArea");
  var historyListEl = document.getElementById("historyList");
  var historyEmptyEl = document.getElementById("historyEmpty");
  var exportCsvBtn = document.getElementById("exportCsvBtn");
  var exportBackupBtn = document.getElementById("exportBackupBtn");
  var restoreBackupBtn = document.getElementById("restoreBackupBtn");
  var restoreFileInput = document.getElementById("restoreFileInput");

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
      if (btn.dataset.tab === "history") renderHistory();
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

  function handleDeleteClick(e) {
    var btn = e.target.closest(".entry-delete");
    if (!btn) return;
    var id = btn.dataset.id;
    if (!window.confirm("Remove this expense?")) return;
    entries = entries.filter(function (en) { return en.id !== id; });
    saveEntries(entries);
    setStatus("Removed.");
    renderAll();
  }

  entryListEl.addEventListener("click", handleDeleteClick);
  historyListEl.addEventListener("click", handleDeleteClick);

  // ---------- render: entry list ----------

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function buildEntryRowHTML(en, todayStr) {
    var dateTag = en.date === todayStr ? "" : formatShort(dateStrToDate(en.date)) + " — ";
    var noteText = dateTag + (en.note || "");
    return (
      '<li class="entry-row">' +
        '<div class="entry-main">' +
          '<div class="entry-category">' + escapeHtml(en.category) + "</div>" +
          (noteText ? '<div class="entry-note">' + escapeHtml(noteText) + "</div>" : "") +
        "</div>" +
        '<div class="entry-amount">$' + en.amount.toFixed(2) + "</div>" +
        '<button class="entry-delete" data-id="' + en.id + '" aria-label="Delete">&times;</button>' +
      "</li>"
    );
  }

  function renderEntryList() {
    var sorted = entries.slice().sort(function (a, b) { return b.ts - a.ts; });
    var todayStr = toLocalDateStr(new Date());

    entryCountEl.textContent = entries.length + (entries.length === 1 ? " entry" : " entries");
    emptyStateEl.style.display = sorted.length === 0 ? "block" : "none";

    entryListEl.innerHTML = sorted.slice(0, 100).map(function (en) {
      return buildEntryRowHTML(en, todayStr);
    }).join("");

    var todayTotal = entries
      .filter(function (en) { return en.date === todayStr; })
      .reduce(function (sum, en) { return sum + en.amount; }, 0);
    todayTotalEl.textContent = todayTotal.toFixed(2);
  }

  // ---------- render: history (by month) ----------

  function renderHistory() {
    var todayStr = toLocalDateStr(new Date());
    var byMonth = {};
    entries.forEach(function (en) {
      var key = en.date.slice(0, 7);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(en);
    });
    var monthKeys = Object.keys(byMonth).sort().reverse();

    historyEmptyEl.style.display = monthKeys.length === 0 ? "block" : "none";

    historyListEl.innerHTML = monthKeys.map(function (key, idx) {
      var monthEntries = byMonth[key].slice().sort(function (a, b) { return b.ts - a.ts; });
      var total = monthEntries.reduce(function (s, en) { return s + en.amount; }, 0);
      var parts = key.split("-");
      var label = MONTH_NAMES[parseInt(parts[1], 10) - 1] + " " + parts[0];
      var rowsHtml = monthEntries.map(function (en) {
        return buildEntryRowHTML(en, todayStr);
      }).join("");

      return (
        '<details class="month-block"' + (idx === 0 ? " open" : "") + ">" +
          '<summary class="month-summary">' +
            '<span class="month-name">' + label + "</span>" +
            '<span class="month-stats">' + monthEntries.length +
              (monthEntries.length === 1 ? " entry" : " entries") + " · $" + total.toFixed(2) + "</span>" +
          "</summary>" +
          '<ul class="month-entries">' + rowsHtml + "</ul>" +
        "</details>"
      );
    }).join("");
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

  // ---------- printable statement ----------

  function getPeriodEntries(period) {
    var now = new Date();
    if (period === "week") {
      var monday = startOfWeek(now);
      var sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
      var filtered = entries.filter(function (en) {
        var d = dateStrToDate(en.date);
        return d >= monday && d <= sunday;
      });
      return {
        entries: filtered,
        title: "WEEKLY STATEMENT",
        range: formatShort(monday) + " – " + formatShort(sunday) + ", " + now.getFullYear()
      };
    }
    var monthFiltered = entries.filter(function (en) {
      var d = dateStrToDate(en.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    return {
      entries: monthFiltered,
      title: "MONTHLY STATEMENT",
      range: MONTH_NAMES[now.getMonth()] + " " + now.getFullYear()
    };
  }

  function buildReceiptHTML(period) {
    var info = getPeriodEntries(period);
    var sorted = info.entries.slice().sort(function (a, b) { return a.ts - b.ts; });
    var total = sorted.reduce(function (s, en) { return s + en.amount; }, 0);

    var rowsHtml = sorted.map(function (en) {
      var desc = en.category + (en.note ? " — " + en.note : "");
      return (
        '<div class="receipt-row">' +
          '<span class="r-date">' + formatMD(dateStrToDate(en.date)) + "</span>" +
          '<span class="r-desc">' + escapeHtml(desc) + "</span>" +
          '<span class="r-amt">$' + en.amount.toFixed(2) + "</span>" +
        "</div>"
      );
    }).join("");

    if (!sorted.length) {
      rowsHtml = '<div class="receipt-row"><span class="r-desc">No expenses in this period.</span></div>';
    }

    var byCategory = {};
    sorted.forEach(function (en) {
      byCategory[en.category] = (byCategory[en.category] || 0) + en.amount;
    });
    var cats = Object.keys(byCategory).sort(function (a, b) { return byCategory[b] - byCategory[a]; });
    var catHtml = cats.map(function (cat) {
      return '<div class="receipt-cat-row"><span>' + escapeHtml(cat) + "</span><span>$" +
        byCategory[cat].toFixed(2) + "</span></div>";
    }).join("");

    var now = new Date();
    var printedAt = formatShort(now) + ", " + now.getFullYear() + " " +
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    return (
      '<div class="receipt">' +
        '<div class="receipt-center">' +
          '<div class="receipt-title">LEDGER</div>' +
          '<div class="receipt-subtitle">' + info.title + "</div>" +
          '<div class="receipt-meta">' + info.range + "</div>" +
          '<div class="receipt-meta">Printed ' + printedAt + "</div>" +
        "</div>" +
        '<hr class="receipt-divider" />' +
        rowsHtml +
        '<div class="receipt-total-row"><span>TOTAL</span><span>$' + total.toFixed(2) + "</span></div>" +
        '<div class="receipt-count">' + sorted.length + (sorted.length === 1 ? " transaction" : " transactions") + "</div>" +
        (cats.length
          ? '<hr class="receipt-divider" /><div class="receipt-cat-row"><strong>BY CATEGORY</strong></div>' + catHtml
          : "") +
        '<hr class="receipt-divider" />' +
        '<div class="receipt-footer">* * * END OF STATEMENT * * *</div>' +
      "</div>"
    );
  }

  document.querySelectorAll("[data-print]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      printAreaEl.innerHTML = buildReceiptHTML(btn.dataset.print);
      window.print();
    });
  });

  // ---------- export / backup / restore ----------

  function downloadFile(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function csvEscape(val) {
    var s = String(val);
    if (/[",\n]/.test(s)) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  exportCsvBtn.addEventListener("click", function () {
    if (!entries.length) {
      setStatus("No data to export.");
      return;
    }
    var sorted = entries.slice().sort(function (a, b) { return a.ts - b.ts; });
    var rows = [["Date", "Category", "Note", "Amount"]];
    sorted.forEach(function (en) {
      rows.push([en.date, en.category, en.note || "", en.amount.toFixed(2)]);
    });
    var csv = rows.map(function (row) { return row.map(csvEscape).join(","); }).join("\r\n");
    downloadFile(csv, "ledger-export-" + toLocalDateStr(new Date()) + ".csv", "text/csv");
    setStatus("Exported " + sorted.length + " entries to CSV.");
  });

  exportBackupBtn.addEventListener("click", function () {
    if (!entries.length) {
      setStatus("No data to back up.");
      return;
    }
    downloadFile(
      JSON.stringify(entries, null, 2),
      "ledger-backup-" + toLocalDateStr(new Date()) + ".json",
      "application/json"
    );
    setStatus("Backup downloaded (" + entries.length + " entries).");
  });

  restoreBackupBtn.addEventListener("click", function () {
    restoreFileInput.click();
  });

  restoreFileInput.addEventListener("change", function () {
    var file = restoreFileInput.files[0];
    restoreFileInput.value = "";
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var imported;
      try {
        imported = JSON.parse(reader.result);
      } catch (e) {
        setStatus("Restore failed: not a valid backup file.");
        return;
      }
      if (!Array.isArray(imported)) {
        setStatus("Restore failed: not a valid backup file.");
        return;
      }

      var existingIds = {};
      entries.forEach(function (en) { existingIds[en.id] = true; });

      var added = 0;
      imported.forEach(function (en) {
        if (
          en && typeof en === "object" &&
          typeof en.id === "string" &&
          typeof en.date === "string" &&
          typeof en.amount === "number" &&
          typeof en.category === "string" &&
          !existingIds[en.id]
        ) {
          entries.push({
            id: en.id,
            ts: typeof en.ts === "number" ? en.ts : dateStrToDate(en.date).getTime(),
            date: en.date,
            amount: en.amount,
            category: en.category,
            note: typeof en.note === "string" ? en.note : ""
          });
          existingIds[en.id] = true;
          added++;
        }
      });

      if (added > 0) saveEntries(entries);
      setStatus(added > 0 ? "Restored " + added + " new entries." : "Nothing new to restore.");
      renderAll();
    };
    reader.readAsText(file);
  });

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
    renderHistory();
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
