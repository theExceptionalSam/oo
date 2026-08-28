/**
 * Message template registry (blueprint 5.1).
 * Variables are plain string-replaced — never eval()'d — and HTML-escaped
 * on render so variable content cannot inject markup.
 */
export const MESSAGE_TEMPLATES: Record<string, { subject: string; body: string }> = {
  'admission-approved': {
    subject: 'Admission Approved — {{schoolName}}',
    body: 'Dear {{parentName}}, {{studentName}} has been offered admission to {{schoolName}}. Welcome!',
  },
  'fee-reminder': {
    subject: 'Fee Reminder — {{term}}',
    body: 'Dear {{parentName}}, this is a reminder that {{studentName}}\'s fees for {{term}} are due. Amount: {{amount}}.',
  },
  'result-published': {
    subject: '{{studentName}}\'s {{term}} Results Available',
    body: 'Dear {{parentName}}, {{studentName}}\'s results for {{term}} have been published. Log in to SchoolSync to view them.',
  },
  announcement: {
    subject: '[{{schoolName}}] {{title}}',
    body: '{{content}}',
  },
  'staff-invitation': {
    subject: 'You are invited to SchoolSync',
    body: 'Hello,\n\nYou have been invited to SchoolSync as {{role}}.\n\nSet your password within {{expiresInHours}} hours using this link:\n{{inviteUrl}}\n\nIf you were not expecting this invitation, you can ignore this email.',
  },
  'password-reset': {
    subject: 'Reset your SchoolSync password',
    body: 'Hello,\n\nA password reset was requested for your SchoolSync account.\n\nReset your password within 1 hour using this link:\n{{resetUrl}}\n\nIf you did not request this, you can safely ignore this email — your password remains unchanged.',
  },
};

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  );

export function renderTemplate(
  templateId: string,
  variables: Record<string, string>,
): { subject: string; body: string } {
  const template = MESSAGE_TEMPLATES[templateId];
  if (!template) throw new Error(`Unknown template: ${templateId}`);

  let { subject, body } = template;
  for (const [key, value] of Object.entries(variables)) {
    const safe = escapeHtml(String(value ?? ''));
    subject = subject.split(`{{${key}}}`).join(safe);
    body = body.split(`{{${key}}}`).join(safe);
  }
  return { subject, body };
}
