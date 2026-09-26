export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      packaging_profile_versions: {
        Row: {
          id: string;
          organization_id: string;
          product_id: string;
          version: number;
          status: string;
          bag_size_gallons: number;
          bags_per_case: number;
          label_width_inches: number;
          label_height_inches: number;
          labels_per_bag: number;
          display_name: string;
          ingredient_statement: string;
          template_key: string;
          created_by: string;
          created_at: string;
          approved_by: string | null;
          approved_at: string | null;
        };
        Insert: {
          id: string;
          product_id: string;
          version: number;
          status: string;
          bag_size_gallons: number;
          bags_per_case: number;
          display_name: string;
          ingredient_statement?: string;
          label_width_inches?: number;
          label_height_inches?: number;
        };
        Update: never;
        Relationships: [];
      };
      shipping_drafts: {
        Row: {
          id: string;
          organization_id: string;
          facility_id: string;
          order_id: string;
          planned_on: string;
          method: string;
          note: string;
          lines: Json;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id: string;
          order_id: string;
          planned_on: string;
          method: string;
          note: string;
          lines: Json;
        };
        Update: never;
        Relationships: [];
      };
      order_production_plans: {
        Row: {
          id: string;
          organization_id: string;
          facility_id: string;
          start_on: string;
          finish_on: string;
          status: string;
          revision: number;
          note: string;
          shortage_reason: string;
          created_by: string;
          created_at: string;
        };
        Insert: { id: string; start_on: string; finish_on: string };
        Update: {
          start_on?: string;
          finish_on?: string;
          status?: string;
          revision?: number;
          note?: string;
          shortage_reason?: string;
        };
        Relationships: [];
      };
      production_lots: {
        Row: {
          id: string;
          organization_id: string;
          facility_id: string;
          order_id: string;
          product_id: string;
          assigned_on: string;
          production_lot_code: string;
          planned_gallons: number;
          planned_batch_count: number;
          status: string;
          assigned_by: string;
          assigned_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      receipt_serializations: {
        Row: {
          id: string;
          organization_id: string;
          facility_id: string;
          receipt_line_id: string;
          supplier_item_id: string | null;
          supplier_item_snapshot: Json | null;
          packages: Json;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          facility_id?: string;
          receipt_line_id?: string;
          supplier_item_id?: string | null;
          supplier_item_snapshot?: Json | null;
          packages?: Json;
          created_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          facility_id?: string;
          receipt_line_id?: string;
          supplier_item_id?: string | null;
          supplier_item_snapshot?: Json | null;
          packages?: Json;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      serialized_unit_events: {
        Row: {
          id: string;
          organization_id: string;
          facility_id: string;
          unit_id: string;
          expected_revision: number;
          remaining_quantity: number;
          status: string;
          reason: string;
          quantity_delta: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          facility_id?: string;
          unit_id?: string;
          expected_revision?: number;
          remaining_quantity?: number;
          status?: string;
          reason?: string;
          quantity_delta?: number;
          created_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          facility_id?: string;
          unit_id?: string;
          expected_revision?: number;
          remaining_quantity?: number;
          status?: string;
          reason?: string;
          quantity_delta?: number;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          contact_name: string;
          email: string;
          phone: string;
          address: string;
          notes: string;
          revision: number;
          id: string;
          organization_id: string;
          name: string;
          name_key: string;
          created_at: string;
        };
        Insert: {
          contact_name?: string;
          email?: string;
          phone?: string;
          address?: string;
          notes?: string;
          id?: string;
          organization_id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          contact_name?: string;
          email?: string;
          phone?: string;
          address?: string;
          notes?: string;
        };
        Relationships: [];
      };
      customer_product_options: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          product_id: string;
          label: string;
          packaging_mode: string;
          unit_name: string;
          gallons_per_unit: number;
          unit_price: number;
          currency: string;
          active: boolean;
          is_preferred: boolean;
          revision: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id: string;
          organization_id?: string;
          customer_id: string;
          product_id: string;
          label: string;
          packaging_mode: string;
          unit_name: string;
          gallons_per_unit: number;
          unit_price: number;
          currency?: string;
          active?: boolean;
          is_preferred?: boolean;
          revision?: number;
          created_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          product_id?: string;
          label?: string;
          packaging_mode?: string;
          unit_name?: string;
          gallons_per_unit?: number;
          unit_price?: number;
          currency?: string;
          active?: boolean;
          is_preferred?: boolean;
          revision?: number;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      customer_orders: {
        Row: {
          id: string;
          organization_id: string;
          facility_id: string;
          customer_id: string;
          customer_name: string;
          reference: string;
          needed_on: string;
          products: Json;
          items: Json;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id: string;
          organization_id?: string;
          facility_id?: string;
          customer_id?: string;
          customer_name: string;
          reference?: string;
          needed_on: string;
          products: Json;
          items?: Json;
          created_by?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      material_plans: {
        Row: {
          id: string;
          organization_id: string;
          facility_id: string;
          name: string;
          needed_on: string;
          batches: Json;
          requirements: Json;
          status: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id: string;
          organization_id?: string;
          facility_id?: string;
          name: string;
          needed_on: string;
          batches: Json;
          requirements?: Json;
          status?: string;
          created_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          facility_id?: string;
          name?: string;
          needed_on?: string;
          batches?: Json;
          requirements?: Json;
          status?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      purchase_drafts: {
        Row: {
          id: string;
          organization_id: string;
          facility_id: string;
          material_plan_id: string | null;
          supplier_id: string;
          expected_on: string;
          status: string;
          reference: string;
          note: string;
          revision: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id: string;
          organization_id?: string;
          facility_id?: string;
          material_plan_id: string | null;
          supplier_id: string;
          expected_on: string;
          status?: string;
          reference?: string;
          note?: string;
          revision?: number;
          created_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          facility_id?: string;
          material_plan_id?: string | null;
          supplier_id?: string;
          expected_on?: string;
          status?: string;
          reference?: string;
          note?: string;
          revision?: number;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      purchase_draft_lines: {
        Row: {
          id: string;
          organization_id: string;
          facility_id: string;
          purchase_draft_id: string;
          ingredient_id: string;
          supplier_item_id: string;
          ingredient_name: string;
          supplier_sku: string;
          uom: string;
          purchase_uom: string;
          pack_quantity: number;
          raw_shortage: number;
          recommended_units: number;
          purchase_units: number;
          quantity: number;
          override_reason: string;
        };
        Insert: {
          id: string;
          organization_id?: string;
          facility_id?: string;
          purchase_draft_id: string;
          ingredient_id: string;
          supplier_item_id: string;
          ingredient_name: string;
          supplier_sku: string;
          uom: string;
          purchase_uom: string;
          pack_quantity: number;
          raw_shortage: number;
          recommended_units: number;
          purchase_units: number;
          quantity: number;
          override_reason?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          facility_id?: string;
          purchase_draft_id?: string;
          ingredient_id?: string;
          supplier_item_id?: string;
          ingredient_name?: string;
          supplier_sku?: string;
          uom?: string;
          purchase_uom?: string;
          pack_quantity?: number;
          raw_shortage?: number;
          recommended_units?: number;
          purchase_units?: number;
          quantity?: number;
          override_reason?: string;
        };
        Relationships: [];
      };

      access_profile_permissions: {
        Row: {
          access_profile_id: string;
          organization_id: string;
          permission_code: string;
        };
        Insert: {
          access_profile_id: string;
          organization_id: string;
          permission_code: string;
        };
        Update: {
          access_profile_id?: string;
          organization_id?: string;
          permission_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'access_profile_permissions_organization_id_access_profile__fkey';
            columns: ['organization_id', 'access_profile_id'];
            isOneToOne: false;
            referencedRelation: 'access_profiles';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'access_profile_permissions_permission_code_fkey';
            columns: ['permission_code'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['code'];
          },
        ];
      };
      access_profiles: {
        Row: {
          active: boolean;
          base_role: string;
          description: string;
          id: string;
          is_system: boolean;
          name: string;
          organization_id: string;
        };
        Insert: {
          active?: boolean;
          base_role: string;
          description?: string;
          id?: string;
          is_system?: boolean;
          name: string;
          organization_id: string;
        };
        Update: {
          active?: boolean;
          base_role?: string;
          description?: string;
          id?: string;
          is_system?: boolean;
          name?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'access_profiles_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      access_requests: {
        Row: {
          auth_user_id: string | null;
          contact_kind: string;
          contact_value: string;
          created_at: string;
          display_name: string;
          id: string;
          organization_id: string;
          preferred_locale: string;
          requested_role: string;
          review_note: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
        };
        Insert: {
          auth_user_id?: string | null;
          contact_kind: string;
          contact_value: string;
          created_at?: string;
          display_name: string;
          id?: string;
          organization_id?: string;
          preferred_locale?: string;
          requested_role?: string;
          review_note?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
        };
        Update: {
          auth_user_id?: string | null;
          contact_kind?: string;
          contact_value?: string;
          created_at?: string;
          display_name?: string;
          id?: string;
          organization_id?: string;
          preferred_locale?: string;
          requested_role?: string;
          review_note?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'access_requests_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      allergens: {
        Row: {
          id: string;
          name: string;
          organization_id: string;
        };
        Insert: {
          id?: string;
          name: string;
          organization_id?: string;
        };
        Update: {
          id?: string;
          name?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'allergens_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_events: {
        Row: {
          actor_user_id: string | null;
          after_data: Json | null;
          before_data: Json | null;
          entity_id: string;
          entity_type: string;
          event_type: string;
          id: string;
          occurred_at: string;
          organization_id: string;
        };
        Insert: {
          actor_user_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          entity_id: string;
          entity_type: string;
          event_type: string;
          id?: string;
          occurred_at?: string;
          organization_id: string;
        };
        Update: {
          actor_user_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          entity_id?: string;
          entity_type?: string;
          event_type?: string;
          id?: string;
          occurred_at?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      facilities: {
        Row: {
          active: boolean;
          id: string;
          name: string;
          organization_id: string;
          timezone: string;
        };
        Insert: {
          active?: boolean;
          id?: string;
          name: string;
          organization_id: string;
          timezone?: string;
        };
        Update: {
          active?: boolean;
          id?: string;
          name?: string;
          organization_id?: string;
          timezone?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'facilities_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      feedback_items: {
        Row: {
          app_version: string | null;
          comment: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          feedback_type: string;
          id: string;
          organization_id: string;
          resolution_note: string;
          route: string;
          status: string;
          submitted_by: string;
        };
        Insert: {
          app_version?: string | null;
          comment: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          feedback_type?: string;
          id?: string;
          organization_id?: string;
          resolution_note?: string;
          route: string;
          status?: string;
          submitted_by?: string;
        };
        Update: {
          app_version?: string | null;
          comment?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          feedback_type?: string;
          id?: string;
          organization_id?: string;
          resolution_note?: string;
          route?: string;
          status?: string;
          submitted_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'feedback_items_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      ingredient_allergens: {
        Row: {
          allergen_id: string;
          ingredient_id: string;
          organization_id: string;
        };
        Insert: {
          allergen_id: string;
          ingredient_id: string;
          organization_id?: string;
        };
        Update: {
          allergen_id?: string;
          ingredient_id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ingredient_allergens_organization_id_allergen_id_fkey';
            columns: ['organization_id', 'allergen_id'];
            isOneToOne: false;
            referencedRelation: 'allergens';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'ingredient_allergens_organization_id_ingredient_id_fkey';
            columns: ['organization_id', 'ingredient_id'];
            isOneToOne: false;
            referencedRelation: 'ingredients';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      ingredient_translations: {
        Row: {
          approved_at: string;
          approved_by: string;
          display_name: string;
          ingredient_id: string;
          locale: string;
          organization_id: string;
        };
        Insert: {
          approved_at?: string;
          approved_by?: string;
          display_name: string;
          ingredient_id: string;
          locale?: string;
          organization_id?: string;
        };
        Update: {
          approved_at?: string;
          approved_by?: string;
          display_name?: string;
          ingredient_id?: string;
          locale?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ingredient_translations_organization_id_ingredient_id_fkey';
            columns: ['organization_id', 'ingredient_id'];
            isOneToOne: false;
            referencedRelation: 'ingredients';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      ingredients: {
        Row: {
          active: boolean;
          category: string;
          created_at: string;
          default_uom: string;
          description: string;
          id: string;
          internal_code: string | null;
          name: string;
          organization_id: string;
          par_level: number | null;
          reorder_point: number | null;
          reorder_quantity: number | null;
          storage_notes: string;
          traceability_mode: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          category?: string;
          created_at?: string;
          default_uom: string;
          description?: string;
          id?: string;
          internal_code?: string | null;
          name: string;
          organization_id?: string;
          par_level?: number | null;
          reorder_point?: number | null;
          reorder_quantity?: number | null;
          storage_notes?: string;
          traceability_mode?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          category?: string;
          created_at?: string;
          default_uom?: string;
          description?: string;
          id?: string;
          internal_code?: string | null;
          name?: string;
          organization_id?: string;
          par_level?: number | null;
          reorder_point?: number | null;
          reorder_quantity?: number | null;
          storage_notes?: string;
          traceability_mode?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ingredients_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_events: {
        Row: {
          created_at: string;
          created_by: string;
          effective_on: string;
          event_type: string;
          facility_id: string;
          id: string;
          ingredient_id: string;
          organization_id: string;
          quantity_delta: number;
          reason_note: string;
          receipt_line_id: string | null;
          request_id: string;
          uom: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          effective_on?: string;
          event_type: string;
          facility_id?: string;
          id?: string;
          ingredient_id: string;
          organization_id?: string;
          quantity_delta: number;
          reason_note: string;
          receipt_line_id?: string | null;
          request_id: string;
          uom: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          effective_on?: string;
          event_type?: string;
          facility_id?: string;
          id?: string;
          ingredient_id?: string;
          organization_id?: string;
          quantity_delta?: number;
          reason_note?: string;
          receipt_line_id?: string | null;
          request_id?: string;
          uom?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_events_organization_id_facility_id_fkey';
            columns: ['organization_id', 'facility_id'];
            isOneToOne: false;
            referencedRelation: 'facilities';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_events_organization_id_ingredient_id_fkey';
            columns: ['organization_id', 'ingredient_id'];
            isOneToOne: false;
            referencedRelation: 'ingredients';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_events_receipt_line_id_fkey';
            columns: ['receipt_line_id'];
            isOneToOne: true;
            referencedRelation: 'inventory_receipt_lines';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_receipt_lines: {
        Row: {
          assigned_source_lot: string | null;
          purchase_draft_line_id: string | null;
          expiration_date: string | null;
          id: string;
          ingredient_id: string;
          organization_id: string;
          quantity: number;
          receipt_id: string;
          supplier_lot: string;
          source_lot_origin: string | null;
          uom: string;
        };
        Insert: {
          assigned_source_lot?: string | null;
          purchase_draft_line_id?: string | null;
          expiration_date?: string | null;
          id?: string;
          ingredient_id: string;
          organization_id?: string;
          quantity: number;
          receipt_id: string;
          supplier_lot?: string;
          source_lot_origin?: string | null;
          uom: string;
        };
        Update: {
          assigned_source_lot?: string | null;
          purchase_draft_line_id?: string | null;
          expiration_date?: string | null;
          id?: string;
          ingredient_id?: string;
          organization_id?: string;
          quantity?: number;
          receipt_id?: string;
          supplier_lot?: string;
          source_lot_origin?: string | null;
          uom?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_receipt_lines_organization_id_ingredient_id_fkey';
            columns: ['organization_id', 'ingredient_id'];
            isOneToOne: false;
            referencedRelation: 'ingredients';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_receipt_lines_organization_id_receipt_id_fkey';
            columns: ['organization_id', 'receipt_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_receipts';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      inventory_receipts: {
        Row: {
          created_at: string;
          created_by: string;
          delivery_line_count: number | null;
          delivery_payload: Json | null;
          delivery_request_id: string | null;
          facility_id: string;
          id: string;
          note: string;
          organization_id: string;
          received_on: string;
          supplier_id: string;
          supplier_reference: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          delivery_line_count?: number | null;
          delivery_payload?: Json | null;
          delivery_request_id?: string | null;
          facility_id?: string;
          id?: string;
          note?: string;
          organization_id?: string;
          received_on: string;
          supplier_id: string;
          supplier_reference?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          delivery_line_count?: number | null;
          delivery_payload?: Json | null;
          delivery_request_id?: string | null;
          facility_id?: string;
          id?: string;
          note?: string;
          organization_id?: string;
          received_on?: string;
          supplier_id?: string;
          supplier_reference?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_receipts_organization_id_facility_id_fkey';
            columns: ['organization_id', 'facility_id'];
            isOneToOne: false;
            referencedRelation: 'facilities';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_receipts_organization_id_supplier_id_fkey';
            columns: ['organization_id', 'supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      login_events: {
        Row: {
          event_type: string;
          id: string;
          ip_address: string | null;
          occurred_at: string;
          organization_id: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          event_type: string;
          id?: string;
          ip_address?: string | null;
          occurred_at?: string;
          organization_id?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Update: {
          event_type?: string;
          id?: string;
          ip_address?: string | null;
          occurred_at?: string;
          organization_id?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'login_events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          signup_enabled: boolean;
          slug: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          signup_enabled?: boolean;
          slug: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          signup_enabled?: boolean;
          slug?: string;
        };
        Relationships: [];
      };
      permissions: {
        Row: {
          area: string;
          code: string;
          description: string;
          label: string;
        };
        Insert: {
          area: string;
          code: string;
          description?: string;
          label: string;
        };
        Update: {
          area?: string;
          code?: string;
          description?: string;
          label?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          active: boolean;
          approved_ingredient_statement: string | null;
          bag_size_gallons: number;
          bags_per_case: number;
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          product_code: string | null;
          standard_batch_gallons: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          approved_ingredient_statement?: string | null;
          bag_size_gallons?: number;
          bags_per_case?: number;
          created_at?: string;
          id?: string;
          name: string;
          organization_id?: string;
          product_code?: string | null;
          standard_batch_gallons?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          approved_ingredient_statement?: string | null;
          bag_size_gallons?: number;
          bags_per_case?: number;
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          product_code?: string | null;
          standard_batch_gallons?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'products_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          access_profile_id: string;
          active: boolean;
          deactivated_at: string | null;
          deactivated_by: string | null;
          deactivation_reason: string | null;
          display_name: string;
          facility_id: string;
          first_name: string;
          id: string;
          last_name: string;
          organization_id: string;
          preferred_locale: string;
          role: string;
          work_email: string | null;
        };
        Insert: {
          access_profile_id: string;
          active?: boolean;
          deactivated_at?: string | null;
          deactivated_by?: string | null;
          deactivation_reason?: string | null;
          display_name: string;
          facility_id: string;
          first_name: string;
          id: string;
          last_name: string;
          organization_id: string;
          preferred_locale?: string;
          role: string;
          work_email?: string | null;
        };
        Update: {
          access_profile_id?: string;
          active?: boolean;
          deactivated_at?: string | null;
          deactivated_by?: string | null;
          deactivation_reason?: string | null;
          display_name?: string;
          facility_id?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          organization_id?: string;
          preferred_locale?: string;
          role?: string;
          work_email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_organization_id_access_profile_id_fkey';
            columns: ['organization_id', 'access_profile_id'];
            isOneToOne: false;
            referencedRelation: 'access_profiles';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'profiles_organization_id_facility_id_fkey';
            columns: ['organization_id', 'facility_id'];
            isOneToOne: false;
            referencedRelation: 'facilities';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'profiles_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      recipe_lines: {
        Row: {
          created_at: string;
          display_measurement: string;
          id: string;
          ingredient_id: string;
          normalized_quantity: number;
          normalized_uom: string;
          operator_note: string | null;
          organization_id: string;
          pounds_equivalent: number | null;
          recipe_section_id: string;
          recipe_version_id: string;
          sequence: number;
          source_line_key: string;
          source_metadata: Json;
        };
        Insert: {
          created_at?: string;
          display_measurement: string;
          id?: string;
          ingredient_id: string;
          normalized_quantity: number;
          normalized_uom: string;
          operator_note?: string | null;
          organization_id?: string;
          pounds_equivalent?: number | null;
          recipe_section_id: string;
          recipe_version_id: string;
          sequence: number;
          source_line_key: string;
          source_metadata?: Json;
        };
        Update: {
          created_at?: string;
          display_measurement?: string;
          id?: string;
          ingredient_id?: string;
          normalized_quantity?: number;
          normalized_uom?: string;
          operator_note?: string | null;
          organization_id?: string;
          pounds_equivalent?: number | null;
          recipe_section_id?: string;
          recipe_version_id?: string;
          sequence?: number;
          source_line_key?: string;
          source_metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'recipe_lines_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recipe_lines_organization_id_ingredient_id_fkey';
            columns: ['organization_id', 'ingredient_id'];
            isOneToOne: false;
            referencedRelation: 'ingredients';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'recipe_lines_organization_id_recipe_version_id_fkey';
            columns: ['organization_id', 'recipe_version_id'];
            isOneToOne: false;
            referencedRelation: 'recipe_versions';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'recipe_lines_organization_id_recipe_version_id_recipe_sect_fkey';
            columns: ['organization_id', 'recipe_version_id', 'recipe_section_id'];
            isOneToOne: false;
            referencedRelation: 'recipe_sections';
            referencedColumns: ['organization_id', 'recipe_version_id', 'id'];
          },
        ];
      };
      recipe_qc_rules: {
        Row: {
          created_at: string;
          id: string;
          instructions: string;
          max_value: number;
          min_value: number;
          name: string;
          organization_id: string;
          recipe_version_id: string;
          sequence: number;
          source_text: string;
          uom: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          instructions?: string;
          max_value: number;
          min_value: number;
          name: string;
          organization_id?: string;
          recipe_version_id: string;
          sequence: number;
          source_text: string;
          uom: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          instructions?: string;
          max_value?: number;
          min_value?: number;
          name?: string;
          organization_id?: string;
          recipe_version_id?: string;
          sequence?: number;
          source_text?: string;
          uom?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recipe_qc_rules_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recipe_qc_rules_organization_id_recipe_version_id_fkey';
            columns: ['organization_id', 'recipe_version_id'];
            isOneToOne: false;
            referencedRelation: 'recipe_versions';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      recipe_sections: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          recipe_version_id: string;
          sequence: number;
          source_heading: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          organization_id?: string;
          recipe_version_id: string;
          sequence: number;
          source_heading?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          recipe_version_id?: string;
          sequence?: number;
          source_heading?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'recipe_sections_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recipe_sections_organization_id_recipe_version_id_fkey';
            columns: ['organization_id', 'recipe_version_id'];
            isOneToOne: false;
            referencedRelation: 'recipe_versions';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      recipe_seed_runs: {
        Row: {
          applied_at: string;
          approved_by: string;
          id: string;
          line_projection_sha256: string;
          organization_id: string;
          record_counts: Json;
          seed_key: string;
          source_sha256: string;
        };
        Insert: {
          applied_at?: string;
          approved_by: string;
          id?: string;
          line_projection_sha256: string;
          organization_id: string;
          record_counts: Json;
          seed_key: string;
          source_sha256: string;
        };
        Update: {
          applied_at?: string;
          approved_by?: string;
          id?: string;
          line_projection_sha256?: string;
          organization_id?: string;
          record_counts?: Json;
          seed_key?: string;
          source_sha256?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recipe_seed_runs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      recipe_versions: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          recipe_id: string;
          released_at: string | null;
          released_by: string | null;
          source_metadata: Json;
          status: string;
          target_yield_gallons: number;
          version_number: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          recipe_id: string;
          released_at?: string | null;
          released_by?: string | null;
          source_metadata?: Json;
          status?: string;
          target_yield_gallons?: number;
          version_number: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          recipe_id?: string;
          released_at?: string | null;
          released_by?: string | null;
          source_metadata?: Json;
          status?: string;
          target_yield_gallons?: number;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'recipe_versions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recipe_versions_organization_id_recipe_id_fkey';
            columns: ['organization_id', 'recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipes';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      recipes: {
        Row: {
          active_version_id: string | null;
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          product_id: string;
          updated_at: string;
        };
        Insert: {
          active_version_id?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          organization_id?: string;
          product_id: string;
          updated_at?: string;
        };
        Update: {
          active_version_id?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          product_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recipes_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recipes_organization_id_product_id_fkey';
            columns: ['organization_id', 'product_id'];
            isOneToOne: true;
            referencedRelation: 'products';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'ss_active_version_same_recipe';
            columns: ['organization_id', 'id', 'active_version_id'];
            isOneToOne: false;
            referencedRelation: 'recipe_versions';
            referencedColumns: ['organization_id', 'recipe_id', 'id'];
          },
        ];
      };
      reference_lists: {
        Row: {
          allow_custom_values: boolean;
          area: string;
          code: string;
          name_en: string;
          name_es: string;
          organization_id: string;
        };
        Insert: {
          allow_custom_values?: boolean;
          area: string;
          code: string;
          name_en: string;
          name_es: string;
          organization_id: string;
        };
        Update: {
          allow_custom_values?: boolean;
          area?: string;
          code?: string;
          name_en?: string;
          name_es?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reference_lists_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      reference_options: {
        Row: {
          active: boolean;
          code: string;
          id: string;
          label_en: string;
          label_es: string;
          list_code: string;
          organization_id: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          code: string;
          id?: string;
          label_en: string;
          label_es: string;
          list_code: string;
          organization_id?: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          code?: string;
          id?: string;
          label_en?: string;
          label_es?: string;
          list_code?: string;
          organization_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'reference_options_organization_id_list_code_fkey';
            columns: ['organization_id', 'list_code'];
            isOneToOne: false;
            referencedRelation: 'reference_lists';
            referencedColumns: ['organization_id', 'code'];
          },
        ];
      };
      supplier_items: {
        Row: {
          active: boolean;
          id: string;
          ingredient_id: string;
          is_preferred: boolean;
          notes: string;
          organization_id: string;
          pack_quantity: number;
          pack_quantity_uom: string;
          purchase_uom: string;
          supplier_id: string;
          supplier_sku: string;
        };
        Insert: {
          active?: boolean;
          id?: string;
          ingredient_id: string;
          is_preferred?: boolean;
          notes?: string;
          organization_id?: string;
          pack_quantity: number;
          pack_quantity_uom: string;
          purchase_uom: string;
          supplier_id: string;
          supplier_sku?: string;
        };
        Update: {
          active?: boolean;
          id?: string;
          ingredient_id?: string;
          is_preferred?: boolean;
          notes?: string;
          organization_id?: string;
          pack_quantity?: number;
          pack_quantity_uom?: string;
          purchase_uom?: string;
          supplier_id?: string;
          supplier_sku?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'supplier_items_organization_id_ingredient_id_fkey';
            columns: ['organization_id', 'ingredient_id'];
            isOneToOne: false;
            referencedRelation: 'ingredients';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'supplier_items_organization_id_supplier_id_fkey';
            columns: ['organization_id', 'supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      suppliers: {
        Row: {
          active: boolean;
          contact_name: string;
          created_at: string;
          email: string;
          id: string;
          lead_time_days: number | null;
          name: string;
          organization_id: string;
          phone: string;
        };
        Insert: {
          active?: boolean;
          contact_name?: string;
          created_at?: string;
          email?: string;
          id?: string;
          lead_time_days?: number | null;
          name: string;
          organization_id?: string;
          phone?: string;
        };
        Update: {
          active?: boolean;
          contact_name?: string;
          created_at?: string;
          email?: string;
          id?: string;
          lead_time_days?: number | null;
          name?: string;
          organization_id?: string;
          phone?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'suppliers_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      save_customer_master: { Args: { payload: Json }; Returns: string };
      save_packaging_profile: { Args: { payload: Json }; Returns: string };
      save_shipping_draft: { Args: { payload: Json }; Returns: string };
      save_order_production_plan: { Args: { payload: Json }; Returns: string };
      assign_production_lot: { Args: { payload: Json }; Returns: string };
      open_batch_worksheet: { Args: { batch_id: string }; Returns: string };
      record_batch_worksheet_usage: { Args: { payload: Json }; Returns: string };
      correct_batch_worksheet_usage: { Args: { payload: Json }; Returns: string };
      report_spice_preparation_issue: { Args: { payload: Json }; Returns: string };
      worker_spice_preparations: { Args: Record<PropertyKey, never>; Returns: Json };
      complete_batch_worksheet: { Args: { execution_id: string }; Returns: string };
      order_production_batches: { Args: { order_id: string }; Returns: Json };
      receive_serialized_delivery: { Args: { payload: Json }; Returns: string };
      receive_purchase_delivery: { Args: { payload: Json }; Returns: string };
      serialize_receipt_line: { Args: { payload: Json }; Returns: string };
      change_serialized_unit: { Args: { payload: Json }; Returns: string };
      find_serialized_units: {
        Args: { search_text?: string; receipt_filter?: string; unit_filter?: string };
        Returns: Json;
      };
      find_traceability_production_lots: {
        Args: { product_filter: string; production_lot_code_filter: string; page_number?: number; requested_page_size?: number };
        Returns: Json;
      };
      trace_production_lot: {
        Args: { production_lot_filter: string; page_number?: number; requested_page_size?: number };
        Returns: Json;
      };
      trace_source_material: {
        Args: { source_lot_filter?: string | null; serialized_unit_filter?: string | null; page_number?: number; requested_page_size?: number };
        Returns: Json;
      };
      save_customer_product_option: { Args: { payload: Json }; Returns: string };
      save_customer_order: { Args: { payload: Json }; Returns: string };
      cancel_customer_order: { Args: { order_id: string }; Returns: string };
      cancel_material_plan: { Args: { plan_id: string }; Returns: string };
      change_purchase_status: { Args: { payload: Json }; Returns: string };
      create_purchase_draft: { Args: { payload: Json }; Returns: string };
      save_material_plan: { Args: { payload: Json }; Returns: string };
      material_requirements: { Args: { plan_id: string }; Returns: Json };
      demand_coverage: { Args: Record<PropertyKey, never>; Returns: Json };
      generate_demand_purchases: { Args: { request_id: string }; Returns: Json };
      approve_access_request: {
        Args: {
          assigned_access_profile_id: string;
          assigned_facility_id: string;
          invited_user_id: string;
          request_id: string;
        };
        Returns: string;
      };
      resolve_signup_organization: {
        Args: { tenant_slug: string };
        Returns: { name: string; slug: string }[];
      };
      submit_access_request: {
        Args: {
          contact_kind: string;
          contact_value: string;
          display_name: string;
          preferred_locale: string;
          requested_role: string;
          tenant_slug: string;
        };
        Returns: string;
      };
      deactivate_user_access: {
        Args: { reason: string; target_user_id: string };
        Returns: undefined;
      };
      reactivate_user_access: {
        Args: { target_user_id: string };
        Returns: undefined;
      };
      change_user_access_profile: {
        Args: { assigned_access_profile_id: string; target_user_id: string };
        Returns: undefined;
      };
      current_facility: { Args: never; Returns: string };
      current_org: { Args: never; Returns: string };
      current_role: { Args: never; Returns: string };
      has_permission: { Args: { requested: string }; Returns: boolean };
      login_event_user_names: {
        Args: Record<PropertyKey, never>;
        Returns: { display_name: string; user_id: string }[];
      };
      post_inventory_receipt: { Args: { payload: Json }; Returns: string };
      save_access_profile: { Args: { payload: Json }; Returns: string };
      save_ingredient: { Args: { payload: Json }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
