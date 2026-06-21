const BASE = 'http://localhost:3001'
import fs from 'fs'
import path from 'path'

const assert = (cond, msg) => {
  if (!cond) {
    console.error('❌ ' + msg)
    process.exit(1)
  }
  console.log('✅ ' + msg)
}

async function req(url, options = {}) {
  const res = await fetch(BASE + url, options)
  const body = await res.json()
  return { status: res.status, ok: res.ok, body }
}

const tests = []

tests.push({ name: 'HEALTH: /api/health', fn: async () => {
  const r = await req('/api/health')
  assert(r.body.success === true, 'health check returns success')
}})

tests.push({ name: 'CREATE_SESSION: create a test session', fn: async () => {
  const r = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '第3周数据结构实验',
      date: '2026-06-25',
      timeStart: '14:00',
      timeEnd: '16:00',
      rows: 4,
      cols: 5,
    }),
  })
  assert(r.body.success === true, 'session created')
  assert(r.body.data.name === '第3周数据结构实验', 'session name matches')
  assert(r.body.data.rows === 4 && r.body.data.cols === 5, 'rows x cols correct')
  globalThis.sessionId = r.body.data.id
}})

tests.push({ name: 'LIST_SEATS: seats created for session', fn: async () => {
  const r = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  assert(r.body.success === true, 'seats fetched')
  assert(r.body.data.length === 20, '4x5 = 20 seats generated')
  const a1 = r.body.data.find(s => s.seat_number === 'A1')
  assert(a1, 'seat A1 exists')
}})

tests.push({ name: 'IMPORT_ROSTER: sample roster via JSON', fn: async () => {
  const students = []
  const names = ['张伟','李娜','王芳','刘洋','陈静','杨磊','赵敏','黄强','周莉','吴涛']
  for (let i = 0; i < 10; i++) {
    students.push({
      student_no: `2024${String(i+1).padStart(3,'0')}`,
      name: names[i],
      class_name: '计算机1班',
      group_name: 'A组',
    })
  }
  const r = await req('/api/rosters/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '2024级计算机1班', students }),
  })
  assert(r.body.success === true, 'roster imported')
  assert(r.body.data.student_count === 10, '10 students imported')
  globalThis.rosterId = r.body.data.id
}})

tests.push({ name: 'IMPORT_ROSTER: DUPLICATE student_no should reject entire batch', fn: async () => {
  const students = [
    { student_no: '2025001', name: '测试1', class_name: '', group_name: '' },
    { student_no: '2025001', name: '测试2', class_name: '', group_name: '' },
  ]
  const r = await req('/api/rosters/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '重复名单', students }),
  })
  assert(r.status === 409, 'duplicate students rejected with 409')
  assert(r.body.success === false, 'duplicate import returns success false')
}})

tests.push({ name: 'LINK_ROSTER: assign roster to session', fn: async () => {
  const r = await req(`/api/sessions/${globalThis.sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rosterId: globalThis.rosterId }),
  })
  assert(r.body.success === true, 'roster linked to session')
}})

tests.push({ name: 'LIST_ROSTER_STUDENTS: check students', fn: async () => {
  const r = await req(`/api/rosters/${globalThis.rosterId}/students`)
  assert(r.body.success === true, 'students fetched')
  assert(r.body.data.length === 10, '10 students returned')
  globalThis.students = r.body.data
}})

tests.push({ name: 'ASSIGN_SEAT: assign student to seat A1', fn: async () => {
  const seats = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const a1 = seats.body.data.find(s => s.seat_number === 'A1')
  const st = globalThis.students[0]
  const r = await req('/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.sessionId, seatId: a1.id, studentId: st.id }),
  })
  assert(r.body.success === true, 'student assigned to A1')
  assert(r.body.data.seat_number === 'A1', 'correct seat')
}})

tests.push({ name: 'ASSIGN_SEAT: CONFLICT - same seat to 2nd student should fail', fn: async () => {
  const seats = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const a1 = seats.body.data.find(s => s.seat_number === 'A1')
  const st2 = globalThis.students[1]
  const r = await req('/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.sessionId, seatId: a1.id, studentId: st2.id }),
  })
  assert(r.status === 409, 'conflict returns 409')
  assert(r.body.success === false, 'conflict assignment rejected')
}})

tests.push({ name: 'ASSIGN_SEAT: assign 2nd student to seat A2', fn: async () => {
  const seats = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const a2 = seats.body.data.find(s => s.seat_number === 'A2')
  const st = globalThis.students[1]
  const r = await req('/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.sessionId, seatId: a2.id, studentId: st.id }),
  })
  assert(r.body.success === true, 'student assigned to A2')
  globalThis.assignmentA2Id = r.body.data.id
}})

tests.push({ name: 'ATTENDANCE: attendance records created automatically', fn: async () => {
  const r = await req(`/api/attendance?sessionId=${globalThis.sessionId}`)
  assert(r.body.success === true, 'attendance fetch ok')
  assert(r.body.data.length >= 2, 'at least 2 attendance records')
  const rec = r.body.data[0]
  assert(rec.status === 'not_checked_in', 'default status is not_checked_in')
  globalThis.attendanceId = rec.id
}})

tests.push({ name: 'ATTENDANCE: update to checked_in', fn: async () => {
  const r = await req(`/api/attendance/${globalThis.attendanceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'checked_in' }),
  })
  assert(r.body.success === true, 'attendance updated')
  assert(r.body.data.status === 'checked_in', 'status is checked_in')
  assert(r.body.data.check_in_time !== null, 'check_in_time is set')
}})

tests.push({ name: 'SWAP_REQUEST: create swap between A1 and A2', fn: async () => {
  const seats = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const a1 = seats.body.data.find(s => s.seat_number === 'A1')
  const a2 = seats.body.data.find(s => s.seat_number === 'A2')
  const r = await req('/api/swap-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: globalThis.sessionId,
      fromStudentId: a1.student_id,
      toStudentId: a2.student_id,
      fromSeatId: a1.id,
      toSeatId: a2.id,
      reason: '视力不好需要靠前',
    }),
  })
  assert(r.body.success === true, 'swap request created')
  assert(r.body.data.status === 'pending', 'status is pending')
  globalThis.swapId = r.body.data.id
}})

tests.push({ name: 'SWAP_APPROVE: approve swap as TA', fn: async () => {
  const r = await req(`/api/swap-requests/${globalThis.swapId}/approve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approverRole: 'ta', approvalNote: '同意调换' }),
  })
  assert(r.body.success === true, 'swap approved')
  assert(r.body.data.status === 'approved', 'status is approved')
  assert(r.body.data.approval_role === 'ta', 'approval_role is ta')
  assert(r.body.data.approval_note === '同意调换', 'approval_note stored')
}})

tests.push({ name: 'SWAP_RESULT: verify seats actually swapped', fn: async () => {
  const seats = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const a1 = seats.body.data.find(s => s.seat_number === 'A1')
  const a2 = seats.body.data.find(s => s.seat_number === 'A2')
  assert(a1.student_id === globalThis.students[1].id, 'A1 now has student2 (was student1)')
  assert(a2.student_id === globalThis.students[0].id, 'A2 now has student1 (was student2)')
  console.log('✅ seats swapped correctly')
}})

tests.push({ name: 'SWAP_FORCE_FAIL: remove A1 assignment then try to approve another swap', fn: async () => {
  const seats = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const a1 = seats.body.data.find(s => s.seat_number === 'A1')
  const a2 = seats.body.data.find(s => s.seat_number === 'A2')
  const b1 = seats.body.data.find(s => s.seat_number === 'B1')
  const st3 = globalThis.students[2]
  await req('/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.sessionId, seatId: b1.id, studentId: st3.id }),
  })
  const reqBody = {
    sessionId: globalThis.sessionId,
    fromStudentId: a1.student_id,
    toStudentId: st3.id,
    fromSeatId: a1.id,
    toSeatId: b1.id,
    reason: '测试强制失败',
  }
  const create = await req('/api/swap-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  })
  const newSwapId = create.body.data.id
  const a1Assignment = a1.assignment_id
  await req(`/api/assignments/${a1Assignment}`, { method: 'DELETE' })
  const r = await req(`/api/swap-requests/${newSwapId}/approve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approverRole: 'ta', approvalNote: '强制审批' }),
  })
  assert(r.status === 409, 'seat changed after unassign returns 409')
  assert(r.body.error === 'SEAT_CHANGED', 'error code SEAT_CHANGED')
  const seatsAfter = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const b1After = seatsAfter.body.data.find(s => s.seat_number === 'B1')
  assert(b1After.student_id === st3.id, 'B1 still has student3 (original assignment preserved)')
  const a1After = seatsAfter.body.data.find(s => s.seat_number === 'A1')
  assert(a1After.status !== 'occupied' || a1After.student_id !== st3.id, 'A1 did not get student3 - original layout preserved')
}})

tests.push({ name: 'DELETE_ROSTER: in-use roster should be blocked', fn: async () => {
  const r = await req(`/api/rosters/${globalThis.rosterId}`, { method: 'DELETE' })
  assert(r.status === 400, 'in-use roster cannot be deleted')
  assert(r.body.success === false, 'delete rejected')
}})

tests.push({ name: 'EXPORT_SEATS: JSON data with Chinese column names', fn: async () => {
  const r = await req(`/api/export/seats?sessionId=${globalThis.sessionId}`)
  assert(r.body.success === true, 'export seats ok')
  assert(r.body.data.length > 0, 'has rows')
  const columns = Object.keys(r.body.data[0])
  assert(columns.includes('学号'), 'export contains 学号 column')
  assert(columns.includes('姓名'), 'export contains 姓名 column')
  assert(columns.includes('场次'), 'export contains 场次 column')
  assert(columns.includes('席位号'), 'export contains 席位号 column')
}})

tests.push({ name: 'EXPORT_ATTENDANCE: JSON data with Chinese column names', fn: async () => {
  const r = await req(`/api/export/attendance?sessionId=${globalThis.sessionId}`)
  assert(r.body.success === true, 'export attendance ok')
  const columns = Object.keys(r.body.data[0])
  assert(columns.includes('签到状态'), 'export contains 签到状态 column')
  assert(columns.includes('签到时间'), 'export contains 签到时间 column')
}})

tests.push({ name: 'OPERATION_LOGS: logs recorded for all mutations', fn: async () => {
  const r = await req(`/api/logs?sessionId=${globalThis.sessionId}`)
  assert(r.body.success === true, 'logs fetched')
  const types = r.body.data.map(l => l.operation_type)
  assert(types.includes('create_session'), 'create_session logged')
  assert(types.includes('assign_seat'), 'assign_seat logged')
  assert(types.includes('approve_swap'), 'approve_swap logged')
  assert(types.includes('update_attendance'), 'update_attendance logged')
  const taApproved = r.body.data.find(l => l.operation_type === 'approve_swap')
  assert(taApproved.operator_role === 'ta', 'TA approval recorded with correct role')
}})

tests.push({ name: 'SAMPLE_CSV: returns valid CSV', fn: async () => {
  const res = await fetch(BASE + '/api/rosters/sample')
  const text = await res.text()
  assert(text.includes('学号,姓名,班级,组别'), 'sample CSV has correct header')
  assert(text.includes('2024001'), 'sample CSV has student IDs')
  assert(text.includes('张伟'), 'sample CSV has Chinese names')
}})

async function main() {
  console.log('\n=== 实验排座系统 API 验证测试 ===\n')
  for (const t of tests) {
    console.log(`\n--- ${t.name} ---`)
    try { await t.fn() } catch (e) { console.error('❌ Exception:', e.message); process.exit(1) }
  }
  console.log('\n=== 所有测试通过 ===\n')
}
main()
