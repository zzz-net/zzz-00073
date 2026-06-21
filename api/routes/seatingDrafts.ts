import { Router, type Request, type Response } from 'express'
import db, { logOperation } from '../db.js'

const router = Router({ mergeParams: true })

function getActiveDraft(sessionId: number): any {
  return db.prepare(`
    SELECT * FROM seating_drafts
    WHERE session_id = ? AND status = 'active'
    ORDER BY id DESC LIMIT 1
  `).get(sessionId) as any
}

function getDraftItems(draftId: number): any[] {
  return db.prepare(`
    SELECT di.*, s.seat_number, s.row_num, s.col_num,
      st.student_no, st.name as student_name, st.class_name, st.group_name
    FROM seating_draft_items di
    JOIN seats s ON di.seat_id = s.id
    JOIN students st ON di.student_id = st.id
    WHERE di.draft_id = ?
    ORDER BY s.row_num, s.col_num
  `).all(draftId) as any[]
}

router.get('/', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session) {
    res.status(404).json({ success: false, error: '场次不存在' })
    return
  }

  const draft = getActiveDraft(Number(sessionId))
  if (!draft) {
    res.json({ success: true, data: null })
    return
  }

  const items = getDraftItems(draft.id)
  res.json({ success: true, data: { ...draft, items } })
})

router.post('/generate', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session) {
    res.status(404).json({ success: false, error: '场次不存在' })
    return
  }

  if (!session.roster_id) {
    res.status(400).json({ success: false, error: '请先绑定名单' })
    return
  }

  const students = db.prepare(`
    SELECT * FROM students WHERE roster_id = ? ORDER BY student_no
  `).all(session.roster_id) as any[]

  const seats = db.prepare(`
    SELECT * FROM seats WHERE session_id = ? ORDER BY row_num, col_num
  `).all(sessionId) as any[]

  if (students.length > seats.length) {
    res.status(400).json({
      success: false,
      error: `学生数量(${students.length})超过席位数量(${seats.length})`
    })
    return
  }

  const transaction = db.transaction(() => {
    const existing = getActiveDraft(Number(sessionId))
    if (existing) {
      db.prepare("UPDATE seating_drafts SET status = 'abandoned', updated_at = datetime('now', 'localtime') WHERE id = ?")
        .run(existing.id)
      logOperation(
        Number(sessionId),
        'abandon_draft',
        'admin',
        'admin',
        `生成新草稿，废弃旧草稿 #${existing.id}`
      )
    }

    const insertDraft = db.prepare(`
      INSERT INTO seating_drafts (session_id, status)
      VALUES (?, 'active')
    `)
    const draftResult = insertDraft.run(sessionId)
    const draftId = draftResult.lastInsertRowid as number

    const insertItem = db.prepare(`
      INSERT INTO seating_draft_items (draft_id, seat_id, student_id)
      VALUES (?, ?, ?)
    `)

    for (let i = 0; i < students.length; i++) {
      insertItem.run(draftId, seats[i].id, students[i].id)
    }

    return draftId
  })

  const draftId = transaction()
  logOperation(
    Number(sessionId),
    'generate_draft',
    'admin',
    'admin',
    `按名单批量生成排座草稿，共${students.length}人`
  )

  const draft = db.prepare('SELECT * FROM seating_drafts WHERE id = ?').get(draftId) as any
  const items = getDraftItems(draftId)
  res.json({ success: true, data: { ...draft, items } })
})

router.put('/', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const { items } = req.body

  if (!items || !Array.isArray(items)) {
    res.status(400).json({ success: false, error: '缺少items参数' })
    return
  }

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session) {
    res.status(404).json({ success: false, error: '场次不存在' })
    return
  }

  let draft: any = getActiveDraft(Number(sessionId))
  if (!draft) {
    const insertDraft = db.prepare(`
      INSERT INTO seating_drafts (session_id, status) VALUES (?, 'active')
    `)
    const result = insertDraft.run(sessionId)
    draft = db.prepare('SELECT * FROM seating_drafts WHERE id = ?').get(result.lastInsertRowid) as any
  }

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM seating_draft_items WHERE draft_id = ?').run(draft.id)

    const insertItem = db.prepare(`
      INSERT INTO seating_draft_items (draft_id, seat_id, student_id)
      VALUES (?, ?, ?)
    `)

    for (const item of items) {
      if (item.seat_id && item.student_id) {
        insertItem.run(draft.id, item.seat_id, item.student_id)
      }
    }

    db.prepare("UPDATE seating_drafts SET updated_at = datetime('now', 'localtime') WHERE id = ?")
      .run(draft.id)
  })

  transaction()
  logOperation(
    Number(sessionId),
    'update_draft',
    'admin',
    'admin',
    `更新排座草稿，共${items.length}条记录`
  )

  const updatedDraft = db.prepare('SELECT * FROM seating_drafts WHERE id = ?').get(draft.id) as any
  const updatedItems = getDraftItems(draft.id)
  res.json({ success: true, data: { ...updatedDraft, items: updatedItems } })
})

interface ConflictItem {
  type: 'duplicate_student' | 'seat_occupied' | 'student_not_in_roster' | 'duplicate_seat'
  seat_id?: number
  seat_number?: string
  student_id?: number
  student_no?: string
  student_name?: string
  reason: string
}

function checkConflicts(sessionId: number, draftId: number): ConflictItem[] {
  const conflicts: ConflictItem[] = []

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session) return conflicts

  const draftItems = db.prepare(`
    SELECT di.*, s.seat_number, st.student_no, st.name as student_name, st.roster_id
    FROM seating_draft_items di
    JOIN seats s ON di.seat_id = s.id
    JOIN students st ON di.student_id = st.id
    WHERE di.draft_id = ?
  `).all(draftId) as any[]

  const seatSet = new Set()
  const studentSet = new Set()

  for (const item of draftItems) {
    if (seatSet.has(item.seat_id)) {
      conflicts.push({
        type: 'duplicate_seat',
        seat_id: item.seat_id,
        seat_number: item.seat_number,
        student_id: item.student_id,
        student_no: item.student_no,
        student_name: item.student_name,
        reason: `席位 ${item.seat_number} 在草稿中被重复分配`
      })
    }
    seatSet.add(item.seat_id)

    if (studentSet.has(item.student_id)) {
      conflicts.push({
        type: 'duplicate_student',
        seat_id: item.seat_id,
        seat_number: item.seat_number,
        student_id: item.student_id,
        student_no: item.student_no,
        student_name: item.student_name,
        reason: `学生 ${item.student_name}(${item.student_no}) 在草稿中被重复分配`
      })
    }
    studentSet.add(item.student_id)
  }

  for (const item of draftItems) {
    const occupied = db.prepare(`
      SELECT a.id FROM assignments a
      WHERE a.session_id = ? AND a.seat_id = ?
    `).get(sessionId, item.seat_id)

    if (occupied) {
      conflicts.push({
        type: 'seat_occupied',
        seat_id: item.seat_id,
        seat_number: item.seat_number,
        student_id: item.student_id,
        student_no: item.student_no,
        student_name: item.student_name,
        reason: `席位 ${item.seat_number} 已被占用`
      })
    }
  }

  if (session.roster_id) {
    for (const item of draftItems) {
      if (item.roster_id !== session.roster_id) {
        conflicts.push({
          type: 'student_not_in_roster',
          seat_id: item.seat_id,
          seat_number: item.seat_number,
          student_id: item.student_id,
          student_no: item.student_no,
          student_name: item.student_name,
          reason: `学生 ${item.student_name}(${item.student_no}) 不属于当前绑定的名单`
        })
      }
    }
  }

  return conflicts
}

router.get('/conflicts', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const draft = getActiveDraft(Number(sessionId))

  if (!draft) {
    res.status(404).json({ success: false, error: '没有活跃的草稿' })
    return
  }

  const conflicts = checkConflicts(Number(sessionId), draft.id)
  res.json({ success: true, data: conflicts })
})

router.post('/apply', (req: Request, res: Response) => {
  const { sessionId } = req.params

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session) {
    res.status(404).json({ success: false, error: '场次不存在' })
    return
  }

  const draft = getActiveDraft(Number(sessionId))
  if (!draft) {
    res.status(404).json({ success: false, error: '没有活跃的草稿' })
    return
  }

  const conflicts = checkConflicts(Number(sessionId), draft.id)
  if (conflicts.length > 0) {
    res.status(409).json({
      success: false,
      error: '存在冲突，无法应用草稿',
      conflicts
    })
    return
  }

  const draftItems = db.prepare(`
    SELECT di.*, s.seat_number, st.student_no, st.name as student_name
    FROM seating_draft_items di
    JOIN seats s ON di.seat_id = s.id
    JOIN students st ON di.student_id = st.id
    WHERE di.draft_id = ?
  `).all(draft.id) as any[]

  const transaction = db.transaction(() => {
    const insertAssignment = db.prepare(`
      INSERT INTO assignments (session_id, seat_id, student_id)
      VALUES (?, ?, ?)
    `)
    const insertAttendance = db.prepare(`
      INSERT INTO attendance (session_id, student_id, seat_id, status)
      VALUES (?, ?, ?, 'not_checked_in')
    `)

    const details: string[] = []
    for (const item of draftItems) {
      insertAssignment.run(sessionId, item.seat_id, item.student_id)
      insertAttendance.run(sessionId, item.student_id, item.seat_id)
      details.push(`${item.student_name}(${item.student_no})->${item.seat_number}`)
    }

    db.prepare("UPDATE seating_drafts SET status = 'applied', updated_at = datetime('now', 'localtime') WHERE id = ?")
      .run(draft.id)

    return details
  })

  const details = transaction()
  logOperation(
    Number(sessionId),
    'apply_draft',
    'admin',
    'admin',
    `应用排座草稿，共${draftItems.length}人: ${details.join(', ')}`
  )

  const seats = db.prepare(`
    SELECT s.*,
      CASE WHEN a.id IS NOT NULL THEN 'occupied' ELSE 'free' END as status,
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
  `).all(sessionId, sessionId)

  res.json({ success: true, data: { applied: draftItems.length, seats } })
})

router.post('/abandon', (req: Request, res: Response) => {
  const { sessionId } = req.params

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session) {
    res.status(404).json({ success: false, error: '场次不存在' })
    return
  }

  const draft = getActiveDraft(Number(sessionId))
  if (!draft) {
    res.status(404).json({ success: false, error: '没有活跃的草稿' })
    return
  }

  db.prepare("UPDATE seating_drafts SET status = 'abandoned', updated_at = datetime('now', 'localtime') WHERE id = ?")
    .run(draft.id)

  logOperation(
    Number(sessionId),
    'abandon_draft',
    'admin',
    'admin',
    `放弃排座草稿 #${draft.id}`
  )

  res.json({ success: true, data: null })
})

export default router
