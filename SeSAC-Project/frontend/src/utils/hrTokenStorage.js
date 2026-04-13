/** HR JWT: 탭을 닫으면 사라지도록 sessionStorage (localStorage 마이그레이션 1회). */

export const HR_TOKEN_KEY = 'hr_access_token'

export function getHrToken() {
  if (typeof window === 'undefined' || !window.sessionStorage) return ''
  try {
    let t = sessionStorage.getItem(HR_TOKEN_KEY)
    if (!t && window.localStorage) {
      const legacy = localStorage.getItem(HR_TOKEN_KEY)
      if (legacy) {
        sessionStorage.setItem(HR_TOKEN_KEY, legacy)
        localStorage.removeItem(HR_TOKEN_KEY)
        t = legacy
      }
    }
    return t || ''
  } catch {
    return ''
  }
}

export function setHrToken(token) {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  try {
    sessionStorage.setItem(HR_TOKEN_KEY, token)
    if (window.localStorage) localStorage.removeItem(HR_TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export function clearHrToken() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(HR_TOKEN_KEY)
    if (window.localStorage) localStorage.removeItem(HR_TOKEN_KEY)
  } catch {
    /* ignore */
  }
}
