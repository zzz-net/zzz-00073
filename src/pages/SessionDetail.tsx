import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Grid3X3, ArrowLeftRight, ClipboardCheck, History,
  Calendar, Clock, Users, Link2, X, CheckCircle,
  XCircle, Clock4, UserMinus, ArrowRight,
  FileEdit, Save, Play, Trash2, AlertTriangle, Sparkles,
  LayoutGrid, Download, RotateCcw
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import {
  fetchSessions, updateSession, fetchSessionSeats,
  fetchRosters, fetchRosterStudents,
  createAssignment, deleteAssignment,
  fetchSwapRequests, approveSwapRequest, rejectSwapRequest,
  fetchAttendance, updateAttendance,
  fetchLogs,
  fetchDraft, generateDraft, saveDraft, applyDraft, abandonDraft, fetchDraftConflicts,
  fetchTemplates, saveTemplate, checkTemplateApplyConflicts, applyTemplate,
  fetchTemplateSnapshots, rollbackTemplateSnapshot
} from '@/utils/api'
import { toast } from '@/components/Toast'
import type {
  Session, Seat, Roster, Student, SwapRequest, AttendanceRecord, OperationLog,
  SeatingDraft, DraftConflict, DraftItem, SeatingTemplate, TemplateApplyConflict,
  TemplateApplySnapshot
} from '@/types'

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
  generate_draft: '生成草稿',
  update_draft: '更新草稿',
  apply_draft: '应用草稿',
  apply_draft_failed: '应用草稿失败',
  abandon_draft: '放弃草稿',
  save_template: '保存模板',
  overwrite_template: '覆盖模板',
  update_template: '更新模板',
  delete_template: '删除模板',
  export_template: '导出模板',
  import_template: '导入模板',
  apply_template: '套用模板',
  apply_template_failed: '套用模板失败',
  rollback_template: '撤销套用模板',
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

  const [draftMode, setDraftMode] = useState(false)
  const [draft, setDraft] = useState<SeatingDraft | null>(null)
  const [draftConflicts, setDraftConflicts] = useState<DraftConflict[]>([])
  const [showDraftAssignModal, setShowDraftAssignModal] = useState(false)
  const [draftSelectedSeat, setDraftSelectedSeat] = useState<Seat | null>(null)
  const [draftSelectedStudentId, setDraftSelectedStudentId] = useState<number | null>(null)
  const [draftDirty, setDraftDirty] = useState(false)

  const [templates, setTemplates] = useState<SeatingTemplate[]>([])
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
  const [saveTemplateForm, setSaveTemplateForm] = useState({ name: '', remark: '', checkInInitRule: 'not_checked_in', overwrite: false })
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [applyConflicts, setApplyConflicts] = useState<TemplateApplyConflict[]>([])
  const [checkingConflicts, setCheckingConflicts] = useState(false)
  const [snapshots, setSnapshots] = useState<TemplateApplySnapshot[]>([])
  const [showRollbackModal, setShowRollbackModal] = useState(false)
  const [selectedSnapshot, setSelectedSnapshot] = useState<TemplateApplySnapshot | null>(null)

  const loadData = async () => {
    try {
      const [sessionData, seatsData, templatesData, snapshotsData] = await Promise.all([
        fetchSessions(),
        fetchSessionSeats(sessionId),
        fetchTemplates(),
        fetchTemplateSnapshots(sessionId),
      ])
      const s = sessionData.find((s) => s.id === sessionId)
      if (s) setSession(s)
      setSeats(seatsData)
      setTemplates(templatesData)
      setSnapshots(snapshotsData)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadDraft = async () => {
    try {
      const draftData = await fetchDraft(sessionId)
      setDraft(draftData)
      if (draftData) {
        const conflicts = await fetchDraftConflicts(sessionId)
        setDraftConflicts(conflicts)
      } else {
        setDraftConflicts([])
      }
    } catch {
      // ignore
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

  const handleEnterDraftMode = async () => {
    if (!session?.roster_id) {
      toast('请先绑定名单', 'error')
      return
    }
    await loadDraft()
    setDraftMode(true)
  }

  const handleExitDraftMode = () => {
    if (draftDirty) {
      if (!confirm('草稿有未保存的修改，确定要退出吗？')) return
    }
    setDraftMode(false)
    setDraftDirty(false)
  }

  const handleGenerateDraft = async () => {
    if (!session?.roster_id) {
      toast('请先绑定名单', 'error')
      return
    }
    try {
      const draftData = await generateDraft(sessionId)
      setDraft(draftData)
      setDraftDirty(false)
      const conflicts = await fetchDraftConflicts(sessionId)
      setDraftConflicts(conflicts)
      toast('草稿生成成功', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleSaveDraft = async () => {
    if (!draft) return
    try {
      const items = draft.items.map((item) => ({
        seat_id: item.seat_id,
        student_id: item.student_id,
      }))
      const draftData = await saveDraft(sessionId, items)
      setDraft(draftData)
      setDraftDirty(false)
      const conflicts = await fetchDraftConflicts(sessionId)
      setDraftConflicts(conflicts)
      toast('草稿已保存', 'success')
    } catch (e: any) {
      if (e.conflicts) {
        setDraftConflicts(e.conflicts)
      }
      toast(e.message, 'error')
    }
  }

  const handleApplyDraft = async () => {
    if (!draft || draft.items.length === 0) {
      toast('草稿为空，无法应用', 'error')
      return
    }
    if (draftConflicts.length > 0) {
      toast(`存在 ${draftConflicts.length} 个冲突，请先解决`, 'error')
      return
    }
    if (!confirm(`确定应用草稿？共 ${draft.items.length} 名学生将被分配席位。`)) return
    try {
      const result = await applyDraft(sessionId)
      setSeats(result.seats)
      setDraft(null)
      setDraftMode(false)
      setDraftDirty(false)
      setDraftConflicts([])
      toast(`应用成功，共分配 ${result.applied} 个席位`, 'success')
    } catch (e: any) {
      if (e.duplicates || (e as any).conflicts) {
        setDraftConflicts((e as any).conflicts || [])
      }
      toast(e.message, 'error')
    }
  }

  const handleAbandonDraft = async () => {
    if (!draft) return
    if (!confirm('确定要放弃当前草稿吗？此操作不可恢复。')) return
    try {
      await abandonDraft(sessionId)
      setDraft(null)
      setDraftMode(false)
      setDraftDirty(false)
      setDraftConflicts([])
      toast('草稿已放弃', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleOpenSaveTemplate = () => {
    const occupiedCount = seats.filter(s => s.status === 'occupied').length
    if (occupiedCount === 0) {
      toast('当前场次没有排座记录，无法保存为模板', 'error')
      return
    }
    if (currentRole !== 'admin') {
      toast('仅管理员可保存模板', 'error')
      return
    }
    setSaveTemplateForm({ name: '', remark: '', checkInInitRule: 'not_checked_in', overwrite: false })
    setShowSaveTemplateModal(true)
  }

  const handleSaveTemplate = async () => {
    if (!saveTemplateForm.name.trim()) {
      toast('请输入模板名称', 'error')
      return
    }
    try {
      const result = await saveTemplate({
        sessionId,
        name: saveTemplateForm.name.trim(),
        remark: saveTemplateForm.remark.trim(),
        checkInInitRule: saveTemplateForm.checkInInitRule,
        overwrite: saveTemplateForm.overwrite
      })
      toast(`模板${saveTemplateForm.overwrite ? '覆盖' : '保存'}成功`, 'success')
      setShowSaveTemplateModal(false)
      setTemplates(await fetchTemplates())
    } catch (e: any) {
      if (e.message.includes('已存在') && !saveTemplateForm.overwrite) {
        if (confirm(`模板名称 "${saveTemplateForm.name}" 已存在，是否覆盖？`)) {
          setSaveTemplateForm({ ...saveTemplateForm, overwrite: true })
          return
        }
      }
      toast(e.message, 'error')
    }
  }

  const handleOpenApplyTemplate = () => {
    if (currentRole !== 'admin') {
      toast('仅管理员可套用模板', 'error')
      return
    }
    if (!session?.roster_id) {
      toast('请先绑定名单后再套用模板', 'error')
      return
    }
    setSelectedTemplateId(null)
    setApplyConflicts([])
    setShowApplyTemplateModal(true)
  }

  const handleTemplateSelect = async (templateId: number) => {
    setSelectedTemplateId(templateId)
    setCheckingConflicts(true)
    setApplyConflicts([])
    try {
      const conflicts = await checkTemplateApplyConflicts(templateId, sessionId, currentRole)
      setApplyConflicts(conflicts)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setCheckingConflicts(false)
    }
  }

  const handleApplyTemplate = async () => {
    if (!selectedTemplateId) return
    if (applyConflicts.length > 0) {
      toast(`存在 ${applyConflicts.length} 个冲突，无法套用模板`, 'error')
      return
    }
    const template = templates.find(t => t.id === selectedTemplateId)
    if (!confirm(`确定套用模板 "${template?.name}"？这将批量分配 ${template?.item_count || 0} 个席位。`)) return

    try {
      const result = await applyTemplate(selectedTemplateId, sessionId, 'admin', currentRole)
      setSeats(result.seats)
      setSnapshots(await fetchTemplateSnapshots(sessionId))
      toast(`套用成功，共分配 ${result.applied} 个席位`, 'success')
      setShowApplyTemplateModal(false)
      loadData()
      loadTabData('logs')
    } catch (e: any) {
      if (e.conflicts) {
        setApplyConflicts(e.conflicts)
      }
      toast(e.message, 'error')
    }
  }

  const handleOpenRollback = (snapshot: TemplateApplySnapshot) => {
    if (currentRole !== 'admin') {
      toast('仅管理员可撤销套用', 'error')
      return
    }
    setSelectedSnapshot(snapshot)
    setShowRollbackModal(true)
  }

  const handleRollback = async () => {
    if (!selectedSnapshot) return
    if (!confirm(`确定撤销套用模板 "${selectedSnapshot.template_name}"？将恢复到套用前的状态。`)) return

    try {
      const result = await rollbackTemplateSnapshot(selectedSnapshot.id, 'admin', currentRole)
      setSeats(result.seats)
      setSnapshots(await fetchTemplateSnapshots(sessionId))
      toast(`撤销成功，已恢复 ${result.restored_assignments} 条排座记录`, 'success')
      setShowRollbackModal(false)
      loadData()
      loadTabData('logs')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleDraftSeatClick = (seat: Seat) => {
    const draftItem = draft?.items.find((item) => item.seat_id === seat.id)
    if (draftItem) {
      if (!confirm(`移除 ${draftItem.student_name} 的草稿席位 ${seat.seat_number}？`)) return
      setDraft({
        ...draft!,
        items: draft!.items.filter((item) => item.seat_id !== seat.id),
      })
      setDraftDirty(true)
      return
    }
    setDraftSelectedSeat(seat)
    setDraftSelectedStudentId(null)
    if (session?.roster_id) {
      handleLoadRosterStudents(session.roster_id)
    }
    setShowDraftAssignModal(true)
  }

  const handleDraftAssign = async () => {
    if (!draftSelectedSeat || !draftSelectedStudentId || !draft) {
      toast('请选择学生', 'error')
      return
    }
    const newItems = draft.items.filter((item) => item.seat_id !== draftSelectedSeat.id && item.student_id !== draftSelectedStudentId)
    const student = rosterStudents.find((s) => s.id === draftSelectedStudentId)
    if (student) {
      newItems.push({
        id: 0,
        draft_id: draft.id,
        seat_id: draftSelectedSeat.id,
        student_id: student.id,
        seat_number: draftSelectedSeat.seat_number,
        row_num: draftSelectedSeat.row_num,
        col_num: draftSelectedSeat.col_num,
        student_no: student.student_no,
        student_name: student.name,
        class_name: student.class_name,
        group_name: student.group_name,
        created_at: new Date().toISOString(),
      })
    }
    setDraft({ ...draft, items: newItems })
    setDraftDirty(true)
    setShowDraftAssignModal(false)
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
  const draftCount = draft?.items.length || 0

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
          {activeTab === 'seats' && (
            <button
              onClick={draftMode ? handleExitDraftMode : handleEnterDraftMode}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                draftMode
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
              }`}
            >
              <FileEdit className="w-4 h-4" />
              {draftMode ? '退出草稿' : '排座草稿'}
            </button>
          )}
          {activeTab === 'seats' && !draftMode && currentRole === 'admin' && (
            <>
              <button
                onClick={handleOpenSaveTemplate}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
              >
                <Save className="w-4 h-4" />
                保存为模板
              </button>
              <button
                onClick={handleOpenApplyTemplate}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <LayoutGrid className="w-4 h-4" />
                套用模板
              </button>
            </>
          )}
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

      {activeTab === 'seats' && !draftMode && (
        <SeatGrid seats={seats} rows={session.rows} cols={session.cols} onSeatClick={handleSeatClick} />
      )}

      {activeTab === 'seats' && draftMode && (
        <div className="space-y-4">
          {draft && draft.roster_valid === false && (
            <div className="bg-red-50 border-2 border-red-400 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-red-800 mb-1">名单状态异常</h3>
                <p className="text-sm text-red-700">
                  {draft.roster_invalid_reason || '当前名单无效'}，草稿中的学生没有有效名单归属。
                  请先重新绑定名单后再进行保存或应用操作。
                </p>
              </div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
                  草稿模式 {draftDirty && <span className="ml-1 text-amber-500">● 未保存</span>}
                </span>
                <span className="text-sm text-slate-500">
                  已分配 {draftCount} / {totalSeats} 个席位
                </span>
                {draftConflicts.length > 0 && (
                  <span className="flex items-center gap-1 text-sm text-red-600">
                    <AlertTriangle className="w-4 h-4" />
                    {draftConflicts.length} 个冲突
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateDraft}
                  disabled={!session?.roster_id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  批量生成
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={!draft || !draftDirty || draft?.roster_valid === false}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  保存草稿
                </button>
                <button
                  onClick={handleApplyDraft}
                  disabled={!draft || draft.items.length === 0 || draftConflicts.length > 0 || draft?.roster_valid === false}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  <Play className="w-4 h-4" />
                  应用草稿
                </button>
                <button
                  onClick={handleAbandonDraft}
                  disabled={!draft}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  放弃草稿
                </button>
              </div>
            </div>
          </div>

          {draftConflicts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="text-sm font-medium text-red-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                冲突列表
              </h3>
              <ul className="space-y-1">
                {draftConflicts.map((c, i) => (
                  <li key={i} className="text-sm text-red-700">
                    • {c.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DraftSeatGrid
            seats={seats}
            draftItems={draft?.items || []}
            rows={session.rows}
            cols={session.cols}
            onSeatClick={handleDraftSeatClick}
          />
        </div>
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

      {showDraftAssignModal && draftSelectedSeat && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">草稿分配席位 {draftSelectedSeat.seat_number}</h2>
              <button onClick={() => setShowDraftAssignModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {session.roster_id ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">选择学生</label>
                  <select
                    value={draftSelectedStudentId || ''}
                    onChange={(e) => setDraftSelectedStudentId(Number(e.target.value) || null)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">-- 请选择 --</option>
                    {rosterStudents
                      .filter(
                        (s) => !draft?.items.some((item) => item.student_id === s.id)
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
                onClick={() => setShowDraftAssignModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDraftAssign}
                disabled={!draftSelectedStudentId}
                className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                添加到草稿
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

      {showSaveTemplateModal && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">保存为模板</h2>
              <button onClick={() => setShowSaveTemplateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">模板名称 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={saveTemplateForm.name}
                  onChange={(e) => setSaveTemplateForm({ ...saveTemplateForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="例如：计算机1班标准排座"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                <textarea
                  value={saveTemplateForm.remark}
                  onChange={(e) => setSaveTemplateForm({ ...saveTemplateForm, remark: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  rows={3}
                  placeholder="可选，描述模板用途"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">套用后签到初始状态</label>
                <select
                  value={saveTemplateForm.checkInInitRule}
                  onChange={(e) => setSaveTemplateForm({ ...saveTemplateForm, checkInInitRule: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="not_checked_in">未签到</option>
                  <option value="checked_in">已签到</option>
                  <option value="late">迟到</option>
                  <option value="absent">缺勤</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="overwrite-template"
                  checked={saveTemplateForm.overwrite}
                  onChange={(e) => setSaveTemplateForm({ ...saveTemplateForm, overwrite: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500"
                />
                <label htmlFor="overwrite-template" className="text-sm text-slate-600">
                  覆盖已存在的同名模板
                </label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowSaveTemplateModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!saveTemplateForm.name.trim()}
                className="px-4 py-2 text-sm bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                <Save className="w-4 h-4 inline mr-1" />
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showApplyTemplateModal && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">套用模板</h2>
              <button onClick={() => setShowApplyTemplateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1 space-y-4">
              {templates.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <LayoutGrid className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>暂无可用模板</p>
                  <p className="text-sm mt-1">请先在场次详情中保存排座为模板</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">选择模板</label>
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-auto border border-slate-200 rounded-lg p-2">
                      {templates.map((t) => (
                        <label
                          key={t.id}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                            selectedTemplateId === t.id
                              ? 'bg-cyan-50 border-2 border-cyan-400'
                              : 'bg-slate-50 border-2 border-transparent hover:bg-slate-100'
                          }`}
                        >
                          <input
                            type="radio"
                            name="template"
                            value={t.id}
                            checked={selectedTemplateId === t.id}
                            onChange={() => handleTemplateSelect(t.id)}
                            className="w-4 h-4 text-cyan-500 focus:ring-cyan-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-800">{t.name}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-2">
                              <span>{t.rows}×{t.cols}</span>
                              <span>·</span>
                              <span>{t.item_count} 条记录</span>
                              {t.roster_name && (
                                <>
                                  <span>·</span>
                                  <span>关联: {t.roster_name}</span>
                                </>
                              )}
                            </div>
                            {t.remark && <div className="text-xs text-slate-400 mt-1">{t.remark}</div>}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {checkingConflicts && (
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <p className="text-sm text-slate-600">正在检测冲突...</p>
                    </div>
                  )}

                  {!checkingConflicts && selectedTemplateId && (
                    <TemplateConflictList conflicts={applyConflicts} />
                  )}

                  {snapshots.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-amber-800 mb-2 flex items-center gap-2">
                        <RotateCcw className="w-4 h-4" />
                        历史套用记录（可撤销）
                      </h4>
                      <div className="space-y-2 max-h-32 overflow-auto">
                        {snapshots.map((s) => (
                          <div
                            key={s.id}
                            className="flex items-center justify-between bg-white/50 rounded-lg p-2 text-sm"
                          >
                            <div>
                              <span className="font-medium text-amber-800">{s.template_name}</span>
                              <span className="text-amber-600 ml-2">
                                由 {s.operator} 于 {new Date(s.applied_at).toLocaleString()} 套用
                              </span>
                            </div>
                            {s.rolled_back ? (
                              <span className="text-xs text-slate-400">已撤销</span>
                            ) : (
                              <button
                                onClick={() => handleOpenRollback(s)}
                                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                              >
                                撤销
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowApplyTemplateModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleApplyTemplate}
                disabled={!selectedTemplateId || applyConflicts.length > 0 || checkingConflicts}
                className="px-4 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                <Play className="w-4 h-4 inline mr-1" />
                套用
              </button>
            </div>
          </div>
        </div>
      )}

      {showRollbackModal && selectedSnapshot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">撤销套用模板</h2>
              <button onClick={() => setShowRollbackModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800 mb-1">确认撤销</h4>
                    <p className="text-sm text-amber-700">
                      将撤销模板 "{selectedSnapshot.template_name}" 的套用，
                      恢复到套用前的排座和签到状态。
                    </p>
                    <p className="text-xs text-amber-600 mt-2">
                      操作人: {selectedSnapshot.operator} · 套用时间: {new Date(selectedSnapshot.applied_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                此操作将删除套用模板后产生的所有排座和签到记录，并恢复套用前的数据。
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowRollbackModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleRollback}
                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4 inline mr-1" />
                确认撤销
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

function DraftSeatGrid({
  seats,
  draftItems,
  rows,
  cols,
  onSeatClick,
}: {
  seats: Seat[]
  draftItems: DraftItem[]
  rows: number
  cols: number
  onSeatClick: (seat: Seat) => void
}) {
  const grid: (Seat | null)[][] = []
  for (let r = 0; r < rows; r++) {
    const row: (Seat | null)[] = []
    for (let c = 0; c < cols; c++) {
      const seat = seats.find((s) => s.row_num === r && s.col_num === c)
      row.push(seat || null)
    }
    grid.push(row)
  }

  const getDraftItem = (seatId: number) => {
    return draftItems.find((item) => item.seat_id === seatId)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 overflow-auto">
      <div className="flex items-center gap-4 mb-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-emerald-100 border border-emerald-300" /> 空闲
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-cyan-100 border border-cyan-300" /> 已排
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-amber-100 border-2 border-amber-400 border-dashed" /> 草稿
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {grid.map((row, ri) => (
          <div key={ri} className="flex gap-1.5">
            {row.map((seat, ci) => {
              if (!seat) return <div key={ci} className="min-w-[60px] min-h-[40px]" />
              const draftItem = getDraftItem(seat.id)
              const isOccupied = seat.status === 'occupied'
              const isDraft = !!draftItem
              return (
                <button
                  key={ci}
                  onClick={() => onSeatClick(seat)}
                  className={`flex items-center justify-center rounded text-xs font-medium transition-all hover:scale-105 hover:shadow-md min-w-[60px] min-h-[40px] px-1 py-1 ${
                    isDraft
                      ? 'bg-amber-100 border-2 border-amber-400 border-dashed text-amber-800'
                      : isOccupied
                      ? 'bg-cyan-100 border-2 border-cyan-400 text-cyan-800'
                      : 'bg-emerald-50 border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                  }`}
                  title={isDraft ? `草稿: ${draftItem.student_name} (点击移除)` : isOccupied ? `已排: ${seat.student_name}` : `点击分配 ${seat.seat_number}`}
                >
                  <span className="truncate max-w-[70px]">
                    {isDraft ? draftItem.student_name : isOccupied ? seat.student_name : seat.seat_number}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function TemplateConflictList({ conflicts }: { conflicts: TemplateApplyConflict[] }) {
  if (conflicts.length === 0) return null

  const getConflictIcon = (type: string) => {
    switch (type) {
      case 'layout_mismatch':
      case 'roster_unbound':
      case 'permission_denied':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'student_not_found':
      case 'student_not_in_roster':
        return <UserMinus className="w-4 h-4 text-orange-500" />
      case 'seat_occupied':
      case 'duplicate_seat':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />
      case 'duplicate_student':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />
      default:
        return <AlertTriangle className="w-4 h-4 text-slate-500" />
    }
  }

  const getConflictLabel = (type: string) => {
    switch (type) {
      case 'layout_mismatch': return '布局不匹配'
      case 'roster_unbound': return '名单未绑定'
      case 'permission_denied': return '权限不足'
      case 'student_not_found': return '学生不存在'
      case 'student_not_in_roster': return '学生不在名单中'
      case 'seat_occupied': return '席位已占用'
      case 'duplicate_seat': return '重复分配席位'
      case 'duplicate_student': return '重复分配学生'
      default: return type
    }
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 max-h-64 overflow-auto">
      <h4 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        检测到 {conflicts.length} 个冲突，无法套用模板
      </h4>
      <ul className="space-y-2">
        {conflicts.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-sm bg-white/50 rounded-lg p-2">
            {getConflictIcon(c.type)}
            <div className="flex-1">
              <span className="font-medium text-red-700">[{getConflictLabel(c.type)}]</span>
              <span className="text-red-600 ml-1">{c.reason}</span>
              {(c.seat_number || c.student_no) && (
                <div className="text-xs text-red-500 mt-0.5">
                  {c.seat_number && <span className="mr-2">席位: {c.seat_number}</span>}
                  {c.student_no && <span>学生: {c.student_name}({c.student_no})</span>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
