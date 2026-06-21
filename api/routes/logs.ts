import { Router, type Request, type Response } from 'express'
import db from '../db.js'

const router = Router()

router.get('/', (req: Request, res: Response) => {
  const { sessionId } = req.query
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少sessionId参数' })
    return
  }

  const logs = db.prepare(`
    SELECT * FROM operation_logs WHERE session_id = ? ORDER BY created_at DESC
  `).all(sessionId)

  res.json({ success: true, data: logs })
})

export default router
