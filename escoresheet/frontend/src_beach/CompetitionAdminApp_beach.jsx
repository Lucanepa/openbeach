import { useState } from 'react'
import { useAuth } from './contexts_beach/AuthContext_beach'
import CompetitionList from './components_beach/admin/CompetitionList_beach'
import ExcelUpload from './components_beach/admin/ExcelUpload_beach'
import CompMatchEditor from './components_beach/admin/CompMatchEditor_beach'

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 20px',
  background: '#111827',
  borderBottom: '1px solid #1f2937'
}

const navBtnStyle = (active) => ({
  padding: '8px 16px',
  background: active ? '#3b82f6' : 'transparent',
  color: active ? '#fff' : '#9ca3af',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer'
})

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 8,
  color: '#e5e7eb',
  fontSize: 16,
  outline: 'none',
  boxSizing: 'border-box'
}

const buttonStyle = {
  width: '100%',
  padding: '12px 16px',
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 16,
  cursor: 'pointer'
}

function AdminLogin() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await signIn(email, password)
    if (err) setError(err.message)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0b1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(90vw, 400px)', background: '#111827', border: '2px solid #7c3aed', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: 'rgba(124, 58, 237, 0.1)', borderBottom: '1px solid rgba(124, 58, 237, 0.3)' }}>
          <img src="/openbeach_no_bg.png" alt="openBeach" style={{ width: 32, height: 32 }} />
          <h2 style={{ margin: 0, color: '#fff', fontSize: 20, fontWeight: 600 }}>Competition Admin</h2>
        </div>
        <div style={{ padding: 20 }}>
          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, color: '#ef4444', marginBottom: 16, fontSize: 14 }}>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={inputStyle} required />
            </div>
            <div style={{ marginBottom: 16 }}>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" style={inputStyle} required />
            </div>
            <button type="submit" style={{ ...buttonStyle, background: '#7c3aed' }} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In as Admin'}
            </button>
          </form>
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <a href="/" style={{ color: '#9ca3af', fontSize: 14, textDecoration: 'underline' }}>Back to Scorer App</a>
          </div>
        </div>
      </div>
    </div>
  )
}

function AccessDenied() {
  const { signOut } = useAuth()
  return (
    <div style={{ minHeight: '100vh', background: '#0b1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#e5e7eb' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>&#x1F6AB;</div>
        <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Access Denied</h2>
        <p style={{ color: '#9ca3af', marginBottom: 24 }}>Your account does not have the admin role.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <a href="/" style={{ padding: '10px 20px', background: '#374151', color: '#e5e7eb', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>Back to Scorer App</a>
          <button onClick={() => signOut()} style={{ padding: '10px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>Sign Out</button>
        </div>
      </div>
    </div>
  )
}

export default function CompetitionAdminApp() {
  const { user, profile, loading } = useAuth()
  const [view, setView] = useState('list') // 'list' | 'upload' | 'editor'
  const [editingMatch, setEditingMatch] = useState(null)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#9ca3af', fontSize: 16 }}>Loading...</div>
      </div>
    )
  }

  if (!user) return <AdminLogin />

  const isAdmin = profile?.roles?.includes('admin') || profile?.roles?.includes('super_admin')
  if (!isAdmin) return <AccessDenied />

  const handleEdit = (match) => {
    setEditingMatch(match)
    setView('editor')
  }

  const handleEditorClose = () => {
    setEditingMatch(null)
    setView('list')
  }

  const handleUploadComplete = () => {
    setView('list')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0b1220', color: '#e5e7eb' }}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/openbeach_no_bg.png" alt="openBeach" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 600, fontSize: 16, color: '#fff' }}>Competition Admin</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => { setView('list'); setEditingMatch(null) }} style={navBtnStyle(view === 'list')}>Matches</button>
          <button onClick={() => { setView('upload'); setEditingMatch(null) }} style={navBtnStyle(view === 'upload')}>Upload Excel</button>
          <div style={{ width: 1, height: 24, background: '#374151', margin: '0 8px' }} />
          <span style={{ color: '#9ca3af', fontSize: 13 }}>{profile?.first_name || user.email}</span>
          <button onClick={() => window.location.href = '/'} style={{ padding: '6px 12px', background: '#374151', color: '#9ca3af', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
            Scorer App
          </button>
        </div>
      </div>

      {/* Content */}
      {view === 'list' && <CompetitionList onEdit={handleEdit} />}
      {view === 'upload' && <ExcelUpload userId={user.id} onComplete={handleUploadComplete} />}
      {view === 'editor' && <CompMatchEditor match={editingMatch} onClose={handleEditorClose} />}
    </div>
  )
}
