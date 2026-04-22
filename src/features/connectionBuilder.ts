/**
 * ConnectionBuilder — Build and maintain emergency contact networks
 * for foster youth who typically have zero reliable contacts.
 */

import { z } from 'zod';

export const SupportContactSchema = z.object({
  id: z.string().uuid(),
  youthId: z.string().uuid(),
  name: z.string(),
  role: z.enum(['caseworker', 'casa', 'mentor', 'former_foster_parent', 'teacher', 'therapist', 'counselor', 'employer', 'coach', 'sibling', 'relative', 'friend', 'faith_leader', 'community_member']),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  organization: z.string().optional(),
  relationship: z.object({
    since: z.string(),
    trustLevel: z.enum(['high', 'medium', 'low', 'new']),
    lastContact: z.string().optional(),
    contactFrequency: z.enum(['daily', 'weekly', 'monthly', 'occasional', 'lost_touch']),
  }),
  emergencyRole: z.object({
    willingToHelp: z.boolean().optional(),
    canProvideHousing: z.boolean(),
    canProvideTransportation: z.boolean(),
    canProvideFinancial: z.boolean(),
    canProvideMedical: z.boolean(),
    availableHours: z.enum(['24_7', 'business_hours', 'evenings_weekends', 'limited']).optional(),
  }),
  verified: z.boolean(),
  verifiedAt: z.string().datetime().optional(),
});

export const NetworkHealthSchema = z.object({
  youthId: z.string().uuid(),
  assessedAt: z.string().datetime(),
  totalContacts: z.number().int().nonnegative(),
  reliableContacts: z.number().int().nonnegative(),
  emergencyReady: z.number().int().nonnegative(),
  networkScore: z.number().min(0).max(100),
  strengths: z.array(z.string()),
  gaps: z.array(z.object({ type: z.string(), description: z.string(), suggestion: z.string() })),
  roleDistribution: z.record(z.number().int().nonnegative()),
});

export const ConnectionSuggestionSchema = z.object({
  type: z.enum(['program', 'organization', 'role_to_fill']),
  name: z.string(),
  description: z.string(),
  url: z.string().url().optional(),
  phone: z.string().optional(),
  whyRecommended: z.string(),
});

export type SupportContact = z.infer<typeof SupportContactSchema>;
export type NetworkHealth = z.infer<typeof NetworkHealthSchema>;
export type ConnectionSuggestion = z.infer<typeof ConnectionSuggestionSchema>;

export function assessNetworkHealth(contacts: SupportContact[]): NetworkHealth {
  const reliable = contacts.filter(c => c.relationship.trustLevel === 'high' && c.verified && c.phone);
  const emergencyReady = contacts.filter(c => c.emergencyRole.willingToHelp && c.phone && c.verified);

  const roleDistribution: Record<string, number> = {};
  for (const c of contacts) {
    roleDistribution[c.role] = (roleDistribution[c.role] ?? 0) + 1;
  }

  let score = 0;
  score += Math.min(30, reliable.length * 10); // Up to 30 for reliable contacts
  score += Math.min(20, emergencyReady.length * 10); // Up to 20 for emergency-ready
  score += contacts.some(c => c.emergencyRole.canProvideHousing) ? 15 : 0;
  score += contacts.some(c => c.emergencyRole.canProvideTransportation) ? 10 : 0;
  score += contacts.some(c => c.role === 'therapist' || c.role === 'counselor') ? 10 : 0;
  score += Object.keys(roleDistribution).length >= 3 ? 15 : Object.keys(roleDistribution).length * 5;

  const strengths: string[] = [];
  if (reliable.length >= 3) strengths.push('Strong core network of trusted contacts');
  if (contacts.some(c => c.emergencyRole.canProvideHousing)) strengths.push('Housing backup available');
  if (contacts.some(c => c.emergencyRole.availableHours === '24_7')) strengths.push('24/7 support available');

  const gaps: NetworkHealth['gaps'] = [];
  if (reliable.length === 0) gaps.push({ type: 'no_trusted_contacts', description: 'No verified, trusted contacts with phone numbers', suggestion: 'Connect with CASA program or mentorship organization' });
  if (!contacts.some(c => c.emergencyRole.canProvideHousing)) gaps.push({ type: 'no_housing_backup', description: 'No contact who can provide emergency housing', suggestion: 'Identify shelter locations and build relationship with host family program' });
  if (!contacts.some(c => c.role === 'therapist' || c.role === 'counselor')) gaps.push({ type: 'no_mental_health', description: 'No mental health professional in network', suggestion: 'Request therapist assignment through caseworker or insurance' });
  if (contacts.filter(c => c.relationship.contactFrequency === 'lost_touch').length > contacts.length * 0.5) gaps.push({ type: 'network_decay', description: 'Over half of contacts are out of touch', suggestion: 'Schedule monthly check-ins with top 3 contacts' });

  return {
    youthId: contacts[0]?.youthId ?? crypto.randomUUID(),
    assessedAt: new Date().toISOString(),
    totalContacts: contacts.length,
    reliableContacts: reliable.length,
    emergencyReady: emergencyReady.length,
    networkScore: Math.min(100, score),
    strengths,
    gaps,
    roleDistribution,
  };
}

export function suggestConnections(health: NetworkHealth): ConnectionSuggestion[] {
  const suggestions: ConnectionSuggestion[] = [];

  if (health.reliableContacts < 2) {
    suggestions.push({
      type: 'program', name: 'CASA (Court Appointed Special Advocates)', description: 'Trained volunteers who advocate for foster youth in court and provide consistent adult relationship',
      url: 'https://www.casaforchildren.org', whyRecommended: 'Provides a reliable, consistent adult advocate',
    });
    suggestions.push({
      type: 'program', name: 'Big Brothers Big Sisters', description: 'One-on-one mentoring program matching youth with adult mentors',
      url: 'https://www.bbbs.org', whyRecommended: 'Builds long-term mentoring relationship that persists after aging out',
    });
  }

  if (!health.roleDistribution['employer'] && !health.roleDistribution['coach']) {
    suggestions.push({
      type: 'program', name: 'Foster Club', description: 'National network connecting current and former foster youth for peer support',
      url: 'https://www.fosterclub.com', whyRecommended: 'Peer connections who understand the foster care experience',
    });
  }

  if (health.gaps.some(g => g.type === 'no_housing_backup')) {
    suggestions.push({
      type: 'organization', name: 'Covenant House', description: 'Housing and supportive services for youth facing homelessness',
      url: 'https://www.covenanthouse.org', phone: '1-800-388-3888', whyRecommended: 'Emergency and transitional housing specifically for youth',
    });
  }

  suggestions.push({
    type: 'role_to_fill', name: 'Emergency Housing Contact', description: 'An adult who has agreed to provide emergency housing for at least 72 hours',
    whyRecommended: 'Critical gap — every youth needs at least one person who can provide emergency shelter',
  });

  return suggestions;
}
