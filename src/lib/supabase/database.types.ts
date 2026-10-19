export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      feed_status: {
        Row: {
          entity_count: number;
          error_code: string | null;
          id: string;
          last_attempt_at: string | null;
          last_success_at: string | null;
          next_attempt_at: string | null;
          source_timestamp: string | null;
          state: string;
          updated_at: string;
        };
        Insert: {
          entity_count?: number;
          error_code?: string | null;
          id: string;
          last_attempt_at?: string | null;
          last_success_at?: string | null;
          next_attempt_at?: string | null;
          source_timestamp?: string | null;
          state?: string;
          updated_at?: string;
        };
        Update: {
          entity_count?: number;
          error_code?: string | null;
          id?: string;
          last_attempt_at?: string | null;
          last_success_at?: string | null;
          next_attempt_at?: string | null;
          source_timestamp?: string | null;
          state?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          display_name: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          display_name?: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      transit_alert_entities: {
        Row: {
          alert_id: string;
          id: string;
          route_id: string | null;
          selector: Json;
          stop_id: string | null;
          trip_id: string | null;
        };
        Insert: {
          alert_id: string;
          id: string;
          route_id?: string | null;
          selector: Json;
          stop_id?: string | null;
          trip_id?: string | null;
        };
        Update: {
          alert_id?: string;
          id?: string;
          route_id?: string | null;
          selector?: Json;
          stop_id?: string | null;
          trip_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transit_alert_entities_alert_id_fkey";
            columns: ["alert_id"];
            isOneToOne: false;
            referencedRelation: "transit_alerts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_alert_entities_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "transit_routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_alert_entities_stop_id_fkey";
            columns: ["stop_id"];
            isOneToOne: false;
            referencedRelation: "transit_stops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_alert_entities_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "transit_trips";
            referencedColumns: ["id"];
          },
        ];
      };
      transit_alerts: {
        Row: {
          active: boolean;
          active_periods: Json;
          cause: string | null;
          description: string;
          effect: string | null;
          header: string;
          id: string;
          informed_entities: Json;
          provenance: string;
          received_at: string;
          source_id: string;
          source_id_raw: string;
          source_timestamp: string;
          url: string | null;
        };
        Insert: {
          active?: boolean;
          active_periods: Json;
          cause?: string | null;
          description: string;
          effect?: string | null;
          header: string;
          id: string;
          informed_entities: Json;
          provenance?: string;
          received_at: string;
          source_id: string;
          source_id_raw: string;
          source_timestamp: string;
          url?: string | null;
        };
        Update: {
          active?: boolean;
          active_periods?: Json;
          cause?: string | null;
          description?: string;
          effect?: string | null;
          header?: string;
          id?: string;
          informed_entities?: Json;
          provenance?: string;
          received_at?: string;
          source_id?: string;
          source_id_raw?: string;
          source_timestamp?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transit_alerts_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "transit_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      transit_arrival_events: {
        Row: {
          evidence: string;
          id: string;
          instance_key: string | null;
          observed_at: string;
          received_at: string;
          stop_id: string;
          stop_sequence: number | null;
          trip_id: string | null;
          vehicle_id: string;
        };
        Insert: {
          evidence: string;
          id: string;
          instance_key?: string | null;
          observed_at: string;
          received_at: string;
          stop_id: string;
          stop_sequence?: number | null;
          trip_id?: string | null;
          vehicle_id: string;
        };
        Update: {
          evidence?: string;
          id?: string;
          instance_key?: string | null;
          observed_at?: string;
          received_at?: string;
          stop_id?: string;
          stop_sequence?: number | null;
          trip_id?: string | null;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transit_arrival_events_stop_id_fkey";
            columns: ["stop_id"];
            isOneToOne: false;
            referencedRelation: "transit_stops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_arrival_events_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "transit_trips";
            referencedColumns: ["id"];
          },
        ];
      };
      transit_arrivals: {
        Row: {
          arrival_at: string | null;
          departure_at: string | null;
          id: string;
          instance_key: string;
          provenance: string;
          received_at: string;
          relationship: string;
          route_id: string;
          source_id: string;
          source_timestamp: string;
          stop_id: string;
          stop_sequence: number;
          timestamp_kind: string;
          trip_id: string;
          uncertainty_seconds: number | null;
          update_timestamp: string;
          valid_until: string;
        };
        Insert: {
          arrival_at?: string | null;
          departure_at?: string | null;
          id: string;
          instance_key: string;
          provenance?: string;
          received_at: string;
          relationship: string;
          route_id: string;
          source_id: string;
          source_timestamp: string;
          stop_id: string;
          stop_sequence: number;
          timestamp_kind: string;
          trip_id: string;
          uncertainty_seconds?: number | null;
          update_timestamp: string;
          valid_until: string;
        };
        Update: {
          arrival_at?: string | null;
          departure_at?: string | null;
          id?: string;
          instance_key?: string;
          provenance?: string;
          received_at?: string;
          relationship?: string;
          route_id?: string;
          source_id?: string;
          source_timestamp?: string;
          stop_id?: string;
          stop_sequence?: number;
          timestamp_kind?: string;
          trip_id?: string;
          uncertainty_seconds?: number | null;
          update_timestamp?: string;
          valid_until?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transit_arrivals_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "transit_routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_arrivals_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "transit_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_arrivals_stop_id_fkey";
            columns: ["stop_id"];
            isOneToOne: false;
            referencedRelation: "transit_stops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_arrivals_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "transit_trips";
            referencedColumns: ["id"];
          },
        ];
      };
      transit_buildings: {
        Row: {
          aliases: string[];
          id: string;
          latitude: number;
          longitude: number;
          name: string;
          provenance: string;
          verified_at: string;
        };
        Insert: {
          aliases?: string[];
          id: string;
          latitude: number;
          longitude: number;
          name: string;
          provenance: string;
          verified_at: string;
        };
        Update: {
          aliases?: string[];
          id?: string;
          latitude?: number;
          longitude?: number;
          name?: string;
          provenance?: string;
          verified_at?: string;
        };
        Relationships: [];
      };
      transit_entrances: {
        Row: {
          accessible: boolean | null;
          building_id: string;
          id: string;
          latitude: number;
          longitude: number;
          name: string;
          provenance: string;
        };
        Insert: {
          accessible?: boolean | null;
          building_id: string;
          id: string;
          latitude: number;
          longitude: number;
          name: string;
          provenance: string;
        };
        Update: {
          accessible?: boolean | null;
          building_id?: string;
          id?: string;
          latitude?: number;
          longitude?: number;
          name?: string;
          provenance?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transit_entrances_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "transit_buildings";
            referencedColumns: ["id"];
          },
        ];
      };
      transit_frequencies: {
        Row: {
          end_seconds: number;
          exact_times: boolean;
          headway_seconds: number;
          id: string;
          start_seconds: number;
          trip_id: string;
        };
        Insert: {
          end_seconds: number;
          exact_times: boolean;
          headway_seconds: number;
          id: string;
          start_seconds: number;
          trip_id: string;
        };
        Update: {
          end_seconds?: number;
          exact_times?: boolean;
          headway_seconds?: number;
          id?: string;
          start_seconds?: number;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transit_frequencies_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "transit_trips";
            referencedColumns: ["id"];
          },
        ];
      };
      transit_job_runs: {
        Row: {
          entity_count: number;
          error_code: string | null;
          feed_id: string;
          finished_at: string;
          id: string;
          outcome: string;
          started_at: string;
        };
        Insert: {
          entity_count?: number;
          error_code?: string | null;
          feed_id: string;
          finished_at?: string;
          id?: string;
          outcome: string;
          started_at?: string;
        };
        Update: {
          entity_count?: number;
          error_code?: string | null;
          feed_id?: string;
          finished_at?: string;
          id?: string;
          outcome?: string;
          started_at?: string;
        };
        Relationships: [];
      };
      transit_observations: {
        Row: {
          bearing: number | null;
          current_status: string;
          id: string;
          instance_key: string | null;
          latitude: number;
          longitude: number;
          position_timestamp: string;
          position_timestamp_kind: string;
          received_at: string;
          route_id: string | null;
          source_id: string;
          source_id_raw: string;
          source_timestamp: string;
          speed: number | null;
          stop_id: string | null;
          stop_sequence: number | null;
          trip_id: string | null;
        };
        Insert: {
          bearing?: number | null;
          current_status: string;
          id: string;
          instance_key?: string | null;
          latitude: number;
          longitude: number;
          position_timestamp: string;
          position_timestamp_kind: string;
          received_at: string;
          route_id?: string | null;
          source_id: string;
          source_id_raw: string;
          source_timestamp: string;
          speed?: number | null;
          stop_id?: string | null;
          stop_sequence?: number | null;
          trip_id?: string | null;
        };
        Update: {
          bearing?: number | null;
          current_status?: string;
          id?: string;
          instance_key?: string | null;
          latitude?: number;
          longitude?: number;
          position_timestamp?: string;
          position_timestamp_kind?: string;
          received_at?: string;
          route_id?: string | null;
          source_id?: string;
          source_id_raw?: string;
          source_timestamp?: string;
          speed?: number | null;
          stop_id?: string | null;
          stop_sequence?: number | null;
          trip_id?: string | null;
        };
        Relationships: [];
      };
      transit_retention: {
        Row: {
          event_days: number;
          id: boolean;
          job_days: number;
          observation_hours: number;
        };
        Insert: {
          event_days?: number;
          id?: boolean;
          job_days?: number;
          observation_hours?: number;
        };
        Update: {
          event_days?: number;
          id?: boolean;
          job_days?: number;
          observation_hours?: number;
        };
        Relationships: [];
      };
      transit_routes: {
        Row: {
          active: boolean;
          color: string | null;
          id: string;
          long_name: string;
          short_name: string;
          source_id: string;
          source_id_raw: string;
          text_color: string | null;
        };
        Insert: {
          active?: boolean;
          color?: string | null;
          id: string;
          long_name: string;
          short_name: string;
          source_id: string;
          source_id_raw: string;
          text_color?: string | null;
        };
        Update: {
          active?: boolean;
          color?: string | null;
          id?: string;
          long_name?: string;
          short_name?: string;
          source_id?: string;
          source_id_raw?: string;
          text_color?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transit_routes_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "transit_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      transit_services: {
        Row: {
          calendar: Json | null;
          exceptions: Json;
          id: string;
          source_id: string;
          source_id_raw: string;
        };
        Insert: {
          calendar?: Json | null;
          exceptions?: Json;
          id: string;
          source_id: string;
          source_id_raw: string;
        };
        Update: {
          calendar?: Json | null;
          exceptions?: Json;
          id?: string;
          source_id?: string;
          source_id_raw?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transit_services_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "transit_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      transit_shapes: {
        Row: {
          id: string;
          points: Json;
          source_id: string;
          source_id_raw: string;
        };
        Insert: {
          id: string;
          points: Json;
          source_id: string;
          source_id_raw: string;
        };
        Update: {
          id?: string;
          points?: Json;
          source_id?: string;
          source_id_raw?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transit_shapes_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "transit_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      transit_sources: {
        Row: {
          attribution: string;
          enabled: boolean;
          id: string;
          name: string;
          static_url: string;
          timezone: string;
        };
        Insert: {
          attribution: string;
          enabled?: boolean;
          id: string;
          name: string;
          static_url: string;
          timezone: string;
        };
        Update: {
          attribution?: string;
          enabled?: boolean;
          id?: string;
          name?: string;
          static_url?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      transit_stop_times: {
        Row: {
          arrival_seconds: number | null;
          departure_seconds: number | null;
          drop_off_type: number | null;
          id: string;
          pickup_type: number | null;
          stop_id: string;
          stop_sequence: number;
          trip_id: string;
        };
        Insert: {
          arrival_seconds?: number | null;
          departure_seconds?: number | null;
          drop_off_type?: number | null;
          id: string;
          pickup_type?: number | null;
          stop_id: string;
          stop_sequence: number;
          trip_id: string;
        };
        Update: {
          arrival_seconds?: number | null;
          departure_seconds?: number | null;
          drop_off_type?: number | null;
          id?: string;
          pickup_type?: number | null;
          stop_id?: string;
          stop_sequence?: number;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transit_stop_times_stop_id_fkey";
            columns: ["stop_id"];
            isOneToOne: false;
            referencedRelation: "transit_stops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_stop_times_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "transit_trips";
            referencedColumns: ["id"];
          },
        ];
      };
      transit_stops: {
        Row: {
          active: boolean;
          id: string;
          latitude: number;
          location_type: number;
          longitude: number;
          name: string;
          parent_station: string | null;
          source_id: string;
          source_id_raw: string;
        };
        Insert: {
          active?: boolean;
          id: string;
          latitude: number;
          location_type?: number;
          longitude: number;
          name: string;
          parent_station?: string | null;
          source_id: string;
          source_id_raw: string;
        };
        Update: {
          active?: boolean;
          id?: string;
          latitude?: number;
          location_type?: number;
          longitude?: number;
          name?: string;
          parent_station?: string | null;
          source_id?: string;
          source_id_raw?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transit_stops_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "transit_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      transit_trips: {
        Row: {
          active: boolean;
          direction_id: number | null;
          headsign: string | null;
          id: string;
          route_id: string;
          service_id: string;
          shape_id: string | null;
          source_id: string;
          source_id_raw: string;
        };
        Insert: {
          active?: boolean;
          direction_id?: number | null;
          headsign?: string | null;
          id: string;
          route_id: string;
          service_id: string;
          shape_id?: string | null;
          source_id: string;
          source_id_raw: string;
        };
        Update: {
          active?: boolean;
          direction_id?: number | null;
          headsign?: string | null;
          id?: string;
          route_id?: string;
          service_id?: string;
          shape_id?: string | null;
          source_id?: string;
          source_id_raw?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transit_trips_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "transit_routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_trips_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "transit_services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_trips_shape_id_fkey";
            columns: ["shape_id"];
            isOneToOne: false;
            referencedRelation: "transit_shapes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_trips_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "transit_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      transit_vehicles: {
        Row: {
          bearing: number | null;
          current_status: string;
          id: string;
          instance_key: string | null;
          latitude: number;
          longitude: number;
          position_timestamp: string;
          position_timestamp_kind: string;
          received_at: string;
          route_id: string | null;
          source_id: string;
          source_id_raw: string;
          source_timestamp: string;
          speed: number | null;
          stop_id: string | null;
          stop_sequence: number | null;
          trip_id: string | null;
        };
        Insert: {
          bearing?: number | null;
          current_status: string;
          id: string;
          instance_key?: string | null;
          latitude: number;
          longitude: number;
          position_timestamp: string;
          position_timestamp_kind: string;
          received_at: string;
          route_id?: string | null;
          source_id: string;
          source_id_raw: string;
          source_timestamp: string;
          speed?: number | null;
          stop_id?: string | null;
          stop_sequence?: number | null;
          trip_id?: string | null;
        };
        Update: {
          bearing?: number | null;
          current_status?: string;
          id?: string;
          instance_key?: string | null;
          latitude?: number;
          longitude?: number;
          position_timestamp?: string;
          position_timestamp_kind?: string;
          received_at?: string;
          route_id?: string | null;
          source_id?: string;
          source_id_raw?: string;
          source_timestamp?: string;
          speed?: number | null;
          stop_id?: string | null;
          stop_sequence?: number | null;
          trip_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transit_vehicles_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "transit_routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_vehicles_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "transit_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_vehicles_stop_id_fkey";
            columns: ["stop_id"];
            isOneToOne: false;
            referencedRelation: "transit_stops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transit_vehicles_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "transit_trips";
            referencedColumns: ["id"];
          },
        ];
      };
      transit_walking_cache: {
        Row: {
          destination_id: string;
          distance_meters: number;
          duration_seconds: number;
          expires_at: string;
          fetched_at: string;
          geometry: Json;
          id: string;
          origin_id: string;
          profile: string;
          provider: string;
        };
        Insert: {
          destination_id: string;
          distance_meters: number;
          duration_seconds: number;
          expires_at: string;
          fetched_at: string;
          geometry: Json;
          id: string;
          origin_id: string;
          profile: string;
          provider: string;
        };
        Update: {
          destination_id?: string;
          distance_meters?: number;
          duration_seconds?: number;
          expires_at?: string;
          fetched_at?: string;
          geometry?: Json;
          id?: string;
          origin_id?: string;
          profile?: string;
          provider?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
