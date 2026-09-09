export type Role = 'SUPER_ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  iconName?: 'onboarding';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  HR: 'HR',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};

export const ROLE_NAV: Record<Role, NavGroup[]> = {
  SUPER_ADMIN: [
    {
      label: 'Overview',
      items: [{ label: 'Dashboard', path: '/dashboard', icon: '▦' }],
    },
    {
      label: 'HRM',
      items: [
        { label: 'Employees', path: '/employees', icon: '👥' },
        { label: 'Org Chart', path: '/org-chart', icon: '⌗' },
        { label: 'Attendance', path: '/attendance', icon: '◷' },
        { label: 'Leaves', path: '/leave', icon: '▣' },
        { label: 'Holidays & Events', path: '/holidays', icon: '▦' },
      ],
    },
    {
      label: 'Work',
      items: [
        { label: 'Clients', path: '/clients', icon: '◈' },
        { label: 'Projects', path: '/projects', icon: '▣' },
        { label: 'Tasks', path: '/tasks', icon: '✓' },
      ],
    },
    {
      label: 'Recruitment',
      items: [
        { label: 'Recruitment', path: '/recruitment', icon: '◉' },
        // { label: 'Candidates', path: '/candidates', icon: '○' },
        { label: 'Onboarding', path: '/onboarding', icon: '', iconName: 'onboarding' },
      ],
    },
    {
      label: 'Resources',
      items: [
        { label: 'Documents', path: '/documents', icon: '▤' },
        { label: 'Reports', path: '/reports', icon: '▥' },
        { label: 'Departments', path: '/departments', icon: '◈' },
        { label: 'Designations', path: '/designations', icon: '◆' },
      ],
    },
  ],
  HR: [
    {
      label: 'Overview',
      items: [{ label: 'Dashboard', path: '/dashboard', icon: '▦' }],
    },
    {
      label: 'HRM',
      items: [
        { label: 'Employee', path: '/employees', icon: '👥' },
        { label: 'Org Chart', path: '/org-chart', icon: '⌗' },
        { label: 'Attendance', path: '/attendance', icon: '◷' },
        { label: 'Leave', path: '/leave', icon: '▣' },
        { label: 'Holidays & Events', path: '/holidays', icon: '▦' },
      ],
    },
    {
      label: 'Work',
      items: [
        { label: 'Client', path: '/clients', icon: '◈' },
        { label: 'Project', path: '/projects', icon: '▣' },
        { label: 'Task', path: '/tasks', icon: '✓' },
      ],
    },
    {
      label: 'Recruitment',
      items: [
        { label: 'Recruitment', path: '/recruitment', icon: '◉' },
        { label: 'Candidates', path: '/candidates', icon: '○' },
        { label: 'Onboarding', path: '/onboarding', icon: '', iconName: 'onboarding' },
      ],
    },
    {
      label: 'Resources',
      items: [
        { label: 'Documents', path: '/documents', icon: '▤' },
        { label: 'Reports', path: '/reports', icon: '▥' },
      ],
    },
  ],
  MANAGER: [
    {
      label: 'Overview',
      items: [{ label: 'Dashboard', path: '/dashboard', icon: '▦' }],
    },
    {
      label: 'Team',
      items: [
        { label: 'Team', path: '/team', icon: '👥' },
      ],
    },
    {
      label: 'HRM',
      items: [
        { label: 'Org Chart', path: '/org-chart', icon: '⌗' },
        { label: 'Attendance', path: '/attendance', icon: '◷' },
        { label: 'Leave', path: '/leave', icon: '▣' },
        { label: 'Holidays & Events', path: '/holidays', icon: '▦' },
      ],
    },
    {
      label: 'Work',
      items: [
        { label: 'Client', path: '/clients', icon: '◈' },
        { label: 'Project', path: '/projects', icon: '▣' },
        { label: 'Task', path: '/tasks', icon: '✓' },
      ],
    },
    {
      label: 'Resources',
      items: [
        { label: 'Documents', path: '/documents', icon: '▤' },
      ],
    },
  ],
  EMPLOYEE: [
    {
      label: 'Overview',
      items: [{ label: 'Dashboard', path: '/dashboard', icon: '▦' }],
    },
    {
      label: 'HRM',
      items: [
        { label: 'Attendance', path: '/attendance', icon: '◷' },
        { label: 'Leave', path: '/leave', icon: '▣' },
        { label: 'Holidays & Events', path: '/holidays', icon: '▦' },
      ],
    },
    {
      label: 'Work',
      items: [
        { label: 'Task', path: '/tasks', icon: '✓' },
      ],
    },
    {
      label: 'Me',
      items: [
        { label: 'Documents', path: '/documents', icon: '▤' },
      ],
    },
  ],
};
