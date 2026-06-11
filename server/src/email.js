// Pluggable dispatch-email transport.
//
//   EMAIL_TRANSPORT=log   (default) — compose + log only, nothing is sent
//   EMAIL_TRANSPORT=smtp           — send via SMTP (nodemailer)
//   EMAIL_TRANSPORT=graph          — Microsoft Graph (scaffold; see note)
//
// The composed message (incl. accept/decline links) is always returned so the
// UI can preview it. Switch transports purely via environment variables.

import nodemailer from 'nodemailer'
import { signResponseToken } from './tokens.js'

export const SERVICE_MAILBOX = process.env.SERVICE_MAILBOX || 'Serviceuse@moovpool.com'

export function buildDispatchEmail({ dispatch, station, appUrl }) {
  const base = (appUrl || process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')
  const acceptToken = signResponseToken(dispatch.id, 'accept')
  const declineToken = signResponseToken(dispatch.id, 'decline')
  const acceptUrl = `${base}/#/respond/${acceptToken}`
  const declineUrl = `${base}/#/respond/${declineToken}`

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
Moov Pool Warranty Service
${SERVICE_MAILBOX}`

  return { from: SERVICE_MAILBOX, to: station.email, subject, body, acceptUrl, declineUrl }
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

export async function sendEmail(email) {
  const transport = (process.env.EMAIL_TRANSPORT || 'log').toLowerCase()

  if (transport === 'smtp') {
    await getSmtp().sendMail({ from: email.from, to: email.to, subject: email.subject, text: email.body })
    return { mode: 'smtp', sent: true }
  }

  if (transport === 'graph') {
    // Microsoft Graph path for Serviceuse@moovpool.com (Microsoft 365):
    //  1. Register an Azure AD app; grant application permission Mail.Send.
    //  2. Get a token (client credentials) for https://graph.microsoft.com/.default.
    //  3. POST /users/{mailbox}/sendMail with the message + saveToSentItems:true.
    // Implement with @azure/identity + @microsoft/microsoft-graph-client, then
    // return { mode:'graph', sent:true }. Falls through to log until wired.
    console.warn('EMAIL_TRANSPORT=graph not yet wired; logging instead.')
  }

  console.info('[dispatch email — log mode]\n', `${email.subject}\nTo: ${email.to}\n${email.body}\n`)
  return { mode: 'log', sent: false }
}
