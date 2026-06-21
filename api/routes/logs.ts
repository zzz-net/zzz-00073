import { Router, type Request, type Response } from 'express'
import db from '../db.js'

const router = Router()

router.get('/', (req: Request, res: Response) => {
  const { sessionId, limit, offset } = req.query
  const take = Math.min(Number(limit) || 100, 500)
  const skip = Number(offset) || 0

  let logs: any[]
  if (sessionId) {
    logs = db.prepare(`
      SELECT * FROM operation_logs WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(sessionId, take, skip)
  } else {
    logs = db.prepare(`
      SELECT l.*, s.name as session_name
      FROM operation_logs l
      LEFT JOIN sessions s ON l.session_id = s.id
      ORDER BY l.created_at DESC LIMIT ? OFFSET ?
    `).all(take, skip)
  }

  const total = sessionId
    ? (db.prepare('SELECT COUNT(*) as c FROM operation_logs WHERE session_id = ?').get(sessionId) as any).c
    : (db.prepare('SELECT COUNT(*) as c FROM operation_logs').get() as any).c

  res.json({ success: true, data: logs, total })
})

export default router
