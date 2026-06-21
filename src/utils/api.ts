import type { Session, Seat, Roster, Student, Assignment, SwapRequest, AttendanceRecord, OperationLog, SeatingDraft, DraftConflict } from '@/types'

const BASE = '/api'

interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
  message?: string
  duplicates?: string[]
  conflicts?: DraftConflict[]
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, options)
  const body: ApiResponse<T> = await res.json()
  if (!res.ok || !body.success) {
    const err = new Error(body.error || body.message || `HTTP ${res.status}`)
    ;(err as any).duplicates = body.duplicates
    ;(err as any).conflicts = body.conflicts
    throw err
  }
  return body.data
}

export async function fetchSessions(): Promise<Session[]> {
  return request<Session[]>('/sessions')
}

export async function createSession(data: {
  name: string
  date: string
  time_start: string
  time_end: string
  rows: number
  cols: number
  status: string
}): Promise<Session> {
  return request<Session>('/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: data.name,
      date: data.date,
      timeStart: data.time_start,
      timeEnd: data.time_end,
      rows: data.rows,
      cols: data.cols,
    }),
  })
}

export async function updateSession(id: number, data: Partial<Session> & Record<string, any>): Promise<Session> {
  const body: Record<string, any> = { ...data }
  if (data.time_start) { body.timeStart = data.time_start; delete body.time_start }
  if (data.time_end) { body.timeEnd = data.time_end; delete body.time_end }
  if (data.roster_id !== undefined) { body.rosterId = data.roster_id; delete body.roster_id }
  return request<Session>(`/sessions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function deleteSession(id: number): Promise<void> {
  await request(`/sessions/${id}`, { method: 'DELETE' })
}

export async function fetchSessionSeats(sessionId: number): Promise<Seat[]> {
  return request<Seat[]>(`/sessions/${sessionId}/seats`)
}

export async function fetchRosters(): Promise<Roster[]> {
  return request<Roster[]>('/rosters')
}

export async function importRoster(name: string, file: File): Promise<Roster> {
  const formData = new FormData()
  formData.append('name', name)
  formData.append('file', file)
  return request<Roster>('/rosters/import', {
    method: 'POST',
    body: formData,
  })
}

export async function fetchRosterStudents(rosterId: number): Promise<Student[]> {
  return request<Student[]>(`/rosters/${rosterId}/students`)
}

export async function deleteRoster(rosterId: number): Promise<void> {
  await request(`/rosters/${rosterId}`, { method: 'DELETE' })
}

export async function fetchSampleCSV(): Promise<Blob> {
  const res = await fetch(`${BASE}/rosters/sample`)
  return res.blob()
}

export async function createAssignment(data: {
  session_id: number
  seat_id: number
  student_id: number
}): Promise<Assignment> {
  return request<Assignment>('/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: data.session_id,
      seatId: data.seat_id,
      studentId: data.student_id,
    }),
  })
}

export async function deleteAssignment(id: number): Promise<void> {
  await request(`/assignments/${id}`, { method: 'DELETE' })
}

export async function createSwapRequest(data: {
  session_id: number
  from_student_id: number
  to_student_id: number
  from_seat_id: number
  to_seat_id: number
  reason: string
}): Promise<SwapRequest> {
  return request<SwapRequest>('/swap-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: data.session_id,
      fromStudentId: data.from_student_id,
      toStudentId: data.to_student_id,
      fromSeatId: data.from_seat_id,
      toSeatId: data.to_seat_id,
      reason: data.reason,
    }),
  })
}

export async function fetchSwapRequests(sessionId: number): Promise<SwapRequest[]> {
  return request<SwapRequest[]>(`/swap-requests?sessionId=${sessionId}`)
}

export async function approveSwapRequest(id: number, role: string, note?: string): Promise<SwapRequest> {
  return request<SwapRequest>(`/swap-requests/${id}/approve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      approverRole: role,
      approvalNote: note || '',
    }),
  })
}

export async function rejectSwapRequest(id: number, role: string, note?: string): Promise<SwapRequest> {
  return request<SwapRequest>(`/swap-requests/${id}/reject`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      approverRole: role,
      approvalNote: note || '',
    }),
  })
}

export async function fetchAttendance(sessionId: number): Promise<AttendanceRecord[]> {
  return request<AttendanceRecord[]>(`/attendance?sessionId=${sessionId}`)
}

export async function createAttendance(data: {
  session_id: number
  student_id: number
  seat_id: number
  status: string
}): Promise<AttendanceRecord> {
  return request<AttendanceRecord>('/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: data.session_id,
      studentId: data.student_id,
      seatId: data.seat_id,
      status: data.status,
    }),
  })
}

export async function updateAttendance(id: number, data: { status: string }): Promise<AttendanceRecord> {
  return request<AttendanceRecord>(`/attendance/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function fetchLogs(sessionId: number): Promise<OperationLog[]> {
  return request<OperationLog[]>(`/logs?sessionId=${sessionId}`)
}

export async function exportSeats(sessionId: number): Promise<any[]> {
  return request<any[]>(`/export/seats?sessionId=${sessionId}`)
}

export async function exportAttendance(sessionId: number): Promise<any[]> {
  return request<any[]>(`/export/attendance?sessionId=${sessionId}`)
}

export async function exportLogs(sessionId: number): Promise<any[]> {
  return request<any[]>(`/export/logs?sessionId=${sessionId}`)
}

export async function fetchDraft(sessionId: number): Promise<SeatingDraft | null> {
  return request<SeatingDraft | null>(`/sessions/${sessionId}/draft`)
}

export async function generateDraft(sessionId: number): Promise<SeatingDraft> {
  return request<SeatingDraft>(`/sessions/${sessionId}/draft/generate`, {
    method: 'POST',
  })
}

export async function saveDraft(sessionId: number, items: { seat_id: number; student_id: number }[]): Promise<SeatingDraft> {
  return request<SeatingDraft>(`/sessions/${sessionId}/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
}

export async function fetchDraftConflicts(sessionId: number): Promise<DraftConflict[]> {
  return request<DraftConflict[]>(`/sessions/${sessionId}/draft/conflicts`)
}

export async function applyDraft(sessionId: number): Promise<{ applied: number; seats: Seat[] }> {
  return request<{ applied: number; seats: Seat[] }>(`/sessions/${sessionId}/draft/apply`, {
    method: 'POST',
  })
}

export async function abandonDraft(sessionId: number): Promise<void> {
  await request(`/sessions/${sessionId}/draft/abandon`, {
    method: 'POST',
  })
}
