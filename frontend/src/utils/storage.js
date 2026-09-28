// The JWT is kept in localStorage so sessions survive reloads. Trade-off (documented in
// the README): readable by injected scripts, so the app never renders untrusted HTML.
const KEY = 'prepai.token';

export function getToken() {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    /* storage unavailable (private mode) — session lasts for this tab only */
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
