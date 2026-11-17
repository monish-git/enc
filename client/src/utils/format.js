const pad = (n) => String(n).padStart(2, '0');

export const toDate = (d) => (d instanceof Date ? d : new Date(d));

export const fmtClock = (d) => {
  const x = toDate(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
};

export const fmtHM = (d) => {
  const x = toDate(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

export const fmtDate = (d) => {
  const x = toDate(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

export const fmtDateTime = (d) => `${fmtDate(d)} ${fmtClock(d)}`;

export const isToday = (d) => fmtDate(d) === fmtDate(new Date());

// 20:45:12 for today, 2026-11-15 20:45:12 otherwise
export const fmtStamp = (d) => (isToday(d) ? fmtClock(d) : fmtDateTime(d));

export const fmtShort = (d) => (isToday(d) ? fmtHM(d) : fmtDate(d));

export function fmtAgo(d) {
  if (!d) return 'NEVER';
  const s = Math.max(0, Math.floor((Date.now() - toDate(d).getTime()) / 1000));
  if (s < 45) return 'JUST NOW';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} MIN AGO`;
  if (s < 86400) return `${Math.round(s / 3600)} HR AGO`;
  return `${Math.round(s / 86400)} DAY AGO`;
}

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function shortUA(ua = '') {
  const browser =
    /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Unknown browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return `${browser} / ${os}`;
}

export const upper = (s) => String(s ?? '').toUpperCase();

export function passwordScore(pw = '') {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length < 10) s = Math.min(s, 1);
  return Math.min(4, s);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function safeFilename(name = 'file') {
  return String(name).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120) || 'file';
}
