const ACTIONS = Object.freeze({
  HEALTH: 'health',
  SETUP_WORKBOOK: 'setupWorkbook',
  BOOTSTRAP: 'bootstrap',
  GET_PARTIES: 'getParties',
  GET_PRODUCTS: 'getProducts',
  GET_PARTY_SNAPSHOTS: 'getPartySnapshots',
  GET_SNAPSHOT_BY_REF: 'getSnapshotByRef',
  GET_PARTY_LATEST_HISTORY: 'getPartyLatestHistory',
  REBUILD_INDEXES: 'rebuildIndexes',
  GET_SETTINGS: 'getSettings',
  GET_WORKBOOK_META: 'getWorkbookMeta',
  DEBUG_CALC: 'debugCalc',
  SAVE_OWNER_APPROVAL: 'saveOwnerApproval',
  SAVE_FINAL_ACTION: 'saveFinalAction'
});

const ACTION_TAGS = Object.freeze({
  OWNER_APPROVED: 'OWNER_APPROVED',
  PARTY_AGREED: 'PARTY_AGREED',
  DISPATCHED: 'DISPATCHED'
});

const SOURCE_MODES = Object.freeze({
  FRESH: 'FRESH',
  SNAPSHOT: 'SNAPSHOT'
});

const ENUM_VALUES = Object.freeze({
  GST_MODE_PAID: 'PAID',
  GST_MODE_EXTRA: 'EXTRA',
  FREIGHT_MODE_EXTRA: 'EXTRA',
  FREIGHT_MODE_FOR: 'FOR',
  FREIGHT_MODE_HALF_HALF: 'HALF_HALF',
  CD_MODE_NET_RATES: 'NET_RATES',
  CD_MODE_PERCENT: 'PERCENT'
});

const SHEETS = Object.freeze({
  SETTINGS: 'Settings',
  PARTIES: 'Parties',
  LIST_PRICE: 'ListPrice',
  RATE_LOG_HEADER: 'RateLogHeader',
  RATE_LOG_ITEMS: 'RateLogItems',
  PARTY_ITEM_LATEST: 'PartyItemLatest',
  USERS: 'Users',
  SYSTEM_META: 'SystemMeta',
  API_LOG: 'API_Log'
});

const CONFIG = Object.freeze({
  APP_NAME: 'Party Rate Discussion Portal API',
  VERSION: 'phase-1g',
  SPREADSHEET_ID: 'REPLACE_WITH_SPREADSHEET_ID',
  PLACEHOLDER_SPREADSHEET_ID: 'REPLACE_WITH_SPREADSHEET_ID',
  SHEETS: SHEETS,
  WORKBOOK_SHEETS: Object.freeze({
    Settings: Object.freeze(['Key', 'Value', 'Notes']),
    Parties: Object.freeze(['PartyName', 'Active', 'SortOrder', 'Notes']),
    ListPrice: Object.freeze([
      'Category', 'Product', 'PaymentTerms', 'ListPrice1', 'WEF1', 'ListPrice2', 'WEF2', 'ListPrice3', 'WEF3'
    ]),
    RateLogHeader: Object.freeze([
      'RefKey', 'PartyName', 'ActionTag', 'SnapshotDateTime', 'UserEmail', 'ItemCount', 'Notes', 'SourceMode', 'CreatedAt'
    ]),
    RateLogItems: Object.freeze([
      'RefKey', 'PartyName', 'ActionTag', 'SnapshotDateTime', 'UserEmail',
      'Category', 'Product', 'PaymentTerms',
      'LatestListPrice', 'LatestWEF', 'PreviousListPrice', 'PreviousWEF',
      'TDPercent', 'TD20Rate',
      'SpecialDiscPct', 'AfterSpecialDiscRate',
      'GSTMode', 'FreightMode', 'CDMode', 'CDPercent',
      'GSTPercent', 'GSTAmount',
      'FinalRate',
      'OwnerChecked', 'FinalActionChecked',
      'CreatedAt'
    ]),
    PartyItemLatest: Object.freeze([
      'PartyName', 'Product', 'Category',
      'LastRefKey', 'LastActionTag', 'LastTimestamp', 'LastUserEmail',
      'LastFinalRate',
      'LastSpecialDiscPct', 'LastGSTMode', 'LastFreightMode', 'LastCDMode', 'LastCDPercent',
      'LastLatestListPrice', 'LastLatestWEF'
    ]),
    Users: Object.freeze(['Email', 'Name', 'Active', 'Role', 'Notes']),
    SystemMeta: Object.freeze(['Key', 'Value', 'UpdatedAt'])
  }),
  SETTINGS_DEFAULTS: Object.freeze([
    Object.freeze({ key: 'TD_PERCENT', value: 20, notes: 'Standard deduction before special discount' }),
    Object.freeze({ key: 'DEFAULT_NET_CD_PERCENT', value: 5, notes: 'Used when CD mode = NET_RATES' }),
    Object.freeze({ key: 'GST_15', value: 18, notes: 'GST% when payment terms = 15' }),
    Object.freeze({ key: 'GST_30', value: 7.2, notes: 'GST% when payment terms = 30' }),
    Object.freeze({ key: 'ROUND_DECIMALS', value: 2, notes: 'All calculations rounded to 2 decimals' }),
    Object.freeze({ key: 'APP_NAME', value: 'Party Rate Discussion Portal', notes: 'App title' })
  ]),
  SAMPLE_DATA: Object.freeze({
    Parties: Object.freeze([
      Object.freeze(['Apollo Retail', true, 1, 'Primary west-zone account']),
      Object.freeze(['BlueBird Traders', true, 2, 'High-volume monthly buyer']),
      Object.freeze(['Zenith Distributors', false, 3, 'Currently inactive'])
    ]),
    ListPrice: Object.freeze([
      Object.freeze(['Paint', 'Primer X', '15', 1250, '2026-01-01', '', '', '', '']),
      Object.freeze(['Paint', 'Primer X', '30', 1300, '2026-01-01', '', '', '', '']),
      Object.freeze(['Coating', 'Shield Coat', '15', 2200, '2026-01-01', '', '', '', ''])
    ])
  }),
  ENUM_VALUES: ENUM_VALUES,
  ENUMS: Object.freeze({
    GST_MODES: Object.freeze([
      ENUM_VALUES.GST_MODE_PAID,
      ENUM_VALUES.GST_MODE_EXTRA
    ]),
    FREIGHT_MODES: Object.freeze([
      ENUM_VALUES.FREIGHT_MODE_EXTRA,
      ENUM_VALUES.FREIGHT_MODE_FOR,
      ENUM_VALUES.FREIGHT_MODE_HALF_HALF
    ]),
    CD_MODES: Object.freeze([
      ENUM_VALUES.CD_MODE_NET_RATES,
      ENUM_VALUES.CD_MODE_PERCENT
    ]),
    PAYMENT_TERMS: Object.freeze([15, 30])
  }),
  DEFAULTS: Object.freeze({
    TIMEZONE: Session.getScriptTimeZone(),
    CURRENCY: 'INR',
    ROUND_PRECISION: 2,
    DEBUG_ERRORS: false,
    MASTER_CACHE_TTL_SECONDS: 120
  }),
  ACTIONS: ACTIONS,
  ACTION_TAGS: ACTION_TAGS,
  FINAL_ACTION_TAGS: Object.freeze([
    ACTION_TAGS.PARTY_AGREED,
    ACTION_TAGS.DISPATCHED
  ]),
  ALL_ALLOWED_ACTION_TAGS: Object.freeze([
    ACTION_TAGS.OWNER_APPROVED,
    ACTION_TAGS.PARTY_AGREED,
    ACTION_TAGS.DISPATCHED
  ]),
  SOURCE_MODES: SOURCE_MODES,
  ALLOWED_SOURCE_MODES: Object.freeze([
    SOURCE_MODES.FRESH,
    SOURCE_MODES.SNAPSHOT
  ]),
  ROUTE_METHODS: Object.freeze({
    GET: Object.freeze([
      ACTIONS.HEALTH,
      ACTIONS.SETUP_WORKBOOK,
      ACTIONS.BOOTSTRAP,
      ACTIONS.GET_PARTIES,
      ACTIONS.GET_PRODUCTS,
      ACTIONS.GET_PARTY_SNAPSHOTS,
      ACTIONS.GET_SNAPSHOT_BY_REF,
      ACTIONS.GET_PARTY_LATEST_HISTORY,
      ACTIONS.REBUILD_INDEXES,
      ACTIONS.GET_SETTINGS,
      ACTIONS.GET_WORKBOOK_META
    ]),
    POST: Object.freeze([
      ACTIONS.DEBUG_CALC,
      ACTIONS.SAVE_OWNER_APPROVAL,
      ACTIONS.SAVE_FINAL_ACTION
    ])
  }),
  SUPPORTED_ACTIONS: Object.freeze([
    ACTIONS.HEALTH,
    ACTIONS.SETUP_WORKBOOK,
    ACTIONS.BOOTSTRAP,
    ACTIONS.GET_PARTIES,
    ACTIONS.GET_PRODUCTS,
    ACTIONS.GET_PARTY_SNAPSHOTS,
    ACTIONS.GET_SNAPSHOT_BY_REF,
    ACTIONS.GET_PARTY_LATEST_HISTORY,
    ACTIONS.REBUILD_INDEXES,
    ACTIONS.GET_SETTINGS,
    ACTIONS.GET_WORKBOOK_META,
    ACTIONS.DEBUG_CALC,
    ACTIONS.SAVE_OWNER_APPROVAL,
    ACTIONS.SAVE_FINAL_ACTION
  ])
});
