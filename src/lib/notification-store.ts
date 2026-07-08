// ============================================================
// NOTIFICATION FOUNDATION — Catering Management Platform
// In-app notifications, push ready, email/WhatsApp ready
// ============================================================
import { create } from 'zustand';
import { supabase } from './supabase';
import { logAudit } from './logger';
import type { AppNotification, NotificationTemplate } from './types';

// ============================================================
// NOTIFICATION STORE
// ============================================================

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;

  // Actions
  load: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;

  // Real-time
  subscribe: () => () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  loading: true,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        set({ notifications: [], unreadCount: 0, loading: false });
        return;
      }

      const { data, error } = await supabase
        .from('in_app_notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const notifications = (data || []) as AppNotification[];
      const unreadCount = notifications.filter((n) => !n.read_at).length;

      set({ notifications, unreadCount, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  markAsRead: async (id) => {
    try {
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  markAllAsRead: async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('in_app_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;

      set((state) => ({
        notifications: state.notifications.map((n) => ({
          ...n,
          read_at: n.read_at || new Date().toISOString(),
        })),
        unreadCount: 0,
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  deleteNotification: async (id) => {
    try {
      const { error } = await supabase
        .from('in_app_notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set((state) => {
        const notification = state.notifications.find((n) => n.id === id);
        return {
          notifications: state.notifications.filter((n) => n.id !== id),
          unreadCount:
            notification && !notification.read_at
              ? Math.max(0, state.unreadCount - 1)
              : state.unreadCount,
        };
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  clearAll: async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('in_app_notifications')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      set({ notifications: [], unreadCount: 0 });
      await logAudit('Notification', 'ClearAll', 'Cleared all notifications');
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  subscribe: () => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cleanup: (() => void) | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'in_app_notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const newNotification = payload.new as AppNotification;
            set((state) => ({
              notifications: [newNotification, ...state.notifications],
              unreadCount: state.unreadCount + 1,
            }));

            // Show browser notification if permitted
            showBrowserNotification(newNotification);
          }
        )
        .subscribe();
    });

    cleanup = () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };

    return cleanup;
  },
}));

// ============================================================
// IN-APP NOTIFICATION CREATION
// ============================================================

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: AppNotification['type'] = 'info',
  data?: Record<string, any>
): Promise<AppNotification | null> {
  try {
    const { data: notification, error } = await supabase
      .from('in_app_notifications')
      .insert({
        user_id: userId,
        title,
        message,
        type,
        data: data || null,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .maybeSingle();

    if (error) throw error;
    return notification as AppNotification;
  } catch (err) {
    console.error('Failed to create notification:', err);
    return null;
  }
}

export async function createNotificationForRole(
  role: string,
  title: string,
  message: string,
  type: AppNotification['type'] = 'info'
): Promise<void> {
  try {
    // Get all users with the role
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', role)
      .eq('is_active', true);

    if (error) throw error;

    // Create notification for each user
    const notifications = (users || []).map((user) => ({
      user_id: user.id,
      title,
      message,
      type,
      created_at: new Date().toISOString(),
    }));

    if (notifications.length > 0) {
      await supabase.from('in_app_notifications').insert(notifications);
    }
  } catch (err) {
    console.error('Failed to create role notification:', err);
  }
}

// ============================================================
// BROWSER PUSH NOTIFICATION (READY)
// ============================================================

export async function requestPushPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export function showBrowserNotification(notification: AppNotification): void {
  if (Notification.permission === 'granted') {
    const browserNotif = new Notification(notification.title, {
      body: notification.message,
      icon: '/favicon.svg',
      tag: notification.id,
      data: notification.data,
    });

    browserNotif.onclick = () => {
      window.focus();
      browserNotif.close();
    };
  }
}

// ============================================================
// EMAIL NOTIFICATION (QUEUED)
// ============================================================

export async function queueEmailNotification(
  recipientType: 'user' | 'customer' | 'email',
  recipientId: string | null,
  recipientEmail: string | null,
  templateCode: string,
  variables: Record<string, any>
): Promise<boolean> {
  try {
    const { error } = await supabase.from('notification_queue').insert({
      template_code: templateCode,
      recipient_type: recipientType,
      recipient_id:
        recipientType === 'user' || recipientType === 'customer'
          ? recipientId
          : null,
      recipient_email: recipientEmail,
      variables,
      status: 'pending',
      scheduled_at: new Date().toISOString(),
    });

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed to queue email notification:', err);
    return false;
  }
}

// ============================================================
// WHATSAPP NOTIFICATION (QUEUED)
// ============================================================

export async function queueWhatsAppNotification(
  recipientType: 'phone' | 'customer',
  recipientId: string | null,
  recipientPhone: string | null,
  templateCode: string,
  variables: Record<string, any>
): Promise<boolean> {
  try {
    const { error } = await supabase.from('notification_queue').insert({
      template_code: templateCode,
      recipient_type: recipientType === 'phone' ? 'phone' : 'customer',
      recipient_id: recipientType === 'customer' ? recipientId : null,
      recipient_phone: recipientPhone,
      variables,
      status: 'pending',
      scheduled_at: new Date().toISOString(),
    });

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed to queue WhatsApp notification:', err);
    return false;
  }
}

// ============================================================
// NOTIFICATION TEMPLATES
// ============================================================

export async function getTemplates(): Promise<NotificationTemplate[]> {
  try {
    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;
    return (data || []) as NotificationTemplate[];
  } catch {
    return [];
  }
}

export async function renderTemplate(
  template: NotificationTemplate,
  variables: Record<string, any>
): Promise<{ subject: string | null; body: string }> {
  let body = template.body;
  for (const variable of template.variables) {
    const value = variables[variable] ?? '';
    body = body.replace(new RegExp(`{${variable}}`, 'g'), String(value));
  }

  let subject = template.subject;
  if (subject) {
    for (const variable of template.variables) {
      const value = variables[variable] ?? '';
      subject = subject.replace(
        new RegExp(`{${variable}}`, 'g'),
        String(value)
      );
    }
  }

  return { subject, body };
}

// ============================================================
// HOOKS
// ============================================================

export function useNotifications() {
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const loading = useNotificationStore((s) => s.loading);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const deleteNotification = useNotificationStore((s) => s.deleteNotification);
  const clearAll = useNotificationStore((s) => s.clearAll);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  };
}

// ============================================================
// INITIALIZE
// ============================================================

let initialized = false;
export function initializeNotifications(): () => void {
  if (initialized) return () => {};
  initialized = true;

  // Load existing notifications
  useNotificationStore.getState().load();

  // Request push permission
  requestPushPermission();

  // Subscribe to real-time notifications
  const unsubscribe = useNotificationStore.getState().subscribe();

  return () => {
    unsubscribe();
    initialized = false;
  };
}
