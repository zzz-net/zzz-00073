import { Router, type Request, type Response } from 'express'
import db, { logOperation } from '../db.js'

const router = Router()

router.post('/', (req: Request, res: Response) => {
  const { sessionId, fromStudentId, toStudentId, fromSeatId, toSeatId, reason } = req.body
  if (!sessionId || !fromStudentId || !toStudentId || !fromSeatId || !toSeatId) {
    res.status(400).json({ success: false, error: '缺少必填字段' })
    return
  }

  const result = db.prepare(`
    INSERT INTO swap_requests (session_id, from_student_id, to_student_id, from_seat_id, to_seat_id, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, fromStudentId, toStudentId, fromSeatId, toSeatId, reason || '')

  logOperation(
    sessionId,
    'create_swap_request',
    'admin',
    'admin',
    `创建换座请求: 学生${fromStudentId} <-> 学生${toStudentId}`
  )

  const swapRequest = db.prepare(`
    SELECT sr.*,
      fs.student_no as from_student_no, fs.name as from_student_name,
      ts.student_no as to_student_no, ts.name as to_student_name,
      fse.seat_number as from_seat_number, tse.seat_number as to_seat_number
    FROM swap_requests sr
    JOIN students fs ON sr.from_student_id = fs.id
    JOIN students ts ON sr.to_student_id = ts.id
    JOIN seats fse ON sr.from_seat_id = fse.id
    JOIN seats tse ON sr.to_seat_id = tse.id
    WHERE sr.id = ?
  `).get(result.lastInsertRowid)

  res.json({ success: true, data: swapRequest })
})

router.get('/', (req: Request, res: Response) => {
  const { sessionId } = req.query
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少sessionId参数' })
    return
  }

  const requests = db.prepare(`
    SELECT sr.*,
      fs.student_no as from_student_no, fs.name as from_student_name,
      ts.student_no as to_student_no, ts.name as to_student_name,
      fse.seat_number as from_seat_number, tse.seat_number as to_seat_number
    FROM swap_requests sr
    JOIN students fs ON sr.from_student_id = fs.id
    JOIN students ts ON sr.to_student_id = ts.id
    JOIN seats fse ON sr.from_seat_id = fse.id
    JOIN seats tse ON sr.to_seat_id = tse.id
    WHERE sr.session_id = ?
    ORDER BY sr.created_at DESC
  `).all(sessionId)

  res.json({ success: true, data: requests })
})

router.put('/:id/approve', (req: Request, res: Response) => {
  const { id } = req.params
  const { approverRole, approvalNote } = req.body

  const swapRequest = db.prepare('SELECT * FROM swap_requests WHERE id = ?').get(id) as any
  if (!swapRequest) {
    res.status(404).json({ success: false, error: '换座请求不存在' })
    return
  }
  if (swapRequest.status !== 'pending') {
    res.status(400).json({ success: false, error: '该请求已处理' })
    return
  }

  if (approverRole === 'ta') {
    db.prepare(`
      UPDATE swap_requests SET status = 'rejected', approval_role = 'ta',
        approval_note = '助教无审批权限，需管理员审批',
        processed_at = datetime('now', 'localtime') WHERE id = ?
    `).run(id)
    logOperation(
      swapRequest.session_id,
      'reject_swap',
      'admin',
      'ta',
      `助教强制审批被拒绝: 学生${swapRequest.from_student_id} <-> 学生${swapRequest.to_student_id}`
    )
    res.status(403).json({
      success: false,
      error: 'TA_APPROVAL_FORBIDDEN',
      message: '助教无审批调换权限，原排座保持不变',
    })
    return
  }

  const fromAssignment = db.prepare(
    'SELECT * FROM assignments WHERE session_id = ? AND seat_id = ? AND student_id = ?'
  ).get(swapRequest.session_id, swapRequest.from_seat_id, swapRequest.from_student_id) as any

  const toAssignment = db.prepare(
    'SELECT * FROM assignments WHERE session_id = ? AND seat_id = ? AND student_id = ?'
  ).get(swapRequest.session_id, swapRequest.to_seat_id, swapRequest.to_student_id) as any

  if (!fromAssignment || !toAssignment) {
    db.prepare(`
      UPDATE swap_requests SET status = 'rejected', approval_role = ?, approval_note = ?,
        processed_at = datetime('now', 'localtime') WHERE id = ?
    `).run(approverRole || 'admin', '座位状态已变更，自动拒绝', id)

    res.status(409).json({
      success: false,
      error: 'SEAT_CHANGED',
      message: '座位分配状态已变更，无法执行换座',
    })
    return
  }

  const transaction = db.transaction(() => {
    const fromAtt = db.prepare(
      'SELECT * FROM attendance WHERE session_id = ? AND seat_id = ?'
    ).get(swapRequest.session_id, swapRequest.from_seat_id) as any
    const toAtt = db.prepare(
      'SELECT * FROM attendance WHERE session_id = ? AND seat_id = ?'
    ).get(swapRequest.session_id, swapRequest.to_seat_id) as any

    db.prepare('DELETE FROM assignments WHERE id = ?').run(fromAssignment.id)
    db.prepare('DELETE FROM assignments WHERE id = ?').run(toAssignment.id)

    db.prepare(
      'INSERT INTO assignments (session_id, seat_id, student_id) VALUES (?, ?, ?)'
    ).run(swapRequest.session_id, swapRequest.from_seat_id, swapRequest.to_student_id)

    db.prepare(
      'INSERT INTO assignments (session_id, seat_id, student_id) VALUES (?, ?, ?)'
    ).run(swapRequest.session_id, swapRequest.to_seat_id, swapRequest.from_student_id)

    if (fromAtt && toAtt) {
      db.prepare('DELETE FROM attendance WHERE id = ?').run(fromAtt.id)
      db.prepare('DELETE FROM attendance WHERE id = ?').run(toAtt.id)
      db.prepare(
        'INSERT INTO attendance (session_id, student_id, seat_id, status, check_in_time) VALUES (?, ?, ?, ?, ?)'
      ).run(swapRequest.session_id, swapRequest.to_student_id, swapRequest.from_seat_id, fromAtt.status, fromAtt.check_in_time)
      db.prepare(
        'INSERT INTO attendance (session_id, student_id, seat_id, status, check_in_time) VALUES (?, ?, ?, ?, ?)'
      ).run(swapRequest.session_id, swapRequest.from_student_id, swapRequest.to_seat_id, toAtt.status, toAtt.check_in_time)
    }

    db.prepare(`
      UPDATE swap_requests SET status = 'approved', approved_by = 'admin',
        approval_role = ?, approval_note = ?,
        processed_at = datetime('now', 'localtime') WHERE id = ?
    `).run(approverRole || 'admin', approvalNote || '', id)
  })

  transaction()
  logOperation(
    swapRequest.session_id,
    'approve_swap',
    'admin',
    approverRole || 'admin',
    `批准换座: 学生${swapRequest.from_student_id} <-> 学生${swapRequest.to_student_id}`
  )

  const updated = db.prepare(`
    SELECT sr.*,
      fs.student_no as from_student_no, fs.name as from_student_name,
      ts.student_no as to_student_no, ts.name as to_student_name,
      fse.seat_number as from_seat_number, tse.seat_number as to_seat_number
    FROM swap_requests sr
    JOIN students fs ON sr.from_student_id = fs.id
    JOIN students ts ON sr.to_student_id = ts.id
    JOIN seats fse ON sr.from_seat_id = fse.id
    JOIN seats tse ON sr.to_seat_id = tse.id
    WHERE sr.id = ?
  `).get(id)

  res.json({ success: true, data: updated })
})

router.put('/:id/reject', (req: Request, res: Response) => {
  const { id } = req.params
  const { approverRole, approvalNote } = req.body

  const swapRequest = db.prepare('SELECT * FROM swap_requests WHERE id = ?').get(id) as any
  if (!swapRequest) {
    res.status(404).json({ success: false, error: '换座请求不存在' })
    return
  }
  if (swapRequest.status !== 'pending') {
    res.status(400).json({ success: false, error: '该请求已处理' })
    return
  }

  db.prepare(`
    UPDATE swap_requests SET status = 'rejected', approved_by = 'admin',
      approval_role = ?, approval_note = ?,
      processed_at = datetime('now', 'localtime') WHERE id = ?
  `).run(approverRole || 'admin', approvalNote || '', id)

  logOperation(
    swapRequest.session_id,
    'reject_swap',
    'admin',
    approverRole || 'admin',
    `拒绝换座: 学生${swapRequest.from_student_id} <-> 学生${swapRequest.to_student_id}`
  )

  const updated = db.prepare(`
    SELECT sr.*,
      fs.student_no as from_student_no, fs.name as from_student_name,
      ts.student_no as to_student_no, ts.name as to_student_name,
      fse.seat_number as from_seat_number, tse.seat_number as to_seat_number
    FROM swap_requests sr
    JOIN students fs ON sr.from_student_id = fs.id
    JOIN students ts ON sr.to_student_id = ts.id
    JOIN seats fse ON sr.from_seat_id = fse.id
    JOIN seats tse ON sr.to_seat_id = tse.id
    WHERE sr.id = ?
  `).get(id)

  res.json({ success: true, data: updated })
})

export default router
