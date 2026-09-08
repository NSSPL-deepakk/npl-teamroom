import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Employee } from './employees';

export type HolidayCategory = 'National Holiday' | 'Optional Holiday' | 'Company Holiday' | 'Announcement';
const REAL_HOLIDAY_CATEGORIES: HolidayCategory[] = ['National Holiday', 'Optional Holiday', 'Company Holiday'];

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  category: HolidayCategory;
  description?: string | null;
  image?: string | null;
}

export type DayClassification = 'WORKING_DAY' | 'WEEKLY_OFF' | 'HOLIDAY';

export function isWeeklyOff(date: string): boolean {
  const value = new Date(`${date}T00:00:00`);
  if (value.getDay() === 0) return true;
  return value.getDay() === 6 && Math.ceil(value.getDate() / 7) % 2 === 0;
}

export function classifyDay(date: string, holidays: Pick<Holiday, 'date' | 'category'>[]): DayClassification {
  if (holidays.some((holiday) => holiday.date === date && REAL_HOLIDAY_CATEGORIES.includes(holiday.category))) return 'HOLIDAY';
  return isWeeklyOff(date) ? 'WEEKLY_OFF' : 'WORKING_DAY';
}

export function countHolidaysThisYear(holidays: Holiday[], year = new Date().getFullYear()): number {
  return holidays.filter((holiday) => {
    return holiday.date.startsWith(`${year}-`) && REAL_HOLIDAY_CATEGORIES.includes(holiday.category);
  }).length;
}

export type ComputedEventKind = 'Birthday' | 'Anniversary';

export type ComputedEmployeeEvent = {
  id: string;
  date: string;
  name: string;
  category: ComputedEventKind;
  description: string;
  image: null;
  employeeId: string;
  kind: ComputedEventKind;
};

function dateParts(value: string): { month: number; day: number; year: number } {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

export function getComputedEmployeeEvents(employee: Employee, today = new Date()): ComputedEmployeeEvent[] {
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();
  const todayIso = `${todayYear}-${String(todayMonth).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`;
  const events: ComputedEmployeeEvent[] = [];

  if (employee.date_of_birth) {
    const birthday = dateParts(employee.date_of_birth);
    if (birthday.month === todayMonth && birthday.day === todayDay) {
      events.push({
        id: `birthday-${employee.id}`,
        date: todayIso,
        name: `${employee.name}'s birthday`,
        category: 'Birthday',
        description: employee.birthday_message?.trim() || `🎂 Happy Birthday, ${employee.name}! Wishing you a wonderful year ahead.`,
        image: null,
        employeeId: employee.id,
        kind: 'Birthday',
      });
    }
  }

  const joining = dateParts(employee.joining_date);
  const years = todayYear - joining.year;
  if (years > 0 && joining.month === todayMonth && joining.day === todayDay) {
    events.push({
      id: `anniversary-${employee.id}`,
      date: todayIso,
      name: `${employee.name}'s ${years}-year work anniversary`,
      category: 'Anniversary',
      description: employee.anniversary_message?.trim() || `🎉 Happy ${years}-year work anniversary, ${employee.name}! Thank you for your dedication.`,
      image: null,
      employeeId: employee.id,
      kind: 'Anniversary',
    });
  }

  return events;
}

export function getEventPlaceholderImage(name: string, category?: string): string {
  const haystack = `${category ?? ''} ${name}`.toLowerCase();
  let glyph = '🎉';
  let background = '#EEF2FF';
  let foreground = '#4338CA';

  if (haystack.includes('birthday') || haystack.includes('cake')) {
    glyph = '🎂';
    background = '#FDE7F3';
    foreground = '#BE185D';
  } else if (haystack.includes('new year') || haystack.includes('new-year') || haystack.includes('firework')) {
    glyph = '🎆';
    background = '#FFF7ED';
    foreground = '#C2410C';
  } else if (haystack.includes('anniversary') || haystack.includes('milestone')) {
    glyph = '🏆';
    background = '#F5F3FF';
    foreground = '#6D28D9';
  } else if (
    haystack.includes('independence') ||
    haystack.includes('christmas') ||
    haystack.includes('diwali') ||
    haystack.includes('holiday') ||
    haystack.includes('festival')
  ) {
    glyph = '🎊';
    background = '#ECFDF5';
    foreground = '#047857';
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="${name}">
      <rect width="120" height="120" rx="24" fill="${background}"/>
      <circle cx="92" cy="28" r="10" fill="${foreground}" opacity="0.2"/>
      <circle cx="30" cy="92" r="12" fill="${foreground}" opacity="0.12"/>
      <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-size="52">${glyph}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function resolveEventImage(image: string | null | undefined, name: string, category?: string): string {
  return image || getEventPlaceholderImage(name, category);
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}(?:[-*+] |\d+[.)] )/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useHolidays() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('holidays')
      .select('id, date, name, category, description, image')
      .order('date', { ascending: true });
    if (error) {
      setError(error.message);
      console.error('[Holidays] Could not load holidays:', error);
      setLoading(false);
      return;
    }
    setError(null);
    setHolidays((data ?? []) as Holiday[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addHoliday = useCallback(async (h: Omit<Holiday, 'id'>) => {
    const { data, error } = await supabase
      .from('holidays')
      .insert(h)
      .select('id, date, name, category, description, image')
      .single();
    if (error) {
      console.error('[Holidays] Could not add holiday:', error);
      return;
    }
    setHolidays((prev) => [...prev, data as Holiday].sort((a, b) => a.date.localeCompare(b.date)));
  }, []);

  const updateHoliday = useCallback(async (id: string, changes: Partial<Omit<Holiday, 'id'>>) => {
    const { data, error } = await supabase
      .from('holidays')
      .update(changes)
      .eq('id', id)
      .select('id, date, name, category, description, image')
      .single();
    if (error) {
      console.error('[Holidays] Could not update holiday:', error);
      return;
    }
    setHolidays((prev) => prev.map((holiday) => (holiday.id === id ? data as Holiday : holiday)).sort((a, b) => a.date.localeCompare(b.date)));
  }, []);

  const removeHoliday = useCallback(async (id: string) => {
    const { error } = await supabase.from('holidays').delete().eq('id', id);
    if (error) {
      console.error('[Holidays] Could not remove holiday:', error);
      return;
    }
    setHolidays((prev) => prev.filter((holiday) => holiday.id !== id));
  }, []);

  return { holidays: [...holidays].sort((a, b) => a.date.localeCompare(b.date)), addHoliday, updateHoliday, removeHoliday, loading, error, refresh };
}

export function upcomingHolidays(holidays: Holiday[], from = new Date(), limit = 4): Holiday[] {
  const today = from.toISOString().slice(0, 10);
  return holidays.filter((h) => h.date >= today).slice(0, limit);
}

export function formatHolidayDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' });
}
