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
    PostgrestVersion: "14.5"
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
      bookings: {
        Row: {
          created_at: string
          decided_at: string | null
          id: string
          landlord_id: string
          message: string | null
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
          created_at?: string
          decided_at?: string | null
          id?: string
          landlord_id: string
          message?: string | null
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
          created_at?: string
          decided_at?: string | null
          id?: string
          landlord_id?: string
          message?: string | null
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
      live_feed_videos: {
        Row: {
          captured_lat: number | null
          captured_lng: number | null
          created_at: string
          distance_m: number | null
          duration_seconds: number | null
          id: string
          mime_type: string | null
          myr_listing_id: string | null
          myr_room_id: string | null
          owner_id: string
          property_id: string | null
          random_prompt: string
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
          id?: string
          mime_type?: string | null
          myr_listing_id?: string | null
          myr_room_id?: string | null
          owner_id: string
          property_id?: string | null
          random_prompt: string
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
          id?: string
          mime_type?: string | null
          myr_listing_id?: string | null
          myr_room_id?: string | null
          owner_id?: string
          property_id?: string | null
          random_prompt?: string
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
          bio: string | null
          city: string | null
          created_at: string
          display_name: string | null
          gender: string | null
          occupation: string | null
          photo_url: string | null
          updated_at: string
          user_id: string
          verified: boolean
        }
        Insert: {
          account_status?: string
          bio?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          gender?: string | null
          occupation?: string | null
          photo_url?: string | null
          updated_at?: string
          user_id: string
          verified?: boolean
        }
        Update: {
          account_status?: string
          bio?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          gender?: string | null
          occupation?: string | null
          photo_url?: string | null
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
          property_type: string | null
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
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
          property_type?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
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
          property_type?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      rooms: {
        Row: {
          cleaning_amount: number | null
          created_at: string
          has_verified_video: boolean
          id: string
          is_public: boolean
          myr_amenities: string[]
          myr_available: boolean
          myr_deposit: number | null
          myr_description: string | null
          myr_photos: Json
          notes: string | null
          owner_id: string
          property_id: string
          rent_amount: number
          room_number: string
          updated_at: string
          water_per_person: number | null
        }
        Insert: {
          cleaning_amount?: number | null
          created_at?: string
          has_verified_video?: boolean
          id?: string
          is_public?: boolean
          myr_amenities?: string[]
          myr_available?: boolean
          myr_deposit?: number | null
          myr_description?: string | null
          myr_photos?: Json
          notes?: string | null
          owner_id: string
          property_id: string
          rent_amount?: number
          room_number: string
          updated_at?: string
          water_per_person?: number | null
        }
        Update: {
          cleaning_amount?: number | null
          created_at?: string
          has_verified_video?: boolean
          id?: string
          is_public?: boolean
          myr_amenities?: string[]
          myr_available?: boolean
          myr_deposit?: number | null
          myr_description?: string | null
          myr_photos?: Json
          notes?: string | null
          owner_id?: string
          property_id?: string
          rent_amount?: number
          room_number?: string
          updated_at?: string
          water_per_person?: number | null
        }
        Relationships: [
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
      tenants: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          initial_reading: number | null
          initial_reading_date: string | null
          initial_reading_photo: string | null
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
          id?: string
          initial_reading?: number | null
          initial_reading_date?: string | null
          initial_reading_photo?: string | null
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
          id?: string
          initial_reading?: number | null
          initial_reading_date?: string | null
          initial_reading_photo?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_primary_role: { Args: { _role: string }; Returns: string }
      cron_bill_reminders: { Args: never; Returns: undefined }
      current_user_role: { Args: never; Returns: string }
      delete_my_account: { Args: never; Returns: undefined }
      generate_tenant_code: { Args: never; Returns: string }
      has_admin_role: {
        Args: { _role: Database["public"]["Enums"]["admin_role"]; _uid: string }
        Returns: boolean
      }
      is_admin: { Args: { _uid: string }; Returns: boolean }
      is_root_owner: { Args: { _uid: string }; Returns: boolean }
      landlord_plan: { Args: { _uid: string }; Returns: string }
      myr_has_role: {
        Args: { _role: Database["public"]["Enums"]["myr_role"]; _uid: string }
        Returns: boolean
      }
      myr_reserve_room: {
        Args: { _minutes?: number; _room_id: string }
        Returns: string
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
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status: "open" | "in_progress" | "resolved" | "closed"
      verification_kind: "tenant" | "landlord" | "property"
      verification_status: "pending" | "verified" | "rejected"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
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
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: ["open", "in_progress", "resolved", "closed"],
      verification_kind: ["tenant", "landlord", "property"],
      verification_status: ["pending", "verified", "rejected"],
    },
  },
} as const
