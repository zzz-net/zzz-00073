import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Calendar, Clock, Users, LayoutGrid, Link2, X, AlertTriangle, CheckCircle } from 'lucide-react'
import {
  fetchSessions, createSession, deleteSession,
  fetchTemplates, fetchRosters, updateSession,
  checkTemplateApplyConflicts, applyTemplate
} from '@/utils/api'
import { toast } from '@/components/Toast'
import type { Session, SeatingTemplate, Roster, TemplateApplyConflict } from '@/types'

const statusConfig = {
  draft: { label: '草稿', bg: 'bg-slate-200', text: 'text-slate-600' },
  active: { label: '进行中', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  completed: { label: '已完成', bg: 'bg-blue-100', text: 'text-blue-700' },
}

export default function Sessions() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    date: '',
    time_start: '',
    time_end: '',
    rows: 5,
    cols: 8,
    rosterId: null as number | null,
    templateId: null as number | null,
  })
  const [templates, setTemplates] = useState<SeatingTemplate[]>([])
  const [rosters, setRosters] = useState<Roster[]>([])
  const [applyConflicts, setApplyConflicts] = useState<TemplateApplyConflict[]>([])
  const [checkingConflicts, setCheckingConflicts] = useState(false)
  const [creating, setCreating] = useState(false)

  const loadSessions = async () => {
    try {
      const [data, templatesData, rostersData] = await Promise.all([
        fetchSessions(),
        fetchTemplates(),
        fetchRosters(),
      ])
      setSessions(data)
      setTemplates(templatesData)
      setRosters(rostersData)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const handleTemplateSelect = async (templateId: number | null) => {
    setForm({ ...form, templateId })
    setApplyConflicts([])

    if (templateId && form.rosterId) {
      const template = templates.find(t => t.id === templateId)
      if (template) {
        setForm(prev => ({ ...prev, rows: template.rows, cols: template.cols }))
      }
    }
  }

  const handleRosterSelect = async (rosterId: number | null) => {
    setForm({ ...form, rosterId })
    setApplyConflicts([])

    if (form.templateId && rosterId) {
      const template = templates.find(t => t.id === form.templateId)
      if (template) {
        setCheckingConflicts(true)
        try {
          const tempSession = {
            id: 0,
            rows: template.rows,
            cols: template.cols,
            roster_id: rosterId,
          } as Session
          const mockSessionId = 0
          const conflicts = await checkTemplateApplyConflicts(form.templateId, mockSessionId, 'admin')
          setApplyConflicts(conflicts.filter(c =>
            c.type !== 'layout_mismatch' ||
            !c.reason.includes('场次不存在')
          ))
        } catch (e: any) {
          toast(e.message, 'error')
        } finally {
          setCheckingConflicts(false)
        }
      }
    }
  }

  const handleOpenModal = () => {
    setForm({
      name: '',
      date: '',
      time_start: '',
      time_end: '',
      rows: 5,
      cols: 8,
      rosterId: null,
      templateId: null,
    })
    setApplyConflicts([])
    setShowModal(true)
  }

  const handleCreate = async () => {
    if (!form.name || !form.date || !form.time_start || !form.time_end) {
      toast('请填写所有必填项', 'error')
      return
    }
    if (form.templateId && !form.rosterId) {
      toast('套用模板时必须先选择名单', 'error')
      return
    }
    if (form.templateId && applyConflicts.length > 0) {
      toast(`存在 ${applyConflicts.length} 个冲突，无法套用模板`, 'error')
      return
    }

    setCreating(true)
    try {
      const newSession = await createSession({
        name: form.name,
        date: form.date,
        time_start: form.time_start,
        time_end: form.time_end,
        rows: form.rows,
        cols: form.cols,
        status: 'draft',
      })

      if (form.rosterId) {
        await updateSession(newSession.id, { roster_id: form.rosterId } as any)
      }

      if (form.templateId && form.rosterId) {
        const conflicts = await checkTemplateApplyConflicts(form.templateId, newSession.id, 'admin')
        if (conflicts.length > 0) {
          toast(`创建成功，但套用模板时存在 ${conflicts.length} 个冲突`, 'warning')
        } else {
          await applyTemplate(form.templateId, newSession.id, 'admin', 'admin')
          toast('场次创建并套用模板成功', 'success')
        }
      } else {
        toast('场次创建成功', 'success')
      }

      setShowModal(false)
      loadSessions()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (!confirm('确定删除该场次？此操作不可撤销。')) return
    try {
      await deleteSession(id)
      toast('场次已删除', 'success')
      loadSessions()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const totalSeats = (s: Session) => s.rows * s.cols
  const occupancyPercent = (s: Session) => {
    const total = totalSeats(s)
    if (!total) return 0
    return Math.round(((s.occupied_count || 0) / total) * 100)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">场次管理</h1>
        <button
          onClick={handleOpenModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          创建场次
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg">暂无场次</p>
          <p className="text-sm mt-1">点击"创建场次"开始使用</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessions.map((session) => {
            const sc = statusConfig[session.status]
            const percent = occupancyPercent(session)
            return (
              <div
                key={session.id}
                onClick={() => navigate(`/session/${session.id}`)}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg hover:border-cyan-300 transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-slate-800 group-hover:text-cyan-600 transition-colors">
                    {session.name}
                  </h3>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${sc.bg} ${sc.text}`}>
                    {sc.label}
                  </span>
                </div>

                <div className="space-y-2 mb-4 text-sm text-slate-500">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {session.date}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {session.time_start} - {session.time_end}
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    {session.rows}×{session.cols} = {totalSeats(session)} 席位
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>已排座</span>
                    <span>
                      {session.occupied_count || 0}/{totalSeats(session)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={(e) => handleDelete(e, session.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">创建场次</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">场次名称 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="例如：第3周上机实验"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">日期 <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开始时间 <span className="text-red-500">*</span></label>
                  <input
                    type="time"
                    value={form.time_start}
                    onChange={(e) => setForm({ ...form, time_start: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">结束时间 <span className="text-red-500">*</span></label>
                  <input
                    type="time"
                    value={form.time_end}
                    onChange={(e) => setForm({ ...form, time_end: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  绑定名单（可选）
                </h3>
                <select
                  value={form.rosterId || ''}
                  onChange={(e) => handleRosterSelect(Number(e.target.value) || null)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="">-- 不绑定 --</option>
                  {rosters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.student_count}人)
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4" />
                  套用模板（可选）
                </h3>
                {templates.length === 0 ? (
                  <p className="text-sm text-slate-400">暂无可用模板，可创建后在场次详情中保存</p>
                ) : (
                  <div className="space-y-3">
                    <select
                      value={form.templateId || ''}
                      onChange={(e) => handleTemplateSelect(Number(e.target.value) || null)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    >
                      <option value="">-- 不套用 --</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.rows}×{t.cols}, {t.item_count}条)
                        </option>
                      ))}
                    </select>
                    {form.templateId && (
                      <div className="bg-slate-50 rounded-lg p-3 text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-slate-500">布局：</span>
                            <span className="text-slate-700">{form.rows} × {form.cols}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">签到初始：</span>
                            <span className="text-slate-700">
                              {templates.find(t => t.id === form.templateId)?.check_in_init_rule === 'not_checked_in' ? '未签到' :
                               templates.find(t => t.id === form.templateId)?.check_in_init_rule === 'checked_in' ? '已签到' :
                               templates.find(t => t.id === form.templateId)?.check_in_init_rule === 'late' ? '迟到' : '缺勤'}
                            </span>
                          </div>
                        </div>
                        {templates.find(t => t.id === form.templateId)?.remark && (
                          <div className="mt-2">
                            <span className="text-slate-500">备注：</span>
                            <span className="text-slate-700">{templates.find(t => t.id === form.templateId)?.remark}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {form.templateId && !form.rosterId && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    套用模板时请先选择名单
                  </p>
                )}
              </div>

              {form.templateId && form.rosterId && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">行数</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={form.rows}
                      onChange={(e) => setForm({ ...form, rows: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-slate-50"
                      disabled={!!form.templateId}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">列数</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={form.cols}
                      onChange={(e) => setForm({ ...form, cols: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-slate-50"
                      disabled={!!form.templateId}
                    />
                  </div>
                </div>
              )}

              {!form.templateId && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">行数</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={form.rows}
                      onChange={(e) => setForm({ ...form, rows: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">列数</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={form.cols}
                      onChange={(e) => setForm({ ...form, cols: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {checkingConflicts && (
                <div className="bg-slate-50 rounded-lg p-4 text-center">
                  <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm text-slate-600">正在检测冲突...</p>
                </div>
              )}

              {!checkingConflicts && applyConflicts.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 max-h-48 overflow-auto">
                  <h4 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    检测到 {applyConflicts.length} 个冲突
                  </h4>
                  <ul className="space-y-2">
                    {applyConflicts.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm bg-white/50 rounded-lg p-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <span className="font-medium text-red-700">[{c.type}]</span>
                          <span className="text-red-600 ml-1">{c.reason}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!checkingConflicts && form.templateId && form.rosterId && applyConflicts.length === 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm text-emerald-700">模板与名单匹配，可正常套用</span>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !form.name || !form.date || !form.time_start || !form.time_end}
                className="px-4 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {creating && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
