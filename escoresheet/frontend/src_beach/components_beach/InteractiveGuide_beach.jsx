import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal_beach'

// CSS Keyframe animations as inline styles
const animationStyles = `
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.05); opacity: 0.8; }
  }
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-5px); }
  }
  @keyframes rotate-positions {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(60deg); }
  }
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes glow {
    0%, 100% { box-shadow: 0 0 5px rgba(34, 197, 94, 0.5); }
    50% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.8); }
  }
  @keyframes slide-swap {
    0% { transform: translateY(0); }
    50% { transform: translateY(-30px); opacity: 0.5; }
    100% { transform: translateY(0); }
  }
  @keyframes countdown-tick {
    0% { stroke-dashoffset: 0; }
    100% { stroke-dashoffset: 283; }
  }
`

// Collapsible Section Component
function Section({ title, icon, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div style={{ marginBottom: 16, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '14px 16px',
          background: isOpen ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.05)',
          border: 'none',
          borderBottom: isOpen ? '1px solid rgba(255,255,255,0.1)' : 'none',
          color: 'white',
          fontSize: 15,
          fontWeight: 600,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          transition: 'all 0.2s'
        }}
      >
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ flex: 1 }}>{title}</span>
        <span style={{ fontSize: 12, opacity: 0.7, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>
      {isOpen && (
        <div style={{ padding: 16, animation: 'fade-in 0.3s ease-out' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// Q&A Item Component for Troubleshooting
function QAItem({ question, answer }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div style={{ marginBottom: 8, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '12px 14px',
          background: 'transparent',
          border: 'none',
          color: '#60a5fa',
          fontSize: 14,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8
        }}
      >
        <span style={{ fontWeight: 700, color: '#3b82f6' }}>Q:</span>
        <span style={{ flex: 1 }}>{question}</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <div style={{ padding: '0 14px 12px 30px', fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
          <span style={{ fontWeight: 600, color: '#22c55e' }}>A: </span>
          {answer}
        </div>
      )}
    </div>
  )
}

// Interactive Demo Button
function DemoButton({ label, color = '#3b82f6', onClick, small = false, disabled = false }) {
  const [clicked, setClicked] = useState(false)

  const handleClick = () => {
    if (disabled) return
    setClicked(true)
    onClick?.()
    setTimeout(() => setClicked(false), 200)
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      style={{
        padding: small ? '6px 12px' : '10px 20px',
        background: disabled ? 'rgba(255,255,255,0.1)' : color,
        border: 'none',
        borderRadius: 6,
        color: 'white',
        fontSize: small ? 12 : 14,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transform: clicked ? 'scale(0.95)' : 'scale(1)',
        transition: 'all 0.1s',
        opacity: disabled ? 0.5 : 1
      }}
    >
      {label}
    </button>
  )
}

// Interactive Court Visualization for Beach Volleyball (2v2)
function CourtDemo({ animateRotation = false, highlightPosition = null, t }) {
  const [positions, setPositions] = useState([
    { pos: 'left', number: 1, serve: true },
    { pos: 'right', number: 2 }
  ])

  const [isRotating, setIsRotating] = useState(false)

  const rotate = () => {
    if (isRotating) return
    setIsRotating(true)
    setTimeout(() => {
      setPositions(prev => {
        const newPositions = [...prev]
        // Swap positions and toggle serve
        const temp = newPositions[0].number
        newPositions[0].number = newPositions[1].number
        newPositions[1].number = temp
        newPositions[0].serve = !newPositions[0].serve
        newPositions[1].serve = !newPositions[1].serve
        return newPositions
      })
      setIsRotating(false)
    }, 300)
  }

  useEffect(() => {
    if (animateRotation) {
      const interval = setInterval(rotate, 2000)
      return () => clearInterval(interval)
    }
  }, [animateRotation])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {/* Net indicator */}
      <div style={{ width: 200, height: 4, background: 'linear-gradient(90deg, transparent, #fff, transparent)', borderRadius: 2, opacity: 0.3 }} />
      <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>{t('interactiveGuide.demos.net')}</div>

      {/* Court - 2 players side by side */}
      <div style={{
        display: 'flex',
        gap: 16,
        padding: 16,
        background: 'rgba(34, 197, 94, 0.1)',
        border: '2px solid rgba(34, 197, 94, 0.3)',
        borderRadius: 8
      }}>
        {positions.map((p) => (
          <div
            key={p.pos}
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: highlightPosition === p.pos ? '#3b82f6' : 'rgba(255,255,255,0.15)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid rgba(255,255,255,0.3)',
              transition: 'all 0.3s',
              transform: isRotating ? 'scale(0.9)' : 'scale(1)',
              position: 'relative'
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 700 }}>{p.number}</span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>{p.pos}</span>
            {p.serve && (
              <div style={{
                position: 'absolute',
                top: -8,
                right: -8,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#eab308',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                animation: 'bounce 1s infinite'
              }}>
                🏐
              </div>
            )}
          </div>
        ))}
      </div>

      {animateRotation && (
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
          {t('interactiveGuide.demos.rotationHint')}
        </div>
      )}
    </div>
  )
}

// Interactive Score Demo
function ScoreDemo({ t }) {
  const [team1Score, setteam1Score] = useState(12)
  const [team2Score, setteam2Score] = useState(10)
  const [team1Flash, setteam1Flash] = useState(false)
  const [team2Flash, setteam2Flash] = useState(false)

  const addteam1Point = () => {
    setteam1Score(s => Math.min(s + 1, 25))
    setteam1Flash(true)
    setTimeout(() => setteam1Flash(false), 300)
  }

  const addteam2Point = () => {
    setteam2Score(s => Math.min(s + 1, 25))
    setteam2Flash(true)
    setTimeout(() => setteam2Flash(false), 300)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 16, background: 'rgba(0,0,0,0.3)', borderRadius: 8 }}>
      {/* Score display */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{t('interactiveGuide.demos.home')}</div>
          <div style={{
            fontSize: 48,
            fontWeight: 700,
            color: '#3b82f6',
            transition: 'all 0.2s',
            transform: team1Flash ? 'scale(1.2)' : 'scale(1)'
          }}>
            {team1Score}
          </div>
        </div>
        <div style={{ fontSize: 24, opacity: 0.5 }}>:</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{t('interactiveGuide.demos.team2')}</div>
          <div style={{
            fontSize: 48,
            fontWeight: 700,
            color: '#ef4444',
            transition: 'all 0.2s',
            transform: team2Flash ? 'scale(1.2)' : 'scale(1)'
          }}>
            {team2Score}
          </div>
        </div>
      </div>

      {/* Point buttons */}
      <div style={{ display: 'flex', gap: 12 }}>
        <DemoButton label={t('interactiveGuide.demos.pointHome')} color="#3b82f6" onClick={addHomePoint} />
        <DemoButton label={t('interactiveGuide.demos.pointteam2')} color="#ef4444" onClick={addteam2Point} />
      </div>

      <div style={{ fontSize: 11, opacity: 0.5 }}>{t('interactiveGuide.demos.clickToScore')}</div>
    </div>
  )
}

// Countdown Demo
function CountdownDemo({ t }) {
  const [seconds, setSeconds] = useState(30)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (running && seconds > 0) {
      const timer = setTimeout(() => setSeconds(s => s - 1), 1000)
      return () => clearTimeout(timer)
    } else if (seconds === 0) {
      setRunning(false)
      setSeconds(30)
    }
  }, [running, seconds])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: 80, height: 80 }}>
        <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx="40"
            cy="40"
            r="35"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="6"
          />
          <circle
            cx="40"
            cy="40"
            r="35"
            fill="none"
            stroke="#eab308"
            strokeWidth="6"
            strokeDasharray="220"
            strokeDashoffset={220 - (seconds / 30) * 220}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 24,
          fontWeight: 700
        }}>
          {seconds}
        </div>
      </div>
      <DemoButton
        label={running ? t('interactiveGuide.demos.stop') : t('interactiveGuide.demos.startDemo')}
        color={running ? '#ef4444' : '#22c55e'}
        onClick={() => setRunning(!running)}
        small
      />
      <div style={{ fontSize: 11, opacity: 0.5 }}>{t('interactiveGuide.demos.timeoutCountdown')}</div>
    </div>
  )
}

// Interactive Button State Demo - Shows what buttons do and when they're enabled/disabled
function ButtonStateDemo({ t }) {
  const [rallyActive, setRallyActive] = useState(false)
  const [team1Score, setTeam1Score] = useState(0)
  const [team2Score, setTeam2Score] = useState(0)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('info') // 'info', 'success', 'error'

  const showMessage = (msg, type = 'info') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 2500)
  }

  const handleStartRally = () => {
    if (rallyActive) {
      showMessage(t('interactiveGuide.buttonDemo.alreadyActive'), 'error')
      return
    }
    setRallyActive(true)
    showMessage(t('interactiveGuide.buttonDemo.rallyStarted'), 'success')
  }

  const handlePoint = (team) => {
    if (!rallyActive) {
      showMessage(t('interactiveGuide.buttonDemo.startFirst'), 'error')
      return
    }
    if (team === 'team1') {
      setTeam1Score(s => s + 1)
    } else {
      setTeam2Score(s => s + 1)
    }
    setRallyActive(false)
    showMessage(t('interactiveGuide.buttonDemo.pointAwarded'), 'success')
  }

  const resetDemo = () => {
    setRallyActive(false)
    setTeam1Score(0)
    setTeam2Score(0)
    setMessage('')
  }

  return (
    <div style={{
      padding: 20,
      background: 'rgba(0,0,0,0.4)',
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.1)'
    }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: 14, opacity: 0.8 }}>
          {t('interactiveGuide.buttonDemo.title')}
        </h4>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {t('interactiveGuide.buttonDemo.instruction')}
        </div>
      </div>

      {/* Score Display */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24, marginBottom: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>{t('interactiveGuide.demos.team1')}</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6' }}>{team1Score}</div>
        </div>
        <div style={{ fontSize: 20, opacity: 0.3 }}>:</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>{t('interactiveGuide.demos.team2')}</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#ef4444' }}>{team2Score}</div>
        </div>
      </div>

      {/* Rally Status Indicator */}
      <div style={{
        textAlign: 'center',
        marginBottom: 16,
        padding: '8px 16px',
        background: rallyActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.05)',
        borderRadius: 8,
        border: `1px solid ${rallyActive ? 'rgba(34, 197, 94, 0.5)' : 'rgba(255,255,255,0.1)'}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: rallyActive ? '#22c55e' : '#6b7280',
            animation: rallyActive ? 'pulse 1s infinite' : 'none'
          }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            {rallyActive ? t('interactiveGuide.buttonDemo.rallyInProgress') : t('interactiveGuide.buttonDemo.waitingForRally')}
          </span>
        </div>
      </div>

      {/* Buttons Row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {/* Start Rally Button */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleStartRally}
            style={{
              padding: '12px 20px',
              background: rallyActive ? 'rgba(107, 114, 128, 0.3)' : 'linear-gradient(180deg, #4ade80 0%, #22c55e 100%)',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              cursor: rallyActive ? 'not-allowed' : 'pointer',
              opacity: rallyActive ? 0.5 : 1,
              transition: 'all 0.2s',
              boxShadow: rallyActive ? 'none' : '0 4px 12px rgba(34, 197, 94, 0.3)'
            }}
          >
            ▶ {t('interactiveGuide.demos.startRally')}
          </button>
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4 }}>
            {rallyActive ? '❌ ' + t('interactiveGuide.buttonDemo.disabled') : '✓ ' + t('interactiveGuide.buttonDemo.enabled')}
          </div>
        </div>

        {/* Team 1 Point Button */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => handlePoint('team1')}
            style={{
              padding: '12px 20px',
              background: !rallyActive ? 'rgba(107, 114, 128, 0.3)' : 'linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              cursor: !rallyActive ? 'not-allowed' : 'pointer',
              opacity: !rallyActive ? 0.5 : 1,
              transition: 'all 0.2s',
              boxShadow: !rallyActive ? 'none' : '0 4px 12px rgba(59, 130, 246, 0.3)'
            }}
          >
            {t('interactiveGuide.demos.pointTeam1')}
          </button>
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4 }}>
            {!rallyActive ? '❌ ' + t('interactiveGuide.buttonDemo.disabled') : '✓ ' + t('interactiveGuide.buttonDemo.enabled')}
          </div>
        </div>

        {/* Team 2 Point Button */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => handlePoint('team2')}
            style={{
              padding: '12px 20px',
              background: !rallyActive ? 'rgba(107, 114, 128, 0.3)' : 'linear-gradient(180deg, #f87171 0%, #ef4444 100%)',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              cursor: !rallyActive ? 'not-allowed' : 'pointer',
              opacity: !rallyActive ? 0.5 : 1,
              transition: 'all 0.2s',
              boxShadow: !rallyActive ? 'none' : '0 4px 12px rgba(239, 68, 68, 0.3)'
            }}
          >
            {t('interactiveGuide.demos.pointTeam2')}
          </button>
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4 }}>
            {!rallyActive ? '❌ ' + t('interactiveGuide.buttonDemo.disabled') : '✓ ' + t('interactiveGuide.buttonDemo.enabled')}
          </div>
        </div>
      </div>

      {/* Feedback Message */}
      <div style={{
        minHeight: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {message && (
          <div style={{
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            animation: 'fade-in 0.2s ease-out',
            background: messageType === 'success' ? 'rgba(34, 197, 94, 0.2)' :
                       messageType === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
            color: messageType === 'success' ? '#4ade80' :
                   messageType === 'error' ? '#f87171' : '#60a5fa',
            border: `1px solid ${messageType === 'success' ? 'rgba(34, 197, 94, 0.3)' :
                                messageType === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`
          }}>
            {messageType === 'success' ? '✓' : messageType === 'error' ? '✗' : 'ℹ'} {message}
          </div>
        )}
      </div>

      {/* Reset Button */}
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <button
          onClick={resetDemo}
          style={{
            padding: '6px 14px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.6)',
            fontSize: 12,
            cursor: 'pointer'
          }}
        >
          ↺ {t('interactiveGuide.buttonDemo.reset')}
        </button>
      </div>
    </div>
  )
}

// Interactive Timeout Demo - Shows when timeouts are available
function TimeoutAvailabilityDemo({ t }) {
  const [team1Timeouts, setTeam1Timeouts] = useState(0)
  const [team2Timeouts, setTeam2Timeouts] = useState(0)
  const [rallyActive, setRallyActive] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('info')
  const [activeCountdown, setActiveCountdown] = useState(null) // 'team1' or 'team2'
  const [countdown, setCountdown] = useState(30)

  const showMessage = (msg, type) => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 2500)
  }

  useEffect(() => {
    if (activeCountdown && countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
      return () => clearTimeout(timer)
    } else if (countdown === 0) {
      setActiveCountdown(null)
      setCountdown(30)
    }
  }, [activeCountdown, countdown])

  const handleTimeout = (team) => {
    if (rallyActive) {
      showMessage(t('interactiveGuide.timeoutDemo.notDuringRally'), 'error')
      return
    }

    const currentTimeouts = team === 'team1' ? team1Timeouts : team2Timeouts
    if (currentTimeouts >= 2) {
      showMessage(t('interactiveGuide.timeoutDemo.maxReached'), 'error')
      return
    }

    if (activeCountdown) {
      showMessage(t('interactiveGuide.timeoutDemo.alreadyActive'), 'error')
      return
    }

    if (team === 'team1') {
      setTeam1Timeouts(t => t + 1)
    } else {
      setTeam2Timeouts(t => t + 1)
    }
    setActiveCountdown(team)
    showMessage(t('interactiveGuide.timeoutDemo.timeoutCalled'), 'success')
  }

  const resetDemo = () => {
    setTeam1Timeouts(0)
    setTeam2Timeouts(0)
    setRallyActive(false)
    setActiveCountdown(null)
    setCountdown(30)
    setMessage('')
  }

  const team1CanCall = !rallyActive && team1Timeouts < 2 && !activeCountdown
  const team2CanCall = !rallyActive && team2Timeouts < 2 && !activeCountdown

  return (
    <div style={{
      padding: 20,
      background: 'rgba(0,0,0,0.4)',
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.1)'
    }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: 14, opacity: 0.8 }}>
          {t('interactiveGuide.timeoutDemo.title')}
        </h4>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {t('interactiveGuide.timeoutDemo.instruction')}
        </div>
      </div>

      {/* Toggle Rally State */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <button
          onClick={() => setRallyActive(!rallyActive)}
          style={{
            padding: '8px 16px',
            background: rallyActive ? 'rgba(234, 179, 8, 0.3)' : 'rgba(255,255,255,0.1)',
            border: `1px solid ${rallyActive ? '#eab308' : 'rgba(255,255,255,0.2)'}`,
            borderRadius: 6,
            color: 'white',
            fontSize: 12,
            cursor: 'pointer'
          }}
        >
          {rallyActive ? '⏸ ' + t('interactiveGuide.timeoutDemo.endRally') : '▶ ' + t('interactiveGuide.timeoutDemo.simulateRally')}
        </button>
      </div>

      {/* Countdown Display (when active) */}
      {activeCountdown && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ position: 'relative', width: 70, height: 70 }}>
            <svg width="70" height="70" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="35" cy="35" r="30" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
              <circle
                cx="35" cy="35" r="30" fill="none" stroke="#eab308" strokeWidth="5"
                strokeDasharray="188" strokeDashoffset={188 - (countdown / 30) * 188}
                strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              fontSize: 20, fontWeight: 700
            }}>{countdown}</div>
          </div>
        </div>
      )}

      {/* Timeout Buttons */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => handleTimeout('team1')}
            style={{
              padding: '12px 18px',
              background: team1CanCall ? 'linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)' : 'rgba(107, 114, 128, 0.3)',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
              cursor: team1CanCall ? 'pointer' : 'not-allowed',
              opacity: team1CanCall ? 1 : 0.5,
              transition: 'all 0.2s'
            }}
          >
            ⏱ {t('interactiveGuide.demos.team1')}
          </button>
          <div style={{ fontSize: 11, marginTop: 6 }}>
            <span style={{ opacity: 0.6 }}>TO: </span>
            <span style={{ fontWeight: 600 }}>{team1Timeouts}/2</span>
          </div>
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>
            {team1CanCall ? '✓ ' + t('interactiveGuide.buttonDemo.enabled') : '❌ ' + t('interactiveGuide.buttonDemo.disabled')}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => handleTimeout('team2')}
            style={{
              padding: '12px 18px',
              background: team2CanCall ? 'linear-gradient(180deg, #f87171 0%, #ef4444 100%)' : 'rgba(107, 114, 128, 0.3)',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
              cursor: team2CanCall ? 'pointer' : 'not-allowed',
              opacity: team2CanCall ? 1 : 0.5,
              transition: 'all 0.2s'
            }}
          >
            ⏱ {t('interactiveGuide.demos.team2')}
          </button>
          <div style={{ fontSize: 11, marginTop: 6 }}>
            <span style={{ opacity: 0.6 }}>TO: </span>
            <span style={{ fontWeight: 600 }}>{team2Timeouts}/2</span>
          </div>
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>
            {team2CanCall ? '✓ ' + t('interactiveGuide.buttonDemo.enabled') : '❌ ' + t('interactiveGuide.buttonDemo.disabled')}
          </div>
        </div>
      </div>

      {/* Status Indicators */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 12,
        marginBottom: 12,
        fontSize: 11
      }}>
        <div style={{
          padding: '4px 10px',
          borderRadius: 4,
          background: rallyActive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
          border: `1px solid ${rallyActive ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`
        }}>
          {rallyActive ? t('interactiveGuide.timeoutDemo.rallyActive') : t('interactiveGuide.timeoutDemo.noRally')}
        </div>
      </div>

      {/* Feedback Message */}
      <div style={{ minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {message && (
          <div style={{
            padding: '6px 14px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            animation: 'fade-in 0.2s ease-out',
            background: messageType === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            color: messageType === 'success' ? '#4ade80' : '#f87171'
          }}>
            {messageType === 'success' ? '✓' : '✗'} {message}
          </div>
        )}
      </div>

      {/* Reset */}
      <div style={{ textAlign: 'center' }}>
        <button onClick={resetDemo} style={{
          padding: '6px 14px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 6,
          color: 'rgba(255,255,255,0.6)',
          fontSize: 12,
          cursor: 'pointer'
        }}>
          ↺ {t('interactiveGuide.buttonDemo.reset')}
        </button>
      </div>
    </div>
  )
}

// =====================================================
// VISUAL SCREEN MOCKUPS - Shows actual app UI screens
// =====================================================

// Mockup Container - Looks like a screenshot/frame
function ScreenMockup({ title, children, width = '100%' }) {
  return (
    <div style={{
      background: '#0f172a',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      width,
      maxWidth: '100%'
    }}>
      {/* Title bar */}
      <div style={{
        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
        </div>
        <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 8 }}>{title}</span>
      </div>
      {/* Content */}
      <div style={{ padding: 16 }}>
        {children}
      </div>
    </div>
  )
}

// Match Setup Screen Mockup
function MatchSetupMockup({ t }) {
  return (
    <ScreenMockup title={t('interactiveGuide.mockups.matchSetup')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Match Info Card */}
        <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#60a5fa' }}>
            {t('interactiveGuide.mockups.matchInfo')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 4 }}>
              <div style={{ opacity: 0.5, marginBottom: 2 }}>{t('interactiveGuide.mockups.gameNo')}</div>
              <div>2024-001</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 4 }}>
              <div style={{ opacity: 0.5, marginBottom: 2 }}>{t('interactiveGuide.mockups.dateTime')}</div>
              <div>14.01.2026 19:00</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 4 }}>
              <div style={{ opacity: 0.5, marginBottom: 2 }}>{t('interactiveGuide.mockups.location')}</div>
              <div>Zürich, Sportshalle</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 4 }}>
              <div style={{ opacity: 0.5, marginBottom: 2 }}>{t('interactiveGuide.mockups.league')}</div>
              <div>NLA</div>
            </div>
          </div>
        </div>

        {/* Teams Row */}
        <div style={{ display: 'flex', gap: 12 }}>
          {/* Team A Card */}
          <div style={{ flex: 1, background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#3b82f6' }}>
              {t('interactiveGuide.mockups.teamA')}
            </div>
            <div style={{ background: '#3b82f6', color: 'white', padding: '6px 10px', borderRadius: 4, fontSize: 14, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>
              VBC Zürich
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, display: 'flex', justifyContent: 'space-between' }}>
              <span>👥 12 {t('interactiveGuide.mockups.players')}</span>
              <span>✓ {t('interactiveGuide.mockups.rosterComplete')}</span>
            </div>
          </div>

          {/* Team B Card */}
          <div style={{ flex: 1, background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#ef4444' }}>
              {t('interactiveGuide.mockups.teamB')}
            </div>
            <div style={{ background: '#ef4444', color: 'white', padding: '6px 10px', borderRadius: 4, fontSize: 14, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>
              Volley Luzern
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, display: 'flex', justifyContent: 'space-between' }}>
              <span>👥 11 {t('interactiveGuide.mockups.players')}</span>
              <span>✓ {t('interactiveGuide.mockups.rosterComplete')}</span>
            </div>
          </div>
        </div>

        {/* Signatures Card */}
        <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#22c55e' }}>
            {t('interactiveGuide.mockups.signatures')}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 4, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontStyle: 'italic', opacity: 0.5 }}>✓ {t('interactiveGuide.mockups.signed')}</span>
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ opacity: 0.6, marginBottom: 4 }}>{t('interactiveGuide.mockups.captainA')}</div>
              <div style={{ background: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 4, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontStyle: 'italic', opacity: 0.5 }}>✓ {t('interactiveGuide.mockups.signed')}</span>
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 4, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.2)' }}>
                <span style={{ opacity: 0.4 }}>{t('interactiveGuide.mockups.tapToSign')}</span>
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ opacity: 0.6, marginBottom: 4 }}>{t('interactiveGuide.mockups.captainB')}</div>
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 4, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.2)' }}>
                <span style={{ opacity: 0.4 }}>{t('interactiveGuide.mockups.tapToSign')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Continue Button */}
        <button style={{
          background: 'linear-gradient(180deg, #4ade80 0%, #22c55e 100%)',
          border: 'none',
          borderRadius: 8,
          padding: '12px 24px',
          color: 'white',
          fontWeight: 600,
          fontSize: 14,
          cursor: 'default'
        }}>
          {t('interactiveGuide.mockups.continueToToss')} →
        </button>
      </div>
    </ScreenMockup>
  )
}

// Coin Toss Screen Mockup
function CoinTossMockup({ t }) {
  return (
    <ScreenMockup title={t('interactiveGuide.mockups.coinToss')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        {/* Teams */}
        <div style={{ display: 'flex', gap: 24, width: '100%', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
              margin: '0 auto 8px',
              border: '3px solid #60a5fa'
            }}>
              VBC Zürich
            </div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{t('interactiveGuide.mockups.teamA')}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 24, opacity: 0.3 }}>🪙</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
              margin: '0 auto 8px',
              border: '3px solid rgba(255,255,255,0.2)'
            }}>
              Volley Luzern
            </div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{t('interactiveGuide.mockups.teamB')}</div>
          </div>
        </div>

        {/* Selections */}
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
            <span style={{ opacity: 0.6 }}>{t('interactiveGuide.mockups.serve')}:</span>
            <span style={{ color: '#3b82f6', fontWeight: 600 }}>VBC Zürich 🏐</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ opacity: 0.6 }}>{t('interactiveGuide.mockups.leftSide')}:</span>
            <span style={{ color: '#3b82f6', fontWeight: 600 }}>VBC Zürich ←</span>
          </div>
        </div>

        {/* Captain Signatures */}
        <div style={{ display: 'flex', gap: 12, width: '100%' }}>
          <div style={{ flex: 1, background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>{t('interactiveGuide.mockups.captainA')}</div>
            <div style={{ fontStyle: 'italic', opacity: 0.5, fontSize: 12 }}>✓ {t('interactiveGuide.mockups.signed')}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>{t('interactiveGuide.mockups.captainB')}</div>
            <div style={{ fontStyle: 'italic', opacity: 0.5, fontSize: 12 }}>✓ {t('interactiveGuide.mockups.signed')}</div>
          </div>
        </div>

        {/* Start Match Button */}
        <button style={{
          background: 'linear-gradient(180deg, #4ade80 0%, #22c55e 100%)',
          border: 'none',
          borderRadius: 8,
          padding: '12px 32px',
          color: 'white',
          fontWeight: 600,
          fontSize: 14,
          cursor: 'default'
        }}>
          ▶ {t('interactiveGuide.mockups.startMatch')}
        </button>
      </div>
    </ScreenMockup>
  )
}

// Scoreboard Screen Mockup - Multiple states
function ScoreboardMockup({ t, state = 'normal' }) {
  // States: 'normal', 'rally', 'timeout', 'sanction'
  const getStatusBar = () => {
    switch (state) {
      case 'rally':
        return { bg: '#22c55e', text: t('interactiveGuide.mockups.rallyInProgress'), icon: '🏐' }
      case 'timeout':
        return { bg: '#eab308', text: t('interactiveGuide.mockups.timeout') + ' - 0:25', icon: '⏱️' }
      case 'sanction':
        return { bg: '#ef4444', text: t('interactiveGuide.mockups.sanction'), icon: '🟨' }
      default:
        return { bg: '#3b82f6', text: t('interactiveGuide.mockups.waitingForRally'), icon: '⏸️' }
    }
  }

  const status = getStatusBar()

  return (
    <ScreenMockup title={t('interactiveGuide.mockups.scoreboard') + ' - ' + status.text}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Status Bar */}
        <div style={{
          background: status.bg,
          padding: '8px 16px',
          borderRadius: 8,
          textAlign: 'center',
          fontWeight: 600,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8
        }}>
          <span>{status.icon}</span>
          <span>{status.text}</span>
        </div>

        {/* Main Score Display */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
          {/* Team 1 Team */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>VBC Zürich</div>
            <div style={{
              fontSize: 48,
              fontWeight: 700,
              color: '#3b82f6',
              lineHeight: 1,
              textShadow: '0 2px 8px rgba(59, 130, 246, 0.5)'
            }}>
              18
            </div>
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>TO: 1/2 | SUB: 3/6</div>
          </div>

          {/* Serve Indicator & Set Score */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 20,
              marginBottom: 4,
              animation: state === 'rally' ? 'bounce 1s infinite' : 'none'
            }}>
              🏐
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>2 : 1</div>
            <div style={{ fontSize: 10, opacity: 0.5 }}>{t('interactiveGuide.mockups.sets')}</div>
          </div>

          {/* team2 Team */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Volley Luzern</div>
            <div style={{
              fontSize: 48,
              fontWeight: 700,
              color: '#ef4444',
              lineHeight: 1,
              textShadow: '0 2px 8px rgba(239, 68, 68, 0.5)'
            }}>
              15
            </div>
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>TO: 0/2 | SUB: 2/6</div>
          </div>
        </div>

        {/* Court Visualization */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {/* Left Court */}
          <div style={{
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: 8,
            padding: 8,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 28px)',
            gap: 4
          }}>
            {[4, 8, 12, 6, 1, 10].map((num, i) => (
              <div key={i} style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600
              }}>
                {num}
              </div>
            ))}
          </div>

          {/* Net */}
          <div style={{ width: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2 }} />

          {/* Right Court */}
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            padding: 8,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 28px)',
            gap: 4
          }}>
            {[2, 9, 3, 11, 5, 7].map((num, i) => (
              <div key={i} style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600
              }}>
                {num}
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons Row */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button style={{
            padding: '8px 16px',
            background: state === 'rally' ? 'rgba(107, 114, 128, 0.3)' : 'linear-gradient(180deg, #4ade80 0%, #22c55e 100%)',
            border: 'none',
            borderRadius: 6,
            color: 'white',
            fontSize: 12,
            fontWeight: 600,
            opacity: state === 'rally' ? 0.5 : 1,
            cursor: 'default'
          }}>
            ▶ {t('interactiveGuide.demos.startRally')}
          </button>
          <button style={{
            padding: '8px 16px',
            background: state !== 'rally' ? 'rgba(107, 114, 128, 0.3)' : '#3b82f6',
            border: 'none',
            borderRadius: 6,
            color: 'white',
            fontSize: 12,
            fontWeight: 600,
            opacity: state !== 'rally' ? 0.5 : 1,
            cursor: 'default'
          }}>
            + {t('interactiveGuide.mockups.point')}
          </button>
          <button style={{
            padding: '8px 16px',
            background: 'rgba(234, 179, 8, 0.3)',
            border: '1px solid #eab308',
            borderRadius: 6,
            color: '#eab308',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'default'
          }}>
            ⏱️ TO
          </button>
          <button style={{
            padding: '8px 16px',
            background: 'rgba(239, 68, 68, 0.3)',
            border: '1px solid #ef4444',
            borderRadius: 6,
            color: '#ef4444',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'default'
          }}>
            ↩️ {t('interactiveGuide.demos.undo')}
          </button>
        </div>

        {/* Timeout Overlay (conditional) */}
        {state === 'timeout' && (
          <div style={{
            background: 'rgba(234, 179, 8, 0.2)',
            border: '2px solid #eab308',
            borderRadius: 12,
            padding: 16,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 40, fontWeight: 700, color: '#eab308' }}>0:25</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>VBC Zürich - Timeout 1/2</div>
            <button style={{
              marginTop: 12,
              padding: '8px 24px',
              background: '#eab308',
              border: 'none',
              borderRadius: 6,
              color: 'black',
              fontWeight: 600,
              cursor: 'default'
            }}>
              {t('interactiveGuide.mockups.stopTimeout')}
            </button>
          </div>
        )}

        {/* Sanction Overlay (conditional) */}
        {state === 'sanction' && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.2)',
            border: '2px solid #ef4444',
            borderRadius: 12,
            padding: 16,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{t('interactiveGuide.mockups.selectSanction')}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <div style={{ padding: '8px 16px', background: '#eab308', borderRadius: 6, fontWeight: 600, cursor: 'default' }}>
                🟨 {t('interactiveGuide.scoreboard.warning')}
              </div>
              <div style={{ padding: '8px 16px', background: '#ef4444', borderRadius: 6, fontWeight: 600, cursor: 'default' }}>
                🟥 {t('interactiveGuide.scoreboard.penalty')}
              </div>
            </div>
          </div>
        )}
      </div>
    </ScreenMockup>
  )
}

// Match End Screen Mockup
function MatchEndMockup({ t }) {
  return (
    <ScreenMockup title={t('interactiveGuide.mockups.matchEnd')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        {/* Winner Banner */}
        <div style={{
          background: 'linear-gradient(180deg, rgba(34, 197, 94, 0.3) 0%, rgba(34, 197, 94, 0.1) 100%)',
          border: '2px solid #22c55e',
          borderRadius: 12,
          padding: 16,
          width: '100%',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{t('interactiveGuide.mockups.winner')}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>VBC Zürich</div>
        </div>

        {/* Final Score - Beach volleyball is best-of-3 */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>VBC Zürich</div>
            <div style={{ fontSize: 48, fontWeight: 700, color: '#3b82f6' }}>2</div>
          </div>
          <div style={{ fontSize: 20, opacity: 0.3 }}>:</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Volley Luzern</div>
            <div style={{ fontSize: 48, fontWeight: 700, color: '#ef4444' }}>1</div>
          </div>
        </div>

        {/* Set Scores - Beach volleyball is best-of-3 */}
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, opacity: 0.7 }}>{t('interactiveGuide.mockups.setScores')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', fontSize: 14 }}>
            <div><span style={{ opacity: 0.5 }}>Set 1:</span> <strong style={{ color: '#3b82f6' }}>21</strong>-18</div>
            <div><span style={{ opacity: 0.5 }}>Set 2:</span> 19-<strong style={{ color: '#ef4444' }}>21</strong></div>
            <div><span style={{ opacity: 0.5 }}>Set 3:</span> <strong style={{ color: '#3b82f6' }}>15</strong>-12</div>
          </div>
        </div>

        {/* Signatures Section */}
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, opacity: 0.7 }}>{t('interactiveGuide.mockups.finalSignatures')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 11 }}>
            <div style={{ padding: 8, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 4, textAlign: 'center' }}>
              {t('interactiveGuide.mockups.captainA')}: ✓
            </div>
            <div style={{ padding: 8, background: 'rgba(239, 68, 68, 0.1)', borderRadius: 4, textAlign: 'center' }}>
              {t('interactiveGuide.mockups.captainB')}: ✓
            </div>
            <div style={{ padding: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, textAlign: 'center' }}>
              {t('interactiveGuide.mockups.referee1')}: ✓
            </div>
            <div style={{ padding: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, textAlign: 'center' }}>
              {t('interactiveGuide.mockups.scorer')}: ✓
            </div>
          </div>
        </div>

        {/* Export Buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button style={{
            padding: '10px 20px',
            background: 'linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'default'
          }}>
            📄 {t('interactiveGuide.mockups.exportPdf')}
          </button>
          <button style={{
            padding: '10px 20px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            color: 'white',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'default'
          }}>
            💾 {t('interactiveGuide.mockups.exportJson')}
          </button>
          <button style={{
            padding: '10px 20px',
            background: 'linear-gradient(180deg, #4ade80 0%, #22c55e 100%)',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'default'
          }}>
            ☁️ {t('interactiveGuide.mockups.uploadCloud')}
          </button>
        </div>
      </div>
    </ScreenMockup>
  )
}

// Tip Box Component
function TipBox({ children, type = 'tip' }) {
  const colors = {
    tip: { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', icon: '💡' },
    warning: { bg: 'rgba(234, 179, 8, 0.15)', border: '#eab308', icon: '⚠️' },
    important: { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', icon: '❗' },
    success: { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e', icon: '✓' }
  }

  const c = colors[type] || colors.tip

  return (
    <div style={{
      padding: 12,
      background: c.bg,
      borderLeft: `3px solid ${c.border}`,
      borderRadius: '0 6px 6px 0',
      marginTop: 12,
      marginBottom: 12,
      fontSize: 13,
      lineHeight: 1.5,
      display: 'flex',
      gap: 8
    }}>
      <span>{c.icon}</span>
      <div>{children}</div>
    </div>
  )
}

// Step List Component
function StepList({ steps }) {
  return (
    <ol style={{ paddingLeft: 20, margin: '12px 0', lineHeight: 1.8 }}>
      {steps.map((step, i) => (
        <li key={i} style={{ marginBottom: 8, fontSize: 14 }}>{step}</li>
      ))}
    </ol>
  )
}

// Keyboard Shortcut Table
function ShortcutTable({ shortcuts, t }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>{t('interactiveGuide.table.action')}</th>
            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>{t('interactiveGuide.table.key')}</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>{t('interactiveGuide.table.description')}</th>
          </tr>
        </thead>
        <tbody>
          {shortcuts.map((s, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '8px 12px' }}>{s.action}</td>
              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                <kbd style={{
                  padding: '4px 8px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: 4,
                  fontFamily: 'monospace',
                  fontSize: 12
                }}>{s.key}</kbd>
              </td>
              <td style={{ padding: '8px 12px', opacity: 0.7 }}>{s.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Navigation Sidebar
function NavSidebar({ sections, activeSection, onSectionClick }) {
  return (
    <div style={{
      width: 200,
      flexShrink: 0,
      borderRight: '1px solid rgba(255,255,255,0.1)',
      padding: '8px 0',
      position: 'sticky',
      top: 0,
      maxHeight: '80vh',
      overflowY: 'auto'
    }}>
      {sections.map((section, i) => (
        <button
          key={i}
          onClick={() => onSectionClick(section.id)}
          style={{
            display: 'block',
            width: '100%',
            padding: '10px 16px',
            background: activeSection === section.id ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            border: 'none',
            borderLeft: activeSection === section.id ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeSection === section.id ? '#fff' : 'rgba(255,255,255,0.6)',
            fontSize: 13,
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <span style={{ marginRight: 8 }}>{section.icon}</span>
          {section.title}
        </button>
      ))}
    </div>
  )
}

// Main Component
export default function InteractiveGuide({ open, onClose }) {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] = useState('quickstart')
  const contentRef = useRef(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const sections = [
    { id: 'quickstart', title: t('interactiveGuide.sections.quickstart'), icon: '🚀' },
    { id: 'home', title: t('interactiveGuide.sections.home'), icon: '🏠' },
    { id: 'setup', title: t('interactiveGuide.sections.setup'), icon: '📋' },
    { id: 'cointoss', title: t('interactiveGuide.sections.cointoss'), icon: '🪙' },
    { id: 'scoreboard', title: t('interactiveGuide.sections.scoreboard'), icon: '📊' },
    { id: 'matchend', title: t('interactiveGuide.sections.matchend'), icon: '🏆' },
    { id: 'shortcuts', title: t('interactiveGuide.sections.shortcuts'), icon: '⌨️' },
    { id: 'settings', title: t('interactiveGuide.sections.settings'), icon: '⚙️' },
    { id: 'troubleshooting', title: t('interactiveGuide.sections.troubleshooting'), icon: '🔧' },
    { id: 'dashboards', title: t('interactiveGuide.sections.dashboards'), icon: '📱' }
  ]

  const scrollToSection = (sectionId) => {
    setActiveSection(sectionId)
    const element = document.getElementById(`guide-section-${sectionId}`)
    if (element && contentRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Inject animation styles
  useEffect(() => {
    if (open) {
      const styleEl = document.createElement('style')
      styleEl.id = 'interactive-guide-animations'
      styleEl.textContent = animationStyles
      document.head.appendChild(styleEl)
      return () => {
        const el = document.getElementById('interactive-guide-animations')
        if (el) el.remove()
      }
    }
  }, [open])

  return (
    <Modal
      title={t('interactiveGuide.title')}
      open={open}
      onClose={onClose}
      width={1100}
    >
      <div style={{
        display: 'flex',
        maxHeight: '80vh',
        minHeight: 500
      }}>
        {/* Navigation Sidebar - Hidden on mobile */}
        {!isMobile && (
          <NavSidebar
            sections={sections}
            activeSection={activeSection}
            onSectionClick={scrollToSection}
          />
        )}

        {/* Main Content */}
        <div
          ref={contentRef}
          style={{
            flex: 1,
            padding: isMobile ? 16 : 24,
            overflowY: 'auto',
            lineHeight: 1.6
          }}
        >
          {/* Mobile Section Selector */}
          {isMobile && (
            <select
              value={activeSection}
              onChange={(e) => scrollToSection(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                marginBottom: 16,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 6,
                color: 'white',
                fontSize: 14
              }}
            >
              {sections.map(s => (
                <option key={s.id} value={s.id}>{s.icon} {s.title}</option>
              ))}
            </select>
          )}

          {/* ==================== QUICK START ==================== */}
          <div id="guide-section-quickstart">
            <h2 style={{ fontSize: 22, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              🚀 {t('interactiveGuide.sections.quickstart')}
            </h2>

            <p style={{ marginBottom: 16, fontSize: 15 }}>
              {t('interactiveGuide.quickstart.intro')}
            </p>

            <h3 style={{ fontSize: 16, marginTop: 20, marginBottom: 12 }}>
              {t('interactiveGuide.quickstart.flowTitle')}
            </h3>

            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 16,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 8,
              marginBottom: 16
            }}>
              {[
                `🏠 ${t('interactiveGuide.sections.home')}`,
                `📋 ${t('interactiveGuide.sections.setup')}`,
                `🪙 ${t('interactiveGuide.sections.cointoss')}`,
                `📊 ${t('interactiveGuide.sections.scoreboard')}`,
                `🏆 ${t('interactiveGuide.sections.matchend')}`
              ].map((step, i, arr) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    padding: '8px 14px',
                    background: 'rgba(59, 130, 246, 0.2)',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500
                  }}>
                    {step}
                  </div>
                  {i < arr.length - 1 && <span style={{ fontSize: 18, opacity: 0.5 }}>→</span>}
                </div>
              ))}
            </div>

            <TipBox type="tip">
              {t('interactiveGuide.quickstart.tip')}
            </TipBox>
          </div>

          {/* ==================== HOME PAGE ==================== */}
          <div id="guide-section-home" style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 22, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              🏠 {t('interactiveGuide.sections.home')}
            </h2>

            <p style={{ marginBottom: 16 }}>
              {t('interactiveGuide.home.intro')}
            </p>

            <Section title={t('interactiveGuide.home.newMatch')} icon="➕" defaultOpen>
              <p>{t('interactiveGuide.home.newMatchDesc')}</p>

              <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200, padding: 16, background: 'rgba(34, 197, 94, 0.1)', borderRadius: 8, border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#22c55e' }}>
                    {t('interactiveGuide.home.officialMatch')}
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    <li>{t('interactiveGuide.home.officialReq1')}</li>
                    <li>{t('interactiveGuide.home.officialReq2')}</li>
                    <li>{t('interactiveGuide.home.officialReq3')}</li>
                    <li>{t('interactiveGuide.home.officialReq4')}</li>
                    <li>{t('interactiveGuide.home.officialReq5')}</li>
                  </ul>
                </div>
                <div style={{ flex: 1, minWidth: 200, padding: 16, background: 'rgba(234, 179, 8, 0.1)', borderRadius: 8, border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#eab308' }}>
                    {t('interactiveGuide.home.testMatch')}
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    <li>{t('interactiveGuide.home.testReq1')}</li>
                    <li>{t('interactiveGuide.home.testReq2')}</li>
                    <li>{t('interactiveGuide.home.testReq3')}</li>
                    <li>{t('interactiveGuide.home.testReq4')}</li>
                    <li>{t('interactiveGuide.home.testReq5')}</li>
                  </ul>
                </div>
              </div>
            </Section>

            <Section title={t('interactiveGuide.home.matchActions')} icon="⚡">
              <ul style={{ paddingLeft: 20 }}>
                <li><strong>{t('interactiveGuide.home.continue')}</strong> - {t('interactiveGuide.home.continueDesc')}</li>
                <li><strong>{t('interactiveGuide.home.delete')}</strong> - {t('interactiveGuide.home.deleteDesc')}</li>
                <li><strong>{t('interactiveGuide.home.restore')}</strong> - {t('interactiveGuide.home.restoreDesc')}</li>
              </ul>
            </Section>
          </div>

          {/* ==================== MATCH SETUP ==================== */}
          <div id="guide-section-setup" style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 22, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              📋 {t('interactiveGuide.sections.setup')}
            </h2>

            <p style={{ marginBottom: 16 }}>
              {t('interactiveGuide.setup.intro')}
            </p>

            {/* Visual Mockup of Match Setup Screen */}
            <div style={{ marginBottom: 24 }}>
              <MatchSetupMockup t={t} />
            </div>

            <Section title={t('interactiveGuide.setup.matchInfo')} icon="ℹ️" defaultOpen>
              <p>{t('interactiveGuide.setup.matchInfoDesc')}</p>
              <ul style={{ paddingLeft: 20 }}>
                <li><strong>{t('interactiveGuide.setup.gameNumber')}</strong> - {t('interactiveGuide.setup.gameNumberDesc')}</li>
                <li><strong>{t('interactiveGuide.setup.dateTime')}</strong> - {t('interactiveGuide.setup.dateTimeDesc')}</li>
                <li><strong>{t('interactiveGuide.setup.location')}</strong> - {t('interactiveGuide.setup.locationDesc')}</li>
                <li><strong>{t('interactiveGuide.setup.league')}</strong> - {t('interactiveGuide.setup.leagueDesc')}</li>
              </ul>
            </Section>

            <Section title={t('interactiveGuide.setup.teams')} icon="👥">
              <StepList steps={[
                t('interactiveGuide.setup.teamStep1'),
                t('interactiveGuide.setup.teamStep2'),
                t('interactiveGuide.setup.teamStep3')
              ]} />
            </Section>

            <Section title={t('interactiveGuide.setup.roster')} icon="📝">
              <p>{t('interactiveGuide.setup.rosterDesc')}</p>

              <h4 style={{ marginTop: 16 }}>{t('interactiveGuide.setup.addingPlayers')}</h4>
              <StepList steps={[
                t('interactiveGuide.setup.playerStep1'),
                t('interactiveGuide.setup.playerStep2'),
                t('interactiveGuide.setup.playerStep3'),
                t('interactiveGuide.setup.playerStep4'),
                t('interactiveGuide.setup.playerStep5')
              ]} />

              <TipBox type="tip">
                {t('interactiveGuide.setup.pdfTip')}
              </TipBox>

              <TipBox type="important">
                {t('interactiveGuide.setup.minPlayers')}
              </TipBox>
            </Section>

            <Section title={t('interactiveGuide.setup.signatures')} icon="✍️">
              <p>{t('interactiveGuide.setup.signaturesDesc')}</p>
              <ul style={{ paddingLeft: 20 }}>
                <li>{t('interactiveGuide.setup.sig1')}</li>
                <li>{t('interactiveGuide.setup.sig2')}</li>
              </ul>
              <p style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
                {t('interactiveGuide.setup.sigNote')}
              </p>
            </Section>
          </div>

          {/* ==================== COIN TOSS ==================== */}
          <div id="guide-section-cointoss" style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 22, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              🪙 {t('interactiveGuide.sections.cointoss')}
            </h2>

            <p style={{ marginBottom: 16 }}>
              {t('interactiveGuide.cointoss.intro')}
            </p>

            {/* Visual Mockup of Coin Toss Screen */}
            <div style={{ marginBottom: 24 }}>
              <CoinTossMockup t={t} />
            </div>

            <Section title={t('interactiveGuide.cointoss.howTo')} icon="🎯" defaultOpen>
              <StepList steps={[
                t('interactiveGuide.cointoss.step1'),
                t('interactiveGuide.cointoss.step2'),
                t('interactiveGuide.cointoss.step3'),
                t('interactiveGuide.cointoss.step4'),
                t('interactiveGuide.cointoss.step5'),
                t('interactiveGuide.cointoss.step6')
              ]} />
            </Section>

            <TipBox type="tip">
              {t('interactiveGuide.cointoss.set3Tip')}
            </TipBox>
          </div>

          {/* ==================== SCOREBOARD ==================== */}
          <div id="guide-section-scoreboard" style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 22, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              📊 {t('interactiveGuide.sections.scoreboard')}
            </h2>

            <p style={{ marginBottom: 16 }}>
              {t('interactiveGuide.scoreboard.intro')}
            </p>

            {/* Visual Mockups of Scoreboard in Different States */}
            <Section title={t('interactiveGuide.mockups.screenStates')} icon="📸" defaultOpen>
              <p style={{ marginBottom: 16, fontSize: 13, opacity: 0.8 }}>
                {t('interactiveGuide.mockups.screenStatesDesc')}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Normal State */}
                <div>
                  <h4 style={{ marginBottom: 8, fontSize: 14, color: '#3b82f6' }}>
                    {t('interactiveGuide.mockups.stateNormal')}
                  </h4>
                  <ScoreboardMockup t={t} state="normal" />
                </div>

                {/* Rally Active State */}
                <div>
                  <h4 style={{ marginBottom: 8, fontSize: 14, color: '#22c55e' }}>
                    {t('interactiveGuide.mockups.stateRally')}
                  </h4>
                  <ScoreboardMockup t={t} state="rally" />
                </div>

                {/* Timeout State */}
                <div>
                  <h4 style={{ marginBottom: 8, fontSize: 14, color: '#eab308' }}>
                    {t('interactiveGuide.mockups.stateTimeout')}
                  </h4>
                  <ScoreboardMockup t={t} state="timeout" />
                </div>

                {/* Sanction State */}
                <div>
                  <h4 style={{ marginBottom: 8, fontSize: 14, color: '#ef4444' }}>
                    {t('interactiveGuide.mockups.stateSanction')}
                  </h4>
                  <ScoreboardMockup t={t} state="sanction" />
                </div>
              </div>
            </Section>

            <Section title={t('interactiveGuide.scoreboard.courtLayout')} icon="🏐">
              <p style={{ marginBottom: 16 }}>
                {t('interactiveGuide.scoreboard.courtDesc')}
              </p>
              <CourtDemo t={t} />
            </Section>

            <Section title={t('interactiveGuide.scoreboard.recordingPoints')} icon="📈">
              <p>{t('interactiveGuide.scoreboard.pointsDesc')}</p>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                <ScoreDemo t={t} />
              </div>

              <TipBox type="tip">
                {t('interactiveGuide.scoreboard.pointsTip')}
              </TipBox>
            </Section>

            <Section title={t('interactiveGuide.scoreboard.startingRallies')} icon="▶️">
              <p>{t('interactiveGuide.scoreboard.ralliesDesc')}</p>

              <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <DemoButton label={t('interactiveGuide.demos.startSet')} color="#22c55e" />
                  <p style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>{t('interactiveGuide.scoreboard.startSetDesc')}</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <DemoButton label={t('interactiveGuide.demos.startRally')} color="#3b82f6" />
                  <p style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>{t('interactiveGuide.scoreboard.startRallyDesc')}</p>
                </div>
              </div>

              <h4 style={{ marginTop: 24, marginBottom: 12 }}>{t('interactiveGuide.buttonDemo.tryIt')}</h4>
              <ButtonStateDemo t={t} />

              <TipBox type="warning">
                {t('interactiveGuide.scoreboard.lineupWarning')}
              </TipBox>
            </Section>

            <Section title={t('interactiveGuide.scoreboard.timeouts')} icon="⏱️">
              <p>{t('interactiveGuide.scoreboard.timeoutsDesc')}</p>

              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                <CountdownDemo t={t} />
              </div>

              <StepList steps={[
                t('interactiveGuide.scoreboard.toStep1'),
                t('interactiveGuide.scoreboard.toStep2'),
                t('interactiveGuide.scoreboard.toStep3')
              ]} />

              <h4 style={{ marginTop: 24, marginBottom: 12 }}>{t('interactiveGuide.timeoutDemo.tryIt')}</h4>
              <TimeoutAvailabilityDemo t={t} />

              <TipBox type="tip">
                {t('interactiveGuide.scoreboard.toTip')}
              </TipBox>
            </Section>

            <Section title={t('interactiveGuide.scoreboard.sanctions')} icon="🟨">
              <p>{t('interactiveGuide.scoreboard.sanctionsDesc')}</p>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <td style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 20, height: 20, background: '#eab308', borderRadius: 4 }}></span>
                      <strong>{t('interactiveGuide.scoreboard.warning')}</strong>
                    </td>
                    <td style={{ padding: 8, opacity: 0.8 }}>{t('interactiveGuide.scoreboard.warningDesc')}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <td style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 20, height: 20, background: '#ef4444', borderRadius: 4 }}></span>
                      <strong>{t('interactiveGuide.scoreboard.penalty')}</strong>
                    </td>
                    <td style={{ padding: 8, opacity: 0.8 }}>{t('interactiveGuide.scoreboard.penaltyDesc')}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <td style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 20, height: 20, background: '#ef4444', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 10 }}>E</span>
                      <strong>{t('interactiveGuide.scoreboard.expulsion')}</strong>
                    </td>
                    <td style={{ padding: 8, opacity: 0.8 }}>{t('interactiveGuide.scoreboard.expulsionDesc')}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 20, height: 20, background: '#000', border: '2px solid #ef4444', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 10 }}>D</span>
                      <strong>{t('interactiveGuide.scoreboard.disqualification')}</strong>
                    </td>
                    <td style={{ padding: 8, opacity: 0.8 }}>{t('interactiveGuide.scoreboard.disqualificationDesc')}</td>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Section title={t('interactiveGuide.scoreboard.undo')} icon="↩️">
              <p>{t('interactiveGuide.scoreboard.undoDesc')}</p>

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                <DemoButton label={t('interactiveGuide.demos.undo')} color="#ef4444" />
              </div>

              <TipBox type="tip">
                {t('interactiveGuide.scoreboard.undoTip')}
              </TipBox>
            </Section>

            <Section title={t('interactiveGuide.scoreboard.rotation')} icon="🔃">
              <p style={{ marginBottom: 16 }}>
                {t('interactiveGuide.scoreboard.rotationDesc')}
              </p>
              <CourtDemo animateRotation t={t} />
            </Section>

            <Section title={t('interactiveGuide.scoreboard.set3')} icon="3️⃣">
              <p>{t('interactiveGuide.scoreboard.set3Desc')}</p>
              <ul style={{ paddingLeft: 20 }}>
                <li>{t('interactiveGuide.scoreboard.set3Rule1')}</li>
                <li>{t('interactiveGuide.scoreboard.set3Rule2')}</li>
                <li>{t('interactiveGuide.scoreboard.set3Rule3')}</li>
              </ul>
            </Section>
          </div>

          {/* ==================== MATCH END ==================== */}
          <div id="guide-section-matchend" style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 22, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              🏆 {t('interactiveGuide.sections.matchend')}
            </h2>

            <p style={{ marginBottom: 16 }}>
              {t('interactiveGuide.matchend.intro')}
            </p>

            {/* Visual Mockup of Match End Screen */}
            <div style={{ marginBottom: 24 }}>
              <MatchEndMockup t={t} />
            </div>

            <Section title={t('interactiveGuide.matchend.results')} icon="📋" defaultOpen>
              <p>{t('interactiveGuide.matchend.resultsDesc')}</p>
              <ul style={{ paddingLeft: 20 }}>
                <li>{t('interactiveGuide.matchend.result1')}</li>
                <li>{t('interactiveGuide.matchend.result2')}</li>
                <li>{t('interactiveGuide.matchend.result3')}</li>
                <li>{t('interactiveGuide.matchend.result4')}</li>
                <li>{t('interactiveGuide.matchend.result5')}</li>
              </ul>
            </Section>

            <Section title={t('interactiveGuide.matchend.signatures')} icon="✍️">
              <p>{t('interactiveGuide.matchend.signaturesDesc')}</p>
              <StepList steps={[
                t('interactiveGuide.matchend.sigStep1'),
                t('interactiveGuide.matchend.sigStep2'),
                t('interactiveGuide.matchend.sigStep3'),
                t('interactiveGuide.matchend.sigStep4'),
                t('interactiveGuide.matchend.sigStep5')
              ]} />
            </Section>

            <Section title={t('interactiveGuide.matchend.export')} icon="💾">
              <ul style={{ paddingLeft: 20 }}>
                <li><strong>{t('interactiveGuide.matchend.exportJson')}</strong> - {t('interactiveGuide.matchend.exportJsonDesc')}</li>
                <li><strong>{t('interactiveGuide.matchend.exportPdf')}</strong> - {t('interactiveGuide.matchend.exportPdfDesc')}</li>
                <li><strong>{t('interactiveGuide.matchend.exportCloud')}</strong> - {t('interactiveGuide.matchend.exportCloudDesc')}</li>
              </ul>
            </Section>

            <Section title={t('interactiveGuide.matchend.reopen')} icon="🔓">
              <p>{t('interactiveGuide.matchend.reopenDesc')}</p>
              <TipBox type="warning">
                {t('interactiveGuide.matchend.reopenWarning')}
              </TipBox>
            </Section>
          </div>

          {/* ==================== KEYBOARD SHORTCUTS ==================== */}
          <div id="guide-section-shortcuts" style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 22, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              ⌨️ {t('interactiveGuide.sections.shortcuts')}
            </h2>

            <p style={{ marginBottom: 16 }}>
              {t('interactiveGuide.shortcuts.intro')}
            </p>

            <ShortcutTable t={t} shortcuts={[
              { action: t('interactiveGuide.shortcuts.pointLeft'), key: 'A', description: t('interactiveGuide.shortcuts.pointLeftDesc') },
              { action: t('interactiveGuide.shortcuts.pointRight'), key: 'L', description: t('interactiveGuide.shortcuts.pointRightDesc') },
              { action: t('interactiveGuide.shortcuts.timeoutLeft'), key: 'Q', description: t('interactiveGuide.shortcuts.timeoutLeftDesc') },
              { action: t('interactiveGuide.shortcuts.timeoutRight'), key: 'P', description: t('interactiveGuide.shortcuts.timeoutRightDesc') },
              { action: t('interactiveGuide.shortcuts.undo'), key: 'Z', description: t('interactiveGuide.shortcuts.undoDesc') },
              { action: t('interactiveGuide.shortcuts.startRally'), key: 'Enter', description: t('interactiveGuide.shortcuts.startRallyDesc') },
              { action: t('interactiveGuide.shortcuts.cancel'), key: 'Esc', description: t('interactiveGuide.shortcuts.cancelDesc') }
            ]} />

            <TipBox type="tip">
              {t('interactiveGuide.shortcuts.customizeTip')}
            </TipBox>
          </div>

          {/* ==================== SETTINGS ==================== */}
          <div id="guide-section-settings" style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 22, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              ⚙️ {t('interactiveGuide.sections.settings')}
            </h2>

            <Section title={t('interactiveGuide.settings.safety')} icon="🛡️" defaultOpen>
              <ul style={{ paddingLeft: 20 }}>
                <li><strong>{t('interactiveGuide.settings.accidentalRally')}</strong> - {t('interactiveGuide.settings.accidentalRallyDesc')}</li>
                <li><strong>{t('interactiveGuide.settings.accidentalPoint')}</strong> - {t('interactiveGuide.settings.accidentalPointDesc')}</li>
              </ul>
            </Section>

            <Section title={t('interactiveGuide.settings.display')} icon="📱">
              <ul style={{ paddingLeft: 20 }}>
                <li><strong>{t('interactiveGuide.settings.desktop')}</strong> - {t('interactiveGuide.settings.desktopDesc')}</li>
                <li><strong>{t('interactiveGuide.settings.tablet')}</strong> - {t('interactiveGuide.settings.tabletDesc')}</li>
                <li><strong>{t('interactiveGuide.settings.smartphone')}</strong> - {t('interactiveGuide.settings.smartphoneDesc')}</li>
              </ul>
            </Section>

            <Section title={t('interactiveGuide.settings.backup')} icon="💾">
              <p>{t('interactiveGuide.settings.backupDesc')}</p>
              <ul style={{ paddingLeft: 20 }}>
                <li><strong>{t('interactiveGuide.settings.autoBackup')}</strong> - {t('interactiveGuide.settings.autoBackupDesc')}</li>
                <li><strong>{t('interactiveGuide.settings.eventBackup')}</strong> - {t('interactiveGuide.settings.eventBackupDesc')}</li>
              </ul>
            </Section>
          </div>

          {/* ==================== TROUBLESHOOTING ==================== */}
          <div id="guide-section-troubleshooting" style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 22, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              🔧 {t('interactiveGuide.sections.troubleshooting')}
            </h2>

            <p style={{ marginBottom: 16 }}>
              {t('interactiveGuide.troubleshooting.intro')}
            </p>

            <Section title={t('interactiveGuide.troubleshooting.matchIssues')} icon="📊" defaultOpen>
              <QAItem
                question={t('interactiveGuide.troubleshooting.q1')}
                answer={t('interactiveGuide.troubleshooting.a1')}
              />
              <QAItem
                question={t('interactiveGuide.troubleshooting.q2')}
                answer={t('interactiveGuide.troubleshooting.a2')}
              />
              <QAItem
                question={t('interactiveGuide.troubleshooting.q3')}
                answer={t('interactiveGuide.troubleshooting.a3')}
              />
              <QAItem
                question={t('interactiveGuide.troubleshooting.q4')}
                answer={t('interactiveGuide.troubleshooting.a4')}
              />
            </Section>

            <Section title={t('interactiveGuide.troubleshooting.connectionIssues')} icon="🌐">
              <QAItem
                question={t('interactiveGuide.troubleshooting.q11')}
                answer={t('interactiveGuide.troubleshooting.a11')}
              />
              <QAItem
                question={t('interactiveGuide.troubleshooting.q12')}
                answer={t('interactiveGuide.troubleshooting.a12')}
              />
              <QAItem
                question={t('interactiveGuide.troubleshooting.q13')}
                answer={t('interactiveGuide.troubleshooting.a13')}
              />
            </Section>

            <Section title={t('interactiveGuide.troubleshooting.recovery')} icon="💾">
              <QAItem
                question={t('interactiveGuide.troubleshooting.q14')}
                answer={t('interactiveGuide.troubleshooting.a14')}
              />
              <QAItem
                question={t('interactiveGuide.troubleshooting.q15')}
                answer={t('interactiveGuide.troubleshooting.a15')}
              />
              <QAItem
                question={t('interactiveGuide.troubleshooting.q16')}
                answer={t('interactiveGuide.troubleshooting.a16')}
              />
            </Section>
          </div>

          {/* ==================== DASHBOARDS ==================== */}
          <div id="guide-section-dashboards" style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 22, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              📱 {t('interactiveGuide.sections.dashboards')}
            </h2>

            <p style={{ marginBottom: 16 }}>
              {t('interactiveGuide.dashboards.intro')}
            </p>

            <Section title={t('interactiveGuide.dashboards.referee')} icon="👨‍⚖️" defaultOpen>
              <p>{t('interactiveGuide.dashboards.refereeDesc')}</p>
              <StepList steps={[
                t('interactiveGuide.dashboards.refStep1'),
                t('interactiveGuide.dashboards.refStep2'),
                t('interactiveGuide.dashboards.refStep3'),
                t('interactiveGuide.dashboards.refStep4')
              ]} />
              <TipBox type="tip">
                {t('interactiveGuide.dashboards.refTip')}
              </TipBox>
            </Section>

            <Section title={t('interactiveGuide.dashboards.connection')} icon="🔗">
              <ul style={{ paddingLeft: 20 }}>
                <li><strong>{t('interactiveGuide.dashboards.lan')}</strong> - {t('interactiveGuide.dashboards.lanDesc')}</li>
                <li><strong>{t('interactiveGuide.dashboards.cloud')}</strong> - {t('interactiveGuide.dashboards.cloudDesc')}</li>
              </ul>
            </Section>
          </div>

          {/* Footer */}
          <div style={{
            marginTop: 40,
            paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,0.1)',
            textAlign: 'center',
            opacity: 0.6,
            fontSize: 12
          }}>
            {t('interactiveGuide.footer')}
          </div>
        </div>
      </div>
    </Modal>
  )
}
