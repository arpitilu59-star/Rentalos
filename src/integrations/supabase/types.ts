export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          target_id: string | null
          target_type: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_login_events: {
        Row: {
          admin_user_id: string | null
          city: string | null
          country: string | null
          created_at: string
          device_fingerprint: string | null
          email: string | null
          id: string
          ip_address: string | null
          location: string | null
          reason: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          admin_user_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_fingerprint?: string | null
          email?: string | null
          id?: string
          ip_address?: string | null
          location?: string | null
          reason?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          admin_user_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_fingerprint?: string | null
          email?: string | null
          id?: string
          ip_address?: string | null
          location?: string | null
          reason?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          device_fingerprint: string | null
          expires_at: string
          id: string
          purpose: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          device_fingerprint?: string | null
          expires_at: string
          id?: string
          purpose: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          device_fingerprint?: string | null
          expires_at?: string
          id?: string
          purpose?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_security: {
        Row: {
          created_at: string
          totp_enabled: boolean
          totp_secret: string | null
          totp_verified_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          totp_enabled?: boolean
          totp_secret?: string | null
          totp_verified_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          totp_enabled?: boolean
          totp_secret?: string | null
          totp_verified_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_trusted_devices: {
        Row: {
          device_fingerprint: string
          id: string
          label: string | null
          last_seen_at: string
          trusted_at: string
          user_id: string
        }
        Insert: {
          device_fingerprint: string
          id?: string
          label?: string | null
          last_seen_at?: string
          trusted_at?: string
          user_id: string
        }
        Update: {
          device_fingerprint?: string
          id?: string
          label?: string | null
          last_seen_at?: string
          trusted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          permissions: Json
          role: Database["public"]["Enums"]["admin_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          owner_id?: string
        }
        Relationships: []
      }
      app_saved_rooms: {
        Row: {
          created_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          room_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_saved_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string | null
          error: string | null
          id: string
          job: string
          period_key: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          job: string
          period_key: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          job?: string
          period_key?: string
          status?: string
        }
        Relationships: []
      }
      bills: {
        Row: {
          amount_paid: number
          archived: boolean
          bill_kind: string
          bill_month: number | null
          bill_year: number | null
          cleaning_amount: number | null
          created_at: string
          curr_reading: number | null
          due_date: string
          elec_period_end: string | null
          elec_period_start: string | null
          electricity_amount: number | null
          id: string
          last_reminded_at: string | null
          other_charges: number
          other_charges_note: string | null
          owner_id: string
          paid_at: string | null
          persons: number
          prev_reading: number | null
          previous_dues: number
          receipt_sent_at: string | null
          reminders_paused_until: string | null
          rent_amount: number
          rent_period_end: string
          rent_period_start: string
          room_id: string
          status: string
          tenant_id: string | null
          total_amount: number
          units_consumed: number | null
          updated_at: string
          water_amount: number | null
          whatsapp_sent_at: string | null
        }
        Insert: {
          amount_paid?: number
          archived?: boolean
          bill_kind?: string
          bill_month?: number | null
          bill_year?: number | null
          cleaning_amount?: number | null
          created_at?: string
          curr_reading?: number | null
          due_date: string
          elec_period_end?: string | null
          elec_period_start?: string | null
          electricity_amount?: number | null
          id?: string
          last_reminded_at?: string | null
          other_charges?: number
          other_charges_note?: string | null
          owner_id: string
          paid_at?: string | null
          persons?: number
          prev_reading?: number | null
          previous_dues?: number
          receipt_sent_at?: string | null
          reminders_paused_until?: string | null
          rent_amount?: number
          rent_period_end: string
          rent_period_start: string
          room_id: string
          status?: string
          tenant_id?: string | null
          total_amount?: number
          units_consumed?: number | null
          updated_at?: string
          water_amount?: number | null
          whatsapp_sent_at?: string | null
        }
        Update: {
          amount_paid?: number
          archived?: boolean
          bill_kind?: string
          bill_month?: number | null
          bill_year?: number | null
          cleaning_amount?: number | null
          created_at?: string
          curr_reading?: number | null
          due_date?: string
          elec_period_end?: string | null
          elec_period_start?: string | null
          electricity_amount?: number | null
          id?: string
          last_reminded_at?: string | null
          other_charges?: number
          other_charges_note?: string | null
          owner_id?: string
          paid_at?: string | null
          persons?: number
          prev_reading?: number | null
          previous_dues?: number
          receipt_sent_at?: string | null
          reminders_paused_until?: string | null
          rent_amount?: number
          rent_period_end?: string
          rent_period_start?: string
          room_id?: string
          status?: string
          tenant_id?: string | null
          total_amount?: number
          units_consumed?: number | null
          updated_at?: string
          water_amount?: number | null
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_offer_confirmations: {
        Row: {
          agreed_rent: number
          booking_id: string
          confirmed_at: string
          landlord_id: string
          move_in_date: string
          tenant_user_id: string
          terms_snapshot: Json
        }
        Insert: {
          agreed_rent: number
          booking_id: string
          confirmed_at?: string
          landlord_id: string
          move_in_date: string
          tenant_user_id: string
          terms_snapshot: Json
        }
        Update: {
          agreed_rent?: number
          booking_id?: string
          confirmed_at?: string
          landlord_id?: string
          move_in_date?: string
          tenant_user_id?: string
          terms_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "booking_offer_confirmations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_offer_contacts: {
        Row: {
          booking_id: string
          landlord_id: string
          message: string | null
          tenant_email: string | null
          tenant_mobile: string | null
          tenant_user_id: string
        }
        Insert: {
          booking_id: string
          landlord_id: string
          message?: string | null
          tenant_email?: string | null
          tenant_mobile?: string | null
          tenant_user_id: string
        }
        Update: {
          booking_id?: string
          landlord_id?: string
          message?: string | null
          tenant_email?: string | null
          tenant_mobile?: string | null
          tenant_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_offer_contacts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_terms_acceptances: {
        Row: {
          accepted_at: string
          acknowledgements: Json
          booking_id: string
          id: string
          landlord_id: string
          listened: boolean
          property_id: string
          room_id: string
          snapshot: Json
          snapshot_hash: string
          tenant_user_id: string
          terms_version: number | null
          terms_version_id: string | null
        }
        Insert: {
          accepted_at?: string
          acknowledgements: Json
          booking_id: string
          id?: string
          landlord_id: string
          listened?: boolean
          property_id: string
          room_id: string
          snapshot: Json
          snapshot_hash: string
          tenant_user_id: string
          terms_version?: number | null
          terms_version_id?: string | null
        }
        Update: {
          accepted_at?: string
          acknowledgements?: Json
          booking_id?: string
          id?: string
          landlord_id?: string
          listened?: boolean
          property_id?: string
          room_id?: string
          snapshot?: Json
          snapshot_hash?: string
          tenant_user_id?: string
          terms_version?: number | null
          terms_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_terms_acceptances_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_terms_reacceptances: {
        Row: {
          accepted_at: string
          acknowledgements: Json
          booking_id: string
          id: string
          landlord_id: string
          listened: boolean
          property_id: string
          snapshot: Json
          snapshot_hash: string
          tenant_user_id: string
          terms_version: number
          terms_version_id: string | null
        }
        Insert: {
          accepted_at?: string
          acknowledgements: Json
          booking_id: string
          id?: string
          landlord_id: string
          listened?: boolean
          property_id: string
          snapshot: Json
          snapshot_hash: string
          tenant_user_id: string
          terms_version: number
          terms_version_id?: string | null
        }
        Update: {
          accepted_at?: string
          acknowledgements?: Json
          booking_id?: string
          id?: string
          landlord_id?: string
          listened?: boolean
          property_id?: string
          snapshot?: Json
          snapshot_hash?: string
          tenant_user_id?: string
          terms_version?: number
          terms_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_terms_reacceptances_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          admin_note: string | null
          admin_review: string
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          agreed_rent: number | null
          counter_rent: number | null
          created_at: string
          decided_at: string | null
          id: string
          landlord_id: string
          message: string | null
          offer_confirmed_at: string | null
          offer_expires_at: string | null
          offer_rounds: number
          offer_status: string | null
          offered_rent: number | null
          property_id: string
          room_id: string
          status: string
          tenant_email: string | null
          tenant_id: string | null
          tenant_mobile: string
          tenant_name: string
          tenant_user_id: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          admin_review?: string
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          agreed_rent?: number | null
          counter_rent?: number | null
          created_at?: string
          decided_at?: string | null
          id?: string
          landlord_id: string
          message?: string | null
          offer_confirmed_at?: string | null
          offer_expires_at?: string | null
          offer_rounds?: number
          offer_status?: string | null
          offered_rent?: number | null
          property_id: string
          room_id: string
          status?: string
          tenant_email?: string | null
          tenant_id?: string | null
          tenant_mobile: string
          tenant_name: string
          tenant_user_id: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          admin_review?: string
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          agreed_rent?: number | null
          counter_rent?: number | null
          created_at?: string
          decided_at?: string | null
          id?: string
          landlord_id?: string
          message?: string | null
          offer_confirmed_at?: string | null
          offer_expires_at?: string | null
          offer_rounds?: number
          offer_status?: string | null
          offered_rent?: number | null
          property_id?: string
          room_id?: string
          status?: string
          tenant_email?: string | null
          tenant_id?: string | null
          tenant_mobile?: string
          tenant_name?: string
          tenant_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      deposits: {
        Row: {
          amount_deducted: number
          amount_held: number
          amount_refunded: number
          created_at: string
          deduction_reason: string | null
          id: string
          owner_id: string
          refunded_at: string | null
          status: Database["public"]["Enums"]["deposit_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_deducted?: number
          amount_held?: number
          amount_refunded?: number
          created_at?: string
          deduction_reason?: string | null
          id?: string
          owner_id: string
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_deducted?: number
          amount_held?: number
          amount_refunded?: number
          created_at?: string
          deduction_reason?: string | null
          id?: string
          owner_id?: string
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlement_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          expires_at: string | null
          feature_key: string
          id: string
          reason: string | null
          revoked_at: string | null
          starts_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled: boolean
          expires_at?: string | null
          feature_key: string
          id?: string
          reason?: string | null
          revoked_at?: string | null
          starts_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          expires_at?: string | null
          feature_key?: string
          id?: string
          reason?: string | null
          revoked_at?: string | null
          starts_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_overrides_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "feature_catalog"
            referencedColumns: ["feature_key"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          note: string | null
          owner_id: string
          property_id: string | null
          spent_on: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          id?: string
          note?: string | null
          owner_id: string
          property_id?: string | null
          spent_on?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          property_id?: string | null
          spent_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_catalog: {
        Row: {
          description: string | null
          feature_key: string
          kind: string
          label: string
          sort_order: number
          visible: boolean
        }
        Insert: {
          description?: string | null
          feature_key: string
          kind?: string
          label: string
          sort_order?: number
          visible?: boolean
        }
        Update: {
          description?: string | null
          feature_key?: string
          kind?: string
          label?: string
          sort_order?: number
          visible?: boolean
        }
        Relationships: []
      }
      feedback_items: {
        Row: {
          admin_notes: string | null
          app_version: string | null
          body: string
          created_at: string
          id: string
          kind: string
          platform: string
          role: string
          screen: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          app_version?: string | null
          body: string
          created_at?: string
          id?: string
          kind: string
          platform?: string
          role?: string
          screen?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          app_version?: string | null
          body?: string
          created_at?: string
          id?: string
          kind?: string
          platform?: string
          role?: string
          screen?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fraud_flags: {
        Row: {
          created_at: string
          details: Json
          flagged_by: string | null
          id: string
          kind: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["fraud_severity"]
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          flagged_by?: string | null
          id?: string
          kind: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["fraud_severity"]
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          flagged_by?: string | null
          id?: string
          kind?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["fraud_severity"]
          user_id?: string
        }
        Relationships: []
      }
      live_feed_photos: {
        Row: {
          caption: string | null
          captured_lat: number | null
          captured_lng: number | null
          created_at: string
          distance_m: number | null
          expires_at: string | null
          id: string
          owner_id: string
          property_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          room_id: string | null
          storage_path: string
          verification_status: string
        }
        Insert: {
          caption?: string | null
          captured_lat?: number | null
          captured_lng?: number | null
          created_at?: string
          distance_m?: number | null
          expires_at?: string | null
          id?: string
          owner_id: string
          property_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          storage_path: string
          verification_status?: string
        }
        Update: {
          caption?: string | null
          captured_lat?: number | null
          captured_lng?: number | null
          created_at?: string
          distance_m?: number | null
          expires_at?: string | null
          id?: string
          owner_id?: string
          property_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          storage_path?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_feed_photos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_feed_photos_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      live_feed_videos: {
        Row: {
          captured_lat: number | null
          captured_lng: number | null
          created_at: string
          distance_m: number | null
          duration_seconds: number | null
          expires_at: string | null
          id: string
          mime_type: string | null
          myr_listing_id: string | null
          myr_room_id: string | null
          owner_id: string
          playback_path: string | null
          poster_path: string | null
          preview_path: string | null
          processing_error: string | null
          processing_status: string
          property_id: string | null
          random_prompt: string
          reviewed_at: string | null
          reviewed_by: string | null
          room_id: string | null
          storage_path: string
          target_lat: number | null
          target_lng: number | null
          updated_at: string
          verification_notes: string | null
          verification_status: Database["public"]["Enums"]["live_feed_status"]
        }
        Insert: {
          captured_lat?: number | null
          captured_lng?: number | null
          created_at?: string
          distance_m?: number | null
          duration_seconds?: number | null
          expires_at?: string | null
          id?: string
          mime_type?: string | null
          myr_listing_id?: string | null
          myr_room_id?: string | null
          owner_id: string
          playback_path?: string | null
          poster_path?: string | null
          preview_path?: string | null
          processing_error?: string | null
          processing_status?: string
          property_id?: string | null
          random_prompt: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          storage_path: string
          target_lat?: number | null
          target_lng?: number | null
          updated_at?: string
          verification_notes?: string | null
          verification_status?: Database["public"]["Enums"]["live_feed_status"]
        }
        Update: {
          captured_lat?: number | null
          captured_lng?: number | null
          created_at?: string
          distance_m?: number | null
          duration_seconds?: number | null
          expires_at?: string | null
          id?: string
          mime_type?: string | null
          myr_listing_id?: string | null
          myr_room_id?: string | null
          owner_id?: string
          playback_path?: string | null
          poster_path?: string | null
          preview_path?: string | null
          processing_error?: string | null
          processing_status?: string
          property_id?: string | null
          random_prompt?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          storage_path?: string
          target_lat?: number | null
          target_lng?: number | null
          updated_at?: string
          verification_notes?: string | null
          verification_status?: Database["public"]["Enums"]["live_feed_status"]
        }
        Relationships: [
          {
            foreignKeyName: "live_feed_videos_myr_listing_id_fkey"
            columns: ["myr_listing_id"]
            isOneToOne: false
            referencedRelation: "myr_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_feed_videos_myr_room_id_fkey"
            columns: ["myr_room_id"]
            isOneToOne: false
            referencedRelation: "myr_listing_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_feed_videos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_feed_videos_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_tickets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          owner_id: string
          photo_paths: string[]
          priority: Database["public"]["Enums"]["ticket_priority"]
          property_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          room_id: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          owner_id: string
          photo_paths?: string[]
          priority?: Database["public"]["Enums"]["ticket_priority"]
          property_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          room_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string
          photo_paths?: string[]
          priority?: Database["public"]["Enums"]["ticket_priority"]
          property_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          room_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          tenant_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tickets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_readings: {
        Row: {
          ai_detected: boolean
          created_at: string
          id: string
          notes: string | null
          owner_id: string
          photo_lat: number | null
          photo_lng: number | null
          photo_path: string | null
          reading: number
          reading_date: string
          room_id: string
        }
        Insert: {
          ai_detected?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          owner_id: string
          photo_lat?: number | null
          photo_lng?: number | null
          photo_path?: string | null
          reading: number
          reading_date?: string
          room_id: string
        }
        Update: {
          ai_detected?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string
          photo_lat?: number | null
          photo_lng?: number | null
          photo_path?: string | null
          reading?: number
          reading_date?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_submissions: {
        Row: {
          approved_reading: number | null
          created_at: string
          decided_at: string | null
          id: string
          landlord_note: string | null
          meter_reading_id: string | null
          note: string | null
          owner_id: string
          photo_path: string | null
          reading: number
          room_id: string
          status: string
          submitted_by: string
          tenant_id: string
        }
        Insert: {
          approved_reading?: number | null
          created_at?: string
          decided_at?: string | null
          id?: string
          landlord_note?: string | null
          meter_reading_id?: string | null
          note?: string | null
          owner_id: string
          photo_path?: string | null
          reading: number
          room_id: string
          status?: string
          submitted_by: string
          tenant_id: string
        }
        Update: {
          approved_reading?: number | null
          created_at?: string
          decided_at?: string | null
          id?: string
          landlord_note?: string | null
          meter_reading_id?: string | null
          note?: string | null
          owner_id?: string
          photo_path?: string | null
          reading?: number
          room_id?: string
          status?: string
          submitted_by?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_submissions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      move_records: {
        Row: {
          checklist: Json
          condition_notes: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["move_kind"]
          meter_reading: number | null
          move_date: string
          owner_id: string
          photo_paths: string[]
          room_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          checklist?: Json
          condition_notes?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["move_kind"]
          meter_reading?: number | null
          move_date?: string
          owner_id: string
          photo_paths?: string[]
          room_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          checklist?: Json
          condition_notes?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["move_kind"]
          meter_reading?: number | null
          move_date?: string
          owner_id?: string
          photo_paths?: string[]
          room_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "move_records_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "move_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      myr_amenities: {
        Row: {
          code: string
          icon: string | null
          id: string
          label: string
        }
        Insert: {
          code: string
          icon?: string | null
          id?: string
          label: string
        }
        Update: {
          code?: string
          icon?: string | null
          id?: string
          label?: string
        }
        Relationships: []
      }
      myr_bookings: {
        Row: {
          amount: number
          cancelled_reason: string | null
          created_at: string
          deposit: number
          id: string
          landlord_id: string
          listing_id: string
          move_in_date: string | null
          payment_status: Database["public"]["Enums"]["myr_payment_status"]
          reserved_until: string | null
          room_id: string
          status: Database["public"]["Enums"]["myr_booking_status"]
          stay_months: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          cancelled_reason?: string | null
          created_at?: string
          deposit?: number
          id?: string
          landlord_id: string
          listing_id: string
          move_in_date?: string | null
          payment_status?: Database["public"]["Enums"]["myr_payment_status"]
          reserved_until?: string | null
          room_id: string
          status?: Database["public"]["Enums"]["myr_booking_status"]
          stay_months?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          cancelled_reason?: string | null
          created_at?: string
          deposit?: number
          id?: string
          landlord_id?: string
          listing_id?: string
          move_in_date?: string | null
          payment_status?: Database["public"]["Enums"]["myr_payment_status"]
          reserved_until?: string | null
          room_id?: string
          status?: Database["public"]["Enums"]["myr_booking_status"]
          stay_months?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "myr_bookings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "myr_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "myr_bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "myr_listing_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      myr_fraud_flags: {
        Row: {
          created_at: string
          details: Json
          id: string
          kind: string
          listing_id: string | null
          resolved: boolean
          severity: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          kind: string
          listing_id?: string | null
          resolved?: boolean
          severity?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          listing_id?: string | null
          resolved?: boolean
          severity?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "myr_fraud_flags_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "myr_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      myr_inquiries: {
        Row: {
          created_at: string
          id: string
          landlord_id: string
          last_message: string | null
          listing_id: string
          tenant_id: string
          unread_for_landlord: number
          unread_for_tenant: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          landlord_id: string
          last_message?: string | null
          listing_id: string
          tenant_id: string
          unread_for_landlord?: number
          unread_for_tenant?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          landlord_id?: string
          last_message?: string | null
          listing_id?: string
          tenant_id?: string
          unread_for_landlord?: number
          unread_for_tenant?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "myr_inquiries_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "myr_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      myr_inquiry_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          inquiry_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          inquiry_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          inquiry_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "myr_inquiry_messages_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "myr_inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      myr_listing_amenities: {
        Row: {
          amenity_id: string
          listing_id: string
        }
        Insert: {
          amenity_id: string
          listing_id: string
        }
        Update: {
          amenity_id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "myr_listing_amenities_amenity_id_fkey"
            columns: ["amenity_id"]
            isOneToOne: false
            referencedRelation: "myr_amenities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "myr_listing_amenities_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "myr_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      myr_listing_media: {
        Row: {
          created_at: string
          id: string
          kind: string
          listing_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          listing_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          listing_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "myr_listing_media_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "myr_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      myr_listing_rooms: {
        Row: {
          available_from: string | null
          capacity: number
          created_at: string
          deposit: number
          furnishing: Database["public"]["Enums"]["myr_furnishing"]
          gender_pref: Database["public"]["Enums"]["myr_gender_pref"]
          has_verified_video: boolean
          id: string
          label: string
          listing_id: string
          rent: number
          reserved_by: string | null
          reserved_until: string | null
          status: Database["public"]["Enums"]["myr_room_status"]
          updated_at: string
        }
        Insert: {
          available_from?: string | null
          capacity?: number
          created_at?: string
          deposit?: number
          furnishing?: Database["public"]["Enums"]["myr_furnishing"]
          gender_pref?: Database["public"]["Enums"]["myr_gender_pref"]
          has_verified_video?: boolean
          id?: string
          label: string
          listing_id: string
          rent: number
          reserved_by?: string | null
          reserved_until?: string | null
          status?: Database["public"]["Enums"]["myr_room_status"]
          updated_at?: string
        }
        Update: {
          available_from?: string | null
          capacity?: number
          created_at?: string
          deposit?: number
          furnishing?: Database["public"]["Enums"]["myr_furnishing"]
          gender_pref?: Database["public"]["Enums"]["myr_gender_pref"]
          has_verified_video?: boolean
          id?: string
          label?: string
          listing_id?: string
          rent?: number
          reserved_by?: string | null
          reserved_until?: string | null
          status?: Database["public"]["Enums"]["myr_room_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "myr_listing_rooms_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "myr_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      myr_listings: {
        Row: {
          address_line: string | null
          approved_at: string | null
          approved_by: string | null
          city: string | null
          created_at: string
          description: string | null
          has_verified_video: boolean
          id: string
          landlord_id: string
          latitude: number | null
          longitude: number | null
          normalized_address: string | null
          pincode: string | null
          rating_avg: number | null
          rating_count: number
          rejection_reason: string | null
          response_time_minutes: number | null
          rules: string | null
          state: string | null
          status: Database["public"]["Enums"]["myr_listing_status"]
          title: string
          type: Database["public"]["Enums"]["myr_listing_type"]
          updated_at: string
          view_count: number
        }
        Insert: {
          address_line?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          has_verified_video?: boolean
          id?: string
          landlord_id: string
          latitude?: number | null
          longitude?: number | null
          normalized_address?: string | null
          pincode?: string | null
          rating_avg?: number | null
          rating_count?: number
          rejection_reason?: string | null
          response_time_minutes?: number | null
          rules?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["myr_listing_status"]
          title: string
          type: Database["public"]["Enums"]["myr_listing_type"]
          updated_at?: string
          view_count?: number
        }
        Update: {
          address_line?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          has_verified_video?: boolean
          id?: string
          landlord_id?: string
          latitude?: number | null
          longitude?: number | null
          normalized_address?: string | null
          pincode?: string | null
          rating_avg?: number | null
          rating_count?: number
          rejection_reason?: string | null
          response_time_minutes?: number | null
          rules?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["myr_listing_status"]
          title?: string
          type?: Database["public"]["Enums"]["myr_listing_type"]
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      myr_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          push_sent_at: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          push_sent_at?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          push_sent_at?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      myr_reviews: {
        Row: {
          body: string | null
          booking_id: string | null
          created_at: string
          id: string
          listing_id: string
          rating: number
          stay_months: number | null
          tenant_id: string
        }
        Insert: {
          body?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          listing_id: string
          rating: number
          stay_months?: number | null
          tenant_id: string
        }
        Update: {
          body?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          rating?: number
          stay_months?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "myr_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "myr_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "myr_reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "myr_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      myr_saved_listings: {
        Row: {
          created_at: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "myr_saved_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "myr_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      myr_subscriptions: {
        Row: {
          active: boolean
          created_at: string
          current_period_end: string | null
          id: string
          landlord_id: string
          plan: Database["public"]["Enums"]["myr_plan"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          landlord_id: string
          plan?: Database["public"]["Enums"]["myr_plan"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          landlord_id?: string
          plan?: Database["public"]["Enums"]["myr_plan"]
          updated_at?: string
        }
        Relationships: []
      }
      myr_user_profiles: {
        Row: {
          account_status: string
          age: number | null
          bio: string | null
          budget_max: number | null
          budget_min: number | null
          city: string | null
          created_at: string
          diet: string | null
          display_name: string | null
          gender: string | null
          looking_for_roommate: boolean
          occupation: string | null
          photo_url: string | null
          sleep_schedule: string | null
          smoking: boolean | null
          updated_at: string
          user_id: string
          verified: boolean
        }
        Insert: {
          account_status?: string
          age?: number | null
          bio?: string | null
          budget_max?: number | null
          budget_min?: number | null
          city?: string | null
          created_at?: string
          diet?: string | null
          display_name?: string | null
          gender?: string | null
          looking_for_roommate?: boolean
          occupation?: string | null
          photo_url?: string | null
          sleep_schedule?: string | null
          smoking?: boolean | null
          updated_at?: string
          user_id: string
          verified?: boolean
        }
        Update: {
          account_status?: string
          age?: number | null
          bio?: string | null
          budget_max?: number | null
          budget_min?: number | null
          city?: string | null
          created_at?: string
          diet?: string | null
          display_name?: string | null
          gender?: string | null
          looking_for_roommate?: boolean
          occupation?: string | null
          photo_url?: string | null
          sleep_schedule?: string | null
          smoking?: boolean | null
          updated_at?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      myr_user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["myr_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["myr_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["myr_role"]
          user_id?: string
        }
        Relationships: []
      }
      myr_verifications: {
        Row: {
          created_at: string
          id: string
          id_doc_path: string | null
          kind: Database["public"]["Enums"]["myr_verification_kind"]
          listing_id: string | null
          notes: string | null
          property_doc_path: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_path: string | null
          status: Database["public"]["Enums"]["myr_verification_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          id_doc_path?: string | null
          kind: Database["public"]["Enums"]["myr_verification_kind"]
          listing_id?: string | null
          notes?: string | null
          property_doc_path?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string | null
          status?: Database["public"]["Enums"]["myr_verification_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          id_doc_path?: string | null
          kind?: Database["public"]["Enums"]["myr_verification_kind"]
          listing_id?: string | null
          notes?: string | null
          property_doc_path?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string | null
          status?: Database["public"]["Enums"]["myr_verification_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "myr_verifications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "myr_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          account: boolean
          bookings: boolean
          maintenance: boolean
          push_enabled: boolean
          quiet_end: number | null
          quiet_start: number | null
          rent: boolean
          roommate: boolean
          tz_offset_min: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account?: boolean
          bookings?: boolean
          maintenance?: boolean
          push_enabled?: boolean
          quiet_end?: number | null
          quiet_start?: number | null
          rent?: boolean
          roommate?: boolean
          tz_offset_min?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account?: boolean
          bookings?: boolean
          maintenance?: boolean
          push_enabled?: boolean
          quiet_end?: number | null
          quiet_start?: number | null
          rent?: boolean
          roommate?: boolean
          tz_offset_min?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      partner_org_members: {
        Row: {
          created_at: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "partner_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_organizations: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          verified: boolean
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          verified?: boolean
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          verified?: boolean
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          id: string
          method: string | null
          note: string | null
          owner_id: string
          paid_on: string
          screenshot_path: string | null
          tenant_user_id: string | null
          upi_ref: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          bill_id: string
          created_at?: string
          id?: string
          method?: string | null
          note?: string | null
          owner_id: string
          paid_on?: string
          screenshot_path?: string | null
          tenant_user_id?: string | null
          upi_ref?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string
          id?: string
          method?: string | null
          note?: string | null
          owner_id?: string
          paid_on?: string
          screenshot_path?: string | null
          tenant_user_id?: string | null
          upi_ref?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      photo_fingerprints: {
        Row: {
          created_at: string
          hash: string
          owner_id: string
          room_id: string
        }
        Insert: {
          created_at?: string
          hash: string
          owner_id: string
          room_id: string
        }
        Update: {
          created_at?: string
          hash?: string
          owner_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_fingerprints_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_entitlements: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          limit_value: number | null
          plan_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          limit_value?: number | null
          plan_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          limit_value?: number | null
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "feature_catalog"
            referencedColumns: ["feature_key"]
          },
          {
            foreignKeyName: "plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      product_events: {
        Row: {
          created_at: string
          event: string
          id: number
          platform: string
          props: Json
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: never
          platform?: string
          props?: Json
          role?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: never
          platform?: string
          props?: Json
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          bank_details: string | null
          business_name: string | null
          city: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          logo_url: string | null
          mobile: string | null
          phone: string | null
          primary_role: string | null
          updated_at: string
          upi_id: string | null
          upi_qr_path: string | null
          whatsapp_from: string | null
        }
        Insert: {
          address?: string | null
          bank_details?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          logo_url?: string | null
          mobile?: string | null
          phone?: string | null
          primary_role?: string | null
          updated_at?: string
          upi_id?: string | null
          upi_qr_path?: string | null
          whatsapp_from?: string | null
        }
        Update: {
          address?: string | null
          bank_details?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          logo_url?: string | null
          mobile?: string | null
          phone?: string | null
          primary_role?: string | null
          updated_at?: string
          upi_id?: string | null
          upi_qr_path?: string | null
          whatsapp_from?: string | null
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          current_terms_version: number | null
          external_ref_id: string | null
          has_verified_video: boolean
          id: string
          is_public_listing: boolean
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          myr_address: string | null
          myr_city: string | null
          myr_cover_photos: Json
          myr_description: string | null
          myr_lat: number | null
          myr_lng: number | null
          name: string
          notes: string | null
          owner_id: string
          partner_org_id: string | null
          property_type: string | null
          source: string
          terms_summary: Json | null
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          current_terms_version?: number | null
          external_ref_id?: string | null
          has_verified_video?: boolean
          id?: string
          is_public_listing?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          myr_address?: string | null
          myr_city?: string | null
          myr_cover_photos?: Json
          myr_description?: string | null
          myr_lat?: number | null
          myr_lng?: number | null
          name: string
          notes?: string | null
          owner_id: string
          partner_org_id?: string | null
          property_type?: string | null
          source?: string
          terms_summary?: Json | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          current_terms_version?: number | null
          external_ref_id?: string | null
          has_verified_video?: boolean
          id?: string
          is_public_listing?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          myr_address?: string | null
          myr_city?: string | null
          myr_cover_photos?: Json
          myr_description?: string | null
          myr_lat?: number | null
          myr_lng?: number | null
          name?: string
          notes?: string | null
          owner_id?: string
          partner_org_id?: string | null
          property_type?: string | null
          source?: string
          terms_summary?: Json | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_partner_org_id_fkey"
            columns: ["partner_org_id"]
            isOneToOne: false
            referencedRelation: "partner_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      rental_terms_versions: {
        Row: {
          change_note: string | null
          completeness: number
          created_at: string
          created_by: string
          id: string
          property_id: string
          terms: Json
          terms_hash: string
          version: number
        }
        Insert: {
          change_note?: string | null
          completeness?: number
          created_at?: string
          created_by: string
          id?: string
          property_id: string
          terms: Json
          terms_hash: string
          version: number
        }
        Update: {
          change_note?: string | null
          completeness?: number
          created_at?: string
          created_by?: string
          id?: string
          property_id?: string
          terms?: Json
          terms_hash?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_terms_versions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      request_rate_limits: {
        Row: {
          bucket: string
          key_hash: string
          requests: number
          scope: string
        }
        Insert: {
          bucket: string
          key_hash: string
          requests?: number
          scope: string
        }
        Update: {
          bucket?: string
          key_hash?: string
          requests?: number
          scope?: string
        }
        Relationships: []
      }
      room_insight_preferences: {
        Row: {
          owner_id: string
          signals_enabled: boolean
          summary_frequency: string
        }
        Insert: {
          owner_id: string
          signals_enabled?: boolean
          summary_frequency?: string
        }
        Update: {
          owner_id?: string
          signals_enabled?: boolean
          summary_frequency?: string
        }
        Relationships: []
      }
      room_insight_rollout: {
        Row: {
          enabled: boolean
          id: boolean
          pilot_owners: string[]
        }
        Insert: {
          enabled?: boolean
          id?: boolean
          pilot_owners?: string[]
        }
        Update: {
          enabled?: boolean
          id?: boolean
          pilot_owners?: string[]
        }
        Relationships: []
      }
      room_offer_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          room_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          room_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_offer_audit_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_offer_settings: {
        Row: {
          auto_approve: boolean
          min_rent: number | null
          offers_enabled: boolean
          owner_id: string
          room_id: string
          updated_at: string
        }
        Insert: {
          auto_approve?: boolean
          min_rent?: number | null
          offers_enabled?: boolean
          owner_id: string
          room_id: string
          updated_at?: string
        }
        Update: {
          auto_approve?: boolean
          min_rent?: number | null
          offers_enabled?: boolean
          owner_id?: string
          room_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_offer_settings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_reviews: {
        Row: {
          body: string | null
          created_at: string
          id: string
          matched_expectations: boolean | null
          rating: number
          room_id: string
          tenant_user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          matched_expectations?: boolean | null
          rating: number
          room_id: string
          tenant_user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          matched_expectations?: boolean | null
          rating?: number
          room_id?: string
          tenant_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_reviews_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_save_events: {
        Row: {
          day: string
          room_id: string
          user_id: string
        }
        Insert: {
          day?: string
          room_id: string
          user_id: string
        }
        Update: {
          day?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_save_events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_views: {
        Row: {
          day: string
          first_seen_at: string
          room_id: string
          video_completed_at: string | null
          viewer_key: string
        }
        Insert: {
          day?: string
          first_seen_at?: string
          room_id: string
          video_completed_at?: string | null
          viewer_key: string
        }
        Update: {
          day?: string
          first_seen_at?: string
          room_id?: string
          video_completed_at?: string | null
          viewer_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_views_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      roommate_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind?: string
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roommate_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "roommate_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      roommate_threads: {
        Row: {
          blocked_by: string | null
          created_at: string
          id: string
          last_message: string | null
          last_message_at: string
          recipient_id: string
          requester_id: string
          status: string
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string
          recipient_id: string
          requester_id: string
          status?: string
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string
          recipient_id?: string
          requester_id?: string
          status?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          auto_unpublished: boolean
          capacity: number
          cleaning_amount: number | null
          created_at: string
          external_ref_id: string | null
          has_verified_video: boolean
          id: string
          is_public: boolean
          myr_amenities: string[]
          myr_available: boolean
          myr_deposit: number | null
          myr_description: string | null
          myr_photos: Json
          notes: string | null
          occupant_type: string | null
          owner_id: string
          parking_covered: boolean | null
          parking_distance_m: number | null
          parking_kind: Database["public"]["Enums"]["parking_kind"]
          parking_notes: string | null
          parking_paid: boolean | null
          parking_reserved: boolean | null
          parking_vehicle: Database["public"]["Enums"]["parking_vehicle"] | null
          partner_org_id: string | null
          property_id: string
          rent_amount: number
          room_number: string
          room_size: string | null
          source: string
          updated_at: string
          water_per_person: number | null
        }
        Insert: {
          auto_unpublished?: boolean
          capacity?: number
          cleaning_amount?: number | null
          created_at?: string
          external_ref_id?: string | null
          has_verified_video?: boolean
          id?: string
          is_public?: boolean
          myr_amenities?: string[]
          myr_available?: boolean
          myr_deposit?: number | null
          myr_description?: string | null
          myr_photos?: Json
          notes?: string | null
          occupant_type?: string | null
          owner_id: string
          parking_covered?: boolean | null
          parking_distance_m?: number | null
          parking_kind?: Database["public"]["Enums"]["parking_kind"]
          parking_notes?: string | null
          parking_paid?: boolean | null
          parking_reserved?: boolean | null
          parking_vehicle?:
            | Database["public"]["Enums"]["parking_vehicle"]
            | null
          partner_org_id?: string | null
          property_id: string
          rent_amount?: number
          room_number: string
          room_size?: string | null
          source?: string
          updated_at?: string
          water_per_person?: number | null
        }
        Update: {
          auto_unpublished?: boolean
          capacity?: number
          cleaning_amount?: number | null
          created_at?: string
          external_ref_id?: string | null
          has_verified_video?: boolean
          id?: string
          is_public?: boolean
          myr_amenities?: string[]
          myr_available?: boolean
          myr_deposit?: number | null
          myr_description?: string | null
          myr_photos?: Json
          notes?: string | null
          occupant_type?: string | null
          owner_id?: string
          parking_covered?: boolean | null
          parking_distance_m?: number | null
          parking_kind?: Database["public"]["Enums"]["parking_kind"]
          parking_notes?: string | null
          parking_paid?: boolean | null
          parking_reserved?: boolean | null
          parking_vehicle?:
            | Database["public"]["Enums"]["parking_vehicle"]
            | null
          partner_org_id?: string | null
          property_id?: string
          rent_amount?: number
          room_number?: string
          room_size?: string | null
          source?: string
          updated_at?: string
          water_per_person?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_partner_org_id_fkey"
            columns: ["partner_org_id"]
            isOneToOne: false
            referencedRelation: "partner_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          cleaning_amount: number
          created_at: string
          electricity_per_unit: number
          id: string
          owner_id: string | null
          updated_at: string
          water_per_person: number
        }
        Insert: {
          cleaning_amount?: number
          created_at?: string
          electricity_per_unit?: number
          id?: string
          owner_id?: string | null
          updated_at?: string
          water_per_person?: number
        }
        Update: {
          cleaning_amount?: number
          created_at?: string
          electricity_per_unit?: number
          id?: string
          owner_id?: string | null
          updated_at?: string
          water_per_person?: number
        }
        Relationships: []
      }
      subscription_discounts: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          duration_months: number
          expires_at: string | null
          id: string
          kind: string
          periods_used: number
          plan_id: string
          reason: string | null
          starts_at: string
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          duration_months?: number
          expires_at?: string | null
          id?: string
          kind: string
          periods_used?: number
          plan_id: string
          reason?: string | null
          starts_at?: string
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          duration_months?: number
          expires_at?: string | null
          id?: string
          kind?: string
          periods_used?: number
          plan_id?: string
          reason?: string | null
          starts_at?: string
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_discounts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          admin_note: string | null
          amount: number
          claimed_amount: number | null
          clarification_requested: boolean
          created_at: string
          discount_amount: number
          discount_id: string | null
          gateway: string | null
          gateway_order_id: string | null
          gateway_payment_id: string | null
          id: string
          note: string | null
          original_amount: number
          payment_method: string
          payment_proof_path: string | null
          plan_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          subscription_id: string | null
          transaction_reference: string | null
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          claimed_amount?: number | null
          clarification_requested?: boolean
          created_at?: string
          discount_amount?: number
          discount_id?: string | null
          gateway?: string | null
          gateway_order_id?: string | null
          gateway_payment_id?: string | null
          id?: string
          note?: string | null
          original_amount: number
          payment_method?: string
          payment_proof_path?: string | null
          plan_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          subscription_id?: string | null
          transaction_reference?: string | null
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          claimed_amount?: number | null
          clarification_requested?: boolean
          created_at?: string
          discount_amount?: number
          discount_id?: string | null
          gateway?: string | null
          gateway_order_id?: string | null
          gateway_payment_id?: string | null
          id?: string
          note?: string | null
          original_amount?: number
          payment_method?: string
          payment_proof_path?: string | null
          plan_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          subscription_id?: string | null
          transaction_reference?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "subscription_discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          active: boolean
          billing_months: number
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          price_inr: number
          public_visible: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_months?: number
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price_inr?: number
          public_visible?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_months?: number
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_inr?: number
          public_visible?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscription_settings: {
        Row: {
          grace_days: number
          id: number
          instructions: string | null
          legacy_grandfather_done: boolean
          payee_name: string | null
          qr_path: string | null
          updated_at: string
          updated_by: string | null
          upi_id: string | null
        }
        Insert: {
          grace_days?: number
          id?: number
          instructions?: string | null
          legacy_grandfather_done?: boolean
          payee_name?: string | null
          qr_path?: string | null
          updated_at?: string
          updated_by?: string | null
          upi_id?: string | null
        }
        Update: {
          grace_days?: number
          id?: number
          instructions?: string | null
          legacy_grandfather_done?: boolean
          payee_name?: string | null
          qr_path?: string | null
          updated_at?: string
          updated_by?: string | null
          upi_id?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number | null
          created_at: string
          expires_at: string | null
          id: string
          landlord_id: string
          payment_screenshot_path: string | null
          plan: string
          started_at: string
          status: string
          updated_at: string
          upi_ref: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          landlord_id: string
          payment_screenshot_path?: string | null
          plan?: string
          started_at?: string
          status?: string
          updated_at?: string
          upi_ref?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          landlord_id?: string
          payment_screenshot_path?: string | null
          plan?: string
          started_at?: string
          status?: string
          updated_at?: string
          upi_ref?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      support_queries: {
        Row: {
          category: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          provider_id: string | null
          requester_hash: string
          status: string
          subject: string
        }
        Insert: {
          category: string
          created_at?: string
          email: string
          id: string
          message: string
          name: string
          phone?: string | null
          provider_id?: string | null
          requester_hash: string
          status?: string
          subject: string
        }
        Update: {
          category?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          provider_id?: string | null
          requester_hash?: string
          status?: string
          subject?: string
        }
        Relationships: []
      }
      tenant_documents: {
        Row: {
          admin_note: string | null
          created_at: string
          doc_type: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          doc_type: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          doc_type?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          gender: string | null
          id: string
          initial_reading: number | null
          initial_reading_date: string | null
          initial_reading_photo: string | null
          lease_end_date: string | null
          lease_notice_days: number
          move_in_date: string
          name: string
          owner_id: string
          persons: number
          phone: string
          rent_share: number | null
          room_id: string
          tenant_code: string | null
          tenant_user_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          gender?: string | null
          id?: string
          initial_reading?: number | null
          initial_reading_date?: string | null
          initial_reading_photo?: string | null
          lease_end_date?: string | null
          lease_notice_days?: number
          move_in_date?: string
          name: string
          owner_id: string
          persons?: number
          phone: string
          rent_share?: number | null
          room_id: string
          tenant_code?: string | null
          tenant_user_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          gender?: string | null
          id?: string
          initial_reading?: number | null
          initial_reading_date?: string | null
          initial_reading_photo?: string | null
          lease_end_date?: string | null
          lease_notice_days?: number
          move_in_date?: string
          name?: string
          owner_id?: string
          persons?: number
          phone?: string
          rent_share?: number | null
          room_id?: string
          tenant_code?: string | null
          tenant_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          payment_status: string | null
          plan_id: string
          source: string
          starts_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_status?: string | null
          plan_id: string
          source?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_status?: string | null
          plan_id?: string
          source?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_documents: {
        Row: {
          created_at: string
          doc_type: string
          id: string
          storage_path: string
          uploaded_by: string
          verification_id: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          id?: string
          storage_path: string
          uploaded_by: string
          verification_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          id?: string
          storage_path?: string
          uploaded_by?: string
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_documents_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      verifications: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["verification_kind"]
          landlord_user_id: string | null
          notes: string | null
          owner_id: string
          property_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["verification_status"]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["verification_kind"]
          landlord_user_id?: string | null
          notes?: string | null
          owner_id: string
          property_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["verification_kind"]
          landlord_user_id?: string | null
          notes?: string | null
          owner_id?: string
          property_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verifications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_links: {
        Row: {
          last_verified_at: string | null
          linked_at: string
          opted_in: boolean
          phone_e164: string
          user_id: string
          verified: boolean
        }
        Insert: {
          last_verified_at?: string | null
          linked_at?: string
          opted_in?: boolean
          phone_e164: string
          user_id: string
          verified?: boolean
        }
        Update: {
          last_verified_at?: string | null
          linked_at?: string
          opted_in?: boolean
          phone_e164?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          attempts: number
          created_at: string
          direction: Database["public"]["Enums"]["whatsapp_direction"]
          event_type: string
          failure_reason: string | null
          id: string
          provider_message_id: string | null
          status: Database["public"]["Enums"]["whatsapp_status"]
          template: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          direction: Database["public"]["Enums"]["whatsapp_direction"]
          event_type: string
          failure_reason?: string | null
          id?: string
          provider_message_id?: string | null
          status?: Database["public"]["Enums"]["whatsapp_status"]
          template?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          direction?: Database["public"]["Enums"]["whatsapp_direction"]
          event_type?: string
          failure_reason?: string | null
          id?: string
          provider_message_id?: string | null
          status?: Database["public"]["Enums"]["whatsapp_status"]
          template?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_room_booking: {
        Args: {
          _booking: string
          _landlord: string
          _move_in: string
          _rent?: number
        }
        Returns: Json
      }
      admin_apply_subscription_action: {
        Args: {
          _action: string
          _admin: string
          _months: number
          _plan_code: string
          _reason: string
          _target: string
        }
        Returns: Json
      }
      admin_revoke_discount: {
        Args: { _admin: string; _discount: string; _reason: string }
        Returns: undefined
      }
      admin_revoke_override: {
        Args: { _admin: string; _override: string; _reason: string }
        Returns: undefined
      }
      admin_set_discount: {
        Args: {
          _admin: string
          _discount_id?: string
          _expires: string
          _kind: string
          _months: number
          _plan_code: string
          _reason: string
          _starts: string
          _target: string
          _value: number
        }
        Returns: string
      }
      admin_set_override: {
        Args: {
          _admin: string
          _enabled: boolean
          _expires: string
          _feature: string
          _reason: string
          _target: string
        }
        Returns: string
      }
      claim_automation_slot: {
        Args: {
          _entity_id: string
          _entity_type?: string
          _job: string
          _period_key: string
        }
        Returns: boolean
      }
      claim_primary_role: { Args: { _role: string }; Returns: string }
      compute_payable: {
        Args: { _plan_code: string; _uid: string }
        Returns: Json
      }
      confirm_room_offer: {
        Args: { _booking: string; _move_in: string; _tenant: string }
        Returns: Json
      }
      consume_request_limit: {
        Args: { _key: string; _limit: number; _scope: string; _seconds: number }
        Returns: boolean
      }
      create_gateway_payment: {
        Args: {
          _gateway: string
          _order_id: string
          _plan_code: string
          _uid: string
        }
        Returns: Json
      }
      create_room_offer_booking: {
        Args: {
          _acks: Json
          _email: string
          _listened: boolean
          _message: string
          _mobile: string
          _name: string
          _offered: number
          _room: string
          _tenant: string
        }
        Returns: Json
      }
      cron_bill_reminders: { Args: never; Returns: undefined }
      cron_lease_expiry: { Args: never; Returns: undefined }
      cron_subscription_expiry: { Args: never; Returns: undefined }
      current_user_role: { Args: never; Returns: string }
      decide_meter_submission: {
        Args: {
          _approve: boolean
          _id: string
          _note: string
          _owner: string
          _reading: number
        }
        Returns: Json
      }
      decide_subscription_payment: {
        Args: {
          _admin: string
          _decision: string
          _note: string
          _payment: string
        }
        Returns: Json
      }
      delete_my_account: { Args: never; Returns: undefined }
      entitlement_limit: {
        Args: { _key: string; _uid: string }
        Returns: number
      }
      expire_booking_offers: { Args: never; Returns: number }
      finish_automation_slot: {
        Args: {
          _detail?: Json
          _entity_id: string
          _error?: string
          _job: string
          _period_key: string
          _status: string
        }
        Returns: undefined
      }
      gateway_quote: {
        Args: { _plan_code: string; _uid: string }
        Returns: number
      }
      generate_tenant_code: { Args: never; Returns: string }
      get_effective_entitlements: { Args: { _uid: string }; Returns: Json }
      has_admin_role: {
        Args: { _role: Database["public"]["Enums"]["admin_role"]; _uid: string }
        Returns: boolean
      }
      has_entitlement: {
        Args: { _key: string; _uid: string }
        Returns: boolean
      }
      is_admin: { Args: { _uid: string }; Returns: boolean }
      is_root_owner: { Args: { _uid: string }; Returns: boolean }
      is_trusted_db_session: { Args: never; Returns: boolean }
      landlord_dashboard_totals: { Args: { _owner: string }; Returns: Json }
      landlord_plan: { Args: { _uid: string }; Returns: string }
      monitor_room_insights: { Args: never; Returns: number }
      myr_has_role: {
        Args: { _role: Database["public"]["Enums"]["myr_role"]; _uid: string }
        Returns: boolean
      }
      myr_reserve_room: {
        Args: { _minutes?: number; _room_id: string }
        Returns: string
      }
      notify_room_signal: {
        Args: { _kind: string; _room: string }
        Returns: undefined
      }
      notify_user: {
        Args: {
          _body: string
          _kind: string
          _link: string
          _title: string
          _user: string
        }
        Returns: undefined
      }
      offer_agreed_rent: { Args: { _booking: string }; Returns: number }
      offer_decide: {
        Args: {
          _action: string
          _booking: string
          _counter?: number
          _landlord: string
        }
        Returns: Json
      }
      offer_respond: {
        Args: { _action: string; _booking: string; _tenant: string }
        Returns: Json
      }
      offer_submit: {
        Args: { _booking: string; _offered: number; _tenant: string }
        Returns: Json
      }
      publish_rental_terms: {
        Args: {
          _completeness: number
          _note: string
          _owner: string
          _property: string
          _terms: Json
        }
        Returns: Json
      }
      record_room_engagement: {
        Args: { _kind: string; _room: string; _user: string; _viewer: string }
        Returns: undefined
      }
      record_terms_acceptance: {
        Args: {
          _acks: Json
          _booking: string
          _listened: boolean
          _user: string
        }
        Returns: Json
      }
      record_terms_reacceptance: {
        Args: {
          _acks: Json
          _booking: string
          _listened: boolean
          _user: string
        }
        Returns: Json
      }
      reserve_room_offer: {
        Args: { _amount: number; _booking: string }
        Returns: undefined
      }
      room_active_tenants: { Args: { _room: string }; Returns: number }
      room_activity_spikes: {
        Args: never
        Returns: {
          offers: number
          room_id: string
          room_number: string
          views: number
        }[]
      }
      room_insight_counts: {
        Args: { _days?: number; _owner: string }
        Returns: {
          bookings: number
          has_photos: boolean
          has_video: boolean
          offers: number
          requests: number
          room_id: string
          room_number: string
          saves: number
          video_completions: number
          views: number
        }[]
      }
      room_insights_enabled: { Args: { _owner: string }; Returns: boolean }
      run_room_insight_summaries: { Args: never; Returns: number }
      settle_gateway_payment: {
        Args: {
          _amount_paise: number
          _gateway: string
          _gateway_payment_id: string
          _order_id: string
        }
        Returns: Json
      }
      sub_audit: {
        Args: {
          _action: string
          _admin: string
          _new: Json
          _prev: Json
          _reason: string
          _target: string
        }
        Returns: undefined
      }
      sub_effective_plan_code: { Args: { _uid: string }; Returns: string }
      sub_grace_days: { Args: never; Returns: number }
      submit_subscription_payment: {
        Args: {
          _claimed: number
          _note: string
          _plan_code: string
          _proof: string
          _txn: string
          _uid: string
        }
        Returns: Json
      }
      sync_room_availability: { Args: { _room: string }; Returns: undefined }
      tenant_verified: { Args: { _uid: string }; Returns: boolean }
      terms_gate_status: { Args: { _tenant_id: string }; Returns: string }
      terms_reaccept_status: { Args: { _booking: string }; Returns: Json }
    }
    Enums: {
      admin_role:
        | "root_owner"
        | "full_admin"
        | "support_admin"
        | "subscription_admin"
        | "property_admin"
        | "finance_admin"
      deposit_status: "held" | "partial_refunded" | "refunded" | "forfeited"
      fraud_severity: "low" | "medium" | "high" | "critical"
      live_feed_status: "pending" | "verified" | "flagged" | "rejected"
      move_kind: "move_in" | "move_out"
      myr_booking_status:
        | "reserved"
        | "confirmed"
        | "cancelled"
        | "expired"
        | "completed"
      myr_furnishing: "unfurnished" | "semi" | "full"
      myr_gender_pref: "any" | "male" | "female"
      myr_listing_status:
        | "draft"
        | "pending_review"
        | "active"
        | "rejected"
        | "paused"
        | "archived"
      myr_listing_type: "pg" | "room" | "flat" | "hostel" | "shared"
      myr_payment_status: "pending" | "paid" | "failed" | "refunded"
      myr_plan: "free" | "basic" | "premium" | "business"
      myr_role: "tenant" | "landlord" | "super_admin"
      myr_room_status: "available" | "reserved" | "occupied" | "maintenance"
      myr_verification_kind: "tenant" | "landlord" | "property"
      myr_verification_status: "pending" | "verified" | "rejected"
      parking_kind:
        | "dedicated"
        | "shared"
        | "nearby"
        | "street"
        | "none"
        | "unspecified"
      parking_vehicle: "two_wheeler" | "four_wheeler" | "both"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status: "open" | "in_progress" | "resolved" | "closed"
      verification_kind: "tenant" | "landlord" | "property"
      verification_status: "pending" | "verified" | "rejected"
      whatsapp_direction: "outbound" | "inbound"
      whatsapp_status:
        | "queued"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "mocked"
        | "received"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_role: [
        "root_owner",
        "full_admin",
        "support_admin",
        "subscription_admin",
        "property_admin",
        "finance_admin",
      ],
      deposit_status: ["held", "partial_refunded", "refunded", "forfeited"],
      fraud_severity: ["low", "medium", "high", "critical"],
      live_feed_status: ["pending", "verified", "flagged", "rejected"],
      move_kind: ["move_in", "move_out"],
      myr_booking_status: [
        "reserved",
        "confirmed",
        "cancelled",
        "expired",
        "completed",
      ],
      myr_furnishing: ["unfurnished", "semi", "full"],
      myr_gender_pref: ["any", "male", "female"],
      myr_listing_status: [
        "draft",
        "pending_review",
        "active",
        "rejected",
        "paused",
        "archived",
      ],
      myr_listing_type: ["pg", "room", "flat", "hostel", "shared"],
      myr_payment_status: ["pending", "paid", "failed", "refunded"],
      myr_plan: ["free", "basic", "premium", "business"],
      myr_role: ["tenant", "landlord", "super_admin"],
      myr_room_status: ["available", "reserved", "occupied", "maintenance"],
      myr_verification_kind: ["tenant", "landlord", "property"],
      myr_verification_status: ["pending", "verified", "rejected"],
      parking_kind: [
        "dedicated",
        "shared",
        "nearby",
        "street",
        "none",
        "unspecified",
      ],
      parking_vehicle: ["two_wheeler", "four_wheeler", "both"],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: ["open", "in_progress", "resolved", "closed"],
      verification_kind: ["tenant", "landlord", "property"],
      verification_status: ["pending", "verified", "rejected"],
      whatsapp_direction: ["outbound", "inbound"],
      whatsapp_status: [
        "queued",
        "sent",
        "delivered",
        "read",
        "failed",
        "mocked",
        "received",
      ],
    },
  },
} as const
