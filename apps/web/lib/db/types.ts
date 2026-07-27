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
      admin_allowlist: {
        Row: {
          created_at: string
          email: string
          note: string | null
        }
        Insert: {
          created_at?: string
          email: string
          note?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          note?: string | null
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          image_path: string
          slug: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_path: string
          slug: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_path?: string
          slug?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_audit_events: {
        Row: {
          action: string
          actor_kind: string
          actor_user_id: string | null
          booking_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["booking_status"] | null
          id: string
          metadata: Json
          to_status: Database["public"]["Enums"]["booking_status"] | null
        }
        Insert: {
          action: string
          actor_kind: string
          actor_user_id?: string | null
          booking_id: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: string
          metadata?: Json
          to_status?: Database["public"]["Enums"]["booking_status"] | null
        }
        Update: {
          action?: string
          actor_kind?: string
          actor_user_id?: string | null
          booking_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: string
          metadata?: Json
          to_status?: Database["public"]["Enums"]["booking_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_audit_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_automation_jobs: {
        Row: {
          attempt_count: number
          booking_id: string
          completed_at: string | null
          created_at: string
          event_key: string
          id: string
          kind: string
          last_error_at: string | null
          last_error_class: string | null
          lease_expires_at: string | null
          lease_token: string | null
          next_attempt_at: string
          run_at: string
          source_id: string | null
          status: string
          terminal_at: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          booking_id: string
          completed_at?: string | null
          created_at?: string
          event_key: string
          id?: string
          kind: string
          last_error_at?: string | null
          last_error_class?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          next_attempt_at: string
          run_at: string
          source_id?: string | null
          status?: string
          terminal_at?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          booking_id?: string
          completed_at?: string | null
          created_at?: string
          event_key?: string
          id?: string
          kind?: string
          last_error_at?: string | null
          last_error_class?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          next_attempt_at?: string
          run_at?: string
          source_id?: string | null
          status?: string
          terminal_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_automation_jobs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_disputes: {
        Row: {
          audit_note: string | null
          booking_id: string
          category: Database["public"]["Enums"]["booking_dispute_category"]
          created_at: string
          customer_id: string
          dispute_due_at: string | null
          id: string
          narrative: string
          opened_at: string
          resolution_kind:
            | Database["public"]["Enums"]["booking_dispute_resolution"]
            | null
          resolved_at: string | null
          resolved_billable_minutes: number | null
          resolver_id: string | null
          status: Database["public"]["Enums"]["booking_dispute_status"]
        }
        Insert: {
          audit_note?: string | null
          booking_id: string
          category: Database["public"]["Enums"]["booking_dispute_category"]
          created_at?: string
          customer_id: string
          dispute_due_at?: string | null
          id?: string
          narrative: string
          opened_at?: string
          resolution_kind?:
            | Database["public"]["Enums"]["booking_dispute_resolution"]
            | null
          resolved_at?: string | null
          resolved_billable_minutes?: number | null
          resolver_id?: string | null
          status?: Database["public"]["Enums"]["booking_dispute_status"]
        }
        Update: {
          audit_note?: string | null
          booking_id?: string
          category?: Database["public"]["Enums"]["booking_dispute_category"]
          created_at?: string
          customer_id?: string
          dispute_due_at?: string | null
          id?: string
          narrative?: string
          opened_at?: string
          resolution_kind?:
            | Database["public"]["Enums"]["booking_dispute_resolution"]
            | null
          resolved_at?: string | null
          resolved_billable_minutes?: number | null
          resolver_id?: string | null
          status?: Database["public"]["Enums"]["booking_dispute_status"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_disputes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_disputes_resolver_id_fkey"
            columns: ["resolver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_drafts: {
        Row: {
          address: string
          address_kind: string
          booking_id: string
          cleanup_attempt_count: number
          cleanup_last_error: string | null
          cleanup_lease_expires_at: string | null
          cleanup_lease_token: string | null
          cleanup_next_attempt_at: string | null
          cleanup_status: string
          created_at: string
          customer_id: string
          details: string
          estimated_minutes: number
          expires_at: string
          hourly_rate_cents: number
          id: string
          job_zip: string
          latitude: number | null
          longitude: number | null
          on_decline_preference: Database["public"]["Enums"]["booking_decline_preference"]
          original_booking_id: string | null
          provider_service_id: string
          scheduled_at: string
          service_city: string
          stripe_customer_id: string | null
          stripe_payment_intent_id: string
          time_flexibility: Database["public"]["Enums"]["booking_time_flexibility"]
        }
        Insert: {
          address: string
          address_kind?: string
          booking_id: string
          cleanup_attempt_count?: number
          cleanup_last_error?: string | null
          cleanup_lease_expires_at?: string | null
          cleanup_lease_token?: string | null
          cleanup_next_attempt_at?: string | null
          cleanup_status?: string
          created_at?: string
          customer_id: string
          details?: string
          estimated_minutes: number
          expires_at: string
          hourly_rate_cents: number
          id?: string
          job_zip: string
          latitude?: number | null
          longitude?: number | null
          on_decline_preference?: Database["public"]["Enums"]["booking_decline_preference"]
          original_booking_id?: string | null
          provider_service_id: string
          scheduled_at: string
          service_city?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id: string
          time_flexibility?: Database["public"]["Enums"]["booking_time_flexibility"]
        }
        Update: {
          address?: string
          address_kind?: string
          booking_id?: string
          cleanup_attempt_count?: number
          cleanup_last_error?: string | null
          cleanup_lease_expires_at?: string | null
          cleanup_lease_token?: string | null
          cleanup_next_attempt_at?: string | null
          cleanup_status?: string
          created_at?: string
          customer_id?: string
          details?: string
          estimated_minutes?: number
          expires_at?: string
          hourly_rate_cents?: number
          id?: string
          job_zip?: string
          latitude?: number | null
          longitude?: number | null
          on_decline_preference?: Database["public"]["Enums"]["booking_decline_preference"]
          original_booking_id?: string | null
          provider_service_id?: string
          scheduled_at?: string
          service_city?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string
          time_flexibility?: Database["public"]["Enums"]["booking_time_flexibility"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_drafts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_drafts_original_booking_id_fkey"
            columns: ["original_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_drafts_provider_service_id_fkey"
            columns: ["provider_service_id"]
            isOneToOne: false
            referencedRelation: "provider_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_drafts_provider_service_id_fkey"
            columns: ["provider_service_id"]
            isOneToOne: false
            referencedRelation: "public_provider_offerings"
            referencedColumns: ["provider_service_id"]
          },
        ]
      }
      booking_invoices: {
        Row: {
          autocharge_at: string | null
          billing_basis: string
          booking_id: string
          created_at: string
          customer_confirmed_at: string | null
          estimated_minutes_snapshot: number | null
          first_hour_credit_cents: number
          hourly_rate_cents_snapshot: number | null
          id: string
          platform_fee_bps_snapshot: number
          provider_explanation: string
          quote_total_cents_snapshot: number | null
          remaining_balance_cents: number
          resolved_at: string | null
          status: Database["public"]["Enums"]["booking_invoice_status"]
          submitted_at: string | null
          submitted_minutes: number | null
          subtotal_cents: number
          total_platform_fee_cents: number
          updated_at: string
        }
        Insert: {
          autocharge_at?: string | null
          billing_basis?: string
          booking_id: string
          created_at?: string
          customer_confirmed_at?: string | null
          estimated_minutes_snapshot: number | null
          first_hour_credit_cents: number
          hourly_rate_cents_snapshot?: number | null
          id?: string
          platform_fee_bps_snapshot: number
          provider_explanation?: string
          quote_total_cents_snapshot?: number | null
          remaining_balance_cents: number
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["booking_invoice_status"]
          submitted_at?: string | null
          submitted_minutes?: number | null
          subtotal_cents: number
          total_platform_fee_cents: number
          updated_at?: string
        }
        Update: {
          autocharge_at?: string | null
          billing_basis?: string
          booking_id?: string
          created_at?: string
          customer_confirmed_at?: string | null
          estimated_minutes_snapshot?: number | null
          first_hour_credit_cents?: number
          hourly_rate_cents_snapshot?: number | null
          id?: string
          platform_fee_bps_snapshot?: number
          provider_explanation?: string
          quote_total_cents_snapshot?: number | null
          remaining_balance_cents?: number
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["booking_invoice_status"]
          submitted_at?: string | null
          submitted_minutes?: number | null
          subtotal_cents?: number
          total_platform_fee_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_quote_counter_options: {
        Row: {
          booking_id: string
          daypart: Database["public"]["Enums"]["quote_daypart"]
          expires_at: string
          id: string
          local_date: string
          offered_at: string
          ordinal: number
          round_number: number
          selected_at: string | null
        }
        Insert: {
          booking_id: string
          daypart: Database["public"]["Enums"]["quote_daypart"]
          expires_at: string
          id?: string
          local_date: string
          offered_at?: string
          ordinal: number
          round_number: number
          selected_at?: string | null
        }
        Update: {
          booking_id?: string
          daypart?: Database["public"]["Enums"]["quote_daypart"]
          expires_at?: string
          id?: string
          local_date?: string
          offered_at?: string
          ordinal?: number
          round_number?: number
          selected_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_quote_counter_options_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_quote_provider_estimates: {
        Row: {
          booking_id: string
          estimated_minutes: number
          updated_at: string
        }
        Insert: {
          booking_id: string
          estimated_minutes: number
          updated_at?: string
        }
        Update: {
          booking_id?: string
          estimated_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_quote_provider_estimates_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payments: {
        Row: {
          action_required_reason: string | null
          amount_cents: number
          application_fee_cents: number
          attempt_count: number
          authorized_at: string | null
          booking_id: string
          charge_model: Database["public"]["Enums"]["booking_charge_model"]
          created_at: string
          currency: string
          customer_authorization_version: string
          failed_at: string | null
          failure_code: string | null
          failure_details: Json | null
          failure_message: string | null
          id: string
          idempotency_key: string
          invoice_id: string | null
          kind: Database["public"]["Enums"]["booking_payment_kind"]
          status: Database["public"]["Enums"]["booking_payment_status"]
          stripe_connected_account_id: string
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_method_id: string | null
          succeeded_at: string | null
          updated_at: string
        }
        Insert: {
          action_required_reason?: string | null
          amount_cents: number
          application_fee_cents: number
          attempt_count?: number
          authorized_at?: string | null
          booking_id: string
          charge_model?: Database["public"]["Enums"]["booking_charge_model"]
          created_at?: string
          currency?: string
          customer_authorization_version: string
          failed_at?: string | null
          failure_code?: string | null
          failure_details?: Json | null
          failure_message?: string | null
          id?: string
          idempotency_key: string
          invoice_id?: string | null
          kind: Database["public"]["Enums"]["booking_payment_kind"]
          status?: Database["public"]["Enums"]["booking_payment_status"]
          stripe_connected_account_id: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          succeeded_at?: string | null
          updated_at?: string
        }
        Update: {
          action_required_reason?: string | null
          amount_cents?: number
          application_fee_cents?: number
          attempt_count?: number
          authorized_at?: string | null
          booking_id?: string
          charge_model?: Database["public"]["Enums"]["booking_charge_model"]
          created_at?: string
          currency?: string
          customer_authorization_version?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_details?: Json | null
          failure_message?: string | null
          id?: string
          idempotency_key?: string
          invoice_id?: string | null
          kind?: Database["public"]["Enums"]["booking_payment_kind"]
          status?: Database["public"]["Enums"]["booking_payment_status"]
          stripe_connected_account_id?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          succeeded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "booking_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_provider_payouts: {
        Row: {
          amount_cents: number
          booking_id: string
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          paid_at: string | null
          payment_id: string | null
          status: string
          stripe_destination_account_id: string
          stripe_source_charge_id: string | null
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          booking_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          paid_at?: string | null
          payment_id?: string | null
          status?: string
          stripe_destination_account_id: string
          stripe_source_charge_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          paid_at?: string | null
          payment_id?: string | null
          status?: string
          stripe_destination_account_id?: string
          stripe_source_charge_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_provider_payouts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_provider_payouts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "booking_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_refunds: {
        Row: {
          amount_cents: number
          booking_id: string
          created_at: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string
          payment_id: string
          reason: string
          refund_application_fee: boolean
          reversal_metadata: Json | null
          reverse_transfer: boolean
          status: Database["public"]["Enums"]["booking_refund_status"]
          stripe_refund_id: string | null
          stripe_transfer_reversal_id: string | null
          succeeded_at: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          booking_id: string
          created_at?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key: string
          payment_id: string
          reason: string
          refund_application_fee?: boolean
          reversal_metadata?: Json | null
          reverse_transfer?: boolean
          status?: Database["public"]["Enums"]["booking_refund_status"]
          stripe_refund_id?: string | null
          stripe_transfer_reversal_id?: string | null
          succeeded_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          created_at?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key?: string
          payment_id?: string
          reason?: string
          refund_application_fee?: boolean
          reversal_metadata?: Json | null
          reverse_transfer?: boolean
          status?: Database["public"]["Enums"]["booking_refund_status"]
          stripe_refund_id?: string | null
          stripe_transfer_reversal_id?: string | null
          succeeded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "booking_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          accepted_at: string | null
          address: string
          address_kind: string
          arrived_at: string | null
          average_quote_cents_snapshot: number | null
          billing_increment_minutes: number | null
          billing_minimum_minutes: number | null
          booking_flow: Database["public"]["Enums"]["booking_flow"]
          cancellation_notice_hours: number | null
          cancellation_policy_result: string | null
          cancellation_policy_version: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: Database["public"]["Enums"]["user_role"] | null
          cash_settled_at: string | null
          counter_note: string | null
          countered_at: string | null
          created_at: string
          customer_authorization_snapshot: Json | null
          customer_authorization_version: string | null
          customer_id: string
          customer_name_snapshot: string | null
          details: string
          deposit_bps: number | null
          dismissed_at: string | null
          en_route_at: string | null
          estimated_minutes: number | null
          expired_at: string | null
          fee_policy_version: string | null
          hourly_rate_cents_snapshot: number | null
          id: string
          initial_payment_due_at: string | null
          job_photos: Json
          job_zip: string | null
          latitude: number | null
          longitude: number | null
          on_decline_preference: Database["public"]["Enums"]["booking_decline_preference"]
          pilot_timezone: string
          platform_fee_bps: number | null
          platform_fee_cents: number
          policy_snapshot: Json | null
          price_cents: number
          proposed_start_at: string | null
          provider_display_name_snapshot: string | null
          provider_id: string
          quote_sent_at: string | null
          quote_negotiation_round: number
          replaced_by_booking_id: string | null
          replacement_for_booking_id: string | null
          response_alert_at: string | null
          response_alerted_at: string | null
          response_window_hours: number | null
          review_prompt_dismissed_at: string | null
          requested_daypart: Database["public"]["Enums"]["quote_daypart"] | null
          requested_local_date: string | null
          scheduled_at: string | null
          service_city: string
          service_id: string
          service_name_snapshot: string | null
          status: Database["public"]["Enums"]["booking_status"]
          stripe_payment_intent_id: string | null
          terms_version: string | null
          time_flexibility: Database["public"]["Enums"]["booking_time_flexibility"]
          upfront_payment_cents: number | null
          withdrawal_reason: string | null
          withdrawn_at: string | null
          withdrawn_by: string | null
          work_completed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          address: string
          address_kind?: string
          arrived_at?: string | null
          average_quote_cents_snapshot?: number | null
          billing_increment_minutes?: number | null
          billing_minimum_minutes?: number | null
          booking_flow?: Database["public"]["Enums"]["booking_flow"]
          cancellation_notice_hours?: number | null
          cancellation_policy_result?: string | null
          cancellation_policy_version?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_role?: Database["public"]["Enums"]["user_role"] | null
          cash_settled_at?: string | null
          counter_note?: string | null
          countered_at?: string | null
          created_at?: string
          customer_authorization_snapshot?: Json | null
          customer_authorization_version?: string | null
          customer_id: string
          customer_name_snapshot?: string | null
          details?: string
          deposit_bps?: number | null
          dismissed_at?: string | null
          en_route_at?: string | null
          estimated_minutes?: number | null
          expired_at?: string | null
          fee_policy_version?: string | null
          hourly_rate_cents_snapshot?: number | null
          id?: string
          initial_payment_due_at?: string | null
          job_photos?: Json
          job_zip?: string | null
          latitude?: number | null
          longitude?: number | null
          on_decline_preference?: Database["public"]["Enums"]["booking_decline_preference"]
          pilot_timezone?: string
          platform_fee_bps?: number | null
          platform_fee_cents: number
          policy_snapshot?: Json | null
          price_cents: number
          proposed_start_at?: string | null
          provider_display_name_snapshot?: string | null
          provider_id: string
          quote_sent_at?: string | null
          quote_negotiation_round?: number
          replaced_by_booking_id?: string | null
          replacement_for_booking_id?: string | null
          response_alert_at?: string | null
          response_alerted_at?: string | null
          response_window_hours?: number | null
          review_prompt_dismissed_at?: string | null
          requested_daypart?: Database["public"]["Enums"]["quote_daypart"] | null
          requested_local_date?: string | null
          scheduled_at?: string | null
          service_city?: string
          service_id: string
          service_name_snapshot?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_payment_intent_id?: string | null
          terms_version?: string | null
          time_flexibility?: Database["public"]["Enums"]["booking_time_flexibility"]
          upfront_payment_cents?: number | null
          withdrawal_reason?: string | null
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          work_completed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          address?: string
          address_kind?: string
          arrived_at?: string | null
          average_quote_cents_snapshot?: number | null
          billing_increment_minutes?: number | null
          billing_minimum_minutes?: number | null
          booking_flow?: Database["public"]["Enums"]["booking_flow"]
          cancellation_notice_hours?: number | null
          cancellation_policy_result?: string | null
          cancellation_policy_version?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_role?: Database["public"]["Enums"]["user_role"] | null
          cash_settled_at?: string | null
          counter_note?: string | null
          countered_at?: string | null
          created_at?: string
          customer_authorization_snapshot?: Json | null
          customer_authorization_version?: string | null
          customer_id?: string
          customer_name_snapshot?: string | null
          details?: string
          deposit_bps?: number | null
          dismissed_at?: string | null
          en_route_at?: string | null
          estimated_minutes?: number | null
          expired_at?: string | null
          fee_policy_version?: string | null
          hourly_rate_cents_snapshot?: number | null
          id?: string
          initial_payment_due_at?: string | null
          job_photos?: Json
          job_zip?: string | null
          latitude?: number | null
          longitude?: number | null
          on_decline_preference?: Database["public"]["Enums"]["booking_decline_preference"]
          pilot_timezone?: string
          platform_fee_bps?: number | null
          platform_fee_cents?: number
          policy_snapshot?: Json | null
          price_cents?: number
          proposed_start_at?: string | null
          provider_display_name_snapshot?: string | null
          provider_id?: string
          quote_sent_at?: string | null
          quote_negotiation_round?: number
          replaced_by_booking_id?: string | null
          replacement_for_booking_id?: string | null
          response_alert_at?: string | null
          response_alerted_at?: string | null
          response_window_hours?: number | null
          review_prompt_dismissed_at?: string | null
          requested_daypart?: Database["public"]["Enums"]["quote_daypart"] | null
          requested_local_date?: string | null
          scheduled_at?: string | null
          service_city?: string
          service_id?: string
          service_name_snapshot?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_payment_intent_id?: string | null
          terms_version?: string | null
          time_flexibility?: Database["public"]["Enums"]["booking_time_flexibility"]
          upfront_payment_cents?: number | null
          withdrawal_reason?: string | null
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          work_completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "public_provider_directory"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "bookings_replaced_by_booking_id_fkey"
            columns: ["replaced_by_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_replacement_for_booking_id_fkey"
            columns: ["replacement_for_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_withdrawn_by_fkey"
            columns: ["withdrawn_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_resolutions: {
        Row: {
          conversation_id: string
          resolved_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          resolved_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          resolved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_resolutions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_resolutions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          booking_id: string | null
          created_at: string
          customer_id: string
          id: string
          provider_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          provider_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "public_provider_directory"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempt_count: number
          available_at: string
          booking_id: string | null
          created_at: string
          delivered_at: string | null
          delivery_detail: string | null
          delivery_event_at: string | null
          delivery_issue_at: string | null
          delivery_status:
            | Database["public"]["Enums"]["email_delivery_status"]
            | null
          event_key: string
          id: string
          last_error: string | null
          last_error_at: string | null
          last_error_class: string | null
          lease_expires_at: string | null
          lease_token: string | null
          locked_at: string | null
          next_attempt_at: string
          payload: Json
          provider_message_id: string | null
          recipient_email: string
          recipient_user_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["email_outbox_status"]
          template: string
          terminal_at: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          booking_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_detail?: string | null
          delivery_event_at?: string | null
          delivery_issue_at?: string | null
          delivery_status?:
            | Database["public"]["Enums"]["email_delivery_status"]
            | null
          event_key: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_error_class?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          payload?: Json
          provider_message_id?: string | null
          recipient_email: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_outbox_status"]
          template: string
          terminal_at?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          booking_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_detail?: string | null
          delivery_event_at?: string | null
          delivery_issue_at?: string | null
          delivery_status?:
            | Database["public"]["Enums"]["email_delivery_status"]
            | null
          event_key?: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_error_class?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          payload?: Json
          provider_message_id?: string | null
          recipient_email?: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_outbox_status"]
          template?: string
          terminal_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          cleared_at: string | null
          created_at: string
          detail: string | null
          provider_message_id: string
          reason: string
          recipient_email: string
          suppressed_at: string
          updated_at: string
        }
        Insert: {
          cleared_at?: string | null
          created_at?: string
          detail?: string | null
          provider_message_id: string
          reason: string
          recipient_email: string
          suppressed_at: string
          updated_at?: string
        }
        Update: {
          cleared_at?: string | null
          created_at?: string
          detail?: string | null
          provider_message_id?: string
          reason?: string
          recipient_email?: string
          suppressed_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          booking_id: string | null
          content_hash: string
          id: string
          ip_address: unknown
          kind: Database["public"]["Enums"]["legal_acceptance_kind"]
          role: Database["public"]["Enums"]["user_role"]
          service_name: string | null
          service_slug: string | null
          signer_name: string
          snapshot: Json
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          booking_id?: string | null
          content_hash: string
          id?: string
          ip_address?: unknown
          kind: Database["public"]["Enums"]["legal_acceptance_kind"]
          role: Database["public"]["Enums"]["user_role"]
          service_name?: string | null
          service_slug?: string | null
          signer_name: string
          snapshot?: Json
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          booking_id?: string | null
          content_hash?: string
          id?: string
          ip_address?: unknown
          kind?: Database["public"]["Enums"]["legal_acceptance_kind"]
          role?: Database["public"]["Enums"]["user_role"]
          service_name?: string | null
          service_slug?: string | null
          signer_name?: string
          snapshot?: Json
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_acceptances_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_acceptances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          body: string
          conversation_id: string
          created_at: string
          id: string
          image_path: string | null
          moderation_status: Database["public"]["Enums"]["moderation_status"]
          sender_id: string
        }
        Insert: {
          attachments?: Json
          body?: string
          conversation_id: string
          created_at?: string
          id?: string
          image_path?: string | null
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          sender_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          image_path?: string | null
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_events: {
        Row: {
          created_at: string
          id: string
          matched_patterns: string[]
          message_id: string
          original_body: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          matched_patterns?: string[]
          message_id: string
          original_body: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          matched_patterns?: string[]
          message_id?: string
          original_body?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_events_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_reports: {
        Row: {
          created_at: string
          id: string
          message_id: string | null
          reason: string
          reported_user_id: string | null
          reporter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id?: string | null
          reason: string
          reported_user_id?: string | null
          reporter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string | null
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_moderation_events: {
        Row: {
          created_at: string
          field: string
          flagged_text: string
          id: string
          matched_patterns: string[]
          provider_id: string
          resolved_at: string | null
          resolved_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          field: string
          flagged_text: string
          id?: string
          matched_patterns?: string[]
          provider_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          field?: string
          flagged_text?: string
          id?: string
          matched_patterns?: string[]
          provider_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_moderation_events_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_moderation_events_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "public_provider_directory"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "profile_moderation_events_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_moderation_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_line1: string
          address_line2: string
          city: string
          created_at: string
          date_of_birth: string | null
          full_name: string
          geocoded_at: string | null
          id: string
          latitude: number | null
          longitude: number | null
          postal_code: string
          role: Database["public"]["Enums"]["user_role"]
          state: string
        }
        Insert: {
          address_line1?: string
          address_line2?: string
          city?: string
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          geocoded_at?: string | null
          id: string
          latitude?: number | null
          longitude?: number | null
          postal_code?: string
          role?: Database["public"]["Enums"]["user_role"]
          state?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string
          city?: string
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          geocoded_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          postal_code?: string
          role?: Database["public"]["Enums"]["user_role"]
          state?: string
        }
        Relationships: []
      }
      provider_availability_overrides: {
        Row: {
          created_at: string
          end_local: string | null
          id: string
          is_available: boolean
          local_date: string
          provider_id: string
          start_local: string | null
        }
        Insert: {
          created_at?: string
          end_local?: string | null
          id?: string
          is_available: boolean
          local_date: string
          provider_id: string
          start_local?: string | null
        }
        Update: {
          created_at?: string
          end_local?: string | null
          id?: string
          is_available?: boolean
          local_date?: string
          provider_id?: string
          start_local?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_availability_overrides_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_availability_overrides_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "public_provider_directory"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      provider_availability_windows: {
        Row: {
          end_local: string
          id: string
          provider_id: string
          start_local: string
          weekday: number
        }
        Insert: {
          end_local: string
          id?: string
          provider_id: string
          start_local: string
          weekday: number
        }
        Update: {
          end_local?: string
          id?: string
          provider_id?: string
          start_local?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "provider_availability_windows_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_availability_windows_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "public_provider_directory"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      provider_email_verifications: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_email_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_profiles: {
        Row: {
          availability: Json
          availability_end_local: string | null
          availability_note: string
          availability_start_local: string | null
          availability_weekdays: number[]
          avatar_focal_x: number
          avatar_focal_y: number
          avatar_image_path: string | null
          background_check_status: Database["public"]["Enums"]["background_check_status"]
          banner_focal_x: number
          banner_focal_y: number
          banner_image_path: string | null
          banner_style: string
          bio: string
          company_name: string | null
          created_at: string
          display_name: string
          greek_organization: string
          id: string
          id_document_back_url: string | null
          id_document_url: string | null
          minimum_notice_hours: number
          neighborhood: string
          provider_type: Database["public"]["Enums"]["provider_type"]
          school_domain: string | null
          school_name: string
          school_scorecard_id: number | null
          service_zip: string | null
          stripe_account_id: string | null
          stripe_transfers_active: boolean
          stripe_transfers_checked_at: string | null
          user_id: string
          verification_bypassed: boolean
          verification_bypassed_at: string | null
          verification_bypassed_by: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          availability?: Json
          availability_end_local?: string | null
          availability_note?: string
          availability_start_local?: string | null
          availability_weekdays?: number[]
          avatar_focal_x?: number
          avatar_focal_y?: number
          avatar_image_path?: string | null
          background_check_status?: Database["public"]["Enums"]["background_check_status"]
          banner_focal_x?: number
          banner_focal_y?: number
          banner_image_path?: string | null
          banner_style?: string
          bio?: string
          company_name?: string | null
          created_at?: string
          display_name?: string
          greek_organization?: string
          id?: string
          id_document_back_url?: string | null
          id_document_url?: string | null
          minimum_notice_hours?: number
          neighborhood?: string
          provider_type?: Database["public"]["Enums"]["provider_type"]
          school_domain?: string | null
          school_name?: string
          school_scorecard_id?: number | null
          service_zip?: string | null
          stripe_account_id?: string | null
          stripe_transfers_active?: boolean
          stripe_transfers_checked_at?: string | null
          user_id: string
          verification_bypassed?: boolean
          verification_bypassed_at?: string | null
          verification_bypassed_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          availability?: Json
          availability_end_local?: string | null
          availability_note?: string
          availability_start_local?: string | null
          availability_weekdays?: number[]
          avatar_focal_x?: number
          avatar_focal_y?: number
          avatar_image_path?: string | null
          background_check_status?: Database["public"]["Enums"]["background_check_status"]
          banner_focal_x?: number
          banner_focal_y?: number
          banner_image_path?: string | null
          banner_style?: string
          bio?: string
          company_name?: string | null
          created_at?: string
          display_name?: string
          greek_organization?: string
          id?: string
          id_document_back_url?: string | null
          id_document_url?: string | null
          minimum_notice_hours?: number
          neighborhood?: string
          provider_type?: Database["public"]["Enums"]["provider_type"]
          school_domain?: string | null
          school_name?: string
          school_scorecard_id?: number | null
          service_zip?: string | null
          stripe_account_id?: string | null
          stripe_transfers_active?: boolean
          stripe_transfers_checked_at?: string | null
          user_id?: string
          verification_bypassed?: boolean
          verification_bypassed_at?: string | null
          verification_bypassed_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "provider_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_profiles_verification_bypassed_by_fkey"
            columns: ["verification_bypassed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_school_emails: {
        Row: {
          created_at: string
          email: string
          user_id: string
          verified_at: string
        }
        Insert: {
          created_at?: string
          email: string
          user_id: string
          verified_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_school_emails_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_services: {
        Row: {
          average_quote_cents: number | null
          hourly_rate_cents: number | null
          id: string
          preview_image_path: string | null
          price_cents: number
          price_type: Database["public"]["Enums"]["price_type"]
          pricing_mode: string
          provider_id: string
          service_id: string
          unit: Database["public"]["Enums"]["price_unit"]
        }
        Insert: {
          average_quote_cents?: number | null
          hourly_rate_cents?: number | null
          id?: string
          preview_image_path?: string | null
          price_cents: number
          price_type?: Database["public"]["Enums"]["price_type"]
          pricing_mode?: string
          provider_id: string
          service_id: string
          unit?: Database["public"]["Enums"]["price_unit"]
        }
        Update: {
          average_quote_cents?: number | null
          hourly_rate_cents?: number | null
          id?: string
          preview_image_path?: string | null
          price_cents?: number
          price_type?: Database["public"]["Enums"]["price_type"]
          pricing_mode?: string
          provider_id?: string
          service_id?: string
          unit?: Database["public"]["Enums"]["price_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "provider_services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "public_provider_directory"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "provider_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          expo_token: string
          id: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          expo_token: string
          id?: string
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          expo_token?: string
          id?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resend_webhook_events: {
        Row: {
          delivery_status: Database["public"]["Enums"]["email_delivery_status"]
          detail: string | null
          event_created_at: string
          event_type: string
          id: string
          is_current: boolean
          matched_outbox_id: string | null
          processed_at: string
          provider_message_id: string
          received_at: string
          recipient_email: string | null
          svix_id: string
        }
        Insert: {
          delivery_status: Database["public"]["Enums"]["email_delivery_status"]
          detail?: string | null
          event_created_at: string
          event_type: string
          id?: string
          is_current?: boolean
          matched_outbox_id?: string | null
          processed_at?: string
          provider_message_id: string
          received_at?: string
          recipient_email?: string | null
          svix_id: string
        }
        Update: {
          delivery_status?: Database["public"]["Enums"]["email_delivery_status"]
          detail?: string | null
          event_created_at?: string
          event_type?: string
          id?: string
          is_current?: boolean
          matched_outbox_id?: string | null
          processed_at?: string
          provider_message_id?: string
          received_at?: string
          recipient_email?: string | null
          svix_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resend_webhook_events_matched_outbox_id_fkey"
            columns: ["matched_outbox_id"]
            isOneToOne: false
            referencedRelation: "email_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          provider_id: string
          rating: number
          service_id: string
          text: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          provider_id: string
          rating: number
          service_id: string
          text?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          provider_id?: string
          rating?: number
          service_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "public_provider_directory"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "reviews_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category: string
          id: string
          is_live: boolean
          name: string
          slug: string
        }
        Insert: {
          category: string
          id?: string
          is_live?: boolean
          name: string
          slug: string
        }
        Update: {
          category?: string
          id?: string
          is_live?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      site_content: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_content_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_customers: {
        Row: {
          created_at: string
          stripe_customer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          stripe_customer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          stripe_customer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_disputes: {
        Row: {
          amount_cents: number | null
          booking_id: string | null
          created_at: string
          currency: string | null
          evidence_due_by: string | null
          id: string
          is_charge_refundable: boolean | null
          payload: Json
          payment_id: string | null
          reason: string | null
          status: string | null
          stripe_charge_id: string | null
          stripe_dispute_id: string
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          evidence_due_by?: string | null
          id?: string
          is_charge_refundable?: boolean | null
          payload?: Json
          payment_id?: string | null
          reason?: string | null
          status?: string | null
          stripe_charge_id?: string | null
          stripe_dispute_id: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          evidence_due_by?: string | null
          id?: string
          is_charge_refundable?: boolean | null
          payload?: Json
          payment_id?: string | null
          reason?: string | null
          status?: string | null
          stripe_charge_id?: string | null
          stripe_dispute_id?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "booking_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_receipts: {
        Row: {
          api_version: string | null
          attempt_count: number
          event_type: string
          id: string
          last_error: string | null
          livemode: boolean
          next_attempt_at: string | null
          payload: Json
          processed_at: string | null
          processing_started_at: string | null
          received_at: string
          stripe_event_id: string
        }
        Insert: {
          api_version?: string | null
          attempt_count?: number
          event_type: string
          id?: string
          last_error?: string | null
          livemode: boolean
          next_attempt_at?: string | null
          payload: Json
          processed_at?: string | null
          processing_started_at?: string | null
          received_at?: string
          stripe_event_id: string
        }
        Update: {
          api_version?: string | null
          attempt_count?: number
          event_type?: string
          id?: string
          last_error?: string | null
          livemode?: boolean
          next_attempt_at?: string | null
          payload?: Json
          processed_at?: string | null
          processing_started_at?: string | null
          received_at?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          category: string
          contact_email: string | null
          created_at: string
          id: string
          message: string
          resolved_at: string | null
          resolved_by: string | null
          sentiment: string | null
          source_path: string | null
          status: string
          submitter_id: string | null
          updated_at: string
          wants_reply: boolean
        }
        Insert: {
          category: string
          contact_email?: string | null
          created_at?: string
          id?: string
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          sentiment?: string | null
          source_path?: string | null
          status?: string
          submitter_id?: string | null
          updated_at?: string
          wants_reply?: boolean
        }
        Update: {
          category?: string
          contact_email?: string | null
          created_at?: string
          id?: string
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          sentiment?: string | null
          source_path?: string | null
          status?: string
          submitter_id?: string | null
          updated_at?: string
          wants_reply?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_submitter_id_fkey"
            columns: ["submitter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      provider_completed_jobs: {
        Row: {
          completed_jobs: number | null
          provider_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "public_provider_directory"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      provider_ratings: {
        Row: {
          avg_rating: number | null
          provider_id: string | null
          review_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "public_provider_directory"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      provider_reviews: {
        Row: {
          created_at: string | null
          id: string | null
          provider_id: string | null
          rating: number | null
          service_id: string | null
          text: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          provider_id?: string | null
          rating?: number | null
          service_id?: string | null
          text?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          provider_id?: string | null
          rating?: number | null
          service_id?: string | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "public_provider_directory"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "reviews_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      public_provider_directory: {
        Row: {
          availability: Json | null
          availability_end_local: string | null
          availability_note: string | null
          availability_start_local: string | null
          availability_weekdays: number[] | null
          availability_windows: Json | null
          avatar_focal_x: number | null
          avatar_focal_y: number | null
          avatar_image_path: string | null
          banner_focal_x: number | null
          banner_focal_y: number | null
          banner_image_path: string | null
          banner_style: string | null
          bio: string | null
          company_name: string | null
          created_at: string | null
          display_name: string | null
          greek_organization: string | null
          minimum_notice_hours: number | null
          neighborhood: string | null
          provider_id: string | null
          provider_type: Database["public"]["Enums"]["provider_type"] | null
          school_domain: string | null
          school_name: string | null
        }
        Insert: {
          availability?: Json | null
          availability_end_local?: string | null
          availability_note?: string | null
          availability_start_local?: string | null
          availability_weekdays?: number[] | null
          availability_windows?: never
          avatar_focal_x?: number | null
          avatar_focal_y?: number | null
          avatar_image_path?: string | null
          banner_focal_x?: number | null
          banner_focal_y?: number | null
          banner_image_path?: string | null
          banner_style?: string | null
          bio?: string | null
          company_name?: string | null
          created_at?: string | null
          display_name?: string | null
          greek_organization?: string | null
          minimum_notice_hours?: number | null
          neighborhood?: string | null
          provider_id?: string | null
          provider_type?: Database["public"]["Enums"]["provider_type"] | null
          school_domain?: string | null
          school_name?: string | null
        }
        Update: {
          availability?: Json | null
          availability_end_local?: string | null
          availability_note?: string | null
          availability_start_local?: string | null
          availability_weekdays?: number[] | null
          availability_windows?: never
          avatar_focal_x?: number | null
          avatar_focal_y?: number | null
          avatar_image_path?: string | null
          banner_focal_x?: number | null
          banner_focal_y?: number | null
          banner_image_path?: string | null
          banner_style?: string | null
          bio?: string | null
          company_name?: string | null
          created_at?: string | null
          display_name?: string | null
          greek_organization?: string | null
          minimum_notice_hours?: number | null
          neighborhood?: string | null
          provider_id?: string | null
          provider_type?: Database["public"]["Enums"]["provider_type"] | null
          school_domain?: string | null
          school_name?: string | null
        }
        Relationships: []
      }
      public_provider_offerings: {
        Row: {
          average_quote_cents: number | null
          hourly_rate_cents: number | null
          is_hourly_bookable: boolean | null
          is_quote_bookable: boolean | null
          preview_image_path: string | null
          price_cents: number | null
          price_type: Database["public"]["Enums"]["price_type"] | null
          pricing_mode: string | null
          provider_id: string | null
          provider_service_id: string | null
          service_category: string | null
          service_id: string | null
          service_is_live: boolean | null
          service_name: string | null
          service_slug: string | null
          unit: Database["public"]["Enums"]["price_unit"] | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "public_provider_directory"
            referencedColumns: ["provider_id"]
          },
          {
            foreignKeyName: "provider_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_booking_request: {
        Args: { p_booking_id: string }
        Returns: string
      }
      accept_hourly_counter_offer: {
        Args: { p_booking_id: string }
        Returns: string
      }
      admin_retry_booking_automation_job: {
        Args: { p_job_id: string }
        Returns: boolean
      }
      admin_retry_booking_refund: {
        Args: { p_refund_id: string }
        Returns: string
      }
      admin_retry_email_outbox: {
        Args: { p_outbox_id: string }
        Returns: boolean
      }
      attach_balance_payment_intent: {
        Args: { p_invoice_id: string; p_stripe_payment_intent_id: string }
        Returns: undefined
      }
      attach_first_hour_payment_intent: {
        Args: {
          p_booking_id: string
          p_stripe_customer_id: string
          p_stripe_payment_intent_id: string
        }
        Returns: undefined
      }
      attach_quote_deposit_intent: {
        Args: {
          p_booking_id: string
          p_stripe_customer_id: string
          p_stripe_payment_intent_id: string
        }
        Returns: undefined
      }
      auto_complete_quote_job: {
        Args: { p_booking_id: string }
        Returns: string
      }
      auto_complete_hourly_job: {
        Args: { p_booking_id: string }
        Returns: string
      }
      begin_balance_payment: {
        Args: { p_invoice_id: string }
        Returns: {
          amount_cents: number
          application_fee_cents: number
          idempotency_key: string
          payment_id: string
        }[]
      }
      begin_first_hour_payment: {
        Args: { p_authorization_version: string; p_booking_id: string }
        Returns: {
          amount_cents: number
          application_fee_cents: number
          idempotency_key: string
          payment_id: string
        }[]
      }
      begin_quote_deposit: {
        Args: { p_authorization_version: string; p_booking_id: string }
        Returns: {
          amount_cents: number
          application_fee_cents: number
          idempotency_key: string
          payment_id: string
        }[]
      }
      cancel_booking_as_customer: {
        Args: { p_booking_id: string }
        Returns: string
      }
      cancel_booking_as_provider: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: string
      }
      cancel_quote_booking_as_customer: {
        Args: { p_booking_id: string }
        Returns: string
      }
      cancel_quote_booking_as_provider: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: string
      }
      cancel_booking_request: {
        Args: { p_booking_id: string }
        Returns: string
      }
      claim_booking_automation_jobs: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: {
          attempt_count: number
          booking_id: string
          id: string
          kind: string
          lease_token: string
          source_id: string
        }[]
      }
      claim_conversation_for_booking: {
        Args: { target_booking_id: string }
        Returns: string
      }
      claim_due_invoice: {
        Args: { p_invoice_id: string }
        Returns: {
          amount_cents: number
          application_fee_cents: number
          booking_id: string
          idempotency_key: string
          payment_id: string
          stripe_connected_account_id: string
          stripe_customer_id: string
          stripe_payment_method_id: string
        }[]
      }
      claim_email_outbox: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: {
          attempt_count: number
          booking_id: string
          event_key: string
          id: string
          lease_token: string
          payload: Json
          recipient_email: string
          template: string
        }[]
      }
      claim_expired_booking_drafts: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: {
          attempt_count: number
          draft_id: string
          lease_token: string
          stripe_payment_intent_id: string
        }[]
      }
      claim_stripe_webhook_receipt: {
        Args: { p_receipt_id: string; p_stale_seconds?: number }
        Returns: {
          attempt_count: number
          id: string
          payload: Json
          stripe_event_id: string
        }[]
      }
      clear_provider_availability_override: {
        Args: { p_local_date: string }
        Returns: undefined
      }
      complete_booking_automation_job: {
        Args: { p_job_id: string; p_lease_token: string }
        Returns: boolean
      }
      complete_booking_draft_cleanup: {
        Args: { p_draft_id: string; p_lease_token: string }
        Returns: boolean
      }
      counter_hourly_booking_request: {
        Args: {
          p_booking_id: string
          p_note?: string
          p_proposed_start_at: string
        }
        Returns: string
      }
      create_booking_draft:
        | {
            Args: {
              p_address: string
              p_address_kind: string
              p_booking_id: string
              p_details: string
              p_estimated_minutes: number
              p_hourly_rate_cents: number
              p_job_zip: string
              p_latitude?: number
              p_longitude?: number
              p_on_decline_preference: Database["public"]["Enums"]["booking_decline_preference"]
              p_original_booking_id?: string
              p_provider_service_id: string
              p_scheduled_at: string
              p_service_city: string
              p_stripe_customer_id: string
              p_stripe_payment_intent_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_address: string
              p_address_kind: string
              p_booking_id: string
              p_details: string
              p_estimated_minutes: number
              p_hourly_rate_cents: number
              p_job_zip: string
              p_latitude?: number
              p_longitude?: number
              p_on_decline_preference: Database["public"]["Enums"]["booking_decline_preference"]
              p_original_booking_id?: string
              p_provider_service_id: string
              p_scheduled_at: string
              p_service_city: string
              p_stripe_customer_id: string
              p_stripe_payment_intent_id: string
              p_time_flexibility?: Database["public"]["Enums"]["booking_time_flexibility"]
            }
            Returns: undefined
          }
      create_hourly_booking_request: {
        Args: {
          p_address: string
          p_address_kind?: string
          p_details?: string
          p_estimated_minutes: number
          p_job_zip: string
          p_latitude?: number
          p_longitude?: number
          p_provider_service_id: string
          p_response_window_hours: number
          p_scheduled_at: string
          p_service_city?: string
        }
        Returns: string
      }
      create_quote_booking_request: {
        Args: {
          p_address: string
          p_address_kind?: string
          p_details?: string
          p_estimated_minutes: number
          p_job_photos: Json
          p_job_zip: string
          p_latitude?: number
          p_longitude?: number
          p_provider_service_id: string
          p_response_window_hours: number
          p_scheduled_at: string
          p_service_city?: string
        }
        Returns: string
      }
      create_quote_deposit_booking_request: {
        Args: {
          p_address: string
          p_address_kind?: string
          p_details?: string
          p_job_photos: Json
          p_job_zip: string
          p_latitude?: number
          p_longitude?: number
          p_provider_service_id: string
          p_requested_daypart: Database["public"]["Enums"]["quote_daypart"]
          p_requested_local_date: string
          p_service_city?: string
        }
        Returns: string
      }
      counter_quote_booking_request: {
        Args: {
          p_booking_id: string
          p_estimated_minutes: number
          p_note?: string
          p_options: Json
        }
        Returns: number
      }
      current_user_is_adult: { Args: never; Returns: boolean }
      decline_booking_request: {
        Args: { p_booking_id: string }
        Returns: string
      }
      dismiss_booking: { Args: { p_booking_id: string }; Returns: string }
      dismiss_review_prompt: { Args: { p_booking_id: string }; Returns: string }
      email_is_confirmed: { Args: { p_email: string }; Returns: boolean }
      expire_hourly_booking_request: {
        Args: { p_booking_id: string }
        Returns: string
      }
      expire_failed_hourly_capture: {
        Args: { p_booking_id: string }
        Returns: string
      }
      expire_quote_booking_stage: {
        Args: { p_booking_id: string }
        Returns: string
      }
      expire_unpaid_acceptance: {
        Args: { p_booking_id: string }
        Returns: string
      }
      finalize_hourly_booking: {
        Args: { p_stripe_payment_intent_id: string }
        Returns: string
      }
      get_active_email_suppression: {
        Args: { p_recipient_email: string }
        Returns: {
          detail: string
          reason: string
          suppressed_at: string
        }[]
      }
      get_my_booking_reviews: {
        Args: never
        Returns: {
          booking_id: string
          review_id: string
        }[]
      }
      hourly_replacement_candidate_ids: {
        Args: { p_booking_id: string }
        Returns: {
          provider_id: string
          provider_service_id: string
        }[]
      }
      hourly_replacement_fallback_ids: {
        Args: { p_booking_id: string }
        Returns: {
          payout_ready: boolean
          provider_id: string
          provider_service_id: string
        }[]
      }
      hourly_replacement_time_shift_ids: {
        Args: { p_booking_id: string }
        Returns: {
          provider_id: string
          provider_service_id: string
          suggested_start_at: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_member:
        | {
            Args: { conv_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.is_conversation_member(conv_id => text), public.is_conversation_member(conv_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { conv_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.is_conversation_member(conv_id => text), public.is_conversation_member(conv_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      is_provider_approved: {
        Args: { provider_profile_id: string }
        Returns: boolean
      }
      is_provider_capable: { Args: never; Returns: boolean }
      is_provider_offering_hourly_bookable: {
        Args: { provider_service_id: string }
        Returns: boolean
      }
      is_provider_offering_quote_bookable: {
        Args: { provider_service_id: string }
        Returns: boolean
      }
      mark_balance_payment_unsuccessful: {
        Args: {
          p_failure_code?: string
          p_failure_message?: string
          p_stripe_payment_intent_id: string
          p_target_status: Database["public"]["Enums"]["booking_payment_status"]
        }
        Returns: string
      }
      mark_balance_payment_unsuccessful_by_invoice: {
        Args: {
          p_failure_code?: string
          p_failure_message?: string
          p_invoice_id: string
          p_target_status: Database["public"]["Enums"]["booking_payment_status"]
        }
        Returns: string
      }
      mark_booking_arrived: { Args: { p_booking_id: string }; Returns: string }
      mark_booking_en_route: { Args: { p_booking_id: string }; Returns: string }
      mark_first_hour_payment_unsuccessful: {
        Args: {
          p_failure_code?: string
          p_failure_message?: string
          p_stripe_payment_intent_id: string
          p_target_status: Database["public"]["Enums"]["booking_payment_status"]
        }
        Returns: string
      }
      mark_upfront_payment_unsuccessful: {
        Args: {
          p_failure_code?: string
          p_failure_message?: string
          p_stripe_payment_intent_id: string
          p_target_status: Database["public"]["Enums"]["booking_payment_status"]
        }
        Returns: string
      }
      mark_hourly_response_alert: {
        Args: { p_booking_id: string }
        Returns: string
      }
      open_booking_dispute: {
        Args: {
          p_booking_id: string
          p_category: Database["public"]["Enums"]["booking_dispute_category"]
          p_narrative: string
        }
        Returns: string
      }
      owns_provider_profile: { Args: { pp_id: string }; Returns: boolean }
      provider_busy_intervals: {
        Args: { p_from: string; p_provider_id: string; p_to: string }
        Returns: {
          end_at: string
          start_at: string
        }[]
      }
      provider_payout_plan: {
        Args: { p_booking_id: string }
        Returns: {
          destination_account_id: string
          kind: Database["public"]["Enums"]["booking_payment_kind"]
          payment_id: string
          payout_amount_cents: number
          stripe_payment_intent_id: string
        }[]
      }
      provider_schedule_days: {
        Args: { p_from: string; p_provider_id: string; p_to: string }
        Returns: {
          end_local: string
          local_date: string
          start_local: string
        }[]
      }
      quote_hourly_offering_slot: {
        Args: {
          p_estimated_minutes: number
          p_provider_service_id: string
          p_scheduled_at: string
        }
        Returns: {
          hourly_rate_cents: number
          provider_display_name: string
          provider_id: string
          service_id: string
          service_name: string
        }[]
      }
      rank_hourly_provider_ids: {
        Args: { p_job_zip: string; p_service_slug?: string }
        Returns: {
          provider_id: string
        }[]
      }
      reconcile_stripe_refund: {
        Args: {
          p_amount_cents: number
          p_reason?: string
          p_stripe_payment_intent_id: string
          p_stripe_refund_id: string
        }
        Returns: string
      }
      record_first_hour_refund: {
        Args: {
          p_amount_cents?: number
          p_reason: string
          p_stripe_payment_intent_id: string
          p_stripe_refund_id?: string
        }
        Returns: string
      }
      record_provider_payout: {
        Args: {
          p_amount_cents: number
          p_booking_id: string
          p_destination_account_id: string
          p_error?: string
          p_idempotency_key: string
          p_payment_id: string
          p_source_charge_id?: string
          p_status?: string
          p_stripe_transfer_id?: string
        }
        Returns: string
      }
      record_resend_webhook_event: {
        Args: {
          // Hand-widened: the SQL accepts NULL for these, but `supabase gen
          // types` cannot express argument nullability. Re-apply after any regen.
          p_detail?: string | null
          p_event_created_at: string
          p_event_type: string
          p_provider_message_id: string
          p_recipient_email: string | null
          p_svix_id: string
        }
        Returns: {
          current_delivery_status: Database["public"]["Enums"]["email_delivery_status"]
          duplicate: boolean
          matched_outbox_id: string
        }[]
      }
      record_stripe_dispute: { Args: { p_event: Json }; Returns: string }
      reject_hourly_counter_offer: {
        Args: { p_booking_id: string }
        Returns: string
      }
      release_due_invoice_claim: {
        Args: { p_invoice_id: string }
        Returns: boolean
      }
      replace_hourly_booking_request: {
        Args: {
          p_original_booking_id: string
          p_provider_service_id: string
          p_response_window_hours: number
        }
        Returns: string
      }
      replace_quote_booking_request: {
        Args: {
          p_original_booking_id: string
          p_provider_service_id: string
          p_requested_daypart: Database["public"]["Enums"]["quote_daypart"]
          p_requested_local_date: string
        }
        Returns: string
      }
      reset_balance_payment_for_retry: {
        Args: { p_invoice_id: string }
        Returns: {
          amount_cents: number
          application_fee_cents: number
          idempotency_key: string
        }[]
      }
      resolve_booking_dispute: {
        Args: {
          p_audit_note: string
          p_booking_id: string
          p_resolution_kind: Database["public"]["Enums"]["booking_dispute_resolution"]
          p_resolved_billable_minutes?: number
        }
        Returns: {
          charge_amount_cents: number
          charge_application_fee_cents: number
          charge_idempotency_key: string
          charge_payment_id: string
          invoice_id: string
          outcome: string
          refund_amount_cents: number
          refund_idempotency_key: string
          refund_payment_id: string
        }[]
      }
      resolve_quote_booking_dispute: {
        Args: {
          p_audit_note: string
          p_booking_id: string
          p_resolution_kind: Database["public"]["Enums"]["booking_dispute_resolution"]
        }
        Returns: {
          charge_amount_cents: number
          charge_application_fee_cents: number
          charge_idempotency_key: string
          charge_payment_id: string
          invoice_id: string
          outcome: string
          refund_amount_cents: number
          refund_idempotency_key: string
          refund_payment_id: string
        }[]
      }
      retry_booking_automation_job: {
        Args: {
          p_error_class: string
          p_job_id: string
          p_lease_token: string
          p_retry_after_seconds: number
          p_terminal?: boolean
        }
        Returns: boolean
      }
      retry_booking_draft_cleanup: {
        Args: {
          p_draft_id: string
          p_error: string
          p_lease_token: string
          p_retry_after_seconds: number
          p_terminal?: boolean
        }
        Returns: boolean
      }
      retry_email_outbox: {
        Args: {
          p_error_class: string
          p_lease_token: string
          p_outbox_id: string
          p_retry_after_seconds: number
          p_terminal?: boolean
        }
        Returns: boolean
      }
      retry_email_outbox_detailed: {
        Args: {
          p_error_class: string
          p_error_detail: string
          p_lease_token: string
          p_outbox_id: string
          p_retry_after_seconds: number
          p_terminal?: boolean
        }
        Returns: boolean
      }
      save_provider_availability: {
        Args: {
          p_availability_note: string
          p_minimum_notice_hours: number
          p_service_zip: string
          p_windows: Json
        }
        Returns: undefined
      }
      save_provider_availability_override: {
        Args: {
          p_is_available: boolean
          p_local_date: string
          p_periods?: Json
        }
        Returns: undefined
      }
      send_booking_quote: {
        Args: {
          p_booking_id: string
          p_estimated_minutes: number
          p_quote_cents: number
          p_scheduled_at: string
        }
        Returns: string
      }
      select_quote_counter_option: {
        Args: { p_booking_id: string; p_option_id: string }
        Returns: string
      }
      settle_balance_payment: {
        Args: { p_stripe_payment_intent_id: string; p_succeeded_at?: string }
        Returns: string
      }
      settle_booking_refund: {
        Args: {
          p_failure_code?: string
          p_failure_message?: string
          p_idempotency_key: string
          p_status: Database["public"]["Enums"]["booking_refund_status"]
          p_stripe_refund_id?: string
          p_stripe_transfer_reversal_id?: string
        }
        Returns: string
      }
      settle_email_outbox: {
        Args: {
          p_lease_token: string
          p_outbox_id: string
          p_provider_message_id?: string
        }
        Returns: boolean
      }
      withdraw_quote_negotiation: {
        Args: { p_booking_id: string }
        Returns: string
      }
      settle_first_hour_payment: {
        Args: {
          p_stripe_payment_intent_id: string
          p_stripe_payment_method_id?: string
          p_succeeded_at?: string
        }
        Returns: string
      }
      settle_upfront_payment: {
        Args: {
          p_stripe_payment_intent_id: string
          p_stripe_payment_method_id?: string
          p_succeeded_at?: string
        }
        Returns: string
      }
      settle_job_in_cash: {
        Args: {
          p_booking_id: string
          p_confirmed?: boolean
          p_provider_explanation?: string
          p_submitted_minutes: number
        }
        Returns: string
      }
      settle_quote_job_in_cash: {
        Args: { p_booking_id: string; p_confirmed?: boolean }
        Returns: string
      }
      settle_zero_balance_invoice: {
        Args: { p_invoice_id: string }
        Returns: string
      }
      shares_thread_with: { Args: { profile_id: string }; Returns: boolean }
      signup_intent_for_email: { Args: { p_email: string }; Returns: string }
      submit_job_invoice: {
        Args: {
          p_booking_id: string
          p_provider_explanation: string
          p_submitted_minutes: number
        }
        Returns: string
      }
      submit_quote_invoice: {
        Args: { p_booking_id: string }
        Returns: string
      }
      transition_legacy_booking: {
        Args: {
          p_booking_id: string
          p_target_status: Database["public"]["Enums"]["booking_status"]
        }
        Returns: string
      }
      unread_message_summary: {
        Args: never
        Returns: {
          conversation_id: string
          unread_count: number
        }[]
      }
    }
    Enums: {
      background_check_status: "none" | "pending" | "passed"
      booking_charge_model: "destination" | "platform"
      booking_decline_preference: "auto_rematch" | "keep_control"
      booking_dispute_category:
        | "provider_no_show"
        | "hours"
        | "service"
        | "payment"
        | "cancellation"
        | "other"
      booking_dispute_resolution:
        | "approve_submitted_hours"
        | "reduce_billable_minutes"
        | "waive_remaining_balance"
        | "cancel_and_refund"
      booking_dispute_status: "open" | "resolved"
      booking_flow: "legacy" | "hourly_v1" | "quote_v1" | "quote_v2"
      booking_invoice_status:
        | "draft"
        | "review"
        | "requires_action"
        | "processing"
        | "paid"
        | "waived"
        | "refunded"
        | "cash_settled"
      booking_payment_kind: "first_hour" | "balance" | "quote_deposit"
      booking_payment_status:
        | "created"
        | "requires_action"
        | "processing"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "refunded"
        | "authorized"
      booking_refund_status:
        | "created"
        | "processing"
        | "succeeded"
        | "failed"
        | "cancelled"
      booking_status:
        | "requested"
        | "accepted"
        | "booked"
        | "in_progress"
        | "invoice_review"
        | "disputed"
        | "paid"
        | "completed"
        | "declined"
        | "withdrawn"
        | "expired"
        | "cancelled"
        | "countered"
      booking_time_flexibility: "flexible" | "fixed"
      quote_daypart: "morning" | "afternoon" | "either"
      email_delivery_status:
        | "accepted"
        | "delivered"
        | "delayed"
        | "bounced"
        | "complained"
        | "failed"
        | "suppressed"
      email_outbox_status: "pending" | "processing" | "sent" | "failed"
      legal_acceptance_kind:
        | "master_agreement"
        | "booking_addendum"
        | "platform_terms"
        | "customer_booking_terms"
        | "provider_terms"
        | "payment_authorization"
      moderation_status: "clean" | "redacted" | "flagged"
      price_type: "fixed" | "quote"
      price_unit: "per_job" | "per_hour"
      provider_type: "business" | "individual"
      user_role: "customer" | "provider" | "admin"
      verification_status: "pending" | "approved" | "rejected"
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
      background_check_status: ["none", "pending", "passed"],
      booking_charge_model: ["destination", "platform"],
      booking_decline_preference: ["auto_rematch", "keep_control"],
      booking_dispute_category: [
        "provider_no_show",
        "hours",
        "service",
        "payment",
        "cancellation",
        "other",
      ],
      booking_dispute_resolution: [
        "approve_submitted_hours",
        "reduce_billable_minutes",
        "waive_remaining_balance",
        "cancel_and_refund",
      ],
      booking_dispute_status: ["open", "resolved"],
      booking_flow: ["legacy", "hourly_v1", "quote_v1", "quote_v2"],
      booking_invoice_status: [
        "draft",
        "review",
        "requires_action",
        "processing",
        "paid",
        "waived",
        "refunded",
        "cash_settled",
      ],
      booking_payment_kind: ["first_hour", "balance", "quote_deposit"],
      booking_payment_status: [
        "created",
        "requires_action",
        "processing",
        "succeeded",
        "failed",
        "cancelled",
        "refunded",
        "authorized",
      ],
      booking_refund_status: [
        "created",
        "processing",
        "succeeded",
        "failed",
        "cancelled",
      ],
      booking_status: [
        "requested",
        "accepted",
        "booked",
        "in_progress",
        "invoice_review",
        "disputed",
        "paid",
        "completed",
        "declined",
        "withdrawn",
        "expired",
        "cancelled",
        "countered",
      ],
      booking_time_flexibility: ["flexible", "fixed"],
      quote_daypart: ["morning", "afternoon", "either"],
      email_delivery_status: [
        "accepted",
        "delivered",
        "delayed",
        "bounced",
        "complained",
        "failed",
        "suppressed",
      ],
      email_outbox_status: ["pending", "processing", "sent", "failed"],
      legal_acceptance_kind: [
        "master_agreement",
        "booking_addendum",
        "platform_terms",
        "customer_booking_terms",
        "provider_terms",
        "payment_authorization",
      ],
      moderation_status: ["clean", "redacted", "flagged"],
      price_type: ["fixed", "quote"],
      price_unit: ["per_job", "per_hour"],
      provider_type: ["business", "individual"],
      user_role: ["customer", "provider", "admin"],
      verification_status: ["pending", "approved", "rejected"],
    },
  },
} as const

export type UserRole = Database["public"]["Enums"]["user_role"]
export type ProviderType = Database["public"]["Enums"]["provider_type"]
export type VerificationStatus = Database["public"]["Enums"]["verification_status"]
export type BackgroundCheckStatus = Database["public"]["Enums"]["background_check_status"]
export type PriceType = Database["public"]["Enums"]["price_type"]
export type PriceUnit = Database["public"]["Enums"]["price_unit"]
export type BookingStatus = Database["public"]["Enums"]["booking_status"]
export type BookingFlow = Database["public"]["Enums"]["booking_flow"]
export type BookingPaymentKind = Database["public"]["Enums"]["booking_payment_kind"]
export type BookingPaymentStatus = Database["public"]["Enums"]["booking_payment_status"]
export type BookingRefundStatus = Database["public"]["Enums"]["booking_refund_status"]
export type ModerationStatus = Database["public"]["Enums"]["moderation_status"]
export type LegalAcceptanceKind = Database["public"]["Enums"]["legal_acceptance_kind"]
export type EmailDeliveryStatus = Database["public"]["Enums"]["email_delivery_status"]

export type ProfileTextField =
  | "display_name"
  | "bio"
  | "company_name"
  | "school_name"
  | "greek_organization"
export type SupportTicketCategory =
  | "website"
  | "feature_or_service"
  | "booking_or_job"
  | "account_or_payment"
  | "safety_or_trust"
  | "other"
export type SupportTicketSentiment = "positive" | "neutral" | "frustrated"
export type SupportTicketStatus = "new" | "reviewing" | "resolved"

export type Profile = Tables<"profiles">
export type Service = Tables<"services">
export type ProviderProfile = Tables<"provider_profiles">
export type ProviderAvailabilityWindowRow = Tables<"provider_availability_windows">
export type ProviderAvailabilityOverrideRow =
  Tables<"provider_availability_overrides">
export type ProviderService = Tables<"provider_services">
export type Booking = Tables<"bookings">
export type BookingAutomationJob = Tables<"booking_automation_jobs">
export type BookingInvoice = Tables<"booking_invoices">
export type BookingPayment = Tables<"booking_payments">
export type BookingRefund = Tables<"booking_refunds">
export type BookingDispute = Tables<"booking_disputes">
export type BookingAuditEvent = Tables<"booking_audit_events">
export type StripeWebhookReceipt = Tables<"stripe_webhook_receipts">
export type StripeCustomer = Tables<"stripe_customers">
export type StripeDispute = Tables<"stripe_disputes">
export type EmailOutboxItem = Tables<"email_outbox">
export type EmailSuppression = Tables<"email_suppressions">
export type ResendWebhookEvent = Tables<"resend_webhook_events">
export type Review = Tables<"reviews">
export type Conversation = Tables<"conversations">
export type ConversationRead = Tables<"conversation_reads">
export type ConversationResolution = Tables<"conversation_resolutions">
export type Message = Tables<"messages">
export type ModerationEvent = Tables<"moderation_events">
export type ModerationReport = Tables<"moderation_reports">
export type PushToken = Tables<"push_tokens">
export type UserBlock = Tables<"user_blocks">
export type ProfileModerationEvent = Tables<"profile_moderation_events">
export type ProviderEmailVerification = Tables<"provider_email_verifications">
export type ProviderSchoolEmail = Tables<"provider_school_emails">
export type SiteContent = Tables<"site_content">
export type BlogPost = Tables<"blog_posts">
export type PublicBlogPost = Pick<
  BlogPost,
  "id" | "slug" | "title" | "body" | "image_path" | "created_at" | "updated_at"
>
export type SupportTicket = Omit<
  Tables<"support_tickets">,
  "category" | "sentiment" | "status"
> & {
  category: SupportTicketCategory
  sentiment: SupportTicketSentiment | null
  status: SupportTicketStatus
}
export type LegalAcceptance = Tables<"legal_acceptances">
export type ProviderCompletedJobs = Tables<"provider_completed_jobs">
export type ProviderRating = Tables<"provider_ratings">
export type ProviderReview = Tables<"provider_reviews">
export type PublicProviderDirectoryRow = Tables<"public_provider_directory">
export type PublicProviderOfferingRow = Tables<"public_provider_offerings">
export type BookingDeclinePreference =
  Database["public"]["Enums"]["booking_decline_preference"]
export type BookingDraft = Tables<"booking_drafts">
