export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          email: string
          full_name: string | null
          role: 'front_desk' | 'technician' | 'doctor' | 'admin'
          phone: string | null
          avatar_url: string | null
          is_active: boolean
        }
        Insert: {
          id: string
          created_at?: string
          updated_at?: string
          email: string
          full_name?: string | null
          role: 'front_desk' | 'technician' | 'doctor' | 'admin'
          phone?: string | null
          avatar_url?: string | null
          is_active?: boolean
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          email?: string
          full_name?: string | null
          role?: 'front_desk' | 'technician' | 'doctor' | 'admin'
          phone?: string | null
          avatar_url?: string | null
          is_active?: boolean
        }
        Relationships: []
      }
      patients: {
        Row: {
          id: string
          patient_id: string
          created_at: string
          updated_at: string
          first_name: string
          last_name: string
          date_of_birth: string
          gender: 'male' | 'female' | 'other'
          phone: string | null
          email: string | null
          address: string | null
          city: string | null
          state: string | null
          postal_code: string | null
          insurance_provider: string | null
          insurance_id: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          notes: string | null
          is_active: boolean
        }
        Insert: {
          id?: string
          patient_id: string
          created_at?: string
          updated_at?: string
          first_name: string
          last_name: string
          date_of_birth: string
          gender: 'male' | 'female' | 'other'
          phone?: string | null
          email?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          postal_code?: string | null
          insurance_provider?: string | null
          insurance_id?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          notes?: string | null
          is_active?: boolean
        }
        Update: {
          id?: string
          patient_id?: string
          created_at?: string
          updated_at?: string
          first_name?: string
          last_name?: string
          date_of_birth?: string
          gender?: 'male' | 'female' | 'other'
          phone?: string | null
          email?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          postal_code?: string | null
          insurance_provider?: string | null
          insurance_id?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          notes?: string | null
          is_active?: boolean
        }
        Relationships: []
      }
      test_types: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          name: string
          description: string | null
          code: string
          category: string
          unit: string | null
          reference_range: string | null
          turnaround_time_hours: number
          is_active: boolean
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          name: string
          description?: string | null
          code: string
          category: string
          unit?: string | null
          reference_range?: string | null
          turnaround_time_hours: number
          is_active?: boolean
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          name?: string
          description?: string | null
          code?: string
          category?: string
          unit?: string | null
          reference_range?: string | null
          turnaround_time_hours?: number
          is_active?: boolean
        }
        Relationships: []
      }
      lab_requests: {
        Row: {
          id: string
          request_id: string
          created_at: string
          updated_at: string
          patient_id: string
          test_type_id: string
          ordered_by: string
          status: 'pending' | 'collected' | 'processing' | 'completed' | 'cancelled'
          priority: 'routine' | 'urgent'
          collection_date: string | null
          notes: string | null
          specimen_type: string | null
        }
        Insert: {
          id?: string
          request_id: string
          created_at?: string
          updated_at?: string
          patient_id: string
          test_type_id: string
          ordered_by: string
          status?: 'pending' | 'collected' | 'processing' | 'completed' | 'cancelled'
          priority?: 'routine' | 'urgent'
          collection_date?: string | null
          notes?: string | null
          specimen_type?: string | null
        }
        Update: {
          id?: string
          request_id?: string
          created_at?: string
          updated_at?: string
          patient_id?: string
          test_type_id?: string
          ordered_by?: string
          status?: 'pending' | 'collected' | 'processing' | 'completed' | 'cancelled'
          priority?: 'routine' | 'urgent'
          collection_date?: string | null
          notes?: string | null
          specimen_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'lab_requests_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lab_requests_test_type_id_fkey'
            columns: ['test_type_id']
            isOneToOne: false
            referencedRelation: 'test_types'
            referencedColumns: ['id']
          },
        ]
      }
      lab_results: {
        Row: {
          id: string
          result_id: string
          created_at: string
          updated_at: string
          lab_request_id: string
          status: 'draft' | 'reviewed' | 'approved' | 'released'
          reviewed_by: string | null
          reviewed_at: string | null
          released_at: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          result_id: string
          created_at?: string
          updated_at?: string
          lab_request_id: string
          status?: 'draft' | 'reviewed' | 'approved' | 'released'
          reviewed_by?: string | null
          reviewed_at?: string | null
          released_at?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          result_id?: string
          created_at?: string
          updated_at?: string
          lab_request_id?: string
          status?: 'draft' | 'reviewed' | 'approved' | 'released'
          reviewed_by?: string | null
          reviewed_at?: string | null
          released_at?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'lab_results_lab_request_id_fkey'
            columns: ['lab_request_id']
            isOneToOne: false
            referencedRelation: 'lab_requests'
            referencedColumns: ['id']
          },
        ]
      }
      result_files: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          lab_result_id: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          uploaded_by: string
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          lab_result_id: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          uploaded_by: string
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          lab_result_id?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: 'result_files_lab_result_id_fkey'
            columns: ['lab_result_id']
            isOneToOne: false
            referencedRelation: 'lab_results'
            referencedColumns: ['id']
          },
        ]
      }
      audit_logs: {
        Row: {
          id: string
          created_at: string
          user_id: string
          action: 'create' | 'read' | 'update' | 'delete'
          resource_type: string
          resource_id: string
          changes: Json | null
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          user_id: string
          action: 'create' | 'read' | 'update' | 'delete'
          resource_type: string
          resource_id: string
          changes?: Json | null
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          user_id?: string
          action?: 'create' | 'read' | 'update' | 'delete'
          resource_type?: string
          resource_id?: string
          changes?: Json | null
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      visits: {
        Row: {
          id: string
          patient_id: string
          visit_date: string
          status: string
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          visit_date: string
          status?: string
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          visit_date?: string
          status?: string
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'visits_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
        ]
      }
      visit_tests: {
        Row: {
          id: string
          visit_id: string
          test_type_id: string
          assigned_to: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          visit_id: string
          test_type_id: string
          assigned_to?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          visit_id?: string
          test_type_id?: string
          assigned_to?: string | null
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'visit_tests_visit_id_fkey'
            columns: ['visit_id']
            isOneToOne: false
            referencedRelation: 'visits'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visit_tests_test_type_id_fkey'
            columns: ['test_type_id']
            isOneToOne: false
            referencedRelation: 'test_types'
            referencedColumns: ['id']
          },
        ]
      }
      test_results: {
        Row: {
          id: string
          test_id: string
          field_name: string
          value: string
          unit: string | null
          normal_min: number | null
          normal_max: number | null
          is_abnormal: boolean
          created_at: string
        }
        Insert: {
          id?: string
          test_id: string
          field_name: string
          value: string
          unit?: string | null
          normal_min?: number | null
          normal_max?: number | null
          is_abnormal?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          test_id?: string
          field_name?: string
          value?: string
          unit?: string | null
          normal_min?: number | null
          normal_max?: number | null
          is_abnormal?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'test_results_test_id_fkey'
            columns: ['test_id']
            isOneToOne: false
            referencedRelation: 'visit_tests'
            referencedColumns: ['id']
          },
        ]
      }
      doctor_notes: {
        Row: {
          id: string
          visit_id: string
          doctor_id: string
          notes: string
          created_at: string
        }
        Insert: {
          id?: string
          visit_id: string
          doctor_id: string
          notes: string
          created_at?: string
        }
        Update: {
          id?: string
          visit_id?: string
          doctor_id?: string
          notes?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'doctor_notes_visit_id_fkey'
            columns: ['visit_id']
            isOneToOne: false
            referencedRelation: 'visits'
            referencedColumns: ['id']
          },
        ]
      }
      payments: {
        Row: {
          id: string
          visit_id: string
          amount: number
          status: string
          method: string | null
          received_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          visit_id: string
          amount: number
          status?: string
          method?: string | null
          received_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          visit_id?: string
          amount?: number
          status?: string
          method?: string | null
          received_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payments_visit_id_fkey'
            columns: ['visit_id']
            isOneToOne: false
            referencedRelation: 'visits'
            referencedColumns: ['id']
          },
        ]
      }
      samples: {
        Row: {
          id: string
          visit_id: string
          sample_type: string
          barcode: string | null
          collected_at: string | null
          collected_by: string | null
          status: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          visit_id: string
          sample_type: string
          barcode?: string | null
          collected_at?: string | null
          collected_by?: string | null
          status?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          visit_id?: string
          sample_type?: string
          barcode?: string | null
          collected_at?: string | null
          collected_by?: string | null
          status?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'samples_visit_id_fkey'
            columns: ['visit_id']
            isOneToOne: false
            referencedRelation: 'visits'
            referencedColumns: ['id']
          },
        ]
      }
      visit_timestamps: {
        Row: {
          id: string
          visit_id: string
          created_at: string
          collected_at: string | null
          processed_at: string | null
          reviewed_at: string | null
          approved_at: string | null
          delivered_at: string | null
        }
        Insert: {
          id?: string
          visit_id: string
          created_at?: string
          collected_at?: string | null
          processed_at?: string | null
          reviewed_at?: string | null
          approved_at?: string | null
          delivered_at?: string | null
        }
        Update: {
          id?: string
          visit_id?: string
          created_at?: string
          collected_at?: string | null
          processed_at?: string | null
          reviewed_at?: string | null
          approved_at?: string | null
          delivered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'visit_timestamps_visit_id_fkey'
            columns: ['visit_id']
            isOneToOne: false
            referencedRelation: 'visits'
            referencedColumns: ['id']
          },
        ]
      }
      test_templates: {
        Row: {
          id: string
          test_type_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          test_type_id: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          test_type_id?: string
          name?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'test_templates_test_type_id_fkey'
            columns: ['test_type_id']
            isOneToOne: true
            referencedRelation: 'test_types'
            referencedColumns: ['id']
          },
        ]
      }
      test_template_fields: {
        Row: {
          id: string
          template_id: string
          field_name: string
          unit: string | null
          normal_min: number | null
          normal_max: number | null
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          template_id: string
          field_name: string
          unit?: string | null
          normal_min?: number | null
          normal_max?: number | null
          display_order: number
          created_at?: string
        }
        Update: {
          id?: string
          template_id?: string
          field_name?: string
          unit?: string | null
          normal_min?: number | null
          normal_max?: number | null
          display_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'test_template_fields_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'test_templates'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: 'front_desk' | 'technician' | 'doctor' | 'admin'
      gender: 'male' | 'female' | 'other'
      request_status: 'pending' | 'collected' | 'processing' | 'completed' | 'cancelled'
      priority: 'routine' | 'urgent'
      result_status: 'draft' | 'reviewed' | 'approved' | 'released'
      audit_action: 'create' | 'read' | 'update' | 'delete'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
