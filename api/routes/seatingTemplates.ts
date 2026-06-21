import { Router, type Request, type Response } from 'express'
import db, { logOperation } from '../db.js'

const router = Router()

const REQUIRED_TEMPLATE_FIELDS = ['name', 'rows', 'cols', 'items']
const REQUIRED_ITEM_FIELDS = ['row_num', 'col_num', 'seat_number', 'student_no', 'student_name']
const VALID_CHECKIN_RULES = ['not_checked_in', 'checked_in', 'late', 'absent']

interface TemplateApplyConflict {
  type: 'layout_mismatch' | 'student_not_found' | 'student_not_in_roster' | 'seat_occupied' | 'duplicate_student' | 'duplicate_seat' | 'roster_unbound' | 'permission_denied'
  seat_number?: string
  student_no?: string
  student_name?: string
  reason: string
}

function getTemplateWithItems(templateId: number): any {
  const template = db.prepare('SELECT * FROM seating_templates WHERE id = ?').get(templateId) as any
  if (!template) return null
  const items = db.prepare('SELECT * FROM seating_template_items WHERE template_id = ? ORDER BY row_num, col_num').all(templateId)
  return { ...template, items, item_count: items.length }
}

function validateTemplateStructure(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['模板数据必须是对象'] }
  }
  for (const f of REQUIRED_TEMPLATE_FIELDS) {
    if (!(f in data)) {
      errors.push(`缺少必填字段: ${f}`)
    }
  }
  if (errors.length > 0) return { valid: false, errors }

  if (typeof data.name !== 'string' || data.name.trim() === '') {
    errors.push('name 必须是非空字符串')
  }
  if (typeof data.rows !== 'number' || data.rows < 1) {
    errors.push('rows 必须是正整数')
  }
  if (typeof data.cols !== 'number' || data.cols < 1) {
    errors.push('cols 必须是正整数')
  }
  if (!Array.isArray(data.items)) {
    errors.push('items 必须是数组')
    return { valid: false, errors }
  }
  if (data.check_in_init_rule !== undefined && !VALID_CHECKIN_RULES.includes(data.check_in_init_rule)) {
    errors.push(`check_in_init_rule 必须是: ${VALID_CHECKIN_RULES.join(', ')}`)
  }

  const seatSet = new Set<string>()
  const studentSet = new Set<string>()
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    if (!item || typeof item !== 'object') {
      errors.push(`items[${i}] 不是有效对象`)
      continue
    }
    for (const f of REQUIRED_ITEM_FIELDS) {
      if (!(f in item)) {
        errors.push(`items[${i}] 缺少字段: ${f}`)
      }
    }
    if (typeof item.seat_number === 'string') {
      if (seatSet.has(item.seat_number)) {
        errors.push(`items 中存在重复席位号: ${item.seat_number}`)
      }
      seatSet.add(item.seat_number)
    }
    if (typeof item.student_no === 'string') {
      if (studentSet.has(item.student_no)) {
        errors.push(`items 中存在重复学号: ${item.student_no}`)
      }
      studentSet.add(item.student_no)
    }
  }

  return { valid: errors.length === 0, errors }
}

function checkTemplateApplyConflicts(sessionId: number, templateId: number, operatorRole: string = 'admin'): TemplateApplyConflict[] {
  const conflicts: TemplateApplyConflict[] = []

  if (operatorRole !== 'admin') {
    conflicts.push({
      type: 'permission_denied',
      reason: `当前角色 ${operatorRole} 无权限套用模板，仅 admin 可操作`
    })
    return conflicts
  }

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session) {
    conflicts.push({ type: 'layout_mismatch', reason: '场次不存在' })
    return conflicts
  }

  const template = db.prepare('SELECT * FROM seating_templates WHERE id = ?').get(templateId) as any
  if (!template) {
    conflicts.push({ type: 'layout_mismatch', reason: '模板不存在' })
    return conflicts
  }

  if (session.rows !== template.rows || session.cols !== template.cols) {
    conflicts.push({
      type: 'layout_mismatch',
      reason: `布局不匹配: 模板是 ${template.rows}x${template.cols}，当前场次是 ${session.rows}x${session.cols}`
    })
    return conflicts
  }

  if (!session.roster_id) {
    conflicts.push({
      type: 'roster_unbound',
      reason: '场次未绑定名单，无法套用模板'
    })
    return conflicts
  }

  const rosterExists = db.prepare('SELECT id, name FROM rosters WHERE id = ?').get(session.roster_id)
  if (!rosterExists) {
    conflicts.push({
      type: 'roster_unbound',
      reason: '场次绑定的名单已被删除'
    })
    return conflicts
  }

  const templateItems = db.prepare('SELECT * FROM seating_template_items WHERE template_id = ?').all(templateId) as any[]

  const seats = db.prepare('SELECT * FROM seats WHERE session_id = ?').all(sessionId) as any[]
  const seatMap = new Map<string, number>()
  for (const s of seats) seatMap.set(s.seat_number, s.id)

  const students = db.prepare('SELECT * FROM students WHERE roster_id = ?').all(session.roster_id) as any[]
  const studentNoMap = new Map<string, any>()
  for (const st of students) studentNoMap.set(st.student_no, st)

  const occupiedSeats = db.prepare('SELECT seat_id FROM assignments WHERE session_id = ?').all(sessionId) as any[]
  const occupiedSeatIds = new Set(occupiedSeats.map(o => o.seat_id))

  const assignedStudents = db.prepare('SELECT student_id FROM assignments WHERE session_id = ?').all(sessionId) as any[]
  const assignedStudentIds = new Set(assignedStudents.map(a => a.student_id))

  const seenSeatNumbers = new Set<string>()
  const seenStudentNos = new Set<string>()

  for (const item of templateItems) {
    if (seenSeatNumbers.has(item.seat_number)) {
      conflicts.push({
        type: 'duplicate_seat',
        seat_number: item.seat_number,
        student_no: item.student_no,
        student_name: item.student_name,
        reason: `模板中席位 ${item.seat_number} 被重复分配`
      })
    }
    seenSeatNumbers.add(item.seat_number)

    if (seenStudentNos.has(item.student_no)) {
      conflicts.push({
        type: 'duplicate_student',
        seat_number: item.seat_number,
        student_no: item.student_no,
        student_name: item.student_name,
        reason: `模板中学生 ${item.student_name}(${item.student_no}) 被重复分配`
      })
    }
    seenStudentNos.add(item.student_no)

    if (!seatMap.has(item.seat_number)) {
      conflicts.push({
        type: 'layout_mismatch',
        seat_number: item.seat_number,
        student_no: item.student_no,
        student_name: item.student_name,
        reason: `模板中的席位 ${item.seat_number} 在当前场次中不存在`
      })
      continue
    }

    const seatId = seatMap.get(item.seat_number)!
    if (occupiedSeatIds.has(seatId)) {
      conflicts.push({
        type: 'seat_occupied',
        seat_number: item.seat_number,
        student_no: item.student_no,
        student_name: item.student_name,
        reason: `席位 ${item.seat_number} 已被占用，无法套用`
      })
    }

    const student = studentNoMap.get(item.student_no)
    if (!student) {
      conflicts.push({
        type: 'student_not_found',
        seat_number: item.seat_number,
        student_no: item.student_no,
        student_name: item.student_name,
        reason: `学生 ${item.student_name}(${item.student_no}) 不存在于当前绑定的名单中`
      })
      continue
    }

    if (student.roster_id !== session.roster_id) {
      conflicts.push({
        type: 'student_not_in_roster',
        seat_number: item.seat_number,
        student_no: item.student_no,
        student_name: item.student_name,
        reason: `学生 ${item.student_name}(${item.student_no}) 不属于当前绑定的名单`
      })
    }

    if (assignedStudentIds.has(student.id)) {
      conflicts.push({
        type: 'duplicate_student',
        seat_number: item.seat_number,
        student_no: item.student_no,
        student_name: item.student_name,
        reason: `学生 ${item.student_name}(${item.student_no}) 已在本场次中分配了座位`
      })
    }
  }

  return conflicts
}

router.get('/', (_req: Request, res: Response) => {
  const templates = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM seating_template_items ti WHERE ti.template_id = t.id) as item_count
    FROM seating_templates t
    ORDER BY t.updated_at DESC
  `).all()
  res.json({ success: true, data: templates })
})

router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const template = getTemplateWithItems(Number(id))
  if (!template) {
    res.status(404).json({ success: false, error: '模板不存在' })
    return
  }
  res.json({ success: true, data: template })
})

router.post('/', (req: Request, res: Response) => {
  const { sessionId, name, remark, checkInInitRule = 'not_checked_in', overwrite = false } = req.body

  if (!sessionId || !name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ success: false, error: '缺少必填字段: sessionId, name' })
    return
  }

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session) {
    res.status(404).json({ success: false, error: '场次不存在' })
    return
  }

  const existing = db.prepare('SELECT id FROM seating_templates WHERE name = ?').get(name.trim()) as any
  if (existing && !overwrite) {
    res.status(409).json({ success: false, error: `模板名称 "${name}" 已存在，使用 overwrite=true 可覆盖保存` })
    return
  }

  const assignments = db.prepare(`
    SELECT a.*, s.seat_number, s.row_num, s.col_num,
      st.student_no, st.name as student_name, st.class_name, st.group_name
    FROM assignments a
    JOIN seats s ON a.seat_id = s.id
    JOIN students st ON a.student_id = st.id
    WHERE a.session_id = ?
    ORDER BY s.row_num, s.col_num
  `).all(sessionId) as any[]

  if (assignments.length === 0) {
    res.status(400).json({ success: false, error: '该场次没有排座结果，无法保存为模板' })
    return
  }

  const rosterInfo = session.roster_id
    ? (db.prepare('SELECT id, name FROM rosters WHERE id = ?').get(session.roster_id) as any)
    : null

  const transaction = db.transaction(() => {
    let templateId: number
    if (existing && overwrite) {
      db.prepare(`
        UPDATE seating_templates SET
          remark = ?, rows = ?, cols = ?, roster_id = ?, roster_name = ?,
          check_in_init_rule = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        remark || '',
        session.rows,
        session.cols,
        rosterInfo?.id ?? null,
        rosterInfo?.name ?? null,
        checkInInitRule,
        existing.id
      )
      db.prepare('DELETE FROM seating_template_items WHERE template_id = ?').run(existing.id)
      templateId = existing.id
    } else {
      const result = db.prepare(`
        INSERT INTO seating_templates (name, remark, rows, cols, roster_id, roster_name, check_in_init_rule, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'admin')
      `).run(
        name.trim(),
        remark || '',
        session.rows,
        session.cols,
        rosterInfo?.id ?? null,
        rosterInfo?.name ?? null,
        checkInInitRule
      )
      templateId = result.lastInsertRowid as number
    }

    const insertItem = db.prepare(`
      INSERT INTO seating_template_items
        (template_id, row_num, col_num, seat_number, student_no, student_name, class_name, group_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const a of assignments) {
      insertItem.run(
        templateId,
        a.row_num,
        a.col_num,
        a.seat_number,
        a.student_no,
        a.student_name,
        a.class_name || '',
        a.group_name || ''
      )
    }
    return templateId
  })

  const templateId = transaction()
  const op = existing && overwrite ? '覆盖保存' : '保存'
  logOperation(
    Number(sessionId),
    existing && overwrite ? 'overwrite_template' : 'save_template',
    'admin',
    'admin',
    `${op}排座模板 "${name.trim()}"，共 ${assignments.length} 个分配记录`
  )

  const template = getTemplateWithItems(templateId)
  res.json({ success: true, data: template })
})

router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const { name, remark, checkInInitRule } = req.body

  const existing = db.prepare('SELECT * FROM seating_templates WHERE id = ?').get(id) as any
  if (!existing) {
    res.status(404).json({ success: false, error: '模板不存在' })
    return
  }

  if (name && typeof name === 'string' && name.trim() !== existing.name) {
    const duplicate = db.prepare('SELECT id FROM seating_templates WHERE name = ? AND id != ?').get(name.trim(), id)
    if (duplicate) {
      res.status(409).json({ success: false, error: `模板名称 "${name.trim()}" 已存在` })
      return
    }
  }

  const updates: string[] = []
  const values: any[] = []
  if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()) }
  if (remark !== undefined) { updates.push('remark = ?'); values.push(remark || '') }
  if (checkInInitRule !== undefined) {
    if (!VALID_CHECKIN_RULES.includes(checkInInitRule)) {
      res.status(400).json({ success: false, error: `checkInInitRule 必须是: ${VALID_CHECKIN_RULES.join(', ')}` })
      return
    }
    updates.push('check_in_init_rule = ?')
    values.push(checkInInitRule)
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now', 'localtime')")
    values.push(id)
    db.prepare(`UPDATE seating_templates SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  }

  logOperation(
    null,
    'update_template',
    'admin',
    'admin',
    `更新模板 "${existing.name}" -> "${name || existing.name}"`
  )

  const template = getTemplateWithItems(Number(id))
  res.json({ success: true, data: template })
})

router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const existing = db.prepare('SELECT * FROM seating_templates WHERE id = ?').get(id) as any
  if (!existing) {
    res.status(404).json({ success: false, error: '模板不存在' })
    return
  }
  db.prepare('DELETE FROM seating_templates WHERE id = ?').run(id)
  logOperation(null, 'delete_template', 'admin', 'admin', `删除模板 "${existing.name}"`)
  res.json({ success: true, data: null })
})

router.get('/:id/export', (req: Request, res: Response) => {
  const { id } = req.params
  const template = getTemplateWithItems(Number(id))
  if (!template) {
    res.status(404).json({ success: false, error: '模板不存在' })
    return
  }
  const exportData = {
    schema_version: 1,
    name: template.name,
    remark: template.remark,
    rows: template.rows,
    cols: template.cols,
    roster_id: template.roster_id,
    roster_name: template.roster_name,
    check_in_init_rule: template.check_in_init_rule,
    created_by: template.created_by,
    exported_at: new Date().toISOString(),
    items: template.items.map((i: any) => ({
      row_num: i.row_num,
      col_num: i.col_num,
      seat_number: i.seat_number,
      student_no: i.student_no,
      student_name: i.student_name,
      class_name: i.class_name,
      group_name: i.group_name,
    }))
  }
  logOperation(null, 'export_template', 'admin', 'admin', `导出模板 "${template.name}"`)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(template.name)}.json`)
  res.json(exportData)
})

router.post('/import', (req: Request, res: Response) => {
  const data = req.body
  const validation = validateTemplateStructure(data)
  if (!validation.valid) {
    res.status(400).json({
      success: false,
      error: '模板数据格式无效',
      details: validation.errors
    })
    return
  }

  const existing = db.prepare('SELECT id FROM seating_templates WHERE name = ?').get(data.name.trim()) as any
  if (existing) {
    res.status(409).json({
      success: false,
      error: `模板名称 "${data.name.trim()}" 已存在`
    })
    return
  }

  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO seating_templates (name, remark, rows, cols, roster_id, roster_name, check_in_init_rule, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name.trim(),
      data.remark || '',
      data.rows,
      data.cols,
      data.roster_id ?? null,
      data.roster_name ?? null,
      data.check_in_init_rule || 'not_checked_in',
      data.created_by || 'admin'
    )
    const templateId = result.lastInsertRowid as number

    const insertItem = db.prepare(`
      INSERT INTO seating_template_items
        (template_id, row_num, col_num, seat_number, student_no, student_name, class_name, group_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const item of data.items) {
      insertItem.run(
        templateId,
        item.row_num,
        item.col_num,
        item.seat_number,
        item.student_no,
        item.student_name,
        item.class_name || '',
        item.group_name || ''
      )
    }
    return templateId
  })

  try {
    const templateId = transaction()
    logOperation(
      null,
      'import_template',
      'admin',
      'admin',
      `导入模板 "${data.name.trim()}"，共 ${data.items.length} 条记录`
    )
    const template = getTemplateWithItems(templateId)
    res.json({ success: true, data: template })
  } catch (err: any) {
    res.status(500).json({ success: false, error: '导入失败: ' + err.message })
  }
})

router.post('/:id/apply/conflicts', (req: Request, res: Response) => {
  const { id } = req.params
  const { sessionId, operatorRole = 'admin' } = req.body
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少 sessionId' })
    return
  }
  const conflicts = checkTemplateApplyConflicts(Number(sessionId), Number(id), operatorRole)
  res.json({ success: true, data: conflicts })
})

router.post('/:id/apply', (req: Request, res: Response) => {
  const { id } = req.params
  const { sessionId, operator = 'admin', operatorRole = 'admin' } = req.body

  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少 sessionId' })
    return
  }

  const conflicts = checkTemplateApplyConflicts(Number(sessionId), Number(id), operatorRole)
  if (conflicts.length > 0) {
    logOperation(
      Number(sessionId),
      'apply_template_failed',
      operator,
      operatorRole as any,
      `套用模板失败 #${id}，存在 ${conflicts.length} 个冲突`
    )
    res.status(409).json({
      success: false,
      error: `存在 ${conflicts.length} 个冲突，无法套用模板`,
      conflicts
    })
    return
  }

  const template = db.prepare('SELECT * FROM seating_templates WHERE id = ?').get(id) as any
  const templateItems = db.prepare('SELECT * FROM seating_template_items WHERE template_id = ?').all(id) as any[]

  const oldAssignments = db.prepare(`
    SELECT a.*, s.seat_number, st.student_no, st.name as student_name
    FROM assignments a
    JOIN seats s ON a.seat_id = s.id
    JOIN students st ON a.student_id = st.id
    WHERE a.session_id = ?
  `).all(sessionId) as any[]

  const oldAttendance = db.prepare(`
    SELECT att.*, s.student_no, s.name as student_name, se.seat_number
    FROM attendance att
    JOIN students s ON att.student_id = s.id
    JOIN seats se ON att.seat_id = se.id
    WHERE att.session_id = ?
  `).all(sessionId) as any[]

  const snapshotBefore = JSON.stringify({
    assignments: oldAssignments,
    attendance: oldAttendance
  })

  const transaction = db.transaction(() => {
    const insertAssignment = db.prepare(
      'INSERT INTO assignments (session_id, seat_id, student_id) VALUES (?, ?, ?)'
    )
    const insertAttendance = db.prepare(
      'INSERT INTO attendance (session_id, student_id, seat_id, status) VALUES (?, ?, ?, ?)'
    )

    const seats = db.prepare('SELECT * FROM seats WHERE session_id = ?').all(sessionId) as any[]
    const seatMap = new Map<string, number>()
    for (const s of seats) seatMap.set(s.seat_number, s.id)

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
    const students = db.prepare('SELECT * FROM students WHERE roster_id = ?').all(session.roster_id) as any[]
    const studentNoMap = new Map<string, any>()
    for (const st of students) studentNoMap.set(st.student_no, st)

    const details: string[] = []
    for (const item of templateItems) {
      const seatId = seatMap.get(item.seat_number)!
      const student = studentNoMap.get(item.student_no)!
      insertAssignment.run(sessionId, seatId, student.id)
      insertAttendance.run(sessionId, student.id, seatId, template.check_in_init_rule || 'not_checked_in')
      details.push(`${item.student_name}(${item.student_no})->${item.seat_number}`)
    }

    const snapshotResult = db.prepare(`
      INSERT INTO template_apply_snapshots
        (session_id, template_id, template_name, operator, operator_role, snapshot_before)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      template.id,
      template.name,
      operator,
      operatorRole,
      snapshotBefore
    )

    return { snapshotId: snapshotResult.lastInsertRowid as number, details }
  })

  let result: { snapshotId: number; details: string[] }
  try {
    result = transaction()
  } catch (err: any) {
    logOperation(
      Number(sessionId),
      'apply_template_failed',
      operator,
      operatorRole as any,
      `套用模板失败 #${id}：事务错误 - ${err.message}`
    )
    res.status(500).json({ success: false, error: '套用模板时发生错误，所有数据已回滚' })
    return
  }

  logOperation(
    Number(sessionId),
    'apply_template',
    operator,
    operatorRole as any,
    `套用模板 "${template.name}"，共 ${templateItems.length} 人: ${result.details.join(', ')}`
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

  const snapshot = db.prepare('SELECT * FROM template_apply_snapshots WHERE id = ?').get(result.snapshotId)

  res.json({
    success: true,
    data: {
      applied: templateItems.length,
      seats,
      snapshot
    }
  })
})

router.get('/sessions/:sessionId/snapshots', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const snapshots = db.prepare(`
    SELECT * FROM template_apply_snapshots
    WHERE session_id = ? AND rolled_back = 0
    ORDER BY applied_at DESC
  `).all(sessionId)
  res.json({ success: true, data: snapshots })
})

router.post('/snapshots/:snapshotId/rollback', (req: Request, res: Response) => {
  const { snapshotId } = req.params
  const { operator = 'admin', operatorRole = 'admin' } = req.body

  if (operatorRole !== 'admin') {
    res.status(403).json({ success: false, error: '仅 admin 可执行撤销操作' })
    return
  }

  const snapshot = db.prepare('SELECT * FROM template_apply_snapshots WHERE id = ?').get(snapshotId) as any
  if (!snapshot) {
    res.status(404).json({ success: false, error: '快照不存在' })
    return
  }
  if (snapshot.rolled_back) {
    res.status(400).json({ success: false, error: '该次套用已被撤销过' })
    return
  }

  let snapshotBefore: { assignments: any[]; attendance: any[] }
  try {
    snapshotBefore = JSON.parse(snapshot.snapshot_before)
  } catch {
    res.status(500).json({ success: false, error: '快照数据损坏，无法撤销' })
    return
  }

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM attendance WHERE session_id = ?').run(snapshot.session_id)
    db.prepare('DELETE FROM assignments WHERE session_id = ?').run(snapshot.session_id)

    const insertAssignment = db.prepare(
      'INSERT INTO assignments (session_id, seat_id, student_id, assigned_at) VALUES (?, ?, ?, ?)'
    )
    const insertAttendance = db.prepare(`
      INSERT INTO attendance (session_id, student_id, seat_id, status, check_in_time)
      VALUES (?, ?, ?, ?, ?)
    `)

    for (const a of snapshotBefore.assignments || []) {
      insertAssignment.run(snapshot.session_id, a.seat_id, a.student_id, a.assigned_at)
    }
    for (const att of snapshotBefore.attendance || []) {
      insertAttendance.run(snapshot.session_id, att.student_id, att.seat_id, att.status, att.check_in_time)
    }

    db.prepare('UPDATE template_apply_snapshots SET rolled_back = 1 WHERE id = ?').run(snapshotId)
  })

  try {
    transaction()
  } catch (err: any) {
    res.status(500).json({ success: false, error: '撤销失败: ' + err.message })
    return
  }

  logOperation(
    snapshot.session_id,
    'rollback_template',
    operator,
    'admin',
    `撤销套用模板 "${snapshot.template_name}"，恢复 ${snapshotBefore.assignments?.length || 0} 条分配记录`
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
  `).all(snapshot.session_id, snapshot.session_id)

  const attendance = db.prepare(`
    SELECT att.*, s.student_no, s.name as student_name, se.seat_number
    FROM attendance att
    JOIN students s ON att.student_id = s.id
    JOIN seats se ON att.seat_id = se.id
    WHERE att.session_id = ?
    ORDER BY se.row_num, se.col_num
  `).all(snapshot.session_id)

  res.json({
    success: true,
    data: {
      restored_assignments: snapshotBefore.assignments?.length || 0,
      restored_attendance: snapshotBefore.attendance?.length || 0,
      seats,
      attendance
    }
  })
})

export default router
