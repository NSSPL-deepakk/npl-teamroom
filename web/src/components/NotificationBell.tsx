import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Notification = {
    id: string;
    kind: 'announcement_created' | 'leave_request_submitted';
    title: string;
    message: string;
    read_at: string | null;
    created_at: string;
};

const NOTIFICATION_COLUMNS = 'id, kind, title, message, read_at, created_at';

function formatNotificationDate(value: string): string {
    return new Date(value).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function NotificationBell({ userId }: { userId: string | undefined }) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) {
            setNotifications([]);
            return;
        }

        let cancelled = false;
        setLoading(true);
        void supabase
            .from('notifications')
            .select(NOTIFICATION_COLUMNS)
            .eq('recipient_user_id', userId)
            .order('created_at', { ascending: false })
            .limit(30)
            .then(({ data, error: fetchError }) => {
                if (cancelled) return;
                if (fetchError) {
                    setError(fetchError.message);
                } else {
                    setError(null);
                    setNotifications((data ?? []) as Notification[]);
                }
                setLoading(false);
            });

        const channel = supabase
            .channel(`notifications-${userId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_user_id=eq.${userId}` },
                (payload) => {
                    setNotifications((current) => [payload.new as Notification, ...current.filter((item) => item.id !== payload.new.id)].slice(0, 30));
                },
            )
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    setError('Live notifications are temporarily unavailable.');
                }
            });

        return () => {
            cancelled = true;
            void supabase.removeChannel(channel);
        };
    }, [userId]);

    const unreadCount = notifications.filter((notification) => !notification.read_at).length;

    async function markRead(notification: Notification) {
        if (notification.read_at) return;
        const readAt = new Date().toISOString();
        const { error: updateError } = await supabase.from('notifications').update({ read_at: readAt }).eq('id', notification.id);
        if (updateError) {
            setError(updateError.message);
            return;
        }
        setNotifications((current) => current.map((item) => (item.id === notification.id ? { ...item, read_at: readAt } : item)));
    }

    async function markAllRead() {
        const unreadIds = notifications.filter((notification) => !notification.read_at).map((notification) => notification.id);
        if (unreadIds.length === 0) return;
        const readAt = new Date().toISOString();
        const { error: updateError } = await supabase.from('notifications').update({ read_at: readAt }).in('id', unreadIds);
        if (updateError) {
            setError(updateError.message);
            return;
        }
        setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
    }

    return (
        <div className="relative">
            <button
                type="button"
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
                className="relative flex h-9 w-9 items-center justify-center hover:bg-[var(--paper)]"
                style={{ color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)' }}
            >
                <Bell size={17} strokeWidth={1.8} />
                {unreadCount > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: 'var(--status-absent)' }} />}
            </button>

            {open && (
                <div className="absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-2rem))] border bg-white shadow-lg" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                    <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--line-soft)' }}>
                        <h2 className="font-display text-base font-semibold" style={{ color: 'var(--ink)' }}>Notifications</h2>
                        {unreadCount > 0 && <button type="button" onClick={() => void markAllRead()} className="font-mono text-[10px] uppercase tracking-wide hover:underline" style={{ color: 'var(--accent-structure)' }}>Mark all read</button>}
                    </div>
                    <div className="max-h-[min(420px,calc(100vh-8rem))] overflow-y-auto">
                        {loading ? (
                            <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading notifications...</p>
                        ) : error ? (
                            <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--status-absent)' }}>{error}</p>
                        ) : notifications.length === 0 ? (
                            <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No notifications yet.</p>
                        ) : notifications.map((notification) => (
                            <button
                                type="button"
                                key={notification.id}
                                onClick={() => void markRead(notification)}
                                className="flex w-full gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-[var(--paper)]"
                                style={{ borderColor: 'var(--line-soft)', background: notification.read_at ? 'white' : 'var(--accent-structure-bg)' }}
                            >
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: notification.read_at ? 'var(--line-soft)' : 'var(--accent-structure)' }} />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium" style={{ color: 'var(--ink)' }}>{notification.title}</span>
                                    <span className="mt-0.5 block text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>{notification.message}</span>
                                    <span className="mt-1 block font-mono text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>{formatNotificationDate(notification.created_at)}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
