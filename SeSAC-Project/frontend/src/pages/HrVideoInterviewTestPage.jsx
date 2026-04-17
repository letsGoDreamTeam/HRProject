import { useEffect, useRef, useState } from 'react'
import { usePeerJsInterview } from '../hooks/usePeerJsInterview'
import { parseVideoMeetingUrl } from '../utils/videoMeetingUrls'

function randomRoomId() {
  return `hr-${Math.random().toString(36).slice(2, 10)}`
}

function sanitizeRoomId(raw) {
  return String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 64)
}

const TABS = [
  { id: 'link', label: '외부 초대 링크' },
  { id: 'jitsi', label: 'Jitsi (임베드)' },
  { id: 'webrtc', label: '직접 WebRTC (P2P)' },
]

export function HrVideoInterviewTestPage() {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const loadedJitsiScriptForDomain = useRef('')

  const [mainTab, setMainTab] = useState('link')

  const [roomId, setRoomId] = useState(randomRoomId())
  const [jitsiDomain, setJitsiDomain] = useState('meet.jit.si')
  const [displayName, setDisplayName] = useState('HR 면접관')
  const [joined, setJoined] = useState(false)
  const [inviteErr, setInviteErr] = useState('')
  const [jitsiErr, setJitsiErr] = useState('')
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoMuted, setIsVideoMuted] = useState(false)

  const [inviteUrl, setInviteUrl] = useState('')
  const [parsedInvite, setParsedInvite] = useState(null)

  const {
    localVideoRef,
    remoteVideoRef,
    connect: connectWebrtc,
    disconnect: disconnectWebrtc,
    status: webrtcStatus,
    role: webrtcRole,
    lastError: webrtcErr,
  } = usePeerJsInterview()
  const [webrtcRoomId, setWebrtcRoomId] = useState(() => randomRoomId())

  const meetingUrl = `https://${jitsiDomain}/${sanitizeRoomId(roomId)}`

  function ensureJitsiScript(domain) {
    if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
    if (window.JitsiMeetExternalAPI && loadedJitsiScriptForDomain.current === domain) {
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-jitsi-domain="${domain}"]`)
      if (existing && window.JitsiMeetExternalAPI) {
        loadedJitsiScriptForDomain.current = domain
        resolve()
        return
      }
      const script = document.createElement('script')
      script.src = `https://${domain}/external_api.js`
      script.async = true
      script.dataset.jitsiDomain = domain
      script.onload = () => {
        loadedJitsiScriptForDomain.current = domain
        resolve()
      }
      script.onerror = () => reject(new Error('Jitsi 스크립트 로드 실패'))
      document.body.appendChild(script)
    })
  }

  useEffect(() => {
    return () => {
      if (apiRef.current) {
        apiRef.current.dispose()
        apiRef.current = null
      }
    }
  }, [])

  const joinMeeting = async () => {
    const cleanRoom = sanitizeRoomId(roomId)
    if (!cleanRoom) {
      setJitsiErr('회의실 ID를 입력해 주세요.')
      return
    }
    try {
      await ensureJitsiScript(jitsiDomain)
    } catch {
      setJitsiErr('Jitsi 스크립트를 불러오지 못했습니다. 도메인을 확인하거나 잠시 후 다시 시도해 주세요.')
      return
    }
    if (!window.JitsiMeetExternalAPI) {
      setJitsiErr('Jitsi API를 사용할 수 없습니다.')
      return
    }
    setJitsiErr('')
    if (apiRef.current) {
      apiRef.current.dispose()
      apiRef.current = null
    }
    const api = new window.JitsiMeetExternalAPI(jitsiDomain, {
      roomName: cleanRoom,
      parentNode: containerRef.current,
      userInfo: { displayName: displayName.trim() || 'HR 면접관' },
      configOverwrite: {
        prejoinPageEnabled: true,
      },
      interfaceConfigOverwrite: {
        MOBILE_APP_PROMO: false,
      },
    })
    api.addListener('videoConferenceJoined', () => setJoined(true))
    api.addListener('videoConferenceLeft', () => setJoined(false))
    api.addListener('audioMuteStatusChanged', ({ muted }) => setIsMuted(Boolean(muted)))
    api.addListener('videoMuteStatusChanged', ({ muted }) => setIsVideoMuted(Boolean(muted)))
    apiRef.current = api
  }

  const leaveMeeting = () => {
    if (!apiRef.current) return
    apiRef.current.executeCommand('hangup')
    apiRef.current.dispose()
    apiRef.current = null
    setJoined(false)
  }

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(meetingUrl)
    } catch {
      setJitsiErr('링크 복사에 실패했습니다. 주소를 직접 복사해 주세요.')
    }
  }

  const analyzeInviteLink = () => {
    const result = parseVideoMeetingUrl(inviteUrl)
    setParsedInvite(result)
    setInviteErr(result.error || '')
  }

  const applyJitsiFromParsed = () => {
    if (!parsedInvite || parsedInvite.action !== 'embed-jitsi') return
    setJitsiDomain(parsedInvite.jitsiDomain)
    setRoomId(parsedInvite.roomName)
    setMainTab('jitsi')
  }

  const openExternalTab = () => {
    if (!parsedInvite?.href) return
    window.open(parsedInvite.href, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">화상면접 회의실 (사이트 내)</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          외부 플랫폼 초대 링크를 붙여 넣어 연동하거나, Jitsi 임베드·브라우저{' '}
          <a
            href="https://webrtc.org/"
            target="_blank"
            rel="noreferrer"
            className="text-violet-600 underline decoration-violet-400/60 underline-offset-2 hover:text-violet-700 dark:text-violet-400"
          >
            WebRTC
          </a>{' '}
          P2P로 별도 앱 없이 면접을 진행할 수 있습니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-700">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMainTab(t.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              mainTab === t.id
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mainTab === 'link' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">초대 링크 자동 연동</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Zoom·Google Meet·Teams 링크는 보안 정책상 이 페이지에 끼워 넣을 수 없어 새 탭으로 엽니다. Jitsi 링크는
            아래에서 회의실 ID를 추출해 사이트 안 Jitsi 화면으로 이어줍니다.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={inviteUrl}
              onChange={(e) => setInviteUrl(e.target.value)}
              placeholder="https://meet.google.com/xxx-yyyy-zzz 또는 zoom.us/j/…"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={analyzeInviteLink}
              className="shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              링크 분석
            </button>
          </div>

          {parsedInvite && parsedInvite.platform !== 'empty' ? (
            <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/50">
              <p className="font-medium text-slate-800 dark:text-slate-100">
                감지: {parsedInvite.label || parsedInvite.platform}
                {parsedInvite.platform === 'jitsi' ? ' · 임베드 가능' : ' · 새 탭으로 열기'}
              </p>
              {parsedInvite.href ? (
                <p className="break-all text-xs text-slate-600 dark:text-slate-300">{parsedInvite.href}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {parsedInvite.action === 'embed-jitsi' ? (
                  <button
                    type="button"
                    onClick={applyJitsiFromParsed}
                    className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                  >
                    이 설정으로 Jitsi 탭 열기
                  </button>
                ) : parsedInvite.action === 'open-tab' && parsedInvite.href ? (
                  <button
                    type="button"
                    onClick={openExternalTab}
                    className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                  >
                    브라우저에서 열기
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {inviteErr ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
              {inviteErr}
            </p>
          ) : null}
        </section>
      ) : null}

      {mainTab === 'jitsi' ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Jitsi 회의실 입장</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              서버: {jitsiDomain} — 자체 Jitsi를 쓰는 경우 도메인을 맞춰 주세요.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={jitsiDomain}
                onChange={(e) => setJitsiDomain(e.target.value.trim() || 'meet.jit.si')}
                placeholder="Jitsi 도메인 (예: meet.jit.si)"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="회의실 ID"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="표시 이름"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400 sm:col-span-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void joinMeeting()}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
              >
                회의실 입장
              </button>
              <button
                type="button"
                onClick={leaveMeeting}
                disabled={!joined}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                회의 종료
              </button>
              <button
                type="button"
                onClick={() => void copyInvite()}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                초대 링크 복사
              </button>
            </div>
            <p className="mt-2 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
              초대 링크: {meetingUrl}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              상태: {joined ? '입장됨' : '미입장'} · 마이크 {isMuted ? '꺼짐' : '켜짐'} · 카메라{' '}
              {isVideoMuted ? '꺼짐' : '켜짐'}
            </p>
            {jitsiErr ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                {jitsiErr}
              </p>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40">
            <div ref={containerRef} className="h-[70vh] min-h-[520px] w-full bg-slate-100 dark:bg-slate-950" />
          </section>
        </>
      ) : null}

      {mainTab === 'webrtc' ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">WebRTC 직접 연결 (PeerJS)</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              브라우저 표준 WebRTC와 오픈소스{' '}
              <a
                href="https://github.com/peers/peerjs"
                target="_blank"
                rel="noreferrer"
                className="text-violet-600 underline decoration-violet-400/60 underline-offset-2"
              >
                PeerJS
              </a>
              로 1:1 영상·음성을 연결합니다. 첫 입장자가 방장(같은 회의실 ID), 두 번째 참가자가 자동으로 붙습니다.
              운영 환경에서는 시그널링·TURN 서버를 자체 구축하는 것이 안전합니다.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={webrtcRoomId}
                onChange={(e) => setWebrtcRoomId(e.target.value)}
                placeholder="공유 회의실 ID"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void connectWebrtc(webrtcRoomId)}
                  disabled={
                    webrtcStatus === 'connecting' ||
                    webrtcStatus === 'connected' ||
                    webrtcStatus === 'waiting'
                  }
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  연결
                </button>
                <button
                  type="button"
                  onClick={disconnectWebrtc}
                  disabled={webrtcStatus === 'idle'}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  종료
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              역할: {webrtcRole === 'host' ? '방장(대기 중)' : webrtcRole === 'guest' ? '참가자' : '—'} · 상태:{' '}
              {{
                idle: '대기',
                connecting: '연결 중',
                waiting: '상대 입장 대기',
                connected: '연결됨',
              }[webrtcStatus] || webrtcStatus}
            </p>
            {webrtcErr ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                {webrtcErr}
              </p>
            ) : null}
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black dark:border-slate-800">
              <p className="bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300">내 화면</p>
              <video
                ref={localVideoRef}
                className="aspect-video w-full object-cover"
                autoPlay
                playsInline
                muted
              />
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black dark:border-slate-800">
              <p className="bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300">상대 화면</p>
              <video
                ref={remoteVideoRef}
                className="aspect-video w-full object-cover"
                autoPlay
                playsInline
              />
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
