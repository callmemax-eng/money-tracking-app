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
  var entryDateInput = document.getElementById("entryDate");
  var categoryInput = document.getElementById("category");
  var noteInput = document.getElementById("note");
  var entryListEl = document.getElementById("entryList");
  var entryCountEl = document.getElementById("entryCount");
  var emptyStateEl = document.getElementById("emptyState");
  var statusMsgEl = document.getElementById("statusMsg");
  var addBtn = document.getElementById("addBtn");
  var cancelEditBtn = document.getElementById("cancelEditBtn");

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
  var monthSelectorEl = document.getElementById("monthSelector");
  var historyMonthLabelEl = document.getElementById("historyMonthLabel");
  var historyMonthTotalEl = document.getElementById("historyMonthTotal");
  var exportCsvBtn = document.getElementById("exportCsvBtn");
  var exportBackupBtn = document.getElementById("exportBackupBtn");
  var restoreBackupBtn = document.getElementById("restoreBackupBtn");
  var restoreFileInput = document.getElementById("restoreFileInput");
  var shareBtn = document.getElementById("shareBtn");
  var qrBtn = document.getElementById("qrBtn");
  var qrWrap = document.getElementById("qrWrap");
  var qrCanvas = document.getElementById("qrCanvas");

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

  // ---------- entry date field (defaults to today, editable) ----------

  function resetEntryDateField() {
    var todayStr = toLocalDateStr(new Date());
    entryDateInput.value = todayStr;
    entryDateInput.max = todayStr;
  }

  resetEntryDateField();

  // ---------- edit mode ----------

  var editingEntryId = null;

  function enterEditMode(entry) {
    editingEntryId = entry.id;
    amountInput.value = entry.amount;
    entryDateInput.value = entry.date;
    entryDateInput.max = toLocalDateStr(new Date());
    categoryInput.value = entry.category;
    noteInput.value = entry.note || "";
    addBtn.textContent = "✓ SAVE CHANGES";
    cancelEditBtn.hidden = false;
    entryForm.scrollIntoView({ behavior: "smooth", block: "start" });
    amountInput.focus();
  }

  function exitEditMode() {
    editingEntryId = null;
    addBtn.textContent = "+ ADD EXPENSE";
    cancelEditBtn.hidden = true;
  }

  function resetForm() {
    entryForm.reset();
    categoryInput.value = "Food";
    resetEntryDateField();
  }

  cancelEditBtn.addEventListener("click", function () {
    resetForm();
    exitEditMode();
  });

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
    var todayStr = toLocalDateStr(now);
    var entryDate = entryDateInput.value || todayStr;
    var roundedAmount = Math.round(amount * 100) / 100;
    var computedTs = entryDate === todayStr ? now.getTime() : dateStrToDate(entryDate).getTime();

    if (editingEntryId) {
      var existing = entries.find(function (en) { return en.id === editingEntryId; });
      if (existing) {
        existing.amount = roundedAmount;
        existing.date = entryDate;
        existing.ts = computedTs;
        existing.category = categoryInput.value;
        existing.note = noteInput.value.trim();
        saveEntries(entries);
        setStatus("Updated $" + existing.amount.toFixed(2) + " (" + existing.category + ").");
      }
      exitEditMode();
    } else {
      var entry = {
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
        ts: computedTs,
        date: entryDate,
        amount: roundedAmount,
        category: categoryInput.value,
        note: noteInput.value.trim()
      };
      entries.push(entry);
      saveEntries(entries);
      var dateNote = entryDate === todayStr ? "" : " for " + formatShort(dateStrToDate(entryDate));
      setStatus("Saved $" + entry.amount.toFixed(2) + " to " + entry.category + dateNote + ".");
    }

    resetForm();
    amountInput.focus();
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
    if (editingEntryId === id) {
      resetForm();
      exitEditMode();
    }
    setStatus("Removed.");
    renderAll();
  }

  entryListEl.addEventListener("click", handleDeleteClick);
  historyListEl.addEventListener("click", handleDeleteClick);

  function handleEditClick(e) {
    var btn = e.target.closest(".entry-edit");
    if (!btn) return;
    var entry = entries.find(function (en) { return en.id === btn.dataset.id; });
    if (entry) enterEditMode(entry);
  }

  entryListEl.addEventListener("click", handleEditClick);

  // ---------- render: entry list ----------

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function buildEntryRowHTML(en, todayStr, showEdit, hideDateTag) {
    var dateTag = (hideDateTag || en.date === todayStr) ? "" : formatShort(dateStrToDate(en.date)) + " — ";
    var noteText = dateTag + (en.note || "");
    return (
      '<li class="entry-row">' +
        '<div class="entry-main">' +
          '<div class="entry-category">' + escapeHtml(en.category) + "</div>" +
          (noteText ? '<div class="entry-note">' + escapeHtml(noteText) + "</div>" : "") +
        "</div>" +
        '<div class="entry-amount">$' + en.amount.toFixed(2) + "</div>" +
        (showEdit ? '<button class="entry-edit" data-id="' + en.id + '" aria-label="Edit">&#9998;</button>' : "") +
        '<button class="entry-delete" data-id="' + en.id + '" aria-label="Delete">&times;</button>' +
      "</li>"
    );
  }

  function renderEntryList() {
    var todayStr = toLocalDateStr(new Date());
    var todayEntries = entries
      .filter(function (en) { return en.date === todayStr; })
      .sort(function (a, b) { return b.ts - a.ts; });

    entryCountEl.textContent = todayEntries.length + (todayEntries.length === 1 ? " entry" : " entries");
    emptyStateEl.style.display = todayEntries.length === 0 ? "block" : "none";

    entryListEl.innerHTML = todayEntries.map(function (en) {
      return buildEntryRowHTML(en, todayStr, true);
    }).join("");

    var todayTotal = todayEntries.reduce(function (sum, en) { return sum + en.amount; }, 0);
    todayTotalEl.textContent = todayTotal.toFixed(2);
  }

  // ---------- render: history (by month) ----------

  var selectedHistoryMonth = null;

  function monthKeyLabel(key) {
    var parts = key.split("-");
    return MONTH_NAMES[parseInt(parts[1], 10) - 1] + " " + parts[0];
  }

  monthSelectorEl.addEventListener("click", function (e) {
    var chip = e.target.closest(".month-chip");
    if (!chip) return;
    selectedHistoryMonth = chip.dataset.month;
    renderHistory();
  });

  function renderHistory() {
    var todayStr = toLocalDateStr(new Date());
    var byMonth = {};
    entries.forEach(function (en) {
      var key = en.date.slice(0, 7);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(en);
    });
    var monthKeys = Object.keys(byMonth).sort().reverse();

    if (monthKeys.length === 0) {
      monthSelectorEl.innerHTML = "";
      historyMonthLabelEl.textContent = "—";
      historyMonthTotalEl.textContent = "$0.00";
      historyListEl.innerHTML = "";
      historyEmptyEl.style.display = "block";
      return;
    }
    historyEmptyEl.style.display = "none";

    if (!selectedHistoryMonth || monthKeys.indexOf(selectedHistoryMonth) === -1) {
      selectedHistoryMonth = monthKeys[0];
    }

    monthSelectorEl.innerHTML = monthKeys.map(function (key) {
      var active = key === selectedHistoryMonth ? " active" : "";
      return '<button type="button" class="month-chip' + active + '" data-month="' + key + '">' +
        monthKeyLabel(key) + "</button>";
    }).join("");

    var monthEntries = byMonth[selectedHistoryMonth].slice();
    var total = monthEntries.reduce(function (s, en) { return s + en.amount; }, 0);

    historyMonthLabelEl.textContent = monthKeyLabel(selectedHistoryMonth) +
      " · " + monthEntries.length + (monthEntries.length === 1 ? " entry" : " entries");
    historyMonthTotalEl.textContent = "$" + total.toFixed(2);

    // group the month's entries by day, so it reads as daily totals
    // instead of one long pile of transactions
    var byDay = {};
    monthEntries.forEach(function (en) {
      if (!byDay[en.date]) byDay[en.date] = [];
      byDay[en.date].push(en);
    });
    var dayKeys = Object.keys(byDay).sort().reverse();
    var DOW_FULL = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

    historyListEl.innerHTML = dayKeys.map(function (dateKey) {
      var dayEntries = byDay[dateKey].slice().sort(function (a, b) { return b.ts - a.ts; });
      var dayTotal = dayEntries.reduce(function (s, en) { return s + en.amount; }, 0);
      var d = dateStrToDate(dateKey);
      var dayLabel = DOW_FULL[d.getDay()] + ", " + formatShort(d);
      var rowsHtml = dayEntries.map(function (en) {
        return buildEntryRowHTML(en, todayStr, false, true);
      }).join("");

      return (
        '<div class="day-block">' +
          '<div class="day-header"><span>' + dayLabel + "</span><span>$" + dayTotal.toFixed(2) + "</span></div>" +
          '<ul class="day-entries">' + rowsHtml + "</ul>" +
        "</div>"
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

  function isStandalonePWA() {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }

  function triggerPrint(period) {
    printAreaEl.innerHTML = buildReceiptHTML(period);
    window.print();
  }

  document.querySelectorAll("[data-print]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var period = btn.dataset.print;
      if (isStandalonePWA()) {
        // iOS (and some other) home-screen "standalone" apps can't open the
        // system print sheet at all — window.print() silently no-ops there.
        // A plain target="_blank" link doesn't reliably escape standalone
        // mode either (it can just reload the same window). On iOS, the
        // x-safari-https scheme forces a hand-off to real Safari, where
        // printing actually works.
        var url = location.origin + location.pathname + "?print=" + period;
        if (window.navigator.standalone === true) {
          url = url.replace(/^https:/, "x-safari-https:").replace(/^http:/, "x-safari-http:");
        }
        var a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setStatus("Opening in Safari to print…");
      } else {
        triggerPrint(period);
      }
    });
  });

  // If opened via the standalone-mode print fallback above, print automatically.
  var autoPrintPeriod = new URLSearchParams(window.location.search).get("print");
  if (autoPrintPeriod === "week" || autoPrintPeriod === "month") {
    window.addEventListener("load", function () {
      history.replaceState(null, "", location.pathname);
      setTimeout(function () { triggerPrint(autoPrintPeriod); }, 300);
    });
  }

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

  // ---------- share ----------

  shareBtn.addEventListener("click", function () {
    var shareData = {
      title: "Ledger",
      text: "Track your daily expenses with Ledger.",
      url: location.origin + location.pathname
    };
    if (navigator.share) {
      navigator.share(shareData).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareData.url)
        .then(function () { setStatus("Link copied to clipboard."); })
        .catch(function () { setStatus("Couldn't copy — copy the link from your address bar."); });
      return;
    }
    setStatus("Sharing isn't supported here — copy the link from your address bar.");
  });

  // ---------- QR code (grain/sand styled) ----------

  var qrRendered = false;

  function isFinderModule(row, col, count) {
    var inTopLeft = row < 7 && col < 7;
    var inTopRight = row < 7 && col >= count - 7;
    var inBottomLeft = row >= count - 7 && col < 7;
    return inTopLeft || inTopRight || inBottomLeft;
  }

  function renderQRCode(text) {
    var qr = qrcode(0, "H");
    qr.addData(text);
    qr.make();

    var count = qr.getModuleCount();
    var moduleSize = 10;
    var margin = 4;
    var size = (count + margin * 2) * moduleSize;

    qrCanvas.width = size;
    qrCanvas.height = size;
    var ctx = qrCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";

    for (var row = 0; row < count; row++) {
      for (var col = 0; col < count; col++) {
        if (!qr.isDark(row, col)) continue;
        var x = (col + margin) * moduleSize;
        var y = (row + margin) * moduleSize;

        if (isFinderModule(row, col, count)) {
          // finder squares stay solid — scanners rely on their crisp shape
          ctx.fillRect(x, y, moduleSize, moduleSize);
          continue;
        }

        // everything else: an irregular cluster of overlapping blobs,
        // dense enough to scan but rounded enough to read as "grain"
        var cx = x + moduleSize / 2;
        var cy = y + moduleSize / 2;
        ctx.beginPath();
        ctx.arc(
          cx + (Math.random() - 0.5) * moduleSize * 0.1,
          cy + (Math.random() - 0.5) * moduleSize * 0.1,
          moduleSize * 0.5, 0, Math.PI * 2
        );
        ctx.fill();
        for (var i = 0; i < 6; i++) {
          var angle = Math.random() * Math.PI * 2;
          var dist = Math.random() * moduleSize * 0.35;
          var r = moduleSize * (0.2 + Math.random() * 0.12);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  qrBtn.addEventListener("click", function () {
    var showing = !qrWrap.hidden;
    if (showing) {
      qrWrap.hidden = true;
      qrBtn.textContent = "▦ SHOW QR CODE";
      return;
    }
    if (!qrRendered) {
      renderQRCode(location.origin + location.pathname);
      qrRendered = true;
    }
    qrWrap.hidden = false;
    qrBtn.textContent = "▦ HIDE QR CODE";
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

    // When a newly deployed service worker takes over, reload once to
    // pick up the fresh app shell instead of staying on the old cached one.
    var reloadedForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloadedForUpdate) return;
      reloadedForUpdate = true;
      window.location.reload();
    });
  }
})();
