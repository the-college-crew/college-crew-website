/**
 * Database types — single source of truth for row shapes.
 *
 * Hand-written to match supabase/migrations/20260702120000_initial_schema.sql.
 * Once the schema is pushed to the provisioned project, regenerate with:
 *
 *   npx supabase gen types typescript --linked > lib/db/types.ts
 *
 * and keep the convenience aliases at the bottom of this file.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "customer" | "provider" | "admin";
/** Provider free-text fields the profile scan covers (profile_moderation_events.field). */
export type ProfileTextField = "display_name" | "bio";
export type ProviderType = "business" | "individual";
export type VerificationStatus = "pending" | "approved" | "rejected";
export type BackgroundCheckStatus = "none" | "pending" | "passed";
export type PriceType = "fixed" | "quote";
export type PriceUnit = "per_job" | "per_hour";
export type BookingStatus =
  | "requested"
  | "accepted"
  | "paid"
  | "completed"
  | "declined"
  | "cancelled";
export type ModerationStatus = "clean" | "redacted" | "flagged";
export type SupportTicketCategory =
  | "website"
  | "feature_or_service"
  | "booking_or_job"
  | "account_or_payment"
  | "safety_or_trust"
  | "other";
export type SupportTicketSentiment = "positive" | "neutral" | "frustrated";
export type SupportTicketStatus = "new" | "reviewing" | "resolved";
export type LegalAcceptanceKind = "master_agreement" | "booking_addendum";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          full_name: string;
          date_of_birth: string | null;
          address_line1: string;
          address_line2: string;
          city: string;
          state: string;
          postal_code: string;
          created_at: string;
        };
        Insert: {
          id: string;
          role?: UserRole;
          full_name?: string;
          date_of_birth?: string | null;
          address_line1?: string;
          address_line2?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          full_name?: string;
          date_of_birth?: string | null;
          address_line1?: string;
          address_line2?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          name: string;
          slug: string;
          category: string;
          is_live: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          category: string;
          is_live?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          category?: string;
          is_live?: boolean;
        };
        Relationships: [];
      };
      provider_profiles: {
        Row: {
          id: string;
          user_id: string;
          display_name: string;
          bio: string;
          provider_type: ProviderType;
          neighborhood: string;
          verification_status: VerificationStatus;
          id_document_url: string | null;
          id_document_back_url: string | null;
          background_check_status: BackgroundCheckStatus;
          stripe_account_id: string | null;
          availability: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          display_name?: string;
          bio?: string;
          provider_type?: ProviderType;
          neighborhood?: string;
          verification_status?: VerificationStatus;
          id_document_url?: string | null;
          id_document_back_url?: string | null;
          background_check_status?: BackgroundCheckStatus;
          stripe_account_id?: string | null;
          availability?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          display_name?: string;
          bio?: string;
          provider_type?: ProviderType;
          neighborhood?: string;
          verification_status?: VerificationStatus;
          id_document_url?: string | null;
          id_document_back_url?: string | null;
          background_check_status?: BackgroundCheckStatus;
          stripe_account_id?: string | null;
          availability?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_services: {
        Row: {
          id: string;
          provider_id: string;
          service_id: string;
          price_cents: number;
          price_type: PriceType;
          unit: PriceUnit;
          preview_image_path: string | null;
        };
        Insert: {
          id?: string;
          provider_id: string;
          service_id: string;
          price_cents: number;
          price_type?: PriceType;
          unit?: PriceUnit;
          preview_image_path?: string | null;
        };
        Update: {
          id?: string;
          provider_id?: string;
          service_id?: string;
          price_cents?: number;
          price_type?: PriceType;
          unit?: PriceUnit;
          preview_image_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "provider_services_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_services_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          id: string;
          customer_id: string;
          provider_id: string;
          service_id: string;
          status: BookingStatus;
          scheduled_at: string;
          address: string;
          details: string;
          price_cents: number;
          platform_fee_cents: number;
          stripe_payment_intent_id: string | null;
          dismissed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          provider_id: string;
          service_id: string;
          status?: BookingStatus;
          scheduled_at: string;
          address: string;
          details?: string;
          price_cents: number;
          platform_fee_cents: number;
          stripe_payment_intent_id?: string | null;
          dismissed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          provider_id?: string;
          service_id?: string;
          status?: BookingStatus;
          scheduled_at?: string;
          address?: string;
          details?: string;
          price_cents?: number;
          platform_fee_cents?: number;
          stripe_payment_intent_id?: string | null;
          dismissed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          id: string;
          booking_id: string;
          rating: number;
          text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          rating: number;
          text?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          rating?: number;
          text?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          id: string;
          customer_id: string;
          provider_id: string;
          booking_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          provider_id: string;
          booking_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          provider_id?: string;
          booking_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_reads: {
        Row: {
          conversation_id: string;
          user_id: string;
          last_read_at: string;
        };
        Insert: {
          conversation_id: string;
          user_id: string;
          last_read_at?: string;
        };
        Update: {
          conversation_id?: string;
          user_id?: string;
          last_read_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_reads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          image_path: string | null;
          moderation_status: ModerationStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          body?: string;
          image_path?: string | null;
          moderation_status?: ModerationStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          sender_id?: string;
          body?: string;
          image_path?: string | null;
          moderation_status?: ModerationStatus;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_email_verifications: {
        Row: {
          user_id: string;
          email: string;
          code_hash: string;
          attempts: number;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          email: string;
          code_hash: string;
          attempts?: number;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          email?: string;
          code_hash?: string;
          attempts?: number;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_email_verifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_school_emails: {
        Row: {
          user_id: string;
          email: string;
          verified_at: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          email: string;
          verified_at?: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          email?: string;
          verified_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_school_emails_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      site_content: {
        Row: {
          key: string;
          value: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          key: string;
          value: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          key?: string;
          value?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "site_content_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      support_tickets: {
        Row: {
          id: string;
          submitter_id: string | null;
          category: SupportTicketCategory;
          sentiment: SupportTicketSentiment | null;
          message: string;
          wants_reply: boolean;
          contact_email: string | null;
          source_path: string | null;
          status: SupportTicketStatus;
          created_at: string;
          updated_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          id?: string;
          submitter_id?: string | null;
          category: SupportTicketCategory;
          sentiment?: SupportTicketSentiment | null;
          message: string;
          wants_reply?: boolean;
          contact_email?: string | null;
          source_path?: string | null;
          status?: SupportTicketStatus;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          id?: string;
          submitter_id?: string | null;
          category?: SupportTicketCategory;
          sentiment?: SupportTicketSentiment | null;
          message?: string;
          wants_reply?: boolean;
          contact_email?: string | null;
          source_path?: string | null;
          status?: SupportTicketStatus;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "support_tickets_submitter_id_fkey";
            columns: ["submitter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_tickets_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      legal_acceptances: {
        Row: {
          id: string;
          user_id: string;
          booking_id: string | null;
          kind: LegalAcceptanceKind;
          role: UserRole;
          version: string;
          content_hash: string;
          signer_name: string;
          service_slug: string | null;
          service_name: string | null;
          snapshot: Json;
          ip_address: string | null;
          user_agent: string | null;
          accepted_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          booking_id?: string | null;
          kind: LegalAcceptanceKind;
          role: UserRole;
          version: string;
          content_hash: string;
          signer_name: string;
          service_slug?: string | null;
          service_name?: string | null;
          snapshot?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          accepted_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          booking_id?: string | null;
          kind?: LegalAcceptanceKind;
          role?: UserRole;
          version?: string;
          content_hash?: string;
          signer_name?: string;
          service_slug?: string | null;
          service_name?: string | null;
          snapshot?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          accepted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "legal_acceptances_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "legal_acceptances_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      moderation_events: {
        Row: {
          id: string;
          message_id: string;
          original_body: string;
          matched_patterns: string[];
          created_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          id?: string;
          message_id: string;
          original_body: string;
          matched_patterns?: string[];
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          id?: string;
          message_id?: string;
          original_body?: string;
          matched_patterns?: string[];
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "moderation_events_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_moderation_events: {
        Row: {
          id: string;
          provider_id: string;
          user_id: string;
          field: ProfileTextField;
          flagged_text: string;
          matched_patterns: string[];
          resolved_at: string | null;
          resolved_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          user_id: string;
          field: ProfileTextField;
          flagged_text: string;
          matched_patterns?: string[];
          resolved_at?: string | null;
          resolved_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          provider_id?: string;
          user_id?: string;
          field?: ProfileTextField;
          flagged_text?: string;
          matched_patterns?: string[];
          resolved_at?: string | null;
          resolved_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_moderation_events_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_moderation_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      provider_ratings: {
        Row: {
          provider_id: string;
          avg_rating: number;
          review_count: number;
        };
        Relationships: [];
      };
      provider_reviews: {
        Row: {
          id: string;
          provider_id: string;
          service_id: string;
          rating: number;
          text: string;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      unread_message_summary: {
        Args: Record<string, never>;
        Returns: { conversation_id: string; unread_count: number }[];
      };
      // Attaches the caller's booking-less inquiry thread to one of their
      // bookings. Returns the claimed conversation id, or null if there was
      // nothing to claim.
      claim_conversation_for_booking: {
        Args: { target_booking_id: string };
        Returns: string | null;
      };
    };
    Enums: {
      user_role: UserRole;
      provider_type: ProviderType;
      verification_status: VerificationStatus;
      background_check_status: BackgroundCheckStatus;
      price_type: PriceType;
      price_unit: PriceUnit;
      booking_status: BookingStatus;
      moderation_status: ModerationStatus;
      legal_acceptance_kind: LegalAcceptanceKind;
    };
    CompositeTypes: Record<string, never>;
  };
};

// Convenience row aliases — prefer these in app code.
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Service = Database["public"]["Tables"]["services"]["Row"];
export type ProviderProfile =
  Database["public"]["Tables"]["provider_profiles"]["Row"];
export type ProviderService =
  Database["public"]["Tables"]["provider_services"]["Row"];
export type Booking = Database["public"]["Tables"]["bookings"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type ConversationRead =
  Database["public"]["Tables"]["conversation_reads"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type ModerationEvent =
  Database["public"]["Tables"]["moderation_events"]["Row"];
export type ProviderEmailVerification =
  Database["public"]["Tables"]["provider_email_verifications"]["Row"];
export type ProviderSchoolEmail =
  Database["public"]["Tables"]["provider_school_emails"]["Row"];
export type SiteContent = Database["public"]["Tables"]["site_content"]["Row"];
export type SupportTicket =
  Database["public"]["Tables"]["support_tickets"]["Row"];
export type LegalAcceptance =
  Database["public"]["Tables"]["legal_acceptances"]["Row"];
export type ProviderRating =
  Database["public"]["Views"]["provider_ratings"]["Row"];
export type ProviderReview =
  Database["public"]["Views"]["provider_reviews"]["Row"];
