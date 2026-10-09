self.onmessage = async (e) => {
  const { url, id } = e.data;
  try {
    const res = await fetch(url);
    // Without this a 404 returns an HTML error page, JSON.parse chokes on it,
    // and the failure is reported as a syntax error instead of a missing file.
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const data = JSON.parse(await res.text());
    self.postMessage({ id, data });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
