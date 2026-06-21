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
  globalThis.swapId1 = r.body.data.id
  globalThis.swap1FromStudent = a1.student_id
  globalThis.swap1ToStudent = a2.student_id
  globalThis.swap1FromSeat = a1.id
  globalThis.swap1ToSeat = a2.id
}})

tests.push({ name: 'TA_FORCE_APPROVE_FAIL: TA must be rejected, seats unchanged, data clean', fn: async () => {
  const seatsBefore = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const a1Before = seatsBefore.body.data.find(s => s.seat_number === 'A1')
  const a2Before = seatsBefore.body.data.find(s => s.seat_number === 'A2')
  const r = await req(`/api/swap-requests/${globalThis.swapId1}/approve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approverRole: 'ta', approvalNote: '助教强制审批' }),
  })
  assert(r.status === 403, 'TA approval returns 403 Forbidden')
  assert(r.body.success === false, 'TA approval rejected (success=false)')
  assert(r.body.error === 'TA_APPROVAL_FORBIDDEN', 'error code is TA_APPROVAL_FORBIDDEN')
  assert(r.body.message.includes('原排座保持不变'), 'message mentions 原排座保持不变')
  const seatsAfter = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const a1After = seatsAfter.body.data.find(s => s.seat_number === 'A1')
  const a2After = seatsAfter.body.data.find(s => s.seat_number === 'A2')
  assert(a1After.student_id === a1Before.student_id, 'A1 student unchanged after TA rejection')
  assert(a2After.student_id === a2Before.student_id, 'A2 student unchanged after TA rejection')
  const swapAfter = await req(`/api/swap-requests?sessionId=${globalThis.sessionId}`)
  const req1 = swapAfter.body.data.find(s => s.id === globalThis.swapId1)
  assert(req1.status === 'rejected', 'swap request status is rejected')
  assert(req1.approval_role === 'ta', 'approval_role recorded as ta')
  assert(req1.approval_note === '助教无审批权限，需管理员审批', 'rejection note stored correctly')
  const logs = await req(`/api/logs?sessionId=${globalThis.sessionId}`)
  const taRejectLog = logs.body.data.find(l =>
    l.operation_type === 'reject_swap' && l.operator_role === 'ta')
  assert(taRejectLog, 'reject_swap log with ta role exists')
  assert(taRejectLog.details.includes('助教强制审批被拒绝'), 'log message contains rejection reason')
  console.log('✅ TA approval correctly rejected, seats unchanged, data clean')
}})

tests.push({ name: 'SWAP_REQUEST: create 2nd swap for admin approval', fn: async () => {
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
  assert(r.body.success === true, '2nd swap request created')
  assert(r.body.data.status === 'pending', 'status is pending')
  globalThis.swapId2 = r.body.data.id
}})

tests.push({ name: 'SWAP_APPROVE: approve swap as ADMIN (normal success path)', fn: async () => {
  const r = await req(`/api/swap-requests/${globalThis.swapId2}/approve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approverRole: 'admin', approvalNote: '管理员批准调换' }),
  })
  assert(r.body.success === true, 'swap approved by admin')
  assert(r.body.data.status === 'approved', 'status is approved')
  assert(r.body.data.approval_role === 'admin', 'approval_role is admin')
  assert(r.body.data.approval_note === '管理员批准调换', 'approval_note stored')
}})

tests.push({ name: 'SWAP_RESULT: verify seats actually swapped after admin approval', fn: async () => {
  const seats = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const a1 = seats.body.data.find(s => s.seat_number === 'A1')
  const a2 = seats.body.data.find(s => s.seat_number === 'A2')
  assert(a1.student_id === globalThis.students[1].id, 'A1 now has student2 (was student1)')
  assert(a2.student_id === globalThis.students[0].id, 'A2 now has student1 (was student2)')
  console.log('✅ seats swapped correctly after admin approval')
}})

tests.push({ name: 'SEAT_CHANGED_FAIL: unassign seat then admin approve should fail', fn: async () => {
  const seats = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const b1 = seats.body.data.find(s => s.seat_number === 'B1')
  const b2 = seats.body.data.find(s => s.seat_number === 'B2')
  const st3 = globalThis.students[2]
  const st4 = globalThis.students[3]
  const assignB1 = await req('/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.sessionId, seatId: b1.id, studentId: st3.id }),
  })
  assert(assignB1.body.success === true, 'B1 assigned to st3')
  const assignB2 = await req('/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.sessionId, seatId: b2.id, studentId: st4.id }),
  })
  assert(assignB2.body.success === true, 'B2 assigned to st4')
  const reqBody = {
    sessionId: globalThis.sessionId,
    fromStudentId: st3.id,
    toStudentId: st4.id,
    fromSeatId: b1.id,
    toSeatId: b2.id,
    reason: '测试SEAT_CHANGED场景',
  }
  const create = await req('/api/swap-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  })
  const newSwapId = create.body.data.id
  const b1Assignment = b1.assignment_id || assignB1.body.data.id
  await req(`/api/assignments/${b1Assignment}`, { method: 'DELETE' })
  const r = await req(`/api/swap-requests/${newSwapId}/approve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approverRole: 'admin', approvalNote: '管理员审批但席位已变' }),
  })
  assert(r.status === 409, 'seat changed after unassign returns 409')
  assert(r.body.error === 'SEAT_CHANGED', 'error code SEAT_CHANGED')
  const seatsAfter = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const b2After = seatsAfter.body.data.find(s => s.seat_number === 'B2')
  assert(b2After.student_id === st4.id, 'B2 still has st4 (original assignment preserved)')
  const b1After = seatsAfter.body.data.find(s => s.seat_number === 'B1')
  assert(b1After.status !== 'occupied' || b1After.student_id !== st4.id, 'B1 did not get st4 - original layout preserved')
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
  assert(types.includes('reject_swap'), 'reject_swap logged')
  assert(types.includes('update_attendance'), 'update_attendance logged')
  const adminApproved = r.body.data.find(l => l.operation_type === 'approve_swap')
  assert(adminApproved.operator_role === 'admin', 'admin approval recorded with correct role')
  const taRejected = r.body.data.find(l => l.operation_type === 'reject_swap' && l.operator_role === 'ta')
  assert(taRejected, 'TA rejection recorded with correct role')
}})

tests.push({ name: 'USER_LINK_VERIFY: no false approved in swap list or exports', fn: async () => {
  const swapList = await req(`/api/swap-requests?sessionId=${globalThis.sessionId}`)
  const taRejected = swapList.body.data.find(s => s.id === globalThis.swapId1)
  assert(taRejected.status === 'rejected', 'swap #1 status = rejected in list API')
  assert(taRejected.status !== 'approved', 'swap #1 is NOT approved in list API')
  assert(taRejected.approval_role === 'ta', 'swap #1 approval_role = ta in list API')
  const adminApproved = swapList.body.data.find(s => s.id === globalThis.swapId2)
  assert(adminApproved.status === 'approved', 'swap #2 status = approved in list API')
  assert(adminApproved.approval_role === 'admin', 'swap #2 approval_role = admin in list API')
  const seatsExport = await req(`/api/export/seats?sessionId=${globalThis.sessionId}`)
  const a1Row = seatsExport.body.data.find(r => r.席位号 === 'A1')
  const a2Row = seatsExport.body.data.find(r => r.席位号 === 'A2')
  assert(a1Row.姓名 === '李娜', 'A1=李娜 after admin approval swap, not affected by TA rejection')
  assert(a2Row.姓名 === '张伟', 'A2=张伟 after admin approval swap, not affected by TA rejection')
  const attExport = await req(`/api/export/attendance?sessionId=${globalThis.sessionId}`)
  const columns = Object.keys(attExport.body.data[0])
  assert(!columns.includes('approval_role'), 'attendance export does not leak approval data')
  console.log('✅ User link verification passed - no false approved state visible')
}})

tests.push({ name: 'SAMPLE_CSV: returns valid CSV', fn: async () => {
  const res = await fetch(BASE + '/api/rosters/sample')
  const text = await res.text()
  assert(text.includes('学号,姓名,班级,组别'), 'sample CSV has correct header')
  assert(text.includes('2024001'), 'sample CSV has student IDs')
  assert(text.includes('张伟'), 'sample CSV has Chinese names')
}})

tests.push({ name: 'SAMPLE_FILENAME_MATCH: download filename matches page description', fn: async () => {
  const res = await fetch(BASE + '/api/rosters/sample')
  const disposition = res.headers.get('Content-Disposition') || ''
  assert(disposition.length > 0, 'Content-Disposition header is present')
  assert(disposition.includes('UTF-8'), 'filename uses UTF-8 encoding (RFC 5987)')
  assert(disposition.includes('%E6%A0%B7%E4%BE%8B%E5%90%8D%E5%8D%95.csv'), 'filename is 样例名单.csv (URL-encoded)')
  const decoded = decodeURIComponent(disposition.match(/UTF-8''(.+)/)?.[1] || '')
  assert(decoded === '样例名单.csv', 'decoded filename is 样例名单.csv')
  console.log('✅ Sample filename matches: 样例名单.csv')
}})

tests.push({ name: 'SEAT_REFRESH_AFTER_APPROVE: seat data fresh on re-enter (no stale cache)', fn: async () => {
  const seatsFirst = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const a1First = seatsFirst.body.data.find(s => s.seat_number === 'A1')
  const a2First = seatsFirst.body.data.find(s => s.seat_number === 'A2')
  assert(a1First.student_id === globalThis.students[1].id, 'first load: A1 has student2 (Li Na)')
  assert(a2First.student_id === globalThis.students[0].id, 'first load: A2 has student1 (Zhang Wei)')
  console.log('✅ First page load - seats match expected state')
  const seatsSecond = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const a1Second = seatsSecond.body.data.find(s => s.seat_number === 'A1')
  const a2Second = seatsSecond.body.data.find(s => s.seat_number === 'A2')
  assert(a1Second.student_id === a1First.student_id, 'second load: A1 matches first load - consistent')
  assert(a2Second.student_id === a2First.student_id, 'second load: A2 matches first load - consistent')
  const c1 = seatsSecond.body.data.find(s => s.seat_number === 'C1')
  const st6 = globalThis.students[5]
  const assignResp = await req('/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.sessionId, seatId: c1.id, studentId: st6.id }),
  })
  assert(assignResp.body.success === true, 'assigned student6 to C1')
  const seatsAfterAssign = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const c1After = seatsAfterAssign.body.data.find(s => s.seat_number === 'C1')
  assert(c1After.status === 'occupied', 'C1 is occupied after assignment')
  assert(c1After.student_id === st6.id, 'C1 has student6 - data refreshed on next query')
  const swapReq = await req('/api/swap-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: globalThis.sessionId,
      fromStudentId: a1Second.student_id,
      toStudentId: st6.id,
      fromSeatId: a1Second.id,
      toSeatId: c1.id,
      reason: '测试审批后刷新验证',
    }),
  })
  assert(swapReq.body.success === true, 'swap request created between A1 and C1')
  const swapId3 = swapReq.body.data.id
  const seatsBeforeApprove = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const a1BeforeAppr = seatsBeforeApprove.body.data.find(s => s.seat_number === 'A1')
  const c1BeforeAppr = seatsBeforeApprove.body.data.find(s => s.seat_number === 'C1')
  assert(a1BeforeAppr.student_id === globalThis.students[1].id, 'before approve: A1 still has Li Na')
  assert(c1BeforeAppr.student_id === st6.id, 'before approve: C1 still has student6')
  const approveResp = await req(`/api/swap-requests/${swapId3}/approve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approverRole: 'admin', approvalNote: '管理员批准' }),
  })
  assert(approveResp.body.success === true, 'swap approved by admin')
  const seatsAfterApprove = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  const a1AfterAppr = seatsAfterApprove.body.data.find(s => s.seat_number === 'A1')
  const c1AfterAppr = seatsAfterApprove.body.data.find(s => s.seat_number === 'C1')
  assert(a1AfterAppr.student_id === st6.id, 'AFTER APPROVE: A1 now has student6 (swapped)')
  assert(c1AfterAppr.student_id === globalThis.students[1].id, 'AFTER APPROVE: C1 now has Li Na (swapped)')
  console.log('✅ Seat data immediately updated after approval - no stale data on re-query')
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
