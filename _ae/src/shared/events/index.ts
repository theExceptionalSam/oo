/**
 * Logical event names used across the SchoolSync event bus.
 * Add new events here so they are discoverable via code search.
 */
export const SchoolSyncEvents = {
  USER_REGISTERED: 'user.registered',
  ATTENDANCE_ABSENT: 'attendance.absent',
  ATTENDANCE_MARKED: 'attendance.marked',
  FEE_DUE_REMINDER: 'fee.due_reminder',
  FEE_PAYMENT_COMPLETED: 'fee.payment_completed',
  EXAM_PUBLISHED: 'exam.published',
  ANNOUNCEMENT_PUBLISHED: 'announcement.published',
  MESSAGE_SENT: 'message.sent',
} as const;

export type SchoolSyncEventName =
  (typeof SchoolSyncEvents)[keyof typeof SchoolSyncEvents];
