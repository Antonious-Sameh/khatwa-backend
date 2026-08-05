// src/utils/deviceLabel.js
// Best-effort, dependency-free User-Agent → short label converter.
// Only used to help the teacher tell two bound devices apart in the UI —
// never used for any security decision (the device binding itself is by id).

function detectOS(ua) {
  if (/windows/i.test(ua))               return 'Windows';
  if (/iphone/i.test(ua))                return 'iPhone';
  if (/ipad/i.test(ua))                  return 'iPad';
  if (/android/i.test(ua))               return 'Android';
  if (/mac ?os/i.test(ua))               return 'Mac';
  if (/linux/i.test(ua))                 return 'Linux';
  return null;
}

function detectBrowser(ua) {
  if (/samsungbrowser/i.test(ua))        return 'Samsung Internet';
  if (/edg\//i.test(ua))                 return 'Edge';
  if (/opr\/|opera/i.test(ua))           return 'Opera';
  if (/ucbrowser/i.test(ua))             return 'UC Browser';
  if (/firefox/i.test(ua))               return 'Firefox';
  if (/crios/i.test(ua))                 return 'Chrome';
  if (/chrome/i.test(ua) && !/headless/i.test(ua)) return 'Chrome';
  if (/fxios/i.test(ua))                 return 'Firefox';
  if (/safari/i.test(ua))                return 'Safari';
  return null;
}

function deriveDeviceLabel(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return null;
  const os      = detectOS(userAgent);
  const browser = detectBrowser(userAgent);
  if (os && browser) return `${os} · ${browser}`;
  if (os)            return os;
  if (browser)        return browser;
  return null;
}

module.exports = { deriveDeviceLabel };