import { useState } from 'react'
import { callCard } from '../lib/format.js'

// Clipboard icon that copies the station's call card (company, contact, phone, email,
// address) as plain text. Shows a tick for a moment after copying. Shown wherever a
// station is named: list, map pins, search results, profile.
export default function CopyCard({ station, label = false, className = '' }) {
  const [done, setDone] = useState(false)
  async function copy(e) {
    e.stopPropagation()
    e.preventDefault()
    const text = callCard(station)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      window.prompt('Copy the call card:', text) // clipboard blocked — let them copy by hand
    }
    setDone(true)
    setTimeout(() => setDone(false), 1400)
  }
  return (
    <button type="button" className={'copy-btn' + (done ? ' done' : '') + (className ? ' ' + className : '')} onClick={copy}
      title={done ? 'Copied' : `Copy call card — ${[station.phone, station.email].filter(Boolean).join(' · ') || 'no phone/email on file'}`}
      aria-label="Copy call card">
      {done ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12h6M9 16h4" />
        </svg>
      )}
      {label && <span>{done ? 'Copied' : 'Copy call card'}</span>}
    </button>
  )
}
