import { useCallback, useEffect, useRef, useState } from "react";

export function usePolling(fetchFn, intervalMs = 60000, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  const fetch = useCallback(async () => {
    try {
      const result = await fetchFn();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetch();
    timer.current = setInterval(fetch, intervalMs);
    return () => clearInterval(timer.current);
  }, [fetch, intervalMs]);

  return { data, loading, error, refresh: fetch };
}
