/**
 * DocumentVault — Secure digital document storage for foster youth
 * who frequently lose vital documents during placement changes.
 */

import { z } from 'zod';

export const StoredDocumentSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  documentType: z.enum(['birth_certificate', 'social_security_card', 'state_id', 'passport', 'insurance_card', 'court_order', 'iep', 'medical_records', 'immunization_records', 'school_transcript', 'diploma_ged', 'placement_history', 'medication_list', 'emergency_plan', 'other']),
  title: z.string(),
  uploadedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  renewalReminderDays: z.number().int().nonnegative().optional(),
  encrypted: z.boolean().default(true),
  fileHash: z.string(),
  fileSize: z.number().int().positive(),
  mimeType: z.string(),
  accessLog: z.array(z.object({ accessedAt: z.string().datetime(), accessedBy: z.string(), action: z.enum(['view', 'download', 'share', 'update']) })),
  sharedWith: z.array(z.object({ userId: z.string(), role: z.string(), grantedAt: z.string().datetime(), expiresAt: z.string().datetime().optional() })),
  tags: z.array(z.string()),
});

export const VaultSummarySchema = z.object({
  ownerId: z.string().uuid(),
  documentCount: z.number().int().nonnegative(),
  completeness: z.number().min(0).max(100),
  missingCritical: z.array(z.object({ document: z.string(), importance: z.enum(['critical', 'important', 'recommended']), howToObtain: z.string() })),
  expiringDocuments: z.array(z.object({ documentId: z.string(), title: z.string(), expiresAt: z.string(), daysUntilExpiry: z.number().int() })),
  storageUsedBytes: z.number().int().nonnegative(),
  lastBackup: z.string().datetime().optional(),
});

export const ShareRequestSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  requestedBy: z.object({ name: z.string(), role: z.string(), organization: z.string(), email: z.string().email() }),
  requestedAt: z.string().datetime(),
  reason: z.string(),
  status: z.enum(['pending', 'approved', 'denied', 'expired']),
  expiresAt: z.string().datetime(),
  accessType: z.enum(['view_once', 'view_7d', 'download_once']),
});

export type StoredDocument = z.infer<typeof StoredDocumentSchema>;
export type VaultSummary = z.infer<typeof VaultSummarySchema>;
export type ShareRequest = z.infer<typeof ShareRequestSchema>;

const CRITICAL_DOCUMENTS = [
  { document: 'birth_certificate', importance: 'critical' as const, howToObtain: 'State vital records office — free for current/former foster youth in most states' },
  { document: 'social_security_card', importance: 'critical' as const, howToObtain: 'Social Security Administration office or ssa.gov — free' },
  { document: 'state_id', importance: 'critical' as const, howToObtain: 'DMV — free for foster youth in most states (Chafee-eligible)' },
  { document: 'insurance_card', importance: 'critical' as const, howToObtain: 'Medicaid covers former foster youth to age 26 under ACA' },
  { document: 'immunization_records', importance: 'important' as const, howToObtain: 'Healthcare provider or state immunization registry' },
  { document: 'school_transcript', importance: 'important' as const, howToObtain: 'School registrar — request official copy' },
  { document: 'medical_records', importance: 'important' as const, howToObtain: 'Healthcare providers — free under HIPAA right of access' },
  { document: 'court_order', importance: 'important' as const, howToObtain: 'Court clerk or caseworker' },
  { document: 'placement_history', importance: 'recommended' as const, howToObtain: 'Caseworker or agency records department' },
];

export function assessVaultCompleteness(documents: StoredDocument[]): VaultSummary {
  const docTypes = new Set(documents.map(d => d.documentType));
  const missingCritical = CRITICAL_DOCUMENTS.filter(c => !docTypes.has(c.document as any));
  const criticalCount = CRITICAL_DOCUMENTS.length;
  const haveCount = criticalCount - missingCritical.length;
  const completeness = Math.round((haveCount / criticalCount) * 100);

  const now = Date.now();
  const expiringDocuments = documents
    .filter(d => d.expiresAt)
    .map(d => {
      const expires = new Date(d.expiresAt!).getTime();
      return { documentId: d.id, title: d.title, expiresAt: d.expiresAt!, daysUntilExpiry: Math.ceil((expires - now) / 86400000) };
    })
    .filter(d => d.daysUntilExpiry <= 90 && d.daysUntilExpiry > 0)
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  return {
    ownerId: documents[0]?.ownerId ?? crypto.randomUUID(),
    documentCount: documents.length,
    completeness,
    missingCritical,
    expiringDocuments,
    storageUsedBytes: documents.reduce((sum, d) => sum + d.fileSize, 0),
  };
}

export function processShareRequest(request: ShareRequest, ownerApproves: boolean): ShareRequest {
  if (new Date(request.expiresAt).getTime() < Date.now()) {
    return { ...request, status: 'expired' };
  }
  return { ...request, status: ownerApproves ? 'approved' : 'denied' };
}

export function generateRenewalReminders(documents: StoredDocument[]): Array<{ documentId: string; title: string; message: string; daysUntilExpiry: number }> {
  const now = Date.now();
  return documents
    .filter(d => d.expiresAt && d.renewalReminderDays !== undefined)
    .map(d => {
      const expires = new Date(d.expiresAt!).getTime();
      const daysUntil = Math.ceil((expires - now) / 86400000);
      return { documentId: d.id, title: d.title, message: `Your ${d.title} expires in ${daysUntil} days. Begin renewal process now.`, daysUntilExpiry: daysUntil };
    })
    .filter(r => r.daysUntilExpiry <= (documents.find(d => d.id === r.documentId)?.renewalReminderDays ?? 30))
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}
