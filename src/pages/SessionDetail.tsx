import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Grid3X3, ArrowLeftRight, ClipboardCheck, History,
  Calendar, Clock, Users, Link2, X, CheckCircle,
  XCircle, Clock4, UserMinus, ArrowRight
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import {
  fetchSessions, updateSession, fetchSessionSeats,
  fetchRosters, fetchRosterStudents,
  createAssignment, deleteAssignment,
  fetchSwapRequests, approveSwapRequest, rejectSwapRequest,
  fetchAttendance, updateAttendance,
  fetchLogs
} from '@/utils/api'
import { toast } from '@/components/Toast'
import type { Session, Seat, Roster, Student, SwapRequest, AttendanceRecord, OperationLog } from '@/types'

type TabKey = 'seats' | 'swap' | 'attendance' | 'logs'

const tabs: { key: TabKey; label: string; icon: any }[] = [
  { key: 'seats', label: '席位视图', icon: Grid3X3 },
  { key: 'swap', label: '调换审批', icon: ArrowLeftRight },
  { key: 'attendance', label: '签到记录', icon: ClipboardCheck },
  { key: 'logs', label: '操作历史', icon: History },
]

const opTypeLabels: Record<string, string> = {
  assign: '排座',
  unassign: '取消排座',
  swap_request: '调换申请',
  swap_approve: '批准调换',
  swap_reject: '拒绝调换',
  check_in: '签到',
  import_roster: '导入名单',
  create_session: '创建场次',
}

const attendanceLabels: Record<string, string> = {
  not_checked_in: '未签到',
  checked_in: '已签到',
  late: '迟到',
  absent: '缺勤',
}

const attendanceColors: Record<string, string> = {
  not_checked_in: 'bg-slate-100 text-slate-600',
  checked_in: 'bg-emerald-100 text-emerald-700',
  late: 'bg-amber-100 text-amber-700',
  absent: 'bg-red-100 text-red-700',
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const sessionId = Number(id)
  const { currentRole } = useAppStore()

  const [session, setSession] = useState<Session | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('seats')
  const [seats, setSeats] = useState<Seat[]>([])
  const [rosters, setRosters] = useState<Roster[]>([])
  const [rosterStudents, setRosterStudents] = useState<Student[]>([])
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [loading, setLoading] = useState(true)

  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)

  const [showRosterModal, setShowRosterModal] = useState(false)
  const [selectedRosterId, setSelectedRosterId] = useState<number | null>(null)

  const [approvalNote, setApprovalNote] = useState<Record<number, string>>({})

  const loadData = async () => {
    try {
      const [sessionData, seatsData] = await Promise.all([
        fetchSessions(),
        fetchSessionSeats(sessionId),
      ])
      const s = sessionData.find((s) => s.id === sessionId)
      if (s) setSession(s)
      setSeats(seatsData)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadTabData = async (tab: TabKey) => {
    try {
      switch (tab) {
        case 'swap':
          setSwapRequests(await fetchSwapRequests(sessionId))
          break
        case 'attendance':
          setAttendance(await fetchAttendance(sessionId))
          break
        case 'logs':
          setLogs(await fetchLogs(sessionId))
          break
      }
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  useEffect(() => {
    loadData()
    fetchRosters().then(setRosters).catch(() => {})
  }, [sessionId])

  useEffect(() => {
    if (activeTab !== 'seats') {
      loadTabData(activeTab)
    }
  }, [activeTab, sessionId])

  const handleLinkRoster = async () => {
    if (!selectedRosterId) {
      toast('请选择名单', 'error')
      return
    }
    try {
      const updated = await updateSession(sessionId, { roster_id: selectedRosterId } as any)
      setSession(updated)
      setShowRosterModal(false)
      toast('名单绑定成功', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleLoadRosterStudents = async (rosterId: number) => {
    setSelectedRosterId(rosterId)
    try {
      const data = await fetchRosterStudents(rosterId)
      setRosterStudents(data)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleSeatClick = (seat: Seat) => {
    if (seat.status === 'occupied') {
      if (!confirm(`取消 ${seat.student_name} 的席位 ${seat.seat_number}？`)) return
      const assignmentId = seat.assignment_id
      if (!assignmentId) return
      deleteAssignment(assignmentId)
        .then(() => {
          toast('已取消排座', 'success')
          loadData()
        })
        .catch((e: any) => toast(e.message, 'error'))
      return
    }
    setSelectedSeat(seat)
    setSelectedStudentId(null)
    if (session?.roster_id) {
      handleLoadRosterStudents(session.roster_id)
    }
    setShowAssignModal(true)
  }

  const handleAssign = async () => {
    if (!selectedSeat || !selectedStudentId) {
      toast('请选择学生', 'error')
      return
    }
    try {
      await createAssignment({
        session_id: sessionId,
        seat_id: selectedSeat.id,
        student_id: selectedStudentId,
      })
      toast('排座成功', 'success')
      setShowAssignModal(false)
      loadData()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleApproveSwap = async (id: number) => {
    try {
      const note = approvalNote[id] || ''
      await approveSwapRequest(id, currentRole, note || undefined)
      toast('已批准调换', 'success')
      loadData()
      loadTabData('swap')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleRejectSwap = async (id: number) => {
    try {
      const note = approvalNote[id] || ''
      await rejectSwapRequest(id, currentRole, note || undefined)
      toast('已拒绝调换', 'success')
      loadData()
      loadTabData('swap')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleAttendanceChange = async (recordId: number, status: string) => {
    try {
      await updateAttendance(recordId, { status })
      toast('签到状态已更新', 'success')
      loadTabData('attendance')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleBatchCheckIn = async () => {
    const unchecked = attendance.filter((a) => a.status === 'not_checked_in')
    for (const record of unchecked) {
      try {
        await updateAttendance(record.id, { status: 'checked_in' })
      } catch {
        // continue
      }
    }
    toast('批量签到完成', 'success')
    loadTabData('attendance')
  }

  if (loading || !session) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const occupiedCount = seats.filter((s) => s.status === 'occupied').length
  const totalSeats = session.rows * session.cols

  return (
    <div>
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <div className="flex flex-wrap items-center gap-6">
          <h1 className="text-xl font-bold text-slate-800">{session.name}</h1>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{session.date}</span>
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{session.time_start}-{session.time_end}</span>
            <span className="flex items-center gap-1"><Users className="w-4 h-4" />{occupiedCount}/{totalSeats}</span>
          </div>
          <button
            onClick={() => {
              setSelectedRosterId(session.roster_id)
              setShowRosterModal(true)
              fetchRosters().then(setRosters)
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              session.roster_id
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
            }`}
          >
            <Link2 className="w-4 h-4" />
            {session.roster_id ? '已绑定名单' : '绑定名单'}
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-white rounded-xl border border-slate-200 p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex-1 justify-center ${
              activeTab === tab.key
                ? 'bg-cyan-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'seats' && (
        <SeatGrid seats={seats} rows={session.rows} cols={session.cols} onSeatClick={handleSeatClick} />
      )}

      {activeTab === 'swap' && (
        <SwapTab
          requests={swapRequests}
          currentRole={currentRole}
          approvalNote={approvalNote}
          setApprovalNote={setApprovalNote}
          onApprove={handleApproveSwap}
          onReject={handleRejectSwap}
        />
      )}

      {activeTab === 'attendance' && (
        <AttendanceTab
          records={attendance}
          onStatusChange={handleAttendanceChange}
          onBatchCheckIn={handleBatchCheckIn}
        />
      )}

      {activeTab === 'logs' && <LogsTab logs={logs} />}

      {showAssignModal && selectedSeat && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">分配席位 {selectedSeat.seat_number}</h2>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {session.roster_id ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">选择学生</label>
                  <select
                    value={selectedStudentId || ''}
                    onChange={(e) => setSelectedStudentId(Number(e.target.value) || null)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">-- 请选择 --</option>
                    {rosterStudents
                      .filter(
                        (s) => !seats.some((seat) => seat.student_id === s.id && seat.status === 'occupied')
                      )
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.student_no} - {s.name} ({s.class_name})
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <p className="text-sm text-amber-600">请先绑定名单后再分配席位</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAssign}
                disabled={!selectedStudentId}
                className="px-4 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                确认分配
              </button>
            </div>
          </div>
        </div>
      )}

      {showRosterModal && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">绑定名单</h2>
              <button onClick={() => setShowRosterModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">选择名单</label>
              <select
                value={selectedRosterId || ''}
                onChange={(e) => setSelectedRosterId(Number(e.target.value) || null)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">-- 请选择 --</option>
                {rosters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.student_count}人)
                  </option>
                ))}
              </select>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowRosterModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleLinkRoster}
                className="px-4 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
              >
                确认绑定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SeatGrid({ seats, rows, cols, onSeatClick }: { seats: Seat[]; rows: number; cols: number; onSeatClick: (seat: Seat) => void }) {
  const grid: (Seat | null)[][] = []
  for (let r = 0; r < rows; r++) {
    const row: (Seat | null)[] = []
    for (let c = 0; c < cols; c++) {
      const seat = seats.find((s) => s.row_num === r && s.col_num === c)
      row.push(seat || null)
    }
    grid.push(row)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 overflow-auto">
      <div className="flex items-center gap-4 mb-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-emerald-100 border border-emerald-300" /> 空闲
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-cyan-100 border border-cyan-300" /> 已占
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {grid.map((row, ri) => (
          <div key={ri} className="flex gap-1.5">
            {row.map((seat, ci) => (
              <button
                key={ci}
                onClick={() => seat && onSeatClick(seat)}
                className={`flex items-center justify-center rounded text-xs font-medium transition-all hover:scale-105 hover:shadow-md min-w-[60px] min-h-[40px] px-1 py-1 ${
                  seat?.status === 'occupied'
                    ? 'bg-cyan-100 border-2 border-cyan-400 text-cyan-800'
                    : 'bg-emerald-50 border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                }`}
                title={seat?.status === 'occupied' ? `点击取消 ${seat.student_name} 的席位` : `点击分配席位 ${seat?.seat_number}`}
              >
                <span className="truncate max-w-[70px]">
                  {seat?.status === 'occupied' ? seat.student_name : seat?.seat_number}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function SwapTab({
  requests,
  currentRole,
  approvalNote,
  setApprovalNote,
  onApprove,
  onReject,
}: {
  requests: SwapRequest[]
  currentRole: string
  approvalNote: Record<number, string>
  setApprovalNote: (notes: Record<number, string>) => void
  onApprove: (id: number) => void
  onReject: (id: number) => void
}) {
  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
        <ArrowLeftRight className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p>暂无调换申请</p>
      </div>
    )
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700"><Clock4 className="w-3 h-3" />待审批</span>
      case 'approved':
        return <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700"><CheckCircle className="w-3 h-3" />已批准</span>
      case 'rejected':
        return <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700"><XCircle className="w-3 h-3" />已拒绝</span>
      default:
        return null
    }
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => (
        <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            {statusBadge(req.status)}
            <span className="text-xs text-slate-400">{new Date(req.created_at).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-sm font-medium text-slate-800">{req.from_student_name}</p>
              <p className="text-xs text-slate-500">{req.from_student_no}</p>
              <p className="text-xs text-cyan-600 mt-1">席位 {req.from_seat_number}</p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />
            <div className="flex-1 bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-sm font-medium text-slate-800">{req.to_student_name}</p>
              <p className="text-xs text-slate-500">{req.to_student_no}</p>
              <p className="text-xs text-cyan-600 mt-1">席位 {req.to_seat_number}</p>
            </div>
          </div>
          {req.reason && (
            <p className="text-sm text-slate-600 mb-3">原因：{req.reason}</p>
          )}
          {req.status === 'pending' && (
            <div className="border-t border-slate-100 pt-3">
              {currentRole === 'ta' && (
                <textarea
                  value={approvalNote[req.id] || ''}
                  onChange={(e) => setApprovalNote({ ...approvalNote, [req.id]: e.target.value })}
                  placeholder="审批备注（可选）"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-3"
                  rows={2}
                />
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => onApprove(req.id)}
                  className="flex items-center gap-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm rounded-lg transition-colors"
                >
                  <CheckCircle className="w-4 h-4" /> 批准
                </button>
                <button
                  onClick={() => onReject(req.id)}
                  className="flex items-center gap-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
                >
                  <XCircle className="w-4 h-4" /> 拒绝
                </button>
              </div>
            </div>
          )}
          {req.processed_at && (
            <div className="border-t border-slate-100 pt-3 text-xs text-slate-400">
              <span>审批人：{req.approved_by} ({req.approval_role === 'admin' ? '管理员' : '助教'})</span>
              {req.approval_note && <span className="ml-3">备注：{req.approval_note}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function AttendanceTab({
  records,
  onStatusChange,
  onBatchCheckIn,
}: {
  records: AttendanceRecord[]
  onStatusChange: (id: number, status: string) => void
  onBatchCheckIn: () => void
}) {
  const hasUnchecked = records.some((r) => r.status === 'not_checked_in')

  return (
    <div>
      {hasUnchecked && (
        <div className="flex justify-end mb-4">
          <button
            onClick={onBatchCheckIn}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm rounded-lg transition-colors"
          >
            <ClipboardCheck className="w-4 h-4" />
            批量签到
          </button>
        </div>
      )}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">学号</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">姓名</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">席位号</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">签到状态</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">签到时间</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-6 py-3 text-sm text-slate-700">{record.student_no}</td>
                <td className="px-6 py-3 text-sm text-slate-700">{record.student_name}</td>
                <td className="px-6 py-3 text-sm text-slate-500">{record.seat_number}</td>
                <td className="px-6 py-3">
                  <select
                    value={record.status}
                    onChange={(e) => onStatusChange(record.id, e.target.value)}
                    className={`text-xs px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500 ${attendanceColors[record.status]}`}
                  >
                    <option value="not_checked_in">未签到</option>
                    <option value="checked_in">已签到</option>
                    <option value="late">迟到</option>
                    <option value="absent">缺勤</option>
                  </select>
                </td>
                <td className="px-6 py-3 text-sm text-slate-500">
                  {record.check_in_time ? new Date(record.check_in_time).toLocaleString() : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {records.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>暂无签到记录</p>
          </div>
        )}
      </div>
    </div>
  )
}

function LogsTab({ logs }: { logs: OperationLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
        <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p>暂无操作记录</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="space-y-0">
        {logs.map((log, i) => (
          <div key={log.id} className="flex gap-4 pb-4 relative">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-cyan-600">
                  {(opTypeLabels[log.operation_type] || log.operation_type).charAt(0)}
                </span>
              </div>
              {i < logs.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
            </div>
            <div className="flex-1 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800">
                  {opTypeLabels[log.operation_type] || log.operation_type}
                </span>
                <span className="text-xs text-slate-400">
                  {log.operator} ({log.operator_role === 'admin' ? '管理员' : '助教'})
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-0.5">{log.details}</p>
              <p className="text-xs text-slate-400 mt-1">{new Date(log.created_at).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
