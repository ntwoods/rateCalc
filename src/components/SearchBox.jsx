import { memo, useEffect, useState } from 'react';

function SearchBox({ value = '', onChange, delayMs = 280, disabled = false }) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof onChange === 'function') {
        onChange(localValue);
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [localValue, delayMs, onChange]);

  return (
    <div className="control-card" data-tour="product-search">
      <label htmlFor="product-search">Product Search</label>
      <div className="search-box-wrap">
        <input
          id="product-search"
          type="text"
          placeholder="Search products by name"
          value={localValue}
          onChange={(event) => setLocalValue(event.target.value)}
          disabled={disabled}
        />

        {localValue ? (
          <button
            type="button"
            className="inline-clear-btn"
            aria-label="Clear product search"
            onClick={() => setLocalValue('')}
            disabled={disabled}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default memo(SearchBox);
