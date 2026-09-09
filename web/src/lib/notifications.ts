import { supabase } from './supabase';

type NotificationKind = 'announcement_created' | 'leave_request_submitted';

async function invokeNotification(kind: NotificationKind, recordId: string): Promise<void> {
    try {
        const { error } = await supabase.functions.invoke('send-email-notification', {
            body: { kind, record_id: recordId },
        });
        if (error) console.error('[Notifications] Email notification failed:', error);
    } catch (error) {
        console.error('[Notifications] Email notification invocation failed:', error);
    }
}

export function notifyAnnouncementCreated(recordId: string): void {
    void invokeNotification('announcement_created', recordId);
}

export function notifyLeaveRequestSubmitted(recordId: string): void {
    void invokeNotification('leave_request_submitted', recordId);
}
