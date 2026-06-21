self.onmessage = async (e) => {
  const { url, id } = e.data;
  try {
    const res = await fetch(url);
    const text = await res.text();
    const data = JSON.parse(text);
    self.postMessage({ id, data });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
