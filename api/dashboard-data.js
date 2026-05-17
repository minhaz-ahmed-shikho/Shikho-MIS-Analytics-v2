const DEFAULT_SHEET_ID = "1010WS28NGeh6CkQlXX6GoeLfewA_EYDYkp-y-84QqDo";
const { requireSession } = require("./_auth");

const SHEETS = {
  CONFIG: "Config",
  PL: "PL_Monthly",
  REVENUE_CHANNEL: "Revenue_Channel",
  REVENUE_COURSE: "Revenue_Course",
  NEW_REPEAT: "New_vs_Repeat",
  COGS: "COGS_Accrual",
  ACADEMIC: "Academic Support_Accrual",
  SM: "S&M Cost_Accrual",
  BRAND: "Brand Marketing Cost_Accrual",
  INDIRECT: "Indirect Cost_Accrual",
  PAYROLL: "Payroll",
  SALES: "Sales_Team",
  DM: "Digital_Marketing",
  CASH: "Cash_Position",
  KPI: "KPI",
  MAU: "MAU_Registrations"
};

const REQUIRED_TABS = Object.values(SHEETS);

function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LOOKUP = {
  jan: "Jan",
  january: "Jan",
  feb: "Feb",
  february: "Feb",
  mar: "Mar",
  march: "Mar",
  apr: "Apr",
  april: "Apr",
  may: "May",
  jun: "Jun",
  june: "Jun",
  jul: "Jul",
  july: "Jul",
  aug: "Aug",
  august: "Aug",
  sep: "Sep",
  sept: "Sep",
  september: "Sep",
  oct: "Oct",
  october: "Oct",
  nov: "Nov",
  november: "Nov",
  dec: "Dec",
  december: "Dec"
};

function normalizePeriod(value) {
  const raw = cleanText(value);
  if (!raw) return "";

  const normalized = raw.replace(/[_/]+/g, "-").replace(/\s+/g, " ");
  const match = normalized.match(/^([A-Za-z]+)[-\s]+(\d{2}|\d{4})$/);
  if (!match) return raw;

  const mon = MONTH_LOOKUP[match[1].toLowerCase()];
  if (!mon) return raw;

  const yy = match[2].length === 4 ? match[2].slice(-2) : match[2].padStart(2, "0");
  return `${mon}-${yy}`;
}

function periodSerial(period) {
  const normalized = normalizePeriod(period);
  if (!normalized || !normalized.includes("-")) return -Infinity;

  const [mon, yy] = normalized.split("-");
  const mi = MONTHS.indexOf(mon);
  const yr = 2000 + Number(yy);

  if (mi < 0 || !Number.isFinite(yr)) return -Infinity;
  return yr * 12 + mi;
}

function nextPeriod(period) {
  const serial = periodSerial(period);
  if (!Number.isFinite(serial)) return "";

  const next = serial + 1;
  const yr = Math.floor(next / 12);
  const mi = next % 12;
  return `${MONTHS[mi]}-${String(yr - 2000).padStart(2, "0")}`;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;

  let s = String(value).trim();
  if (!s || s === "-" || s === "—") return null;

  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }

  s = s
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/\s/g, "");

  if (!s || s === "-" || s === "—") return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function parseSeries(row, startIndex, length) {
  const values = [];
  for (let i = 0; i < length; i++) {
    values.push(toNumber(row[startIndex + i]));
  }
  return values;
}

function parseSimpleSheet(values) {
  const header = values[0] || [];
  const months = header.slice(1).map(cleanText).filter(Boolean);
  const data = {};

  for (const row of values.slice(1)) {
    const key = cleanText(row[0]);
    if (!key) continue;
    data[key] = parseSeries(row, 1, months.length);
  }

  return { months, data };
}

function parseGroupedSheet(values) {
  const header = values[0] || [];
  const months = header.slice(2).map(cleanText).filter(Boolean);
  const data = {};

  for (const row of values.slice(1)) {
    const metricType = cleanText(row[0]);
    const key = cleanText(row[1]);
    if (!metricType || !key) continue;

    if (!data[metricType]) data[metricType] = {};
    data[metricType][key] = parseSeries(row, 2, months.length);
  }

  return { months, data };
}

function parsePL(values) {
  const header = values[0] || [];
  const months = header.slice(3).map(cleanText).filter(Boolean);
  const actual = {};
  const budget = {};
  const sections = {};

  for (const row of values.slice(1)) {
    const metric = cleanText(row[0]);
    const section = cleanText(row[1]);
    const type = cleanText(row[2]).toLowerCase();
    if (!metric) continue;

    const series = parseSeries(row, 3, months.length);

    if (type.includes("budget")) {
      budget[metric] = series;
    } else {
      actual[metric] = series;
    }

    if (section) sections[metric] = section;
  }

  return { months, actual, budget, sections };
}

function parseSM(values) {
  const header = values[0] || [];
  const months = header.slice(2).map(cleanText).filter(Boolean);
  const data = {};
  const groups = {};

  for (const row of values.slice(1)) {
    const group = cleanText(row[0]);
    const segment = cleanText(row[1]);
    if (!group || !segment) continue;

    let key = segment;

    if (segment.toLowerCase() === "total") {
      if (group === "Sales Team Cost") key = "Total Sales Team Cost";
      else if (group === "Acquisition Marketing Cost") key = "Total Acquisition Marketing Cost";
      else key = `Total ${group}`;
    }

    data[key] = parseSeries(row, 2, months.length);
    groups[key] = group;
  }

  return { months, data, groups };
}

function normalizeHeader(header) {
  return cleanText(header).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseConfig(values) {
  const config = {};

  for (const row of values.slice(1)) {
    const key = cleanText(row[0]);
    const value = cleanText(row[1]);
    if (!key) continue;
    config[key] = value;
  }

  const actualsTo = normalizePeriod(config.Actuals_To || config.Reporting_Month);
  const forecastFrom = normalizePeriod(config.Forecast_From || nextPeriod(actualsTo));

  return {
    companyName: config.Company_Name || "",
    reportingCurrency: config.Reporting_Currency || "",
    reportingMonth: config.Reporting_Month || "",
    fileLastUpdated: config.File_Last_Updated || "",
    actualsFrom: normalizePeriod(config.Actuals_From),
    actualsTo,
    forecastFrom,
    forecastTo: normalizePeriod(config.Forecast_To),
    budgetYear: toNumber(config.Budget_Year),
    raw: config
  };
}

function parseCash(values) {
  const header = values[0] || [];
  const rows = [];

  const fieldMap = {
    "month": "Month",
    "scenario": "Scenario",
    "net_revenue": "Net_Revenue",
    "gross_cash_burn": "Gross_Cash_Burn",
    "net_cash_burn": "Net_Cash_Burn",
    "total_costs": "Total_Costs",
    "cash_burn": "Cash_Burn",
    "opening_balance": "Opening_Balance",
    "closing_balance": "Closing_Balance",
    "investment_loan_inflows": "Investment_Loan_Inflows",
    "loan_inflows": "Investment_Loan_Inflows",
    "inflows": "Investment_Loan_Inflows",
    "investment_fdr_outflows": "Investment_FDR_Outflows",
    "fdr_outflows": "Investment_FDR_Outflows",
    "outflows": "Investment_FDR_Outflows",
    "notes": "Notes"
  };

  for (const row of values.slice(1)) {
    const month = cleanText(row[0]);
    const scenario = cleanText(row[1]);
    if (!month || !scenario) continue;

    const obj = {};

    header.forEach((h, i) => {
      const normalizedHeader = normalizeHeader(h);
      const field = fieldMap[normalizedHeader] || cleanText(h).replace(/\s+/g, "_");
      const raw = row[i];

      if (["Month", "Scenario", "Investment_Loan_Inflows", "Investment_FDR_Outflows", "Notes"].includes(field)) {
        obj[field] = cleanText(raw) || null;
      } else {
        obj[field] = toNumber(raw);
      }
    });

    const inflow = cleanText(obj.Investment_Loan_Inflows);
    const outflow = cleanText(obj.Investment_FDR_Outflows);
    const existingNotes = cleanText(obj.Notes);

    const noteParts = [];
    if (inflow) noteParts.push(`Inflow: ${inflow}`);
    if (outflow) noteParts.push(`Outflow: ${outflow}`);
    if (existingNotes) noteParts.push(existingNotes);

    obj.Notes = noteParts.join(" | ") || null;

    rows.push(obj);
  }

  return rows;
}

function parseKPI(values) {
  const header = values[0] || [];
  const months = header.slice(4).map(cleanText).filter(Boolean);
  const data = {};

  for (const row of values.slice(1)) {
    const key = cleanText(row[0]);
    if (!key) continue;

    data[key] = {
      unit: cleanText(row[1]),
      lowerIsBetter: cleanText(row[2]).toLowerCase() === "yes",
      target: toNumber(row[3]),
      values: parseSeries(row, 4, months.length)
    };
  }

  return { months, data };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

function getSeriesValue(source, period, key) {
  const months = source.months || [];
  const data = source.data || {};
  const index = months.indexOf(period);

  if (index < 0) {
    return { exists: false, value: null };
  }

  const arr = data[key];
  if (!arr) {
    return { exists: true, value: null };
  }

  return { exists: true, value: arr[index] ?? null };
}

function validateSeriesGroup(label, source, period, requiredKeys) {
  const issues = [];
  const months = source.months || [];

  if (!months.includes(period)) {
    issues.push(`${label}: missing ${period} column`);
    return issues;
  }

  for (const key of requiredKeys) {
    const { value } = getSeriesValue(source, period, key);
    if (value === null || value === undefined || !Number.isFinite(value)) {
      issues.push(`${label}: missing ${key} for ${period}`);
    }
  }

  return issues;
}

function validateGroupedMetric(label, dataset, metricType, period, requiredKeys) {
  return validateSeriesGroup(
    label,
    {
      months: dataset.months || [],
      data: (dataset.data || {})[metricType] || {}
    },
    period,
    requiredKeys
  );
}

function validateCashActual(cashRows, period) {
  const row = (cashRows || []).find(item => item.Month === period && item.Scenario === "Base");
  if (!row) return [`Cash Position: missing Base row for ${period}`];

  const issues = [];
  ["Net_Revenue", "Gross_Cash_Burn", "Net_Cash_Burn", "Opening_Balance", "Closing_Balance"].forEach(key => {
    if (row[key] === null || row[key] === undefined || !Number.isFinite(row[key])) {
      issues.push(`Cash Position: missing ${key} for ${period}`);
    }
  });

  return issues;
}

function validateActualPeriod(dash, period) {
  if (!period) return ["Config: Actuals_To is missing"];

  return [
    ...validateSeriesGroup("P&L", { months: dash.pl.months, data: dash.pl.actual }, period, [
      "Gross Revenue",
      "Net Revenue",
      "Gross Margin",
      "EBITDA",
      "Net Cash Burn"
    ]),
    ...validateGroupedMetric("Revenue Channel", dash.revChannel, "Revenue", period, ["Total Revenue"]),
    ...validateGroupedMetric("Revenue Course", dash.revCourse, "Revenue", period, ["Total Revenue"]),
    ...validateGroupedMetric("New vs Repeat", dash.nvr, "Revenue", period, ["Total"]),
    ...validateGroupedMetric("Sales Team", dash.sales, "Revenue", period, ["Total Revenue"]),
    ...validateSeriesGroup("Digital Marketing", dash.dm, period, [
      "Total_Ad_Spend",
      "Adjusted_Ad_Spend_Total"
    ]),
    ...validateSeriesGroup("MAU Registrations", dash.mau, period, [
      "MAU",
      "New_Registrations",
      "Active_Paid_Users"
    ]),
    ...validateCashActual(dash.cash, period)
  ];
}

const ACCRUAL_WARNING_LABELS = {
  cogs: "COGS_Accrual",
  academic: "Academic Support_Accrual",
  sm: "S&M Cost_Accrual",
  brand: "Brand Marketing Cost_Accrual",
  indirect: "Indirect Cost_Accrual"
};

function hasAnyNumericValueAtPeriod(source, period) {
  const months = source.months || [];
  const index = months.indexOf(period);
  if (index < 0) return false;

  return Object.values(source.data || {}).some(series => {
    if (!Array.isArray(series)) return false;
    return Number.isFinite(series[index]);
  });
}

function accrualPeriodWarnings(dash, period) {
  if (!period) return [];

  return Object.entries(ACCRUAL_WARNING_LABELS).flatMap(([key, label]) => {
    const source = (dash.accrualCosts || {})[key] || {};
    return hasAnyNumericValueAtPeriod(source, period)
      ? []
      : [`${label}: ${period} accrual data pending`];
  });
}

function findLatestCompleteActualPeriod(dash, configuredActualPeriod) {
  const ceiling = periodSerial(configuredActualPeriod);
  const months = (dash.pl.months || [])
    .filter(period => periodSerial(period) <= ceiling)
    .sort((a, b) => periodSerial(b) - periodSerial(a));

  for (const period of months) {
    if (!validateActualPeriod(dash, period).length) return period;
  }

  return "";
}

function buildPeriodMetadata(dash, meta) {
  const configuredActual = meta.actualsTo || "";
  const configuredIssues = validateActualPeriod(dash, configuredActual);
  const latestCompleteActual = findLatestCompleteActualPeriod(dash, configuredActual);
  const displayActual = configuredIssues.length ? latestCompleteActual : configuredActual;
  const selectable = (dash.pl.months || []).filter(period => periodSerial(period) <= periodSerial(displayActual));
  const nextForecastPeriod = nextPeriod(displayActual);
  const configuredForecastFrom = meta.forecastFrom || "";
  const forecastFrom =
    configuredForecastFrom && periodSerial(configuredForecastFrom) > periodSerial(displayActual)
      ? configuredForecastFrom
      : nextForecastPeriod;
  const warnings = [];

  if (configuredActual && configuredIssues.length) {
    warnings.push(
      `${configuredActual} is set as Actuals_To in Config, but required dashboard data is incomplete. Showing ${displayActual || "no period"} instead.`
    );
  }

  if (
    configuredForecastFrom &&
    displayActual &&
    periodSerial(configuredForecastFrom) <= periodSerial(displayActual)
  ) {
    warnings.push(
      `${configuredForecastFrom} is set as Forecast_From in Config, but forecast should start after ${displayActual}. Using ${forecastFrom || "the next period"} for dashboard shading.`
    );
  }

  warnings.push(...accrualPeriodWarnings(dash, displayActual || configuredActual));

  return {
    periods: {
      actualsFrom: meta.actualsFrom || selectable[0] || "",
      actualsTo: configuredActual,
      latestCompleteActual,
      displayActual,
      forecastFrom,
      forecastTo: meta.forecastTo || "",
      budgetYear: meta.budgetYear,
      selectable
    },
    validation: {
      ok: !configuredIssues.length,
      configuredActualComplete: !configuredIssues.length,
      warnings,
      errors: configuredIssues,
      checkedPeriod: configuredActual
    }
  };
}

async function getGoogleSheetsClient() {
  const sheetId = process.env.GOOGLE_SHEET_ID || DEFAULT_SHEET_ID;
  const serviceAccountEmail = cleanText(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);

  if (!serviceAccountEmail || !privateKey) {
    return {
      sheetId,
      sheets: null,
      sourceMode: "public_csv"
    };
  }

  const { google } = require("googleapis");

  const auth = new google.auth.JWT(
    serviceAccountEmail,
    null,
    privateKey,
    ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  );

  return {
    sheetId,
    sheets: google.sheets({ version: "v4", auth }),
    sourceMode: "service_account"
  };
}

function normalizePrivateKey(value) {
  let key = cleanText(value);
  if (!key) return "";

  if (key.startsWith("{")) {
    try {
      const parsed = JSON.parse(key);
      key = cleanText(parsed.private_key);
    } catch (error) {
      // Keep the original value so auth returns a useful credential error.
    }
  }

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  return key
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

async function readPublicCsvTab(sheetId, tab) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Unable to read public Google Sheet tab ${tab}: ${response.status} ${response.statusText}`);
  }

  return parseCsv(await response.text());
}

async function readAllRequiredTabs(sheets, sheetId) {
  if (!sheets) {
    const result = {};
    await Promise.all(REQUIRED_TABS.map(async tab => {
      result[tab] = await readPublicCsvTab(sheetId, tab);
    }));
    return result;
  }

  const ranges = REQUIRED_TABS.map(tab => `'${tab}'!A1:AZ1000`);

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId,
    ranges
  });

  const result = {};

  for (const item of response.data.valueRanges || []) {
    const range = item.range || "";
    const match = range.match(/^'?([^'!]+)'?!/);
    const tabName = match ? match[1] : range.split("!")[0].replace(/'/g, "");
    result[tabName] = item.values || [];
  }

  return result;
}

function buildDash(raw, sourceMode = "service_account") {
  const meta = parseConfig(raw[SHEETS.CONFIG] || []);
  const pl = parsePL(raw[SHEETS.PL] || []);

  const revChannel = parseGroupedSheet(raw[SHEETS.REVENUE_CHANNEL] || []);
  const revCourse = parseGroupedSheet(raw[SHEETS.REVENUE_COURSE] || []);
  const nvr = parseGroupedSheet(raw[SHEETS.NEW_REPEAT] || []);

  const cogs = parseSimpleSheet(raw[SHEETS.COGS] || []);
  const academic = parseSimpleSheet(raw[SHEETS.ACADEMIC] || []);
  const sm = parseSM(raw[SHEETS.SM] || []);
  const brand = parseSimpleSheet(raw[SHEETS.BRAND] || []);
  const indirect = parseSimpleSheet(raw[SHEETS.INDIRECT] || []);

  const payroll = parseGroupedSheet(raw[SHEETS.PAYROLL] || []);
  const sales = parseGroupedSheet(raw[SHEETS.SALES] || []);
  const dm = parseSimpleSheet(raw[SHEETS.DM] || []);
  const mau = parseSimpleSheet(raw[SHEETS.MAU] || []);
  const cash = parseCash(raw[SHEETS.CASH] || []);
  const kpi = parseKPI(raw[SHEETS.KPI] || []);

  const dash = {
    meta,
    pl,
    revChannel,
    revCourse,
    nvr,
    cogs,
    accrualCosts: {
      cogs,
      academic,
      sm,
      brand,
      indirect
    },
    payroll,
    sales,
    dm,
    mau,
    cash,
    kpi,
    generatedAt: new Date().toISOString(),
    source: sourceMode === "public_csv" ? "Public Google Sheets CSV" : "Google Sheets API"
  };

  const periodMetadata = buildPeriodMetadata(dash, meta);

  return {
    ...dash,
    ...periodMetadata
  };
}

module.exports = async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");

    if (!requireSession(req, res)) return;

    const { sheetId, sheets, sourceMode } = await getGoogleSheetsClient();
    const raw = await readAllRequiredTabs(sheets, sheetId);
    const dash = buildDash(raw, sourceMode);

    return res.status(200).json(dash);
  } catch (error) {
    const message = error.message && error.message.includes("DECODER routines")
      ? "Google Sheets service account private key could not be decoded. Re-save GOOGLE_PRIVATE_KEY from the service account JSON private_key value."
      : error.message;

    return res.status(500).json({
      ok: false,
      stage: "dashboard_data_build",
      error: message
    });
  }
};
