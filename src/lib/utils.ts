import { UserRole, ActionType, ResourceType } from './types';

/**
 * Generate a patient ID in the format HDS-XXXX where X is a random character
 */
export function generatePatientId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'HDS-';
  for (let i = 0; i < 4; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Format a date for display
 */
export function formatDate(date: string | Date, includeTime = false): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.hour12 = true;
  }

  return dateObj.toLocaleDateString('en-US', options);
}

/**
 * Get initials from a full name
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return '';

  return name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);
}

/**
 * Merge class names using template literals
 * Simple utility that doesn't require external dependencies
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes
    .filter((cls): cls is string => typeof cls === 'string' && cls.length > 0)
    .join(' ');
}

/**
 * Role-based access control matrix
 * Defines which roles can perform which actions on which resources
 */
const accessControlMatrix: Record<
  UserRole,
  Partial<Record<ResourceType, ActionType[]>>
> = {
  [UserRole.FRONT_DESK]: {
    patient: ['view', 'create', 'edit'],
    lab_request: ['view', 'create'],
    lab_result: ['view'],
  },
  [UserRole.TECHNICIAN]: {
    patient: ['view'],
    lab_request: ['view', 'edit'],
    lab_result: ['view', 'create', 'edit'],
  },
  [UserRole.DOCTOR]: {
    patient: ['view', 'edit'],
    lab_request: ['view'],
    lab_result: ['view', 'edit', 'approve', 'release'],
    audit_log: ['view'],
  },
  [UserRole.ADMIN]: {
    patient: ['view', 'create', 'edit', 'delete'],
    lab_request: ['view', 'create', 'edit', 'delete'],
    lab_result: ['view', 'create', 'edit', 'delete', 'approve', 'release'],
    profile: ['view', 'create', 'edit', 'delete'],
    audit_log: ['view'],
  },
};

/**
 * Check if a user role has permission to perform an action on a resource
 */
export function hasPermission(
  role: UserRole | null | undefined,
  action: ActionType,
  resource: ResourceType
): boolean {
  if (!role) {
    return false;
  }

  const rolePermissions = accessControlMatrix[role];
  if (!rolePermissions) {
    return false;
  }

  const resourcePermissions = rolePermissions[resource];
  if (!resourcePermissions) {
    return false;
  }

  return resourcePermissions.includes(action);
}

/**
 * Get all permissions for a specific role
 */
export function getRolePermissions(
  role: UserRole
): Partial<Record<ResourceType, ActionType[]>> {
  return accessControlMatrix[role] || {};
}

/**
 * Capitalize first letter of a string
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format a phone number
 */
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

/**
 * Validate email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Format a number with thousand separators
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Convert snake_case to Title Case
 */
export function snakeCaseToTitleCase(str: string): string {
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Sleep/delay utility for async operations
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
