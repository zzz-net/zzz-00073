import { Router, type Request, type Response } from 'express'
import db, { logOperation } from '../db.js'

const router = Router()

router.post('/', (req: Request, res: Response) => {
  const { sessionId, seatId, studentId } = req.body
  if (!sessionId || !seatId || !studentId) {
    res.status(400).json({ success: false, error: '缺少必填字段' })
    return
  }

  const seat = db.prepare('SELECT * FROM seats WHERE id = ? AND session_id = ?').get(seatId, sessionId) as any
  if (!seat) {
    res.status(404).json({ success: false, error: '座位不存在' })
    return
  }

  const seatOccupied = db.prepare(
    'SELECT id FROM assignments WHERE session_id = ? AND seat_id = ?'
  ).get(sessionId, seatId)
  if (seatOccupied) {
    res.status(409).json({ success: false, error: '该座位已被占用' })
    return
  }

  const studentAssigned = db.prepare(
    'SELECT id FROM assignments WHERE session_id = ? AND student_id = ?'
  ).get(sessionId, studentId)
  if (studentAssigned) {
    res.status(409).json({ success: false, error: '该学生已在本场次中分配了座位' })
    return
  }

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any
  if (!student) {
    res.status(404).json({ success: false, error: '学生不存在' })
    return
  }

  const insertAssignment = db.prepare(
    'INSERT INTO assignments (session_id, seat_id, student_id) VALUES (?, ?, ?)'
  )
  const insertAttendance = db.prepare(
    'INSERT INTO attendance (session_id, student_id, seat_id, status) VALUES (?, ?, ?, ?)'
  )

  const transaction = db.transaction(() => {
    const result = insertAssignment.run(sessionId, seatId, studentId)
    insertAttendance.run(sessionId, studentId, seatId, 'not_checked_in')
    return result.lastInsertRowid as number
  })

  const assignmentId = transaction()
  logOperation(
    sessionId,
    'assign_seat',
    'admin',
    'admin',
    `分配座位: 学生${student.student_no}(${student.name}) -> 座位${seat.seat_number}`
  )

  const assignment = db.prepare(`
    SELECT a.*, s.student_no, s.name as student_name, s.class_name, s.group_name,
      se.seat_number, se.row_num, se.col_num
    FROM assignments a
    JOIN students s ON a.student_id = s.id
    JOIN seats se ON a.seat_id = se.id
    WHERE a.id = ?
  `).get(assignmentId)

  res.json({ success: true, data: assignment })
})

router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params

  const assignment = db.prepare(`
    SELECT a.*, s.student_no, s.name as student_name,
      se.seat_number, se.session_id
    FROM assignments a
    JOIN students s ON a.student_id = s.id
    JOIN seats se ON a.seat_id = se.id
    WHERE a.id = ?
  `).get(id) as any

  if (!assignment) {
    res.status(404).json({ success: false, error: '分配记录不存在' })
    return
  }

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM attendance WHERE session_id = ? AND student_id = ?')
      .run(assignment.session_id, assignment.student_id)
    db.prepare('DELETE FROM assignments WHERE id = ?').run(id)
  })

  transaction()
  logOperation(
    assignment.session_id,
    'unassign_seat',
    'admin',
    'admin',
    `取消分配: 学生${assignment.student_no}(${assignment.student_name}) <- 座位${assignment.seat_number}`
  )

  res.json({ success: true, data: null })
})

export default router
