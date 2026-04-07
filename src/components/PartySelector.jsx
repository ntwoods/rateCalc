import { memo, useEffect, useMemo, useRef, useState } from 'react';

function PartySelector({
  parties = [],
  value = '',
  onChange,
  disabled = false,
  loading = false
}) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const rootRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current || rootRef.current.contains(event.target)) {
        return;
      }
      setOpen(false);
      setHighlightedIndex(-1);
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const keyword = String(query || '').trim().toLowerCase();
    const onlyActive = parties.filter((party) => party?.active !== false);

    if (!keyword) {
      return onlyActive;
    }

    return onlyActive.filter((party) =>
      String(party?.partyName || '').toLowerCase().includes(keyword)
    );
  }, [parties, query]);

  function handleSelect(partyName) {
    setQuery(partyName);
    setOpen(false);
    setHighlightedIndex(-1);
    if (typeof onChange === 'function') {
      onChange(partyName);
    }
  }

  function handleInputChange(event) {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setOpen(true);
    setHighlightedIndex(-1);

    if (!nextQuery.trim() && typeof onChange === 'function') {
      onChange('');
    }
  }

  function handleKeyDown(event) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true);
      return;
    }

    if (!filtered.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % filtered.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1));
      return;
    }

    if (event.key === 'Enter') {
      if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
        event.preventDefault();
        handleSelect(filtered[highlightedIndex].partyName);
      }
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  }

  return (
    <div className="control-card party-selector" ref={rootRef}>
      <label htmlFor="party-selector-input">Party</label>

      <div className="combo-box">
        <input
          id="party-selector-input"
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={loading ? 'Loading parties...' : 'Search and select party'}
          autoComplete="off"
          disabled={disabled || loading}
          aria-expanded={open}
          aria-autocomplete="list"
          role="combobox"
        />

        {query ? (
          <button
            type="button"
            className="inline-clear-btn"
            aria-label="Clear party selection"
            onClick={() => handleSelect('')}
            disabled={disabled || loading}
          >
            ×
          </button>
        ) : null}
      </div>

      {open && !disabled && !loading ? (
        <ul className="combo-list" role="listbox">
          {filtered.length > 0 ? (
            filtered.map((party, index) => (
              <li key={party.partyName} role="option" aria-selected={highlightedIndex === index}>
                <button
                  type="button"
                  className={`combo-item ${highlightedIndex === index ? 'combo-item--active' : ''}`}
                  onClick={() => handleSelect(party.partyName)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span>{party.partyName}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="combo-empty">No matching parties</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

export default memo(PartySelector);
