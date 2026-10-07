import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck, Paperclip, Send, X } from 'lucide-react'
import { getCloudApiUrl } from '../utils_beach/backendConfig_beach'
import { openAppWindow } from '../utils_beach/openAppWindow_beach'
import { Modal as KitModal } from '../ui/volleyui/Modal.jsx'
import { Button } from '../ui/volleyui/Button.jsx'
import { IconButton } from '../ui/volleyui/IconButton.jsx'
import { Field } from '../ui/volleyui/Field.jsx'
import { Select } from '../ui/volleyui/Select.jsx'
import { Input } from '../ui/volleyui/Input.jsx'
import { Textarea } from '../ui/volleyui/Textarea.jsx'
import { NOTICE } from '../ui/volleyui/tones.js'

const CONTACT_TYPES = ['support', 'feedback', 'request']

const AREAS = [
  'mainPage',
  'header',
  'options',
  'matchSetup',
  'coinToss',
  'scoreboard',
  'approval',
  'escoresheet',
  'refereeDashboard',
  'livescore'
]

const SUPPORT_TYPES = ['bug', 'help']

const SEVERITY_LEVELS = [
  { value: 1, label: 'severity1' },
  { value: 2, label: 'severity2' },
  { value: 3, label: 'severity3' },
  { value: 4, label: 'severity4' }
]

// Volleyui form pieces (kit Field + native controls): no asterisks, the
// native `required` marks the fields the form needs.
function Dropdown({ label, value, onChange, options, placeholder, t, translationPrefix, required = false }) {
  return (
    <Field label={label} required={required}>
      <Select
        block
        size="lg"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        options={options.map(opt => {
          const v = typeof opt === 'object' ? opt.value : opt
          const key = typeof opt === 'object' ? opt.label : opt
          return { value: String(v), label: translationPrefix ? t(`${translationPrefix}.${key}`) : key }
        })}
      />
    </Field>
  )
}

function FileAttachment({ label, files, onFilesChange, t }) {
  const fileInputRef = useRef(null)

  const handleFileSelect = (e) => {
    const newFiles = Array.from(e.target.files)
    onFilesChange([...files, ...newFiles])
  }

  const removeFile = (index) => {
    onFilesChange(files.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,.json,.txt,.log,.pdf,.csv"
      />
      <Button variant="secondary" size="xl" block icon={Paperclip} onClick={() => fileInputRef.current?.click()}>
        {t('supportFeedback.attachFiles')}
      </Button>
      {files.length > 0 && (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {files.map((file, index) => (
            <li key={index} className="flex items-center justify-between gap-2 py-1 pl-3 pr-1 text-xs text-stone-700">
              <span className="min-w-0 flex-1 truncate">{file.name} <span className="tabular-nums text-stone-400">({formatFileSize(file.size)})</span></span>
              <IconButton variant="subtle" icon={X} label={t('supportFeedback.removeFile', { name: file.name, defaultValue: 'Remove {{name}}' })} onClick={() => removeFile(index)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function SupportFeedbackModal({ open, onClose, currentPage = 'mainPage' }) {
  const { t } = useTranslation()
  const [contactType, setContactType] = useState('')
  const [area, setArea] = useState(currentPage)
  const [supportType, setSupportType] = useState('')
  const [severity, setSeverity] = useState('')
  const [comments, setComments] = useState('')
  const [email, setEmail] = useState('')
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  const resetForm = () => {
    setContactType('')
    setArea(currentPage)
    setSupportType('')
    setSeverity('')
    setComments('')
    setEmail('')
    setFiles([])
    setSent(false)
    setError(null)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async () => {
    if (!contactType || !area || !email || !comments) {
      setError(t('supportFeedback.fillRequired'))
      return
    }

    if (contactType === 'support' && !supportType) {
      setError(t('supportFeedback.fillRequired'))
      return
    }

    if (contactType === 'support' && supportType === 'bug' && !severity) {
      setError(t('supportFeedback.fillRequired'))
      return
    }

    setSending(true)
    setError(null)

    try {
      // Prepare form data
      const formData = new FormData()
      formData.append('contactType', contactType)
      formData.append('area', area)
      formData.append('supportType', supportType)
      formData.append('severity', severity)
      formData.append('comments', comments)
      formData.append('email', email)
      formData.append('userAgent', navigator.userAgent)
      formData.append('url', window.location.href)
      formData.append('timestamp', new Date().toISOString())

      // Add files
      files.forEach((file, index) => {
        formData.append(`file_${index}`, file)
      })

      const apiUrl = getCloudApiUrl('/api/contact')

      if (apiUrl) {
        const response = await fetch(apiUrl, {
          method: 'POST',
          body: formData
        })

        if (!response.ok) {
          throw new Error('Failed to send message')
        }
      } else {
        // Fallback: create mailto link with the data
        const subject = `[${contactType.toUpperCase()}] ${t(`supportFeedback.areas.${area}`)}${supportType ? ` - ${t(`supportFeedback.supportTypes.${supportType}`)}` : ''}`
        const body = `
Contact Type: ${t(`supportFeedback.types.${contactType}`)}
Area: ${t(`supportFeedback.areas.${area}`)}
${supportType ? `Support Type: ${t(`supportFeedback.supportTypes.${supportType}`)}\n` : ''}${severity ? `Severity: ${t(`supportFeedback.severities.severity${severity}`)}\n` : ''}
From: ${email}
URL: ${window.location.href}
User Agent: ${navigator.userAgent}

Comments:
${comments}

${files.length > 0 ? `\nNote: ${files.length} file(s) were selected but cannot be attached via mailto. Please reply to this email to receive them.` : ''}
`.trim()

        const mailto = `mailto:volleyball@lucanepa.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
        openAppWindow(mailto)
      }

      setSent(true)
    } catch (err) {
      console.error('Error sending feedback:', err)
      setError(t('supportFeedback.sendError'))
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  const shell = (title, body, footer) => (
    <div className="ov-kit" style={{ position: 'relative', zIndex: 1100 }}>
      <KitModal
        open
        size="md"
        layout="sections"
        dismissible={false}
        onClose={handleClose}
        closeLabel={t('common.close')}
        title={title}
        footer={footer}
      >
        {body}
      </KitModal>
    </div>
  )

  // Sent
  if (sent) {
    const successMessage = contactType === 'support'
      ? t('supportFeedback.thankYouSupport')
      : contactType === 'feedback'
        ? t('supportFeedback.thankYouFeedback')
        : t('supportFeedback.thankYouRequest')

    return shell(
      t('supportFeedback.sent'),
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CircleCheck size={40} className="text-emerald-600" aria-hidden="true" />
        <p className="text-sm text-stone-700">{successMessage}</p>
      </div>,
      <Button variant="dark" size="lg" onClick={handleClose}>{t('common.close')}</Button>
    )
  }

  // Show whether to display comments field
  const showComments = contactType && (
    contactType !== 'support' ||
    supportType === 'help' ||
    (supportType === 'bug' && severity)
  )

  return shell(
    t('supportFeedback.title'),
    <form
      id="ob-support-form"
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
      noValidate
    >
      <Dropdown
        label={t('supportFeedback.contactTypeLabel')}
        value={contactType}
        onChange={setContactType}
        options={CONTACT_TYPES}
        placeholder={t('supportFeedback.selectType')}
        t={t}
        translationPrefix="supportFeedback.types"
        required
      />

      {contactType && (
        <Dropdown
          label={t('supportFeedback.areaLabel')}
          value={area}
          onChange={setArea}
          options={AREAS}
          placeholder={t('supportFeedback.selectArea')}
          t={t}
          translationPrefix="supportFeedback.areas"
          required
        />
      )}

      {contactType === 'support' && area && (
        <Dropdown
          label={t('supportFeedback.supportTypeLabel')}
          value={supportType}
          onChange={setSupportType}
          options={SUPPORT_TYPES}
          placeholder={t('supportFeedback.selectSupportType')}
          t={t}
          translationPrefix="supportFeedback.supportTypes"
          required
        />
      )}

      {contactType === 'support' && supportType === 'bug' && (
        <Dropdown
          label={t('supportFeedback.severityLabel')}
          value={severity}
          onChange={setSeverity}
          options={SEVERITY_LEVELS}
          placeholder={t('supportFeedback.selectSeverity')}
          t={t}
          translationPrefix="supportFeedback.severities"
          required
        />
      )}

      {showComments && (
        <Field label={t('supportFeedback.commentsLabel')} required>
          <Textarea prose rows={5} value={comments} onChange={(e) => setComments(e.target.value)} placeholder={t('supportFeedback.commentsPlaceholder')} />
        </Field>
      )}

      {showComments && (
        <FileAttachment
          label={t('supportFeedback.attachmentsLabel')}
          files={files}
          onFilesChange={setFiles}
          t={t}
        />
      )}

      {showComments && (
        <Field label={t('supportFeedback.emailLabel')} required>
          <Input size="lg" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('supportFeedback.emailPlaceholder')} />
        </Field>
      )}

      {error && <div role="alert" className={NOTICE.error}>{error}</div>}
    </form>,
    <>
      <Button variant="secondary" size="lg" onClick={handleClose}>{t('common.cancel')}</Button>
      {showComments && (
        <Button type="submit" form="ob-support-form" variant="primary" size="lg" icon={Send} loading={sending}>
          {sending ? t('supportFeedback.sending') : t('supportFeedback.send')}
        </Button>
      )}
    </>
  )
}
