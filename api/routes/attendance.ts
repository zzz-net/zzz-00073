import { Router, type Request, type Response } from 'express'
import db, { logOperation } from '../db.js'

const router = Router()

router.get('/', (req: Request, res: Response) => {
  const { sessionId } = req.query
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少sessionId参数' })
    return
  }

  const records = db.prepare(`
    SELECT att.*, s.student_no, s.name as student_name, s.class_name, s.group_name,
      se.seat_number
    FROM attendance att
    JOIN students s ON att.student_id = s.id
    JOIN seats se ON att.seat_id = se.id
    WHERE att.session_id = ?
    ORDER BY se.row_num, se.col_num
  `).all(sessionId)

  res.json({ success: true, data: records })
})

router.post('/', (req: Request, res: Response) => {
  const { sessionId, studentId, seatId, status, records } = req.body

  if (records && Array.isArray(records)) {
    const updateStmt = db.prepare(`
      INSERT INTO attendance (session_id, student_id, seat_id, status, check_in_time)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id, student_id) DO UPDATE SET
        status = excluded.status,
        check_in_time = excluded.check_in_time
    `)

    const transaction = db.transaction(() => {
      for (const r of records) {
        const checkInTime = r.status === 'checked_in' || r.status === 'late'
          ? new Date().toISOString()
          : null
        updateStmt.run(sessionId, r.studentId, r.seatId, r.status || 'not_checked_in', checkInTime)
      }
    })

    transaction()

    const statusSummary = records.map((r: any) => `${r.studentId}:${r.status}`).join(', ')
    logOperation(sessionId, 'batch_update_attendance', 'admin', 'admin', `批量更新签到: ${statusSummary}`)

    res.json({ success: true, data: { updated: records.length } })
    return
  }

  if (!sessionId || !studentId || !seatId) {
    res.status(400).json({ success: false, error: '缺少必填字段' })
    return
  }

  const checkInTime = status === 'checked_in' || status === 'late'
    ? new Date().toISOString()
    : null

  const result = db.prepare(`
    INSERT INTO attendance (session_id, student_id, seat_id, status, check_in_time)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id, student_id) DO UPDATE SET
      status = excluded.status,
      check_in_time = excluded.check_in_time
  `).run(sessionId, studentId, seatId, status || 'not_checked_in', checkInTime)

  logOperation(sessionId, 'create_attendance', 'admin', 'admin', `创建签到: 学生${studentId}, 状态${status || 'not_checked_in'}`)

  const record = db.prepare(`
    SELECT att.*, s.student_no, s.name as student_name, se.seat_number
    FROM attendance att
    JOIN students s ON att.student_id = s.id
    JOIN seats se ON att.seat_id = se.id
    WHERE att.id = ?
  `).get(result.lastInsertRowid)

  res.json({ success: true, data: record })
})

router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const { status } = req.body

  const existing = db.prepare('SELECT * FROM attendance WHERE id = ?').get(id) as any
  if (!existing) {
    res.status(404).json({ success: false, error: '签到记录不存在' })
    return
  }

  const checkInTime = (status === 'checked_in' || status === 'late')
    ? new Date().toISOString()
    : null

  db.prepare('UPDATE attendance SET status = ?, check_in_time = ? WHERE id = ?')
    .run(status, checkInTime, id)

  logOperation(
    existing.session_id,
    'update_attendance',
    'admin',
    'admin',
    `更新签到状态: 学生${existing.student_id}, ${existing.status} -> ${status}`
  )

  const record = db.prepare(`
    SELECT att.*, s.student_no, s.name as student_name, se.seat_number
    FROM attendance att
    JOIN students s ON att.student_id = s.id
    JOIN seats se ON att.seat_id = se.id
    WHERE att.id = ?
  `).get(id)

  res.json({ success: true, data: record })
})

export default router
