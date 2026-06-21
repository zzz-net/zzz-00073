import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Calendar, Clock, Users } from 'lucide-react'
import { fetchSessions, createSession, deleteSession } from '@/utils/api'
import { toast } from '@/components/Toast'
import type { Session } from '@/types'

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
  })

  const loadSessions = async () => {
    try {
      const data = await fetchSessions()
      setSessions(data)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const handleCreate = async () => {
    if (!form.name || !form.date || !form.time_start || !form.time_end) {
      toast('请填写所有必填项', 'error')
      return
    }
    try {
      await createSession({
        name: form.name,
        date: form.date,
        time_start: form.time_start,
        time_end: form.time_end,
        rows: form.rows,
        cols: form.cols,
        status: 'draft',
      })
      toast('场次创建成功', 'success')
      setShowModal(false)
      setForm({ name: '', date: '', time_start: '', time_end: '', rows: 5, cols: 8 })
      loadSessions()
    } catch (e: any) {
      toast(e.message, 'error')
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
          onClick={() => setShowModal(true)}
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">创建场次</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">场次名称</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="例如：第3周上机实验"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">日期</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开始时间</label>
                  <input
                    type="time"
                    value={form.time_start}
                    onChange={(e) => setForm({ ...form, time_start: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">结束时间</label>
                  <input
                    type="time"
                    value={form.time_end}
                    onChange={(e) => setForm({ ...form, time_end: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>
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
                className="px-4 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
