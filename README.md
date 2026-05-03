# Shikho Finance Dashboard Automated

Standalone Vercel project for the Shikho Finance Governance Dashboard.

## Data Source

The dashboard reads live data from Google Sheets through `api/dashboard-data.js`.

The Google Sheet `Config` tab controls the reporting period:

- `Actuals_To`: latest actual month shown in the dashboard
- `Forecast_From`: first forecast month
- `Forecast_To`: final forecast month
- `Budget_Year`: year used for budget comparisons
- `File_Last_Updated`: shown in the dashboard status banner

If `Actuals_To` points to an incomplete month, the API returns a validation warning and the dashboard keeps showing the latest complete period.

## Required Vercel Environment Variables

Set these in the Vercel project:

- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

The private key should keep newline characters escaped as `\n`.
