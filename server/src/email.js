// Pluggable dispatch-email transport.
//
//   EMAIL_TRANSPORT=log   (default) — compose + log only, nothing is sent
//   EMAIL_TRANSPORT=smtp           — send via SMTP (nodemailer)
//   EMAIL_TRANSPORT=graph          — Microsoft 365 via Microsoft Graph sendMail
//
// The composed message (incl. accept/decline links) is always returned so the
// UI can preview it. Switch transports purely via environment variables.

import nodemailer from 'nodemailer'
import { signResponseToken } from './tokens.js'

// Fallback mailbox only — the normal sender is the dispatching user's own mailbox.
export const SERVICE_MAILBOX = process.env.SERVICE_MAILBOX || 'Serviceuse@moovpool.com'

// `sender` is the logged-in dispatcher ({ email, name }). The email is sent FROM
// their mailbox so replies (completion/issues) come back to them and attribution
// is real. Falls back to SERVICE_MAILBOX only if a sender email is missing.
export function buildDispatchEmail({ dispatch, station, appUrl, sender }) {
  const base = (appUrl || process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')
  const acceptToken = signResponseToken(dispatch.id, 'accept')
  const declineToken = signResponseToken(dispatch.id, 'decline')
  const acceptUrl = `${base}/#/respond/${acceptToken}`
  const declineUrl = `${base}/#/respond/${declineToken}`

  const from = sender?.email || SERVICE_MAILBOX
  const senderName = sender?.name || 'Moov Pool Warranty Service'

  const c = dispatch.consumer || {}
  const subject = `[Moov Service Dispatch ${dispatch.id}] ${dispatch.product} — ${c.city || c.address || ''}`
  const body = `Hello ${station.company},

Moov Pool has a warranty service request in your area and would like to offer you
right of first refusal.

  • Product:        ${dispatch.product}
  • Consumer:       ${c.name || '(end user)'}
  • Service addr:   ${c.address || ''}
  • Distance:       ${dispatch.distanceMi != null ? dispatch.distanceMi.toFixed(1) + ' mi from your location' : 'n/a'}
  • Issue:          ${dispatch.issue || '(see attached RMA)'}
  • Dispatch ID:    ${dispatch.id}

Please respond within 24 hours:

  ACCEPT this job:   ${acceptUrl}
  DECLINE:           ${declineUrl}

If you accept, reply to this email thread when the job is COMPLETE, or to report any
issues encountered on site. All correspondence stays on this thread for our records.

Thank you,
${senderName}
Moov Pool Warranty Service
${from}`

  return { from, senderName, to: station.email, subject, body, acceptUrl, declineUrl }
}

let smtpTransport = null
function getSmtp() {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  }
  return smtpTransport
}

// Microsoft 365 / Graph: client-credentials token, then sendMail AS the sender's
// mailbox (email.from = the dispatching user). The Mail.Send *application*
// permission lets the app send as any user in the tenant, so each dispatcher's
// own email is the sender. Setup (one time, in Azure AD):
//   1. App registrations -> New registration.
//   2. API permissions -> Microsoft Graph -> Application -> Mail.Send -> Grant admin consent.
//   3. Certificates & secrets -> new client secret.
//   4. Set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET.
async function getGraphToken() {
  const tenant = process.env.GRAPH_TENANT_ID
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GRAPH_CLIENT_ID,
      client_secret: process.env.GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) throw new Error('Graph token request failed (' + res.status + ')')
  return (await res.json()).access_token
}

export async function sendEmail(email) {
  const transport = (process.env.EMAIL_TRANSPORT || 'log').toLowerCase()

  if (transport === 'smtp') {
    await getSmtp().sendMail({ from: email.from, to: email.to, subject: email.subject, text: email.body })
    return { mode: 'smtp', sent: true }
  }

  if (transport === 'graph') {
    const token = await getGraphToken()
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email.from)}/sendMail`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject: email.subject,
            body: { contentType: 'Text', content: email.body },
            toRecipients: [{ emailAddress: { address: email.to } }],
          },
          saveToSentItems: true,
        }),
      }
    )
    if (!res.ok) throw new Error('Graph sendMail failed (' + res.status + '): ' + (await res.text()))
    return { mode: 'graph', sent: true }
  }

  console.info('[dispatch email — log mode]\n', `${email.subject}\nTo: ${email.to}\n${email.body}\n`)
  return { mode: 'log', sent: false }
}
