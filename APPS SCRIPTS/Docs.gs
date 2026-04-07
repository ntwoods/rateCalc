/*
PHASE 1 BACKEND README (Google Apps Script)
===========================================

1) Required sheets
------------------
Run `GET ?action=setupWorkbook` once after deployment.
This creates/updates:
- Settings
- Parties
- ListPrice
- RateLogHeader
- RateLogItems
- PartyItemLatest
- Users
- SystemMeta
- API_Log

2) Configure spreadsheet ID
---------------------------
In `Config.gs`, set:
CONFIG.SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'

3) Deploy web app
-----------------
- Apps Script Editor -> Deploy -> New deployment
- Type: Web app
- Execute as: Me
- Who has access: as per internal policy
- Copy the web app URL

4) Initialize workbook
----------------------
Open in browser:
<WEB_APP_URL>?action=setupWorkbook

5) GET routes (browser/Postman)
-------------------------------
- health:
  <WEB_APP_URL>?action=health
- bootstrap:
  <WEB_APP_URL>?action=bootstrap
- getParties:
  <WEB_APP_URL>?action=getParties
- getProducts:
  <WEB_APP_URL>?action=getProducts
  <WEB_APP_URL>?action=getProducts&search=primer
  <WEB_APP_URL>?action=getProducts&category=Paint
- getPartySnapshots:
  <WEB_APP_URL>?action=getPartySnapshots&partyName=Apollo%20Retail
- getSnapshotByRef:
  <WEB_APP_URL>?action=getSnapshotByRef&refKey=rate_xxxxx
- getPartyLatestHistory:
  <WEB_APP_URL>?action=getPartyLatestHistory&partyName=Apollo%20Retail
- rebuildIndexes:
  <WEB_APP_URL>?action=rebuildIndexes
- getSettings:
  <WEB_APP_URL>?action=getSettings
- getWorkbookMeta:
  <WEB_APP_URL>?action=getWorkbookMeta

6) POST routes (Postman/curl/fetch)
-----------------------------------
POST URL format:
<WEB_APP_URL>?action=<ACTION_NAME>
Headers:
Content-Type: application/json

POST actions:
- debugCalc
- saveOwnerApproval
- saveFinalAction

7) saveOwnerApproval payload
----------------------------
{
  "partyName": "Apollo Retail",
  "userEmail": "owner@example.com",
  "notes": "Owner reviewed selected items",
  "sourceMode": "FRESH",
  "items": [
    {
      "category": "Paint",
      "product": "Primer X",
      "paymentTerms": 15,
      "latestListPrice": 1250,
      "latestWEF": "2026-01-01",
      "previousListPrice": 1200,
      "previousWEF": "2025-10-01",
      "specialDiscPct": 4,
      "GSTMode": "PAID",
      "FreightMode": "FOR",
      "CDMode": "NET_RATES",
      "ownerChecked": true,
      "finalActionChecked": false
    }
  ]
}

8) saveFinalAction payload
--------------------------
{
  "partyName": "Apollo Retail",
  "userEmail": "sales@example.com",
  "notes": "Party confirmed for dispatch",
  "sourceMode": "SNAPSHOT",
  "actionTag": "PARTY_AGREED",
  "items": [
    {
      "category": "Paint",
      "product": "Primer X",
      "paymentTerms": 15,
      "latestListPrice": 1250,
      "latestWEF": "2026-01-01",
      "previousListPrice": 1200,
      "previousWEF": "2025-10-01",
      "specialDiscPct": 4,
      "GSTMode": "PAID",
      "FreightMode": "FOR",
      "CDMode": "NET_RATES",
      "finalActionChecked": true
    }
  ]
}

9) Consistent API response shape
--------------------------------
All routes return:
{
  "ok": true/false,
  "message": "string",
  "data": { ... } | null,
  "errors": [ ... ]
}
*/

function buildSampleOwnerApprovalPayload() {
  return {
    partyName: 'Apollo Retail',
    userEmail: 'owner@example.com',
    notes: 'Owner reviewed selected rows',
    sourceMode: 'FRESH',
    items: [
      {
        category: 'Paint',
        product: 'Primer X',
        paymentTerms: 15,
        latestListPrice: 1250,
        latestWEF: '2026-01-01',
        previousListPrice: 1200,
        previousWEF: '2025-10-01',
        specialDiscPct: 4,
        GSTMode: 'PAID',
        FreightMode: 'FOR',
        CDMode: 'NET_RATES',
        ownerChecked: true,
        finalActionChecked: false
      }
    ]
  };
}

function buildSampleFinalActionPayload() {
  return {
    partyName: 'Apollo Retail',
    userEmail: 'sales@example.com',
    notes: 'Party agreed and final action selected',
    sourceMode: 'SNAPSHOT',
    actionTag: 'PARTY_AGREED',
    items: [
      {
        category: 'Paint',
        product: 'Primer X',
        paymentTerms: 15,
        latestListPrice: 1250,
        latestWEF: '2026-01-01',
        previousListPrice: 1200,
        previousWEF: '2025-10-01',
        specialDiscPct: 4,
        GSTMode: 'PAID',
        FreightMode: 'FOR',
        CDMode: 'NET_RATES',
        finalActionChecked: true
      }
    ]
  };
}
