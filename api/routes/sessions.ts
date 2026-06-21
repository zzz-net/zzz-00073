import { Router, type Request, type Response } from 'express'
import db, { logOperation } from '../db.js'

const router = Router()

router.get('/', (_req: Request, res: Response) => {
  const sessions = db.prepare(`
    SELECT s.*, r.name as roster_name,
      (SELECT COUNT(*) FROM assignments a WHERE a.session_id = s.id) as occupied_count,
      (SELECT COUNT(*) FROM seats se WHERE se.session_id = s.id) as total_seats
    FROM sessions s
    LEFT JOIN rosters r ON s.roster_id = r.id
    ORDER BY s.date DESC, s.time_start DESC
  `).all()
  res.json({ success: true, data: sessions })
})

router.post('/', (req: Request, res: Response) => {
  const { name, date, timeStart, timeEnd, rows = 5, cols = 8, rosterId } = req.body
  if (!name || !date || !timeStart || !timeEnd) {
    res.status(400).json({ success: false, error: '缺少必填字段' })
    return
  }

  const row = Math.max(1, Number(rows))
  const col = Math.max(1, Number(cols))

  const insertSession = db.prepare(`
    INSERT INTO sessions (name, date, time_start, time_end, rows, cols, roster_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const insertSeat = db.prepare(`
    INSERT INTO seats (session_id, row_num, col_num, seat_number)
    VALUES (?, ?, ?, ?)
  `)

  const transaction = db.transaction(() => {
    const result = insertSession.run(name, date, timeStart, timeEnd, row, col, rosterId ?? null)
    const sessionId = result.lastInsertRowid as number
    for (let r = 0; r < row; r++) {
      for (let c = 0; c < col; c++) {
        const seatNumber = `${String.fromCharCode(65 + r)}${c + 1}`
        insertSeat.run(sessionId, r, c, seatNumber)
      }
    }
    return sessionId
  })

  const sessionId = transaction()
  logOperation(sessionId, 'create_session', 'admin', 'admin', `创建场次: ${name}`)

  const session = db.prepare(`
    SELECT s.*, r.name as roster_name,
      (SELECT COUNT(*) FROM assignments a WHERE a.session_id = s.id) as occupied_count,
      (SELECT COUNT(*) FROM seats se WHERE se.session_id = s.id) as total_seats
    FROM sessions s
    LEFT JOIN rosters r ON s.roster_id = r.id
    WHERE s.id = ?
  `).get(sessionId)

  res.json({ success: true, data: session })
})

router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const { name, date, timeStart, timeEnd, rows, cols, rosterId, status } = req.body

  const existing = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
  if (!existing) {
    res.status(404).json({ success: false, error: '场次不存在' })
    return
  }

  const updates: string[] = []
  const values: any[] = []

  if (name !== undefined) { updates.push('name = ?'); values.push(name) }
  if (date !== undefined) { updates.push('date = ?'); values.push(date) }
  if (timeStart !== undefined) { updates.push('time_start = ?'); values.push(timeStart) }
  if (timeEnd !== undefined) { updates.push('time_end = ?'); values.push(timeEnd) }
  if (status !== undefined) { updates.push('status = ?'); values.push(status) }
  if (rosterId !== undefined) { updates.push('roster_id = ?'); values.push(rosterId) }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now', 'localtime')")
    values.push(id)
    db.prepare(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  }

  logOperation(Number(id), 'update_session', 'admin', 'admin', `更新场次: ${name || existing.name}`)

  const session = db.prepare(`
    SELECT s.*, r.name as roster_name,
      (SELECT COUNT(*) FROM assignments a WHERE a.session_id = s.id) as occupied_count,
      (SELECT COUNT(*) FROM seats se WHERE se.session_id = s.id) as total_seats
    FROM sessions s
    LEFT JOIN rosters r ON s.roster_id = r.id
    WHERE s.id = ?
  `).get(id)

  res.json({ success: true, data: session })
})

router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params

  const existing = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
  if (!existing) {
    res.status(404).json({ success: false, error: '场次不存在' })
    return
  }

  const assignmentCount = db.prepare(
    'SELECT COUNT(*) as count FROM assignments WHERE session_id = ?'
  ).get(id) as { count: number }

  if (assignmentCount.count > 0) {
    res.status(400).json({ success: false, error: '该场次存在座位分配，无法删除' })
    return
  }

  db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  logOperation(null, 'delete_session', 'admin', 'admin', `删除场次: ${existing.name}`)

  res.json({ success: true, data: null })
})

router.get('/:id/seats', (req: Request, res: Response) => {
  const { id } = req.params
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  if (!session) {
    res.status(404).json({ success: false, error: '场次不存在' })
    return
  }

  const seats = db.prepare(`
    SELECT s.*,
      a.id as assignment_id,
      a.student_id,
      a.assigned_at,
      st.student_no,
      st.name as student_name,
      st.class_name,
      st.group_name
    FROM seats s
    LEFT JOIN assignments a ON s.id = a.seat_id AND a.session_id = ?
    LEFT JOIN students st ON a.student_id = st.id
    WHERE s.session_id = ?
    ORDER BY s.row_num, s.col_num
  `).all(id, id)

  res.json({ success: true, data: seats })
})

export default router
