import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ownerUid = process.env.LEGACY_ADMIN_UID?.trim()
const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON

if (!ownerUid) throw new Error('Set LEGACY_ADMIN_UID to the Firebase Auth UID that owns the existing Internet Billing data.')
if (!rawServiceAccount) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_JSON for this one-time local migration. Do not add it to Vercel.')

let serviceAccount
try {
  serviceAccount = JSON.parse(rawServiceAccount)
} catch {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.')
}
if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
  throw new Error('The service-account JSON is missing project_id, client_email, or private_key.')
}

const app = getApps()[0] ?? initializeApp({
  credential: cert({
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
  }),
})
const db = getFirestore(app)

// These are the exact root-level collections used by the previous API version.
// Copying preserves every Firestore document ID and every field; it never deletes
// or modifies the source records. Existing destination documents are left alone.
const rootCollections = [
  'customers',
  'bills',
  'payments',
  'ledgerEntries',
  'systemCounters',
  'idempotencyKeys',
  'auditLogs',
]

let copied = 0
let skipped = 0
const writer = db.bulkWriter()

async function copyCollection(sourceCollection, destinationCollection, label) {
  const source = await sourceCollection.get()
  for (const sourceDoc of source.docs) {
    const destinationRef = destinationCollection.doc(sourceDoc.id)
    const destination = await destinationRef.get()
    if (destination.exists) {
      skipped += 1
    } else {
      writer.set(destinationRef, sourceDoc.data())
      copied += 1
    }
    if (label === 'customers') {
      for (const childCollectionName of ['servicePeriods', 'rates']) {
        const children = await sourceDoc.ref.collection(childCollectionName).get()
        for (const child of children.docs) {
          const childRef = destinationRef.collection(childCollectionName).doc(child.id)
          const existingChild = await childRef.get()
          if (existingChild.exists) skipped += 1
          else {
            writer.set(childRef, child.data())
            copied += 1
          }
        }
      }
    }
  }
  console.log(`${label}: scanned ${source.size} document(s)`)
}

try {
  for (const name of rootCollections) {
    await copyCollection(db.collection(name), db.collection('users').doc(ownerUid).collection(name), name)
  }
  await writer.close()
  console.log(`\nMigration completed for owner UID ${ownerUid}.`)
  console.log(`Copied: ${copied} document(s). Existing destination documents skipped: ${skipped}.`)
  console.log('Original root-level records were not deleted or modified.')
} catch (error) {
  await writer.close().catch(() => undefined)
  console.error('Migration stopped. Source records remain untouched.', error)
  process.exitCode = 1
}
