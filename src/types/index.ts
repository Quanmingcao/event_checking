export interface Event {
    id: string;
    event_code: string;
    name: string;
    location?: string;
    organizer?: string;
    image_url?: string;
    start_time?: string;
    end_time?: string;
    created_at?: string;
    owner_id?: string;
}

export interface Attendant {
    id: string;
    event_id: string;
    full_name: string;
    code: string;
    position?: string;
    organization?: string;
    avatar_url?: string;
    email?: string;
    phone?: string;
    face_descriptor?: any; // Float32Array serialised as array or object
    is_vip: boolean;
    checked_in_at?: string;
    created_at?: string;
    group_id?: string;
    seat_location?: string;
}

export interface CheckinLog {
    id: number;
    event_id: string;
    attendant_id: string;
    checked_in_at: string;
}

export interface EventGroup {
    id: string;
    event_id: string;
    name: string;
    limit_count: number;
    zone_label?: string;
    current_count?: number; // Helper for UI
}

export interface Profile {
    id: string;
    email: string;
    full_name: string;
    role: 'super_admin' | 'faculty';
    created_at: string;
}
