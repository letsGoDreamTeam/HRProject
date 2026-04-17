import { useCallback, useEffect, useRef, useState } from 'react'
import Peer from 'peerjs'

const peerConfig = {
  config: {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  },
}

function getMediaErrorMessage(err) {
  const name = err?.name || ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '카메라/마이크 권한이 차단되었습니다. 브라우저 주소창의 권한 설정을 허용으로 바꿔 주세요.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '사용 가능한 카메라 또는 마이크를 찾을 수 없습니다.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '카메라/마이크가 다른 앱에서 사용 중입니다. 다른 화상 앱을 종료한 뒤 다시 시도해 주세요.'
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return '요청한 카메라/마이크 조건을 만족할 수 없습니다.'
  }
  if (name === 'AbortError') {
    return '카메라/마이크 초기화가 중단되었습니다. 새로고침 후 다시 시도해 주세요.'
  }
  if (name === 'SecurityError') {
    return '보안 정책으로 미디어 장치 접근이 차단되었습니다. HTTPS 또는 localhost에서 접속해 주세요.'
  }
  return `카메라/마이크 초기화에 실패했습니다 (${name || 'UnknownError'}).`
}

function sanitizeRoomId(raw) {
  return String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 64)
}

/**
 * PeerJS(WebRTC) P2P 화상 — 시그널링은 PeerJS 클라우드(오픈소스 PeerServer 호환).
 * 같은 회의실 ID로 첫 입장자가 방장(peer id), 두 번째는 자동으로 발신 연결합니다.
 */
export function usePeerJsInterview() {
  const peerRef = useRef(null)
  const callRef = useRef(null)
  const localStreamRef = useRef(null)

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)

  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [status, setStatus] = useState('idle')
  const [role, setRole] = useState(null)
  const [lastError, setLastError] = useState('')

  useEffect(() => {
    const el = localVideoRef.current
    if (el && localStream) {
      el.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    const el = remoteVideoRef.current
    if (el && remoteStream) {
      el.srcObject = remoteStream
    }
  }, [remoteStream])

  const teardownMedia = useCallback(() => {
    if (callRef.current) {
      try {
        callRef.current.close()
      } catch {
        /* noop */
      }
      callRef.current = null
    }
    if (peerRef.current) {
      try {
        peerRef.current.destroy()
      } catch {
        /* noop */
      }
      peerRef.current = null
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
    setLocalStream(null)
    setRemoteStream(null)
    setRole(null)
    setStatus('idle')
  }, [])

  const disconnect = useCallback(() => {
    setLastError('')
    teardownMedia()
  }, [teardownMedia])

  const connect = useCallback(
    async (roomId) => {
      const cleanRoom = sanitizeRoomId(roomId)
      if (!cleanRoom) {
        setLastError('회의실 ID를 입력해 주세요.')
        return
      }

      setLastError('')
      teardownMedia()

      if (!navigator.mediaDevices?.getUserMedia) {
        setLastError('이 브라우저/환경에서는 카메라·마이크 접근을 지원하지 않습니다. HTTPS 또는 localhost 환경인지 확인해 주세요.')
        return
      }

      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        })
      } catch (err) {
        setLastError(getMediaErrorMessage(err))
        return
      }

      localStreamRef.current = stream
      setLocalStream(stream)
      setStatus('connecting')

      function tryGuest() {
        const peer = new Peer(peerConfig)

        peer.on('open', () => {
          peerRef.current = peer
          setRole('guest')
          const call = peer.call(cleanRoom, stream)
          callRef.current = call
          call.on('stream', (remote) => {
            setRemoteStream(remote)
            setStatus('connected')
          })
          call.on('close', () => {
            setRemoteStream(null)
            setStatus('idle')
          })
          call.on('error', () => {
            setLastError('상대방이 아직 입장하지 않거나 연결할 수 없습니다.')
          })
        })

        peer.on('error', (err) => {
          setLastError(err.message || '연결에 실패했습니다.')
          teardownMedia()
        })
      }

      function tryHost() {
        const peer = new Peer(cleanRoom, peerConfig)

        peer.on('open', () => {
          peerRef.current = peer
          setRole('host')
          setStatus('waiting')
        })

        peer.on('call', (call) => {
          call.answer(stream)
          callRef.current = call
          call.on('stream', (remote) => {
            setRemoteStream(remote)
            setStatus('connected')
          })
          call.on('close', () => {
            setRemoteStream(null)
            setStatus('waiting')
          })
        })

        peer.on('error', (err) => {
          if (err.type === 'unavailable-id') {
            try {
              peer.destroy()
            } catch {
              /* noop */
            }
            tryGuest()
            return
          }
          setLastError(err.message || '연결에 실패했습니다.')
          teardownMedia()
        })
      }

      tryHost()
    },
    [teardownMedia],
  )

  useEffect(() => () => teardownMedia(), [teardownMedia])

  return {
    localVideoRef,
    remoteVideoRef,
    localStream,
    remoteStream,
    status,
    role,
    lastError,
    connect,
    disconnect,
  }
}
