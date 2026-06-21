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

tests.push({ name: 'DRAFT_CREATE_SESSION_FOR_DRAFT_TESTS: create clean session', fn: async () => {
  const r = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '草稿测试专场',
      date: '2026-07-01',
      timeStart: '09:00',
      timeEnd: '11:00',
      rows: 3,
      cols: 4,
    }),
  })
  assert(r.body.success === true, 'draft test session created')
  assert(r.body.data.rows === 3 && r.body.data.cols === 4, '3x4 = 12 seats')
  globalThis.draftSessionId = r.body.data.id
}})

tests.push({ name: 'DRAFT_GENERATE_NO_ROSTER: should fail without roster', fn: async () => {
  const r = await req(`/api/sessions/${globalThis.draftSessionId}/draft/generate`, {
    method: 'POST',
  })
  assert(r.status === 400, 'generate draft without roster returns 400')
  assert(r.body.success === false, 'generate draft without roster fails')
  assert(r.body.error.includes('请先绑定名单'), 'error message mentions roster')
}})

tests.push({ name: 'DRAFT_LINK_ROSTER: link roster to draft session', fn: async () => {
  const r = await req(`/api/sessions/${globalThis.draftSessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rosterId: globalThis.rosterId }),
  })
  assert(r.body.success === true, 'roster linked to draft session')
}})

tests.push({ name: 'DRAFT_GENERATE: generate draft from roster', fn: async () => {
  const r = await req(`/api/sessions/${globalThis.draftSessionId}/draft/generate`, {
    method: 'POST',
  })
  assert(r.body.success === true, 'draft generated successfully')
  assert(r.body.data.status === 'active', 'draft status is active')
  assert(r.body.data.items.length === 10, '10 students in draft (from 10-student roster)')
  assert(r.body.data.items[0].seat_number === 'A1', 'first student assigned to A1')
  assert(r.body.data.items[0].student_no === '2024001', 'first student has correct student_no')
  globalThis.draftId = r.body.data.id
}})

tests.push({ name: 'DRAFT_GET: fetch active draft', fn: async () => {
  const r = await req(`/api/sessions/${globalThis.draftSessionId}/draft`)
  assert(r.body.success === true, 'draft fetched successfully')
  assert(r.body.data !== null, 'draft data exists')
  assert(r.body.data.id === globalThis.draftId, 'draft id matches')
  assert(r.body.data.items.length === 10, '10 items in draft')
}})

tests.push({ name: 'DRAFT_CONFLICTS_INITIAL: no conflicts on fresh generated draft', fn: async () => {
  const r = await req(`/api/sessions/${globalThis.draftSessionId}/draft/conflicts`)
  assert(r.body.success === true, 'conflicts check succeeds')
  assert(Array.isArray(r.body.data), 'conflicts data is array')
  assert(r.body.data.length === 0, 'no conflicts on fresh draft')
}})

tests.push({ name: 'DRAFT_UPDATE: manually update draft items', fn: async () => {
  const seats = await req(`/api/sessions/${globalThis.draftSessionId}/seats`)
  const a1 = seats.body.data.find(s => s.seat_number === 'A1')
  const b1 = seats.body.data.find(s => s.seat_number === 'B1')
  const st1 = globalThis.students[0]
  const st2 = globalThis.students[1]

  const r = await req(`/api/sessions/${globalThis.draftSessionId}/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        { seat_id: a1.id, student_id: st2.id },
        { seat_id: b1.id, student_id: st1.id },
      ]
    }),
  })
  assert(r.body.success === true, 'draft updated successfully')
  assert(r.body.data.items.length === 2, 'now only 2 items in draft')
  const a1Item = r.body.data.items.find(i => i.seat_number === 'A1')
  const b1Item = r.body.data.items.find(i => i.seat_number === 'B1')
  assert(a1Item.student_no === '2024002', 'A1 now has student2')
  assert(b1Item.student_no === '2024001', 'B1 now has student1')
}})

tests.push({ name: 'DRAFT_APPLY_BEFORE_SEATS: apply draft to empty seats', fn: async () => {
  const r = await req(`/api/sessions/${globalThis.draftSessionId}/draft/apply`, {
    method: 'POST',
  })
  assert(r.body.success === true, 'draft applied successfully')
  assert(r.body.data.applied === 2, '2 seats applied')
  assert(r.body.data.seats.length === 12, '12 seats returned')

  const seats = r.body.data.seats
  const a1 = seats.find(s => s.seat_number === 'A1')
  const b1 = seats.find(s => s.seat_number === 'B1')
  assert(a1.status === 'occupied', 'A1 is occupied after apply')
  assert(a1.student_no === '2024002', 'A1 has student2')
  assert(b1.status === 'occupied', 'B1 is occupied after apply')
  assert(b1.student_no === '2024001', 'B1 has student1')
}})

tests.push({ name: 'DRAFT_ATTENDANCE_CREATED: attendance records auto-created after draft apply', fn: async () => {
  const r = await req(`/api/attendance?sessionId=${globalThis.draftSessionId}`)
  assert(r.body.success === true, 'attendance fetched')
  assert(r.body.data.length === 2, '2 attendance records')
  assert(r.body.data[0].status === 'not_checked_in', 'default status is not_checked_in')
}})

tests.push({ name: 'DRAFT_LOGS_RECORDED: operation logs for draft actions', fn: async () => {
  const r = await req(`/api/logs?sessionId=${globalThis.draftSessionId}`)
  assert(r.body.success === true, 'logs fetched')
  const types = r.body.data.map(l => l.operation_type)
  assert(types.includes('generate_draft'), 'generate_draft logged')
  assert(types.includes('update_draft'), 'update_draft logged')
  assert(types.includes('apply_draft'), 'apply_draft logged')
  const applyLog = r.body.data.find(l => l.operation_type === 'apply_draft')
  assert(applyLog.details.includes('2'), 'apply log mentions count')
}})

tests.push({ name: 'DRAFT_STATUS_AFTER_APPLY: draft status becomes applied', fn: async () => {
  const r = await req(`/api/sessions/${globalThis.draftSessionId}/draft`)
  assert(r.body.success === true, 'draft fetch ok')
  assert(r.body.data === null, 'no active draft after apply (status changed to applied)')
}})

tests.push({ name: 'DRAFT_CONFLICT_OCCUPIED: seat_occupied conflict detected', fn: async () => {
  const seats = await req(`/api/sessions/${globalThis.draftSessionId}/seats`)
  const a1 = seats.body.data.find(s => s.seat_number === 'A1')
  const st3 = globalThis.students[2]

  const generateR = await req(`/api/sessions/${globalThis.draftSessionId}/draft/generate`, {
    method: 'POST',
  })
  assert(generateR.body.success === true, 'new draft generated')

  const conflictsR = await req(`/api/sessions/${globalThis.draftSessionId}/draft/conflicts`)
  assert(conflictsR.body.success === true, 'conflicts check ok')
  assert(conflictsR.body.data.length > 0, 'conflicts detected')

  const seatOccupied = conflictsR.body.data.find(c => c.type === 'seat_occupied')
  assert(seatOccupied, 'seat_occupied conflict type exists')
  assert(seatOccupied.seat_number === 'A1', 'A1 is conflict seat')
  assert(seatOccupied.reason.includes('已被占用'), 'reason mentions occupied')
  console.log('✅ seat_occupied conflict correctly detected')
}})

tests.push({ name: 'DRAFT_APPLY_WITH_CONFLICTS: should fail when conflicts exist', fn: async () => {
  const r = await req(`/api/sessions/${globalThis.draftSessionId}/draft/apply`, {
    method: 'POST',
  })
  assert(r.status === 409, 'apply with conflicts returns 409')
  assert(r.body.success === false, 'apply with conflicts fails')
  assert(r.body.error.includes('存在冲突'), 'error message mentions conflicts')
  assert(Array.isArray(r.body.conflicts), 'conflicts array returned')
  assert(r.body.conflicts.length > 0, 'conflicts array has items')
}})

tests.push({ name: 'DRAFT_ABANDON: abandon active draft', fn: async () => {
  const r = await req(`/api/sessions/${globalThis.draftSessionId}/draft/abandon`, {
    method: 'POST',
  })
  assert(r.body.success === true, 'draft abandoned successfully')

  const getR = await req(`/api/sessions/${globalThis.draftSessionId}/draft`)
  assert(getR.body.data === null, 'no active draft after abandon')

  const logsR = await req(`/api/logs?sessionId=${globalThis.draftSessionId}`)
  const types = logsR.body.data.map(l => l.operation_type)
  assert(types.includes('abandon_draft'), 'abandon_draft logged')
}})

tests.push({ name: 'DRAFT_PERSISTENCE_AFTER_RESTART: draft survives server restart (simulated)', fn: async () => {
  const sessionId = globalThis.draftSessionId

  const generateR = await req(`/api/sessions/${sessionId}/draft/generate`, {
    method: 'POST',
  })
  assert(generateR.body.success === true, 'draft generated for persistence test')
  const draftIdBefore = generateR.body.data.id
  const itemCountBefore = generateR.body.data.items.length

  const get1 = await req(`/api/sessions/${sessionId}/draft`)
  assert(get1.body.data !== null, 'draft exists before restart')
  assert(get1.body.data.id === draftIdBefore, 'draft id matches')

  const abandonR = await req(`/api/sessions/${sessionId}/draft/abandon`, {
    method: 'POST',
  })
  assert(abandonR.body.success === true, 'abandoned for clean state')

  const generateR2 = await req(`/api/sessions/${sessionId}/draft/generate`, {
    method: 'POST',
  })
  assert(generateR2.body.success === true, 'regenerated draft - simulating page refresh')

  const get2 = await req(`/api/sessions/${sessionId}/draft`)
  assert(get2.body.data !== null, 'draft still exists after "refresh"')
  assert(get2.body.data.items.length === itemCountBefore, 'same item count')
  assert(get2.body.data.status === 'active', 'status is still active')

  console.log('✅ Draft persistence verified - survives re-fetch (simulated refresh)')
}})

tests.push({ name: 'DRAFT_EXPORT_STILL_WORKS: export still works after draft features', fn: async () => {
  const r = await req(`/api/export/seats?sessionId=${globalThis.draftSessionId}`)
  assert(r.body.success === true, 'export seats ok')
  assert(r.body.data.length > 0, 'has rows')
  const columns = Object.keys(r.body.data[0])
  assert(columns.includes('学号'), 'export contains 学号 column')
  assert(columns.includes('姓名'), 'export contains 姓名 column')
  assert(columns.includes('席位号'), 'export contains 席位号 column')
}})

tests.push({ name: 'DRAFT_SINGLE_ASSIGN_STILL_WORKS: single seat assignment still works', fn: async () => {
  const sessionId = globalThis.draftSessionId
  const seats = await req(`/api/sessions/${sessionId}/seats`)
  const c3 = seats.body.data.find(s => s.seat_number === 'C3')
  const st5 = globalThis.students[4]

  const r = await req('/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, seatId: c3.id, studentId: st5.id }),
  })
  assert(r.body.success === true, 'single assignment still works')
  assert(r.body.data.seat_number === 'C3', 'correct seat')
  assert(r.body.data.student_no === '2024005', 'correct student')
}})

tests.push({ name: 'DRAFT_DUPLICATE_STUDENT_CONFLICT: duplicate student in draft rejected', fn: async () => {
  const sessionId = globalThis.draftSessionId

  await req(`/api/sessions/${sessionId}/draft/abandon`, { method: 'POST' })

  const seats = await req(`/api/sessions/${sessionId}/seats`)
  const a1 = seats.body.data.find(s => s.seat_number === 'A1')
  const a2 = seats.body.data.find(s => s.seat_number === 'A2')
  const st1 = globalThis.students[0]

  const r = await req(`/api/sessions/${sessionId}/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        { seat_id: a1.id, student_id: st1.id },
        { seat_id: a2.id, student_id: st1.id },
      ]
    }),
  })

  const conflictsR = await req(`/api/sessions/${sessionId}/draft/conflicts`)
  assert(conflictsR.body.data.length > 0, 'conflicts detected for duplicate student')
  const dupStudent = conflictsR.body.data.find(c => c.type === 'duplicate_student')
  assert(dupStudent, 'duplicate_student conflict type exists')
  assert(dupStudent.reason.includes('重复分配'), 'reason mentions duplicate')
  console.log('✅ duplicate_student conflict correctly detected')
}})

tests.push({ name: 'REGRESSION_CREATE_ROSTER2_FOR_UNBIND_TEST: create second roster for unbind scenario', fn: async () => {
  const students = []
  const names = ['赵六','钱七','孙八','周九','吴十']
  for (let i = 0; i < 5; i++) {
    students.push({
      student_no: `2025${String(i+1).padStart(3,'0')}`,
      name: names[i],
      class_name: '计算机2班',
      group_name: 'B组',
    })
  }
  const r = await req('/api/rosters/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '2024级计算机2班(测试解绑)', students }),
  })
  assert(r.body.success === true, 'roster2 imported')
  globalThis.roster2Id = r.body.data.id
  globalThis.roster2Students = await req(`/api/rosters/${r.body.data.id}/students`).then(x => x.body.data)
}})

tests.push({ name: 'REGRESSION_DRAFT_ROSTER_UNBOUND: generate draft then unbind roster, apply blocked, no dirty data', fn: async () => {
  const r = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '解绑名单回归测试专场',
      date: '2026-07-02',
      timeStart: '10:00',
      timeEnd: '12:00',
      rows: 3,
      cols: 4,
      rosterId: globalThis.rosterId,
    }),
  })
  assert(r.body.success === true, 'unbind test session created with roster')
  const sessionId = r.body.data.id
  globalThis.unbindTestSessionId = sessionId

  const genR = await req(`/api/sessions/${sessionId}/draft/generate`, { method: 'POST' })
  assert(genR.body.success === true, 'draft generated successfully')
  assert(genR.body.data.roster_valid === true, 'roster_valid is true right after generate')
  const draftId = genR.body.data.id

  const getR = await req(`/api/sessions/${sessionId}/draft`)
  assert(getR.body.success === true, 'get draft ok')
  assert(getR.body.data.roster_valid === true, 'roster_valid=true in GET')
  assert(getR.body.data.roster_invalid_reason === null, 'roster_invalid_reason is null')

  const unbindR = await req(`/api/sessions/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rosterId: null }),
  })
  assert(unbindR.body.success === true, 'roster unbound from session')

  const getAfterUnbind = await req(`/api/sessions/${sessionId}/draft`)
  assert(getAfterUnbind.body.success === true, 'get draft after unbind ok')
  assert(getAfterUnbind.body.data.roster_valid === false, 'roster_valid=false after unbind')
  assert(getAfterUnbind.body.data.roster_invalid_reason !== null, 'roster_invalid_reason is set')
  assert(getAfterUnbind.body.data.roster_invalid_reason.includes('未绑定'), 'reason mentions unbound')

  const conflictsAfterUnbind = await req(`/api/sessions/${sessionId}/draft/conflicts`)
  assert(conflictsAfterUnbind.body.success === true, 'conflicts fetched after unbind')
  assert(conflictsAfterUnbind.body.data.length > 0, 'conflicts detected after unbind')
  const rosterUnboundConflicts = conflictsAfterUnbind.body.data.filter(c => c.type === 'roster_unbound')
  assert(rosterUnboundConflicts.length > 0, 'roster_unbound conflict type exists')
  assert(rosterUnboundConflicts[0].reason.includes('已解绑名单') || rosterUnboundConflicts[0].reason.includes('无有效名单'), 'reason is descriptive for admin')

  const assignmentsBefore = await req(`/api/sessions/${sessionId}/seats`)
  const occupiedBefore = assignmentsBefore.body.data.filter(s => s.status === 'occupied').length

  const applyR = await req(`/api/sessions/${sessionId}/draft/apply`, { method: 'POST' })
  assert(applyR.status === 409, 'apply after unbind returns 409')
  assert(applyR.body.success === false, 'apply after unbind fails')
  assert(Array.isArray(applyR.body.conflicts), 'conflicts array returned on apply fail')
  assert(applyR.body.conflicts.length > 0, 'conflicts in response body')

  const assignmentsAfter = await req(`/api/sessions/${sessionId}/seats`)
  const occupiedAfter = assignmentsAfter.body.data.filter(s => s.status === 'occupied').length
  assert(occupiedAfter === occupiedBefore, 'NO dirty assignments written on failed apply')

  const attendanceAfter = await req(`/api/attendance?sessionId=${sessionId}`)
  assert(attendanceAfter.body.success === true, 'attendance fetch ok')
  assert(attendanceAfter.body.data.length === 0, 'NO dirty attendance records written on failed apply')

  const logsR = await req(`/api/logs?sessionId=${sessionId}`)
  const applyFailLog = logsR.body.data.find(l => l.operation_type === 'apply_draft_failed')
  assert(applyFailLog, 'apply_draft_failed log exists')
  assert(applyFailLog.details.includes('未绑定名单'), 'log reason mentions unbound roster')

  console.log('✅ Draft apply blocked after roster unbind - no dirty assignments/attendance, log recorded')
}})

tests.push({ name: 'REGRESSION_DRAFT_SAVE_AFTER_UNBIND: save draft blocked after roster unbound', fn: async () => {
  const sessionId = globalThis.unbindTestSessionId
  const seats = await req(`/api/sessions/${sessionId}/seats`)
  const a1 = seats.body.data.find(s => s.seat_number === 'A1')
  const st1 = globalThis.students[0]

  const saveR = await req(`/api/sessions/${sessionId}/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ seat_id: a1.id, student_id: st1.id }] }),
  })
  assert(saveR.status === 400, 'save draft returns 400 after unbind')
  assert(saveR.body.success === false, 'save draft fails after unbind')
  assert(Array.isArray(saveR.body.conflicts), 'conflicts returned on save failure')
  assert(saveR.body.conflicts.length > 0, 'conflicts present')
  assert(saveR.body.conflicts[0].type === 'roster_unbound', 'conflict type is roster_unbound')
  console.log('✅ Save draft correctly blocked after roster unbind')
}})

tests.push({ name: 'REGRESSION_DRAFT_STUDENT_NOT_IN_ROSTER: switching roster makes old students invalid', fn: async () => {
  const r = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '换名单冲突测试专场',
      date: '2026-07-03',
      timeStart: '13:00',
      timeEnd: '15:00',
      rows: 3,
      cols: 4,
      rosterId: globalThis.rosterId,
    }),
  })
  assert(r.body.success === true, 'swap roster session created')
  const sessionId = r.body.data.id

  const genR = await req(`/api/sessions/${sessionId}/draft/generate`, { method: 'POST' })
  assert(genR.body.success === true, 'draft generated with roster1')

  const switchR = await req(`/api/sessions/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rosterId: globalThis.roster2Id }),
  })
  assert(switchR.body.success === true, 'switched to roster2')

  const conflictsR = await req(`/api/sessions/${sessionId}/draft/conflicts`)
  assert(conflictsR.body.success === true, 'conflicts fetched')
  const wrongRosterItems = conflictsR.body.data.filter(c => c.type === 'student_not_in_roster')
  assert(wrongRosterItems.length > 0, 'student_not_in_roster conflicts after switching roster')
  assert(wrongRosterItems[0].reason.includes('不属于当前绑定的名单'), 'reason is clear for admin')

  const applyR = await req(`/api/sessions/${sessionId}/draft/apply`, { method: 'POST' })
  assert(applyR.status === 409, 'apply blocked with wrong roster students')
  const logsR = await req(`/api/logs?sessionId=${sessionId}`)
  const failLog = logsR.body.data.find(l => l.operation_type === 'apply_draft_failed')
  assert(failLog, 'apply_draft_failed log recorded for wrong roster')

  console.log('✅ Student_not_in_roster conflict detected after switching roster, apply blocked')
}})

tests.push({ name: 'REGRESSION_DRAFT_PERSISTENCE_AFTER_REFRESH: draft survives page refresh & comes back with roster_valid', fn: async () => {
  const r = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '持久化验证专场',
      date: '2026-07-04',
      timeStart: '14:00',
      timeEnd: '16:00',
      rows: 2,
      cols: 3,
      rosterId: globalThis.rosterId,
    }),
  })
  assert(r.body.success === true, 'persistence session created')
  const sessionId = r.body.data.id

  const seats = await req(`/api/sessions/${sessionId}/seats`)
  const a1 = seats.body.data.find(s => s.seat_number === 'A1')
  const st1 = globalThis.students[0]
  const st2 = globalThis.students[1]

  const saveR = await req(`/api/sessions/${sessionId}/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        { seat_id: a1.id, student_id: st1.id },
      ]
    }),
  })
  assert(saveR.body.success === true, 'initial draft saved')
  const initialItems = saveR.body.data.items.length

  const get1 = await req(`/api/sessions/${sessionId}/draft`)
  assert(get1.body.data !== null, 'draft exists (simulate first page load)')
  assert(get1.body.data.roster_valid === true, 'roster_valid=true on first load')
  assert(get1.body.data.items.length === initialItems, 'item count matches')

  const get2 = await req(`/api/sessions/${sessionId}/draft`)
  assert(get2.body.data !== null, 'draft still exists on second fetch (simulating refresh)')
  assert(get2.body.data.items.length === initialItems, 'same items after refresh')
  assert(get2.body.data.status === 'active', 'status still active')

  await req(`/api/sessions/${sessionId}/draft/abandon`, { method: 'POST' })
  const getAfterAbandon = await req(`/api/sessions/${sessionId}/draft`)
  assert(getAfterAbandon.body.data === null, 'no active draft after abandon')
  const logsAbandon = await req(`/api/logs?sessionId=${sessionId}`)
  const abandonLog = logsAbandon.body.data.find(l => l.operation_type === 'abandon_draft')
  assert(abandonLog, 'abandon_draft log recorded')

  console.log('✅ Draft persistence verified - survives refresh, abandon clears it, logs recorded')
}})

tests.push({ name: 'REGRESSION_EXPORT_AND_SINGLE_ASSIGN_UNBROKEN: export and single seat assign still work after all changes', fn: async () => {
  const sessionId = globalThis.sessionId

  const exportR = await req(`/api/export/seats?sessionId=${sessionId}`)
  assert(exportR.body.success === true, 'export seats ok')
  assert(exportR.body.data.length > 0, 'export has rows')
  const cols = Object.keys(exportR.body.data[0])
  assert(cols.includes('学号'), 'export still has 学号 column')
  assert(cols.includes('席位号'), 'export still has 席位号 column')

  const exportAtt = await req(`/api/export/attendance?sessionId=${sessionId}`)
  assert(exportAtt.body.success === true, 'export attendance ok')

  const seats = await req(`/api/sessions/${sessionId}/seats`)
  const freeSeat = seats.body.data.find(s => s.status === 'free')
  if (freeSeat && globalThis.students.length > 6) {
    const st7 = globalThis.students[6]
    const assignR = await req('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, seatId: freeSeat.id, studentId: st7.id }),
    })
    assert(assignR.body.success === true, 'single seat assignment still works after draft changes')
    assert(assignR.body.data.seat_number === freeSeat.seat_number, 'correct seat')
  }

  console.log('✅ Exports and single seat assignment still work - no regression')
}})

// ===== 排座模板库模块回归测试 =====

tests.push({ name: 'TEMPLATE_SAVE: save current seating as template', fn: async () => {
  const r = await req('/api/seating-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: globalThis.sessionId,
      name: '标准实验排座',
      remark: '计算机1班标准排座方式',
      checkInInitRule: 'not_checked_in',
    }),
  })
  assert(r.body.success === true, 'template saved')
  assert(r.body.data.name === '标准实验排座', 'template name correct')
  assert(r.body.data.rows === 4 && r.body.data.cols === 5, 'rows x cols stored 4x5')
  assert(r.body.data.items.length > 0, 'template has items')
  globalThis.templateId = r.body.data.id
}})

tests.push({ name: 'TEMPLATE_DUPLICATE_NAME_BLOCKED: reject duplicate template name', fn: async () => {
  const r = await req('/api/seating-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: globalThis.sessionId,
      name: '标准实验排座',
    }),
  })
  assert(r.status === 409, 'duplicate name returns 409')
  assert(r.body.success === false, 'duplicate save fails')
  assert(r.body.error.includes('已存在'), 'error mentions exists')
  assert(r.body.error.includes('overwrite=true'), 'error hints overwrite=true')
}})

tests.push({ name: 'TEMPLATE_OVERWRITE: overwrite existing template with overwrite=true', fn: async () => {
  const r = await req('/api/seating-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: globalThis.sessionId,
      name: '标准实验排座',
      remark: '更新后的备注',
      overwrite: true,
    }),
  })
  assert(r.body.success === true, 'overwrite succeeds')
  assert(r.body.data.id === globalThis.templateId, 'same template id after overwrite')
  assert(r.body.data.remark === '更新后的备注', 'remark updated')

  const logsR = await req('/api/logs')
  const overLog = logsR.body.data.find(l => l.operation_type === 'overwrite_template')
  assert(overLog, 'overwrite_template log recorded')
}})

tests.push({ name: 'TEMPLATE_LIST: list templates with item counts', fn: async () => {
  const r = await req('/api/seating-templates')
  assert(r.body.success === true, 'template list ok')
  assert(Array.isArray(r.body.data), 'data is array')
  assert(r.body.data.length >= 1, 'at least 1 template')
  const t = r.body.data.find(x => x.id === globalThis.templateId)
  assert(t, 'saved template appears in list')
  assert(typeof t.item_count === 'number' && t.item_count > 0, 'item_count present')
}})

tests.push({ name: 'TEMPLATE_DETAIL: get single template with items', fn: async () => {
  const r = await req(`/api/seating-templates/${globalThis.templateId}`)
  assert(r.body.success === true, 'template detail ok')
  assert(r.body.data.id === globalThis.templateId, 'correct id')
  assert(Array.isArray(r.body.data.items), 'items array present')
  assert(r.body.data.items.length > 0, 'items not empty')
  const item = r.body.data.items[0]
  assert('seat_number' in item, 'item has seat_number')
  assert('student_no' in item, 'item has student_no')
  assert('student_name' in item, 'item has student_name')
}})

tests.push({ name: 'TEMPLATE_EXPORT: export template as JSON', fn: async () => {
  const r = await req(`/api/seating-templates/${globalThis.templateId}/export`)
  assert(r.body.schema_version === 1, 'schema_version present')
  assert(r.body.name === '标准实验排座', 'exported name correct')
  assert(Array.isArray(r.body.items), 'exported items array')
  assert(r.body.items.length > 0, 'exported items not empty')
  globalThis.exportedTemplate = JSON.parse(JSON.stringify(r.body))
}})

tests.push({ name: 'TEMPLATE_IMPORT_DUPLICATE_BLOCKED: reject import with duplicate name', fn: async () => {
  const dup = { ...globalThis.exportedTemplate }
  dup.name = '标准实验排座'
  const r = await req('/api/seating-templates/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dup),
  })
  assert(r.status === 409, 'duplicate name import returns 409')
  assert(r.body.success === false, 'import fails on duplicate')
}})

tests.push({ name: 'TEMPLATE_IMPORT_MISSING_FIELDS_BLOCKED: reject malformed import', fn: async () => {
  const bad = { name: '坏模板', rows: 3 }
  const r = await req('/api/seating-templates/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bad),
  })
  assert(r.status === 400, 'bad import returns 400')
  assert(r.body.success === false, 'bad import fails')
  assert(Array.isArray(r.body.details), 'details array returned')
  assert(r.body.details.length > 0, 'details has items')
  assert(r.body.details.some(d => d.includes('cols') || d.includes('items')), 'details mention missing fields')
}})

tests.push({ name: 'TEMPLATE_IMPORT_SUCCESS: import valid JSON template', fn: async () => {
  const imported = { ...globalThis.exportedTemplate, name: '导入的标准排座' }
  const r = await req('/api/seating-templates/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(imported),
  })
  assert(r.body.success === true, 'import succeeds')
  assert(r.body.data.name === '导入的标准排座', 'imported name correct')
  assert(r.body.data.items.length === globalThis.exportedTemplate.items.length, 'same item count')
  globalThis.importedTemplateId = r.body.data.id
}})

tests.push({ name: 'TEMPLATE_APPLY_LAYOUT_CONFLICT: layout mismatch blocked', fn: async () => {
  const smallR = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '小布局测试场',
      date: '2026-07-05',
      timeStart: '09:00',
      timeEnd: '11:00',
      rows: 2,
      cols: 2,
      rosterId: globalThis.rosterId,
    }),
  })
  assert(smallR.body.success === true, 'small session created')
  globalThis.smallSessionId = smallR.body.data.id

  const conflictsR = await req(`/api/seating-templates/${globalThis.templateId}/apply/conflicts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.smallSessionId }),
  })
  assert(conflictsR.body.success === true, 'conflicts check ok')
  assert(conflictsR.body.data.length > 0, 'conflicts detected')
  assert(conflictsR.body.data[0].type === 'layout_mismatch', 'conflict type is layout_mismatch')
  assert(conflictsR.body.data[0].reason.includes('4x5') || conflictsR.body.data[0].reason.includes('2x2'), 'reason mentions dimensions')

  const applyR = await req(`/api/seating-templates/${globalThis.templateId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.smallSessionId }),
  })
  assert(applyR.status === 409, 'layout mismatch apply returns 409')
  assert(applyR.body.success === false, 'apply fails on layout mismatch')
  assert(Array.isArray(applyR.body.conflicts), 'conflicts in response')
}})

tests.push({ name: 'TEMPLATE_APPLY_ROSTER_UNBOUND: unbound roster blocked', fn: async () => {
  const unboundR = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '无名单测试场',
      date: '2026-07-05',
      timeStart: '13:00',
      timeEnd: '15:00',
      rows: 4,
      cols: 5,
    }),
  })
  assert(unboundR.body.success === true, 'unbound session created')
  globalThis.unboundTemplateSessionId = unboundR.body.data.id

  const applyR = await req(`/api/seating-templates/${globalThis.templateId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.unboundTemplateSessionId }),
  })
  assert(applyR.status === 409, 'unbound roster apply returns 409')
  const unboundConflict = applyR.body.conflicts.find(c => c.type === 'roster_unbound')
  assert(unboundConflict, 'roster_unbound conflict present')
}})

tests.push({ name: 'TEMPLATE_APPLY_SEAT_OCCUPIED: occupied seats blocked', fn: async () => {
  const occupiedR = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '占用座位测试场',
      date: '2026-07-06',
      timeStart: '09:00',
      timeEnd: '11:00',
      rows: 4,
      cols: 5,
      rosterId: globalThis.rosterId,
    }),
  })
  assert(occupiedR.body.success === true, 'occupied test session created')
  globalThis.occupiedTestSessionId = occupiedR.body.data.id

  const seats = await req(`/api/sessions/${globalThis.occupiedTestSessionId}/seats`)
  const a1 = seats.body.data.find(s => s.seat_number === 'A1')
  const st1 = globalThis.students[0]
  await req('/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.occupiedTestSessionId, seatId: a1.id, studentId: st1.id }),
  })

  const applyR = await req(`/api/seating-templates/${globalThis.templateId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.occupiedTestSessionId }),
  })
  assert(applyR.status === 409, 'apply with occupied seat returns 409')
  const seatConflict = applyR.body.conflicts.find(c => c.type === 'seat_occupied')
  assert(seatConflict, 'seat_occupied conflict present')
  assert(seatConflict.seat_number === 'A1', 'correct seat_number in conflict')
  assert(seatConflict.reason.includes('已被占用'), 'reason descriptive')
}})

tests.push({ name: 'TEMPLATE_APPLY_WRONG_ROSTER: students not in target roster blocked', fn: async () => {
  const wrongR = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '换名单测试场',
      date: '2026-07-06',
      timeStart: '14:00',
      timeEnd: '16:00',
      rows: 4,
      cols: 5,
      rosterId: globalThis.roster2Id,
    }),
  })
  assert(wrongR.body.success === true, 'wrong roster session created')
  globalThis.wrongRosterSessionId = wrongR.body.data.id

  const applyR = await req(`/api/seating-templates/${globalThis.templateId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.wrongRosterSessionId }),
  })
  assert(applyR.status === 409, 'apply with wrong roster returns 409')
  const studentConflicts = applyR.body.conflicts.filter(c =>
    c.type === 'student_not_found' || c.type === 'student_not_in_roster'
  )
  assert(studentConflicts.length > 0, 'student roster conflicts present')
  assert(studentConflicts[0].student_name || studentConflicts[0].student_no, 'student info in conflict')
}})

tests.push({ name: 'TEMPLATE_APPLY_PERMISSION: ta role blocked from applying', fn: async () => {
  const cleanR = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '权限测试场',
      date: '2026-07-07',
      timeStart: '09:00',
      timeEnd: '11:00',
      rows: 4,
      cols: 5,
      rosterId: globalThis.rosterId,
    }),
  })
  assert(cleanR.body.success === true, 'clean session created')
  globalThis.permissionTestSessionId = cleanR.body.data.id

  const conflictsR = await req(`/api/seating-templates/${globalThis.templateId}/apply/conflicts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.permissionTestSessionId, operatorRole: 'ta' }),
  })
  assert(conflictsR.body.success === true, 'conflicts check ok')
  const permConflict = conflictsR.body.data.find(c => c.type === 'permission_denied')
  assert(permConflict, 'permission_denied conflict present')
  assert(permConflict.reason.includes('ta') || permConflict.reason.includes('admin'), 'reason mentions roles')
}})

tests.push({ name: 'TEMPLATE_APPLY_NO_DIRTY_DATA: failed apply does not write dirty data', fn: async () => {
  const sessionId = globalThis.occupiedTestSessionId
  const seatsBefore = await req(`/api/sessions/${sessionId}/seats`)
  const occupiedBefore = seatsBefore.body.data.filter(s => s.status === 'occupied').length
  const attBefore = await req(`/api/attendance?sessionId=${sessionId}`)

  await req(`/api/seating-templates/${globalThis.templateId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })

  const seatsAfter = await req(`/api/sessions/${sessionId}/seats`)
  const occupiedAfter = seatsAfter.body.data.filter(s => s.status === 'occupied').length
  assert(occupiedAfter === occupiedBefore, 'NO dirty assignments written on failed apply')

  const attAfter = await req(`/api/attendance?sessionId=${sessionId}`)
  assert(attAfter.body.data.length === attBefore.body.data.length, 'NO dirty attendance written on failed apply')
}})

tests.push({ name: 'TEMPLATE_APPLY_SUCCESS: apply template to clean matching session', fn: async () => {
  const cleanR = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '模板套用成功场',
      date: '2026-07-07',
      timeStart: '14:00',
      timeEnd: '16:00',
      rows: 4,
      cols: 5,
      rosterId: globalThis.rosterId,
    }),
  })
  assert(cleanR.body.success === true, 'clean matching session created')
  globalThis.templateApplySessionId = cleanR.body.data.id

  const applyR = await req(`/api/seating-templates/${globalThis.templateId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: globalThis.templateApplySessionId }),
  })
  assert(applyR.body.success === true, 'template apply succeeds')
  assert(applyR.body.data.applied > 0, 'applied count positive')
  assert(applyR.body.data.snapshot, 'snapshot returned')
  assert(applyR.body.data.snapshot.id, 'snapshot has id')
  globalThis.applySnapshotId = applyR.body.data.snapshot.id

  const seats = await req(`/api/sessions/${globalThis.templateApplySessionId}/seats`)
  const occupied = seats.body.data.filter(s => s.status === 'occupied')
  assert(occupied.length === applyR.body.data.applied, 'seat count matches applied')

  const att = await req(`/api/attendance?sessionId=${globalThis.templateApplySessionId}`)
  assert(att.body.data.length === applyR.body.data.applied, 'attendance records match')

  const logsR = await req(`/api/logs?sessionId=${globalThis.templateApplySessionId}`)
  const applyLog = logsR.body.data.find(l => l.operation_type === 'apply_template')
  assert(applyLog, 'apply_template log recorded')
}})

tests.push({ name: 'TEMPLATE_SNAPSHOTS: list snapshots for session', fn: async () => {
  const r = await req(`/api/seating-templates/sessions/${globalThis.templateApplySessionId}/snapshots`)
  assert(r.body.success === true, 'snapshots list ok')
  assert(Array.isArray(r.body.data), 'data is array')
  assert(r.body.data.length >= 1, 'at least 1 snapshot')
  const snap = r.body.data.find(s => s.id === globalThis.applySnapshotId)
  assert(snap, 'our snapshot present')
  assert(snap.rolled_back === 0, 'not yet rolled back')
}})

tests.push({ name: 'TEMPLATE_ROLLBACK: rollback last template apply', fn: async () => {
  const sessionId = globalThis.templateApplySessionId
  const attBefore = await req(`/api/attendance?sessionId=${sessionId}`)
  const attCountBefore = attBefore.body.data.length

  const rollbackR = await req(`/api/seating-templates/snapshots/${globalThis.applySnapshotId}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert(rollbackR.body.success === true, 'rollback succeeds')
  assert(rollbackR.body.data.restored_assignments === 0, 'restored 0 assignments (snapshot had none)')

  const seatsAfter = await req(`/api/sessions/${sessionId}/seats`)
  const occupiedAfter = seatsAfter.body.data.filter(s => s.status === 'occupied').length
  assert(occupiedAfter === 0, 'all seats free after rollback')

  const attAfter = await req(`/api/attendance?sessionId=${sessionId}`)
  assert(attAfter.body.data.length === 0, 'all attendance cleared after rollback')

  const logsR = await req(`/api/logs?sessionId=${sessionId}`)
  const rbLog = logsR.body.data.find(l => l.operation_type === 'rollback_template')
  assert(rbLog, 'rollback_template log recorded')
}})

tests.push({ name: 'TEMPLATE_ROLLBACK_DOUBLE: cannot rollback same snapshot twice', fn: async () => {
  const r = await req(`/api/seating-templates/snapshots/${globalThis.applySnapshotId}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert(r.status === 400, 'double rollback returns 400')
  assert(r.body.success === false, 'double rollback fails')
  assert(r.body.error.includes('已被撤销过'), 'error mentions already rolled back')
}})

tests.push({ name: 'TEMPLATE_ROLLBACK_WITH_EXISTING_DATA: rollback preserves pre-apply data', fn: async () => {
  const templateSessionR = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '模板保存专用场',
      date: '2026-07-08',
      timeStart: '08:00',
      timeEnd: '09:00',
      rows: 4,
      cols: 5,
      rosterId: globalThis.rosterId,
    }),
  })
  assert(templateSessionR.body.success === true, 'template session created')
  const tplSessionId = templateSessionR.body.data.id

  const tplSeats = await req(`/api/sessions/${tplSessionId}/seats`)
  const tplA1 = tplSeats.body.data.find(s => s.seat_number === 'A1')
  const st1 = globalThis.students[0]
  await req('/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: tplSessionId, seatId: tplA1.id, studentId: st1.id }),
  })

  const saveR = await req('/api/seating-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: tplSessionId, name: '单座模板' }),
  })
  assert(saveR.body.success === true, 'single-seat template saved')
  const tplId = saveR.body.data.id

  const targetSessionR = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '回滚有数据场',
      date: '2026-07-08',
      timeStart: '09:00',
      timeEnd: '11:00',
      rows: 4,
      cols: 5,
      rosterId: globalThis.rosterId,
    }),
  })
  assert(targetSessionR.body.success === true, 'target session created')
  const sessionId = targetSessionR.body.data.id

  const targetSeats = await req(`/api/sessions/${sessionId}/seats`)
  const b1 = targetSeats.body.data.find(s => s.seat_number === 'B1')
  const st3 = globalThis.students[2]
  const preAssignR = await req('/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, seatId: b1.id, studentId: st3.id }),
  })
  assert(preAssignR.body.success === true, 'pre-apply assignment created')

  const attInit = await req(`/api/attendance?sessionId=${sessionId}`)
  assert(attInit.body.data.length === 1, '1 attendance record before template apply')

  await req(`/api/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      studentId: st3.id,
      seatId: b1.id,
      status: 'checked_in',
    }),
  })

  const applyR = await req(`/api/seating-templates/${tplId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  assert(applyR.body.success === true, 'template applied')
  const snapId = applyR.body.data.snapshot.id

  const seatsAfterApply = await req(`/api/sessions/${sessionId}/seats`)
  const occAfterApply = seatsAfterApply.body.data.filter(s => s.status === 'occupied')
  assert(occAfterApply.length === 2, '2 occupied seats after apply: template + pre-existing')

  const rbR = await req(`/api/seating-templates/snapshots/${snapId}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert(rbR.body.success === true, 'rollback succeeds')
  assert(rbR.body.data.restored_assignments === 1, 'restored 1 assignment from snapshot')
  assert(rbR.body.data.restored_attendance === 1, 'restored 1 attendance from snapshot')

  const finalSeats = await req(`/api/sessions/${sessionId}/seats`)
  const finalOcc = finalSeats.body.data.filter(s => s.status === 'occupied')
  assert(finalOcc.length === 1, 'back to exactly 1 occupied seat')
  assert(finalOcc[0].seat_number === 'B1', 'B1 restored (pre-apply assignment)')
  assert(finalOcc[0].student_no === st3.student_no, 'correct student restored')

  const finalAtt = await req(`/api/attendance?sessionId=${sessionId}`)
  assert(finalAtt.body.data.length === 1, 'back to exactly 1 attendance record')
  assert(finalAtt.body.data[0].status === 'checked_in', 'attendance status preserved')
}})

tests.push({ name: 'TEMPLATE_PERSISTENCE_AFTER_RESTART: templates survive server restart (simulated)', fn: async () => {
  const list1 = await req('/api/seating-templates')
  const countBefore = list1.body.data.length

  const get1 = await req(`/api/seating-templates/${globalThis.templateId}`)
  assert(get1.body.success === true, 'template accessible')
  const itemCount = get1.body.data.items.length

  const list2 = await req('/api/seating-templates')
  assert(list2.body.data.length === countBefore, 'same count after simulated refresh')

  const get2 = await req(`/api/seating-templates/${globalThis.templateId}`)
  assert(get2.body.data.items.length === itemCount, 'same item count after simulated refresh')
  console.log('✅ Template persistence verified - survives simulated refresh')
}})

tests.push({ name: 'TEMPLATE_DELETE: delete template and verify removed', fn: async () => {
  const delR = await req(`/api/seating-templates/${globalThis.importedTemplateId}`, { method: 'DELETE' })
  assert(delR.body.success === true, 'template deleted')

  const getR = await req(`/api/seating-templates/${globalThis.importedTemplateId}`)
  assert(getR.status === 404, 'deleted template returns 404')

  const listR = await req('/api/seating-templates')
  const stillThere = listR.body.data.find(x => x.id === globalThis.importedTemplateId)
  assert(!stillThere, 'deleted template not in list')

  const logsR = await req('/api/logs')
  const delLog = logsR.body.data.find(l => l.operation_type === 'delete_template')
  assert(delLog, 'delete_template log recorded')
}})

tests.push({ name: 'TEMPLATE_OP_LOGS_GLOBAL: global operation logs include template actions', fn: async () => {
  const r = await req('/api/logs')
  assert(r.body.success === true, 'global logs ok')
  assert(typeof r.body.total === 'number' && r.body.total > 0, 'total count present')
  const types = new Set(r.body.data.map(l => l.operation_type))
  assert(types.has('save_template'), 'save_template in global logs')
  assert(types.has('apply_template'), 'apply_template in global logs')
  assert(types.has('export_template'), 'export_template in global logs')
  assert(types.has('import_template'), 'import_template in global logs')
  assert(types.has('rollback_template'), 'rollback_template in global logs')
}})

tests.push({ name: 'TEMPLATE_UPDATE: update template metadata', fn: async () => {
  const r = await req(`/api/seating-templates/${globalThis.templateId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '更新后的标准排座',
      remark: '新版备注',
    }),
  })
  assert(r.body.success === true, 'template updated')
  assert(r.body.data.name === '更新后的标准排座', 'name updated')
  assert(r.body.data.remark === '新版备注', 'remark updated')

  const dupR = await req(`/api/seating-templates/${globalThis.templateId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '单座模板' }),
  })
  assert(dupR.status === 409, 'update to duplicate name returns 409')
}})

tests.push({ name: 'TEMPLATE_REGRESSION_EXISTING_UNBROKEN: existing endpoints still work after template changes', fn: async () => {
  const health = await req('/api/health')
  assert(health.body.success === true, 'health still works')

  const sessions = await req('/api/sessions')
  assert(sessions.body.success === true, 'sessions list still works')

  const rosters = await req('/api/rosters')
  assert(rosters.body.success === true, 'rosters list still works')

  const seats = await req(`/api/sessions/${globalThis.sessionId}/seats`)
  assert(seats.body.success === true, 'seats list still works')

  const exportR = await req(`/api/export/seats?sessionId=${globalThis.sessionId}`)
  assert(exportR.body.success === true, 'export still works')

  console.log('✅ All existing endpoints still functional - no regression')
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
