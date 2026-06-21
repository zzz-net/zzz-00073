import { Router, type Request, type Response } from 'express'
import db from '../db.js'

const router = Router()

router.get('/seats', (req: Request, res: Response) => {
  const { sessionId } = req.query
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少sessionId参数' })
    return
  }

  const data = db.prepare(`
    SELECT s.student_no as 学号, s.name as 姓名, s.class_name as 班级, s.group_name as 组别,
      ses.name as 场次, se.seat_number as 席位号
    FROM seats se
    LEFT JOIN assignments a ON se.id = a.seat_id AND a.session_id = ?
    LEFT JOIN students s ON a.student_id = s.id
    JOIN sessions ses ON se.session_id = ses.id
    WHERE se.session_id = ?
    ORDER BY se.row_num, se.col_num
  `).all(sessionId, sessionId)

  res.json({ success: true, data })
})

router.get('/attendance', (req: Request, res: Response) => {
  const { sessionId } = req.query
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少sessionId参数' })
    return
  }

  const data = db.prepare(`
    SELECT s.student_no as 学号, s.name as 姓名, s.class_name as 班级, s.group_name as 组别,
      ses.name as 场次, se.seat_number as 席位号,
      att.status as 签到状态, att.check_in_time as 签到时间
    FROM attendance att
    JOIN students s ON att.student_id = s.id
    JOIN seats se ON att.seat_id = se.id
    JOIN sessions ses ON att.session_id = ses.id
    WHERE att.session_id = ?
    ORDER BY se.row_num, se.col_num
  `).all(sessionId)

  res.json({ success: true, data })
})

router.get('/logs', (req: Request, res: Response) => {
  const { sessionId } = req.query
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少sessionId参数' })
    return
  }

  const data = db.prepare(`
    SELECT ol.created_at as 操作时间, ol.operation_type as 操作类型,
      ol.operator as 操作人, ol.details as 详情
    FROM operation_logs ol
    WHERE ol.session_id = ?
    ORDER BY ol.created_at DESC
  `).all(sessionId)

  res.json({ success: true, data })
})

export default router
