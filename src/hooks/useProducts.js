import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../api/apiClient';
import { API_ACTIONS } from '../constants/appConfig';
import { buildErrorMessage } from '../utils/helpers';
import { toNumberOrZero } from '../utils/formatters';

function normalizeProductRow(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const category = String(item.category ?? item.Category ?? '').trim();
  const product = String(item.product ?? item.Product ?? '').trim();
  const paymentTerms = toNumberOrZero(item.paymentTerms ?? item.PaymentTerms);

  if (!category || !product || !paymentTerms) {
    return null;
  }

  const latestListPrice = toNumberOrZero(item.latestListPrice ?? item.LatestListPrice);
  const previousListPriceRaw = item.previousListPrice ?? item.PreviousListPrice;
  const previousListPrice =
    previousListPriceRaw === null || previousListPriceRaw === undefined || previousListPriceRaw === ''
      ? null
      : toNumberOrZero(previousListPriceRaw);

  return {
    category,
    product,
    paymentTerms,
    latestListPrice,
    latestWEF: String(item.latestWEF ?? item.LatestWEF ?? '').trim(),
    previousListPrice,
    previousWEF: String(item.previousWEF ?? item.PreviousWEF ?? '').trim()
  };
}

function normalizeProducts(rawProducts) {
  if (!Array.isArray(rawProducts)) {
    return [];
  }

  return rawProducts
    .map(normalizeProductRow)
    .filter(Boolean);
}

function containsIgnoreCase(haystack, needle) {
  const h = String(haystack || '').toLowerCase();
  const n = String(needle || '').toLowerCase();
  if (!n.trim()) {
    return true;
  }
  return h.includes(n.trim());
}

export function useProducts({
  search = '',
  category = '',
  enabled = true,
  serverFilter = true
} = {}) {
  const [rawProducts, setRawProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const requestRef = useRef(0);

  const normalizedSearch = String(search || '').trim();
  const normalizedCategory = String(category || '').trim();

  const fetchProducts = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setError('');
      setRawProducts([]);
      setStats(null);
      return;
    }

    const requestId = Date.now();
    requestRef.current = requestId;

    setLoading(true);
    setError('');

    try {
      const query = {};

      if (serverFilter) {
        if (normalizedSearch) {
          query.search = normalizedSearch;
        }
        if (normalizedCategory) {
          query.category = normalizedCategory;
        }
      } else if (normalizedCategory) {
        query.category = normalizedCategory;
      }

      const response = await apiClient.get(API_ACTIONS.GET_PRODUCTS, query);
      if (requestRef.current !== requestId) {
        return;
      }

      const payload = response?.data || {};
      const nextProducts = normalizeProducts(payload.products || []);
      setRawProducts(nextProducts);
      setStats(payload.stats || null);
    } catch (fetchError) {
      if (requestRef.current !== requestId) {
        return;
      }

      setRawProducts([]);
      setStats(null);
      setError(buildErrorMessage(fetchError, 'Failed to load products.'));
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [enabled, serverFilter, normalizedSearch, normalizedCategory]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const products = useMemo(() => {
    if (serverFilter) {
      return rawProducts;
    }

    return rawProducts.filter((item) => {
      const matchCategory = normalizedCategory
        ? item.category.toLowerCase() === normalizedCategory.toLowerCase()
        : true;

      const matchSearch = containsIgnoreCase(item.product, normalizedSearch);
      return matchCategory && matchSearch;
    });
  }, [rawProducts, serverFilter, normalizedCategory, normalizedSearch]);

  const reload = useCallback(() => {
    fetchProducts();
  }, [fetchProducts]);

  return {
    products,
    loading,
    error,
    stats,
    reload
  };
}