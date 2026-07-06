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
        };
        Insert: {
          id?: string;
          provider_id: string;
          service_id: string;
          price_cents: number;
          price_type?: PriceType;
          unit?: PriceUnit;
        };
        Update: {
          id?: string;
          provider_id?: string;
          service_id?: string;
          price_cents?: number;
          price_type?: PriceType;
          unit?: PriceUnit;
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
      moderation_events: {
        Row: {
          id: string;
          message_id: string;
          original_body: string;
          matched_patterns: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          original_body: string;
          matched_patterns?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          original_body?: string;
          matched_patterns?: string[];
          created_at?: string;
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
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type ModerationEvent =
  Database["public"]["Tables"]["moderation_events"]["Row"];
export type ProviderRating =
  Database["public"]["Views"]["provider_ratings"]["Row"];
export type ProviderReview =
  Database["public"]["Views"]["provider_reviews"]["Row"];
