// Enums
export enum UserRole {
  FRONT_DESK = 'front_desk',
  TECHNICIAN = 'technician',
  DOCTOR = 'doctor',
  ADMIN = 'admin',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export enum Priority {
  ROUTINE = 'routine',
  URGENT = 'urgent',
}

export enum RequestStatus {
  PENDING = 'pending',
  COLLECTED = 'collected',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ResultStatus {
  DRAFT = 'draft',
  REVIEWED = 'reviewed',
  APPROVED = 'approved',
  RELEASED = 'released',
}

export enum AuditAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
}

// Phase 1 Visit-based system enums
export enum VisitStatus {
  CREATED = 'created',
  COLLECTED = 'collected',
  PROCESSING = 'processing',
  REVIEW = 'review',
  APPROVED = 'approved',
  DELIVERED = 'delivered',
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  TRANSFER = 'transfer',
  INSURANCE = 'insurance',
}

export enum SampleType {
  BLOOD = 'blood',
  URINE = 'urine',
  STOOL = 'stool',
  OTHER = 'other',
}

export enum SampleStatus {
  PENDING = 'pending',
  COLLECTED = 'collected',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
}

// Interfaces
export interface Profile {
  id: string;
  createdAt: string;
  updatedAt: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
}

export interface Patient {
  id: string;
  patientId: string;
  createdAt: string;
  updatedAt: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  insuranceProvider: string | null;
  insuranceId: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface TestType {
  id: string;
  name: string;
  category: string;
  description: string | null;
  turnaroundTimeHours: number;
  price: number;
  isSensitive: boolean;
  isActive: boolean;
}

export interface LabRequest {
  id: string;
  requestId: string;
  createdAt: string;
  updatedAt: string;
  patientId: string;
  testTypeId: string;
  orderedBy: string;
  status: RequestStatus;
  priority: Priority;
  collectionDate: string | null;
  notes: string | null;
  specimenType: string | null;
}

export interface LabResult {
  id: string;
  resultId: string;
  createdAt: string;
  updatedAt: string;
  labRequestId: string;
  status: ResultStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  releasedAt: string | null;
  notes: string | null;
}

export interface ResultFile {
  id: string;
  createdAt: string;
  updatedAt: string;
  labResultId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType: string;
  uploadedBy: string;
}

export interface AuditLog {
  id: string;
  createdAt: string;
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  changes: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
}

// Phase 1 Visit-based system interfaces
export interface Visit {
  id: string;
  patientId: string;
  visitDate: string;
  status: VisitStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisitTest {
  id: string;
  visitId: string;
  testTypeId: string;
  assignedTo: string | null;
  status: string;
  createdAt: string;
}

export interface TestResult {
  id: string;
  testId: string;
  fieldName: string;
  value: string;
  unit: string | null;
  normalMin: number | null;
  normalMax: number | null;
  isAbnormal: boolean;
}

export interface DoctorNote {
  id: string;
  visitId: string;
  doctorId: string;
  notes: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  visitId: string;
  amount: number;
  status: PaymentStatus;
  method: PaymentMethod | null;
  receivedBy: string | null;
  createdAt: string;
}

export interface Sample {
  id: string;
  visitId: string;
  sampleType: SampleType;
  barcode: string | null;
  collectedAt: string | null;
  collectedBy: string | null;
  status: SampleStatus;
  notes: string | null;
}

export interface VisitTimestamp {
  id: string;
  visitId: string;
  createdAt: string | null;
  collectedAt: string | null;
  processedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  deliveredAt: string | null;
}

export interface TestTemplate {
  id: string;
  testTypeId: string;
  name: string;
  createdAt: string;
}

export interface TestTemplateField {
  id: string;
  templateId: string;
  fieldName: string;
  unit: string | null;
  normalMin: number | null;
  normalMax: number | null;
  displayOrder: number;
  createdAt: string;
}

// Role-based access control types
export type ActionType = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'release';
export type ResourceType = 'patient' | 'lab_request' | 'lab_result' | 'profile' | 'audit_log' | 'visit' | 'visit_test' | 'sample' | 'payment';

// Authentication types
export interface AuthSession {
  user: {
    id: string;
    email: string;
    aud: string;
    role: string;
    email_confirmed_at: string | null;
    phone_confirmed_at: string | null;
    confirmed_at: string | null;
    last_sign_in_at: string | null;
    app_metadata: {
      provider: string;
      providers: string[];
    };
    user_metadata: {
      [key: string]: unknown;
    };
    identities: Array<{
      id: string;
      user_id: string;
      identity_data: Record<string, unknown> | null;
      provider: string;
      last_sign_in_at: string | null;
      created_at: string;
      updated_at: string;
    }> | null;
    created_at: string;
    updated_at: string;
  };
  session: {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    user: {
      id: string;
      aud: string;
      role: string;
      email: string;
      email_confirmed_at: string | null;
      phone_confirmed_at: string | null;
      confirmed_at: string | null;
      last_sign_in_at: string | null;
      app_metadata: {
        provider: string;
        providers: string[];
      };
      user_metadata: {
        [key: string]: unknown;
      };
      identities: Array<{
        id: string;
        user_id: string;
        identity_data: Record<string, unknown> | null;
        provider: string;
        last_sign_in_at: string | null;
        created_at: string;
        updated_at: string;
      }> | null;
      created_at: string;
      updated_at: string;
    };
  };
}
