/**
 * EmergencyPlan — Disaster preparedness for foster youth with
 * zero emergency contacts, no permanent address, and no stored documents.
 */

import { z } from 'zod';

export const FosterYouthProfileSchema = z.object({
  youthId: z.string().uuid(),
  age: z.number().int().min(12).max(26),
  status: z.enum(['in_care', 'aging_out', 'aged_out', 'reunified', 'adopted']),
  currentPlacement: z.object({
    type: z.enum(['foster_home', 'group_home', 'kinship', 'independent_living', 'shelter', 'homeless', 'unknown']),
    address: z.string().optional(),
    stable: z.boolean(),
    since: z.string().optional(),
  }),
  hasPhone: z.boolean(),
  hasId: z.boolean(),
  hasBirthCertificate: z.boolean(),
  hasSocialSecurityCard: z.boolean(),
  hasInsuranceCard: z.boolean(),
  medications: z.array(z.object({ name: z.string(), dosage: z.string(), prescriber: z.string().optional() })),
  mentalHealthNeeds: z.array(z.enum(['anxiety', 'depression', 'ptsd', 'adhd', 'bipolar', 'none'])),
  disabilities: z.array(z.string()),
  supportNetwork: z.array(z.object({
    name: z.string(), role: z.enum(['caseworker', 'casa', 'mentor', 'former_foster_parent', 'teacher', 'therapist', 'sibling', 'friend', 'employer']),
    phone: z.string().optional(), email: z.string().optional(), reliable: z.boolean(),
  })),
  schoolOrWork: z.object({ type: z.enum(['school', 'work', 'both', 'neither']), location: z.string().optional() }).optional(),
  transportation: z.enum(['none', 'bus_pass', 'bicycle', 'car', 'rideshare']),
  languages: z.array(z.string()).default(['en']),
});

export const YouthEmergencyPlanSchema = z.object({
  youthId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  readinessScore: z.number().min(0).max(100),
  criticalGaps: z.array(z.object({ gap: z.string(), severity: z.enum(['critical', 'high', 'medium']), action: z.string(), resources: z.array(z.string()) })),
  emergencyContacts: z.array(z.object({ priority: z.number().int(), name: z.string(), phone: z.string(), role: z.string(), availableHours: z.string() })),
  meetingPoints: z.object({ primary: z.string(), secondary: z.string(), outOfArea: z.string().optional() }),
  goKit: z.array(z.object({ item: z.string(), have: z.boolean(), howToGet: z.string().optional() })),
  documentChecklist: z.array(z.object({ document: z.string(), secured: z.boolean(), location: z.string().optional(), howToReplace: z.string() })),
  safeLocations: z.array(z.object({ name: z.string(), address: z.string(), type: z.enum(['shelter', 'drop_in', 'library', 'school', 'community_center', 'hospital', 'fire_station']), acceptsMinors: z.boolean(), hours: z.string() })),
  crisisNumbers: z.array(z.object({ name: z.string(), number: z.string(), text: z.string().optional(), available: z.string() })),
});

export type FosterYouthProfile = z.infer<typeof FosterYouthProfileSchema>;
export type YouthEmergencyPlan = z.infer<typeof YouthEmergencyPlanSchema>;

const CRISIS_NUMBERS = [
  { name: '911 Emergency', number: '911', available: '24/7' },
  { name: 'National Runaway Safeline', number: '1-800-786-2929', text: 'Text 66008', available: '24/7' },
  { name: '988 Suicide & Crisis Lifeline', number: '988', text: 'Text 988', available: '24/7' },
  { name: 'Crisis Text Line', number: '', text: 'Text HOME to 741741', available: '24/7' },
  { name: 'Childhelp National Abuse Hotline', number: '1-800-422-4453', available: '24/7' },
  { name: 'National Safe Place', number: '1-888-290-7233', text: 'Text SAFE to 44357', available: '24/7' },
];

export function assessReadiness(profile: FosterYouthProfile): { score: number; gaps: YouthEmergencyPlan['criticalGaps'] } {
  const gaps: YouthEmergencyPlan['criticalGaps'] = [];
  let score = 100;

  if (profile.supportNetwork.filter(c => c.reliable && c.phone).length === 0) {
    score -= 25;
    gaps.push({ gap: 'No reliable emergency contacts', severity: 'critical', action: 'Build emergency contact list with caseworker, CASA volunteer, or mentorship program', resources: ['CASA (Court Appointed Special Advocates): casaforchildren.org', 'Big Brothers Big Sisters: bbbs.org'] });
  }
  if (!profile.hasId) {
    score -= 15;
    gaps.push({ gap: 'No government-issued ID', severity: 'critical', action: 'Apply for state ID — most states provide free IDs for foster youth', resources: ['Foster Club ID assistance: fosterclub.com', 'Local DMV fee waiver program'] });
  }
  if (!profile.hasBirthCertificate) {
    score -= 10;
    gaps.push({ gap: 'No birth certificate', severity: 'high', action: 'Request through caseworker or vital records office — free for current/former foster youth in most states', resources: ['VitalChek: vitalchek.com', 'State vital records office'] });
  }
  if (!profile.hasPhone) {
    score -= 20;
    gaps.push({ gap: 'No phone for emergency communication', severity: 'critical', action: 'Apply for Lifeline Program (free phone for qualifying individuals)', resources: ['Lifeline Program: lifelinesupport.org', 'SafeLink Wireless'] });
  }
  if (profile.currentPlacement.type === 'homeless' || profile.currentPlacement.type === 'unknown') {
    score -= 20;
    gaps.push({ gap: 'No stable housing', severity: 'critical', action: 'Contact local Continuum of Care for youth housing assistance', resources: ['National Safe Place: nationalsafeplace.org', '211 for local resources'] });
  }
  if (profile.medications.length > 0 && !profile.hasInsuranceCard) {
    score -= 10;
    gaps.push({ gap: 'On medications but no insurance card', severity: 'high', action: 'Most former foster youth qualify for Medicaid to age 26 under Affordable Care Act', resources: ['Healthcare.gov former foster youth coverage', 'Local Medicaid office'] });
  }
  if (profile.transportation === 'none') {
    score -= 10;
    gaps.push({ gap: 'No transportation for evacuation', severity: 'high', action: 'Identify bus routes to shelter locations, register for emergency paratransit if applicable', resources: ['Local transit authority', '211 for emergency transportation'] });
  }

  return { score: Math.max(0, score), gaps };
}

export function generateEmergencyPlan(profile: FosterYouthProfile): YouthEmergencyPlan {
  const { score, gaps } = assessReadiness(profile);

  const emergencyContacts = profile.supportNetwork
    .filter(c => c.phone && c.reliable)
    .map((c, i) => ({ priority: i + 1, name: c.name, phone: c.phone!, role: c.role, availableHours: 'Contact to confirm' }));

  const goKit = [
    { item: 'Water bottle (filled)', have: false },
    { item: 'Phone charger / portable battery', have: profile.hasPhone },
    { item: 'Government ID', have: profile.hasId, howToGet: profile.hasId ? undefined : 'Free state ID through caseworker' },
    { item: 'Birth certificate copy', have: profile.hasBirthCertificate, howToGet: profile.hasBirthCertificate ? undefined : 'Request from vital records office' },
    { item: 'Insurance card', have: profile.hasInsuranceCard },
    { item: 'Medication list (written)', have: profile.medications.length > 0 },
    { item: '3-day medication supply', have: false },
    { item: 'Emergency contact card (paper)', have: emergencyContacts.length > 0 },
    { item: 'Cash ($20-50)', have: false },
    { item: 'Change of clothes in waterproof bag', have: false },
    { item: 'Snacks (granola bars, etc.)', have: false },
  ];

  const documentChecklist = [
    { document: 'Government-issued ID', secured: profile.hasId, location: undefined, howToReplace: 'DMV — free for foster youth in most states' },
    { document: 'Birth certificate', secured: profile.hasBirthCertificate, location: undefined, howToReplace: 'State vital records office — free for foster youth' },
    { document: 'Social Security card', secured: profile.hasSocialSecurityCard, location: undefined, howToReplace: 'SSA office or ssa.gov — free replacement' },
    { document: 'Insurance card', secured: profile.hasInsuranceCard, location: undefined, howToReplace: 'Contact Medicaid office or insurance provider' },
    { document: 'Court orders / placement documents', secured: false, location: undefined, howToReplace: 'Request from caseworker or court clerk' },
    { document: 'School records', secured: false, location: undefined, howToReplace: 'Request from school registrar' },
    { document: 'Medical records summary', secured: false, location: undefined, howToReplace: 'Request from healthcare provider' },
  ];

  return {
    youthId: profile.youthId,
    generatedAt: new Date().toISOString(),
    readinessScore: score,
    criticalGaps: gaps,
    emergencyContacts,
    meetingPoints: {
      primary: profile.schoolOrWork?.location ?? 'Set a meeting point at a public landmark near your placement',
      secondary: 'Nearest fire station or library',
      outOfArea: emergencyContacts.length > 0 ? `Contact ${emergencyContacts[0].name}` : 'Call 211 for assistance',
    },
    goKit,
    documentChecklist,
    safeLocations: [
      { name: 'Nearest Fire Station', address: 'Locate at local.fire.department', type: 'fire_station', acceptsMinors: true, hours: '24/7' },
      { name: 'Public Library', address: 'Locate nearest branch', type: 'library', acceptsMinors: true, hours: 'During operating hours' },
      { name: 'National Safe Place location', address: 'Text SAFE to 44357 for nearest location', type: 'shelter', acceptsMinors: true, hours: '24/7' },
    ],
    crisisNumbers: CRISIS_NUMBERS,
  };
}
