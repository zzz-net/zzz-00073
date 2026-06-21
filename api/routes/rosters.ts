import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import db, { logOperation } from '../db.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.get('/', (_req: Request, res: Response) => {
  const rosters = db.prepare('SELECT * FROM rosters ORDER BY created_at DESC').all() as any[]
  const data = rosters.map(r => {
    const session = db.prepare('SELECT id FROM sessions WHERE roster_id = ? LIMIT 1').get(r.id)
    return { ...r, inUse: !!session }
  })
  res.json({ success: true, data })
})

router.post('/import', upload.single('file'), (req: Request, res: Response) => {
  let name: string
  let students: { student_no: string; name: string; class_name: string; group_name: string }[]

  if (req.file) {
    const content = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '')
    const lines = content.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) {
      res.status(400).json({ success: false, error: 'CSV文件至少需要表头和一行数据' })
      return
    }
    name = req.body.name || req.file.originalname.replace(/\.csv$/i, '')
    students = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim())
      if (cols.length < 2 || !cols[0] || !cols[1]) continue
      students.push({
        student_no: cols[0],
        name: cols[1],
        class_name: cols[2] || '',
        group_name: cols[3] || '',
      })
    }
    if (students.length === 0) {
      res.status(400).json({ success: false, error: '未解析到有效学生数据' })
      return
    }
  } else {
    const body = req.body as {
      name: string
      students: { student_no: string; name: string; class_name: string; group_name: string }[]
    }
    name = body.name
    students = body.students
  }

  if (!name || !students || !Array.isArray(students) || students.length === 0) {
    res.status(400).json({ success: false, error: '缺少花名册名称或学生数据' })
    return
  }

  const noSet = new Set<string>()
  const duplicates: string[] = []
  for (const s of students) {
    if (noSet.has(s.student_no)) {
      duplicates.push(s.student_no)
    } else {
      noSet.add(s.student_no)
    }
  }

  if (duplicates.length > 0) {
    res.status(409).json({
      success: false,
      error: '文件内存在重复学号',
      duplicates: [...new Set(duplicates)],
    })
    return
  }

  const insertRoster = db.prepare('INSERT INTO rosters (name, student_count) VALUES (?, ?)')
  const insertStudent = db.prepare(
    'INSERT INTO students (roster_id, student_no, name, class_name, group_name) VALUES (?, ?, ?, ?, ?)'
  )

  const transaction = db.transaction(() => {
    const result = insertRoster.run(name, students.length)
    const rosterId = result.lastInsertRowid as number
    for (const s of students) {
      insertStudent.run(rosterId, s.student_no, s.name, s.class_name || '', s.group_name || '')
    }
    return rosterId
  })

  try {
    const rosterId = transaction()
    logOperation(null, 'import_roster', 'admin', 'admin', `导入花名册: ${name}, ${students.length}人`)
    const roster = db.prepare('SELECT * FROM rosters WHERE id = ?').get(rosterId)
    res.json({ success: true, data: roster })
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      const match = err.message.match(/students\.(.+)/)
      res.status(409).json({
        success: false,
        error: '与已有学生学号冲突',
        detail: match ? match[1] : err.message,
      })
      return
    }
    throw err
  }
})

router.get('/sample', (_req: Request, res: Response) => {
  const header = '学号,姓名,班级,组别'
  const names = [
    '张伟', '李娜', '王芳', '刘洋', '陈静',
    '杨磊', '赵敏', '黄强', '周莉', '吴涛',
    '徐佳', '孙浩', '马丽', '朱明', '胡勇',
    '郭燕', '林峰', '何雪', '高鹏', '罗萍',
  ]
  const rows = names.map((n, i) => `2024${String(i + 1).padStart(3, '0')},${n},计算机1班,A组`)
  const csv = [header, ...rows].join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename=roster_sample.csv')
  res.send('\uFEFF' + csv)
})

router.get('/:id/students', (req: Request, res: Response) => {
  const { id } = req.params
  const roster = db.prepare('SELECT * FROM rosters WHERE id = ?').get(id)
  if (!roster) {
    res.status(404).json({ success: false, error: '花名册不存在' })
    return
  }
  const students = db.prepare(
    'SELECT * FROM students WHERE roster_id = ? ORDER BY student_no'
  ).all(id)
  res.json({ success: true, data: students })
})

router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const roster = db.prepare('SELECT * FROM rosters WHERE id = ?').get(id) as any
  if (!roster) {
    res.status(404).json({ success: false, error: '花名册不存在' })
    return
  }

  const session = db.prepare('SELECT id FROM sessions WHERE roster_id = ? LIMIT 1').get(id)
  if (session) {
    res.status(400).json({ success: false, error: '该花名册正在被场次使用，无法删除' })
    return
  }

  db.prepare('DELETE FROM rosters WHERE id = ?').run(id)
  logOperation(null, 'delete_roster', 'admin', 'admin', `删除花名册: ${roster.name}`)

  res.json({ success: true, data: null })
})

export default router
