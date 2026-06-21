export interface Session {
  id: number
  name: string
  date: string
  time_start: string
  time_end: string
  rows: number
  cols: number
  status: 'draft' | 'active' | 'completed'
  roster_id: number | null
  created_at: string
  updated_at: string
  occupied_count?: number
  total_seats?: number
  roster_name?: string
}

export interface Seat {
  id: number
  session_id: number
  row_num: number
  col_num: number
  seat_number: string
  status: 'free' | 'occupied'
  student_id: number | null
  student_name: string | null
  student_no: string | null
  class_name?: string | null
  group_name?: string | null
  assignment_id?: number | null
  assigned_at?: string | null
}

export interface Roster {
  id: number
  name: string
  student_count: number
  inUse: boolean
  created_at: string
}

export interface Student {
  id: number
  roster_id: number
  student_no: string
  name: string
  class_name: string
  group_name: string
}

export interface Assignment {
  id: number
  session_id: number
  seat_id: number
  student_id: number
  student_no: string
  student_name: string
  seat_number: string
  assigned_at: string
}

export interface SwapRequest {
  id: number
  session_id: number
  from_student_id: number
  to_student_id: number
  from_seat_id: number
  to_seat_id: number
  from_student_no: string
  from_student_name: string
  to_student_no: string
  to_student_name: string
  from_seat_number: string
  to_seat_number: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  approved_by: string | null
  approval_role: 'admin' | 'ta' | null
  approval_note: string | null
  created_at: string
  processed_at: string | null
}

export interface AttendanceRecord {
  id: number
  session_id: number
  student_id: number
  student_no: string
  student_name: string
  seat_number: string
  status: 'not_checked_in' | 'checked_in' | 'late' | 'absent'
  check_in_time: string | null
}

export interface OperationLog {
  id: number
  session_id: number
  operation_type: string
  operator: string
  operator_role: 'admin' | 'ta'
  details: string
  created_at: string
}

export interface DraftItem {
  id: number
  draft_id: number
  seat_id: number
  student_id: number
  seat_number: string
  row_num: number
  col_num: number
  student_no: string
  student_name: string
  class_name: string
  group_name: string
  created_at: string
}

export interface SeatingDraft {
  id: number
  session_id: number
  status: 'active' | 'applied' | 'abandoned'
  created_at: string
  updated_at: string
  items: DraftItem[]
  roster_valid?: boolean
  roster_invalid_reason?: string | null
}

export interface DraftConflict {
  type: 'duplicate_student' | 'seat_occupied' | 'student_not_in_roster' | 'duplicate_seat' | 'roster_unbound'
  seat_id?: number
  seat_number?: string
  student_id?: number
  student_no?: string
  student_name?: string
  reason: string
}

export interface SeatingTemplateItem {
  id: number
  template_id: number
  row_num: number
  col_num: number
  seat_number: string
  student_no: string
  student_name: string
  class_name: string
  group_name: string
}

export interface SeatingTemplate {
  id: number
  name: string
  remark: string
  rows: number
  cols: number
  roster_id: number | null
  roster_name: string | null
  check_in_init_rule: 'not_checked_in' | 'checked_in' | 'late' | 'absent'
  created_by: string
  created_at: string
  updated_at: string
  items?: SeatingTemplateItem[]
  item_count?: number
}

export interface TemplateApplyConflict {
  type: 'layout_mismatch' | 'student_not_found' | 'student_not_in_roster' | 'seat_occupied' | 'duplicate_student' | 'duplicate_seat' | 'roster_unbound' | 'permission_denied'
  seat_number?: string
  student_no?: string
  student_name?: string
  reason: string
}

export interface TemplateApplySnapshot {
  id: number
  session_id: number
  template_id: number
  template_name: string
  operator: string
  operator_role: 'admin' | 'ta'
  applied_at: string
  rolled_back: number
}
