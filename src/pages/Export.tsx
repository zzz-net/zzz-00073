import { useEffect, useState } from 'react'
import { Download, FileSpreadsheet, ClipboardCheck, History } from 'lucide-react'
import { fetchSessions, exportSeats, exportAttendance, exportLogs } from '@/utils/api'
import { toast } from '@/components/Toast'
import type { Session } from '@/types'

interface ExportCard {
  title: string
  icon: any
  columns: string[]
  exportFn: (sessionId: number) => Promise<any[]>
  filename: string
}

const exportCards: ExportCard[] = [
  {
    title: '席位表',
    icon: FileSpreadsheet,
    columns: ['学号', '姓名', '班级', '组别', '场次', '席位号'],
    exportFn: exportSeats,
    filename: '席位表.csv',
  },
  {
    title: '考勤表',
    icon: ClipboardCheck,
    columns: ['学号', '姓名', '班级', '组别', '场次', '签到状态', '签到时间'],
    exportFn: exportAttendance,
    filename: '考勤表.csv',
  },
  {
    title: '操作日志',
    icon: History,
    columns: ['操作时间', '操作类型', '操作人', '详情'],
    exportFn: exportLogs,
    filename: '操作日志.csv',
  },
]

function objectsToCSV(data: any[]): string {
  if (data.length === 0) return ''
  const headers = Object.keys(data[0])
  const headerLine = headers.join(',')
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = String(row[h] ?? '')
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    }).join(',')
  )
  return [headerLine, ...rows].join('\n')
}

function downloadCSV(csvContent: string, filename: string) {
  const bom = '\uFEFF'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function Export() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<Record<number, number>>({})
  const [exporting, setExporting] = useState<Record<number, boolean>>({})

  useEffect(() => {
    fetchSessions()
      .then(setSessions)
      .catch((e: any) => toast(e.message, 'error'))
  }, [])

  const handleExport = async (cardIndex: number) => {
    const sessionId = selectedSession[cardIndex]
    if (!sessionId) {
      toast('请先选择场次', 'error')
      return
    }
    const card = exportCards[cardIndex]
    setExporting((prev) => ({ ...prev, [cardIndex]: true }))
    try {
      const data = await card.exportFn(sessionId)
      if (data.length === 0) {
        toast('该场次暂无数据', 'info')
        return
      }
      const csv = objectsToCSV(data)
      downloadCSV(csv, card.filename)
      toast('导出成功', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setExporting((prev) => ({ ...prev, [cardIndex]: false }))
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">数据导出</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {exportCards.map((card, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center">
                <card.icon className="w-5 h-5 text-cyan-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">{card.title}</h2>
            </div>

            <div className="mb-5">
              <p className="text-xs text-slate-400 mb-2">导出列</p>
              <div className="flex flex-wrap gap-1.5">
                {card.columns.map((col) => (
                  <span key={col} className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded">
                    {col}
                  </span>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <select
                value={selectedSession[idx] || ''}
                onChange={(e) =>
                  setSelectedSession((prev) => ({
                    ...prev,
                    [idx]: Number(e.target.value),
                  }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">选择场次</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.date})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => handleExport(idx)}
              disabled={exporting[idx] || !selectedSession[idx]}
              className="mt-auto flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              {exporting[idx] ? '导出中...' : '导出 CSV'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
