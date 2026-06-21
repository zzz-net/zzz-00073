import { useEffect, useState, useRef } from 'react'
import { Upload, Download, Trash2, ChevronDown, ChevronUp, FileText, AlertCircle } from 'lucide-react'
import { fetchRosters, importRoster, fetchRosterStudents, deleteRoster, fetchSampleCSV } from '@/utils/api'
import { toast } from '@/components/Toast'
import type { Roster, Student } from '@/types'

export default function Roster() {
  const [rosters, setRosters] = useState<Roster[]>([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [importName, setImportName] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const loadRosters = async () => {
    try {
      const data = await fetchRosters()
      setRosters(data)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRosters()
  }, [])

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) {
      setImportFile(file)
      setImportError('')
    } else {
      setImportError('请上传 CSV 文件')
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImportFile(file)
      setImportError('')
    }
  }

  const handleImport = async () => {
    if (!importName.trim()) {
      setImportError('请输入名单名称')
      return
    }
    if (!importFile) {
      setImportError('请选择 CSV 文件')
      return
    }
    setImporting(true)
    setImportError('')
    try {
      await importRoster(importName, importFile)
      toast('名单导入成功', 'success')
      setShowImport(false)
      setImportName('')
      setImportFile(null)
      loadRosters()
    } catch (e: any) {
      setImportError(e.message)
    } finally {
      setImporting(false)
    }
  }

  const handleDownloadSample = async () => {
    try {
      const blob = await fetchSampleCSV()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'roster_sample.csv'
      a.click()
      URL.revokeObjectURL(url)
      toast('样例文件已下载', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleDelete = async (id: number, inUse: boolean) => {
    if (inUse) return
    if (!confirm('确定删除该名单？')) return
    try {
      await deleteRoster(id)
      toast('名单已删除', 'success')
      if (expandedId === id) setExpandedId(null)
      loadRosters()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    setStudentsLoading(true)
    try {
      const data = await fetchRosterStudents(id)
      setStudents(data)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setStudentsLoading(false)
    }
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
        <h1 className="text-2xl font-bold text-slate-800">名单管理</h1>
        <div className="flex gap-3">
          <button
            onClick={handleDownloadSample}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            下载样例
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4" />
            导入名单
          </button>
        </div>
      </div>

      {rosters.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg">暂无名单</p>
          <p className="text-sm mt-1">点击"导入名单"上传 CSV 文件</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">名单名称</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">学生数</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="text-right px-6 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {rosters.map((roster) => (
                <RosterRow
                  key={roster.id}
                  roster={roster}
                  expanded={expandedId === roster.id}
                  students={expandedId === roster.id ? students : []}
                  studentsLoading={studentsLoading}
                  onToggle={() => toggleExpand(roster.id)}
                  onDelete={() => handleDelete(roster.id, roster.inUse)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">导入名单</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">名单名称</label>
                <input
                  type="text"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="例如：2024级计算机1班"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">CSV 文件</label>
                <div
                  ref={dropRef}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    importFile ? 'border-cyan-400 bg-cyan-50' : 'border-slate-300 hover:border-cyan-400 hover:bg-cyan-50/50'
                  }`}
                >
                  {importFile ? (
                    <div className="flex items-center justify-center gap-2 text-cyan-600">
                      <FileText className="w-5 h-5" />
                      <span className="text-sm">{importFile.name}</span>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                      <p className="text-sm text-slate-500">拖拽文件到此处或点击选择</p>
                      <p className="text-xs text-slate-400 mt-1">支持 CSV 格式，列：学号,姓名,班级,组别</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {importError && (
                <div className="flex items-center gap-2 text-red-500 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {importError}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => { setShowImport(false); setImportName(''); setImportFile(null); setImportError('') }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {importing ? '导入中...' : '导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RosterRow({
  roster,
  expanded,
  students,
  studentsLoading,
  onToggle,
  onDelete,
}: {
  roster: Roster
  expanded: boolean
  students: Student[]
  studentsLoading: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
      >
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            <span className="font-medium text-slate-800">{roster.name}</span>
          </div>
        </td>
        <td className="px-6 py-4 text-sm text-slate-600">{roster.student_count} 人</td>
        <td className="px-6 py-4 text-sm text-slate-500">{new Date(roster.created_at).toLocaleString()}</td>
        <td className="px-6 py-4">
          {roster.inUse ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">使用中</span>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">未使用</span>
          )}
        </td>
        <td className="px-6 py-4 text-right">
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (roster.inUse) {
                toast('该名单正在使用中，无法删除', 'error')
                return
              }
              onDelete()
            }}
            className={`p-2 rounded-lg transition-colors ${
              roster.inUse
                ? 'text-slate-300 cursor-not-allowed'
                : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
            }`}
            title={roster.inUse ? '名单使用中，无法删除' : '删除'}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="px-6 py-4 bg-slate-50">
            {studentsLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : students.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">暂无学生数据</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left py-2 px-3">学号</th>
                    <th className="text-left py-2 px-3">姓名</th>
                    <th className="text-left py-2 px-3">班级</th>
                    <th className="text-left py-2 px-3">组别</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} className="border-t border-slate-200">
                      <td className="py-2 px-3 text-slate-700">{s.student_no}</td>
                      <td className="py-2 px-3 text-slate-700">{s.name}</td>
                      <td className="py-2 px-3 text-slate-500">{s.class_name}</td>
                      <td className="py-2 px-3 text-slate-500">{s.group_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
