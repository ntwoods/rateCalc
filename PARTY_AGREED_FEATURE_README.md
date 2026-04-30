# Party Agreed Feature Parking Note

This UI feature was intentionally hidden on 2026-04-30.

Removed from the visible portal:
- Party Agreed row checkboxes in the rate table.
- Party Agreed table header column.
- Save Party Agreed action button.

The underlying save-flow and row-input plumbing is still present in the codebase so the feature can be restored later without rebuilding the backend contract from scratch. To recall it, review the previous usage of `finalActionChecked`, `setFinalActionChecked`, `SAVE_FINAL_ACTION`, and the `showSaveFinal` prop.
