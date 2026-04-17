/**
 * 화상 회의 초대 URL을 파싱해 임베드/새 탭 등 연동 방식을 결정합니다.
 * Zoom·Google Meet 등은 보안상 iframe 임베드가 불가한 경우가 많아 새 탭으로 엽니다.
 */

export function parseVideoMeetingUrl(input) {
  const raw = String(input || '').trim()
  if (!raw) {
    return { platform: 'empty', action: 'none' }
  }

  let url
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    return { platform: 'invalid', action: 'none', error: '유효한 URL 형식이 아닙니다.' }
  }

  const host = url.hostname.toLowerCase()
  const href = url.href

  // Jitsi (공개 meet.jit.si 및 서브도메인, 8x8.vc)
  if (host === 'meet.jit.si' || host.endsWith('.meet.jit.si')) {
    const roomName = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, '') || 'JitSiMeet')
    return {
      platform: 'jitsi',
      action: 'embed-jitsi',
      jitsiDomain: host,
      roomName,
      href,
      label: 'Jitsi',
    }
  }

  if (host === '8x8.vc' || host.endsWith('.8x8.vc')) {
    const roomName = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, '') || 'room')
    return {
      platform: 'jitsi',
      action: 'embed-jitsi',
      jitsiDomain: host,
      roomName,
      href,
      label: 'Jitsi (8x8)',
    }
  }

  if (host.includes('zoom.us') || host.includes('zoomgov.com') || host.includes('zoom.com')) {
    return { platform: 'zoom', action: 'open-tab', href, label: 'Zoom' }
  }

  if (host === 'meet.google.com' || host.endsWith('.meet.google.com')) {
    return { platform: 'meet', action: 'open-tab', href, label: 'Google Meet' }
  }

  if (
    host.includes('teams.microsoft.com') ||
    host.includes('teams.live.com') ||
    host.includes('teams.office.com')
  ) {
    return { platform: 'teams', action: 'open-tab', href, label: 'Microsoft Teams' }
  }

  return { platform: 'unknown', action: 'open-tab', href, label: '외부 링크' }
}
