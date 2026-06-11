// Dispatch email composer.
//
// In this prototype we COMPOSE the exact message that would be sent from the
// service mailbox and "log" it (preview + console). To send for real, replace
// `sendDispatchEmail` with a call to your backend, which would use Microsoft
// Graph (sendMail) authenticated as Serviceuse@moovpool.com, or SMTP.
//
// The accept/decline links point back into this app (#/respond/:token) so the
// station's click is captured. In production these would be signed, single-use
// tokens handled by the backend.

export const SERVICE_MAILBOX = 'Serviceuse@moovpool.com'

export function buildDispatchEmail({ dispatch, station, consumer, product }) {
  const origin = window.location.origin + window.location.pathname
  const acceptUrl = `${origin}#/respond/${dispatch.id}/accept`
  const declineUrl = `${origin}#/respond/${dispatch.id}/decline`

  const subject = `[Moov Service Dispatch ${dispatch.id}] ${product} — ${consumer.city || consumer.address}`

  const body = `Hello ${station.company},

Moov Pool has a warranty service request in your area and would like to offer you
right of first refusal.

  • Product:        ${product}
  • Consumer:       ${consumer.name || '(end user)'}
  • Service addr:   ${consumer.address}
  • Distance:       ${dispatch.distanceMi != null ? dispatch.distanceMi.toFixed(1) + ' mi from your location' : 'n/a'}
  • Issue:          ${dispatch.issue || '(see attached RMA)'}
  • Dispatch ID:    ${dispatch.id}

Please respond within 24 hours:

  ✅ ACCEPT this job:   ${acceptUrl}
  ❌ DECLINE:           ${declineUrl}

If you accept, reply to this email thread when the job is COMPLETE, or to report
any issues encountered on site. All correspondence stays on this thread for our
records.

Thank you,
Moov Pool Warranty Service
${SERVICE_MAILBOX}`

  return { from: SERVICE_MAILBOX, to: station.email, subject, body, acceptUrl, declineUrl }
}

// Pluggable transport. Default: log-mode (preview only). Wire a real transport
// by POSTing `email` to your backend here.
export async function sendDispatchEmail(email) {
  console.info('[Moov dispatch email — log mode]\n', email)
  return { ok: true, mode: 'log' }
}
