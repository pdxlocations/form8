// Apply before styles load so a saved dark preference does not flash light.
(() => {
  const key = 'form8-theme';
  const valid = value => ['system', 'light', 'dark'].includes(value) ? value : 'system';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let mode = 'system';
  try { mode = valid(localStorage.getItem(key)); } catch {}
  function apply() {
    const theme = mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#18241f' : '#15382e');
    const select = document.getElementById('appearance');
    if (select) select.value = mode;
  }
  apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) { mode = valid(event.newValue); apply(); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('appearance')?.addEventListener('change', event => {
      mode = valid(event.target.value);
      try { localStorage.setItem(key, mode); } catch {}
      apply();
    });
  });
})();
