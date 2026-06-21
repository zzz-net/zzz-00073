import { useEffect, useState } from 'react'
import {
  LayoutGrid, Plus, Trash2, Download, Upload, Edit3,
  X, Save, Eye, FileJson, AlertTriangle, CheckCircle
} from 'lucide-react'
import {
  fetchTemplates, fetchTemplate, deleteTemplate,
  exportTemplate, importTemplate, updateTemplate
} from '@/utils/api'
import { toast } from '@/components/Toast'
import type { SeatingTemplate, SeatingTemplateItem } from '@/types'

export default function Templates() {
  const [templates, setTemplates] = useState<SeatingTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState<SeatingTemplate | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', remark: '', checkInInitRule: 'not_checked_in' })
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<any>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const loadTemplates = async () => {
    try {
      const data = await fetchTemplates()
      setTemplates(data)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const handleViewDetail = async (template: SeatingTemplate) => {
    try {
      const detail = await fetchTemplate(template.id)
      setSelectedTemplate(detail)
      setShowDetailModal(true)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleOpenEdit = (template: SeatingTemplate) => {
    setSelectedTemplate(template)
    setEditForm({
      name: template.name,
      remark: template.remark,
      checkInInitRule: template.check_in_init_rule
    })
    setShowEditModal(true)
  }

  const handleEdit = async () => {
    if (!selectedTemplate) return
    if (!editForm.name.trim()) {
      toast('模板名称不能为空', 'error')
      return
    }
    try {
      await updateTemplate(selectedTemplate.id, editForm)
      toast('模板更新成功', 'success')
      setShowEditModal(false)
      loadTemplates()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleDelete = async (template: SeatingTemplate) => {
    if (!confirm(`确定删除模板 "${template.name}"？此操作不可撤销。`)) return
    try {
      await deleteTemplate(template.id)
      toast('模板已删除', 'success')
      loadTemplates()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleExport = async (template: SeatingTemplate) => {
    try {
      const data = await exportTemplate(template.id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${template.name}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast('模板导出成功', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)
    setImportError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (!data.name || !data.rows || !data.cols || !Array.isArray(data.items)) {
          throw new Error('文件格式不正确，缺少必要字段')
        }
        setImportPreview(data)
      } catch (err: any) {
        setImportError(err.message || '文件解析失败，请确保是有效的 JSON 文件')
        setImportPreview(null)
      }
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (!importPreview) return
    try {
      await importTemplate(importPreview)
      toast('模板导入成功', 'success')
      setShowImportModal(false)
      setImportFile(null)
      setImportPreview(null)
      setImportError(null)
      loadTemplates()
    } catch (e: any) {
      let msg = e.message
      if (e.conflicts) {
        msg = `存在冲突：${e.conflicts.map((c: any) => c.reason).join('; ')}`
      }
      toast(msg, 'error')
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
        <h1 className="text-2xl font-bold text-slate-800">排座模板库</h1>
        <button
          onClick={() => {
            setImportFile(null)
            setImportPreview(null)
            setImportError(null)
            setShowImportModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors shadow-sm"
        >
          <Upload className="w-4 h-4" />
          导入模板
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <LayoutGrid className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">暂无模板</h3>
          <p className="text-slate-400 mb-4">在场次详情页中排座后，可以保存为模板以便复用</p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-md mx-auto text-left">
            <h4 className="text-sm font-medium text-amber-800 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              使用说明
            </h4>
            <ul className="text-sm text-amber-700 space-y-1">
              <li>• 进入场次详情 → 席位视图</li>
              <li>• 完成排座后，点击"保存为模板"</li>
              <li>• 新建或补开场次时可直接套用模板</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 group-hover:text-cyan-600 transition-colors">
                    {template.name}
                  </h3>
                  {template.remark && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{template.remark}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2 mb-4 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <LayoutGrid className="w-4 h-4 text-slate-400" />
                  <span>{template.rows} × {template.cols} = {template.rows * template.cols} 席位</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span>{template.item_count || 0} 个分配记录</span>
                </div>
                {template.roster_name && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      关联名单: {template.roster_name}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-slate-600">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                    签到初始: {template.check_in_init_rule === 'not_checked_in' ? '未签到' :
                      template.check_in_init_rule === 'checked_in' ? '已签到' :
                      template.check_in_init_rule === 'late' ? '迟到' : '缺勤'}
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-400 mb-4">
                更新于 {new Date(template.updated_at).toLocaleString()}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleViewDetail(template)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  查看
                </button>
                <button
                  onClick={() => handleOpenEdit(template)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  编辑
                </button>
                <button
                  onClick={() => handleExport(template)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors"
                  title="导出"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(template)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDetailModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">模板详情 - {selectedTemplate.name}</h2>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">布局</label>
                  <p className="text-slate-800">{selectedTemplate.rows} × {selectedTemplate.cols}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">记录数</label>
                  <p className="text-slate-800">{selectedTemplate.item_count} 条</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">关联名单</label>
                  <p className="text-slate-800">{selectedTemplate.roster_name || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">签到初始状态</label>
                  <p className="text-slate-800">{selectedTemplate.check_in_init_rule}</p>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-500 mb-1">备注</label>
                  <p className="text-slate-800">{selectedTemplate.remark || '-'}</p>
                </div>
              </div>

              <h3 className="text-sm font-medium text-slate-700 mb-3">分配明细</h3>
              <div className="bg-slate-50 rounded-lg border border-slate-200 max-h-64 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 text-slate-600">席位</th>
                      <th className="text-left px-4 py-2 text-slate-600">学号</th>
                      <th className="text-left px-4 py-2 text-slate-600">姓名</th>
                      <th className="text-left px-4 py-2 text-slate-600">班级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTemplate.items?.map((item: SeatingTemplateItem, i: number) => (
                      <tr key={i} className="border-t border-slate-200">
                        <td className="px-4 py-2 text-slate-800">{item.seat_number}</td>
                        <td className="px-4 py-2 text-slate-600">{item.student_no}</td>
                        <td className="px-4 py-2 text-slate-800">{item.student_name}</td>
                        <td className="px-4 py-2 text-slate-500">{item.class_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">编辑模板</h2>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">模板名称</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                <textarea
                  value={editForm.remark}
                  onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">签到初始状态</label>
                <select
                  value={editForm.checkInInitRule}
                  onChange={(e) => setEditForm({ ...editForm, checkInInitRule: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="not_checked_in">未签到</option>
                  <option value="checked_in">已签到</option>
                  <option value="late">迟到</option>
                  <option value="absent">缺勤</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleEdit}
                className="px-4 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
              >
                <Save className="w-4 h-4 inline mr-1" />
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">导入模板</h2>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">选择 JSON 文件</label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-cyan-400 transition-colors">
                  <FileJson className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                  <p className="text-sm text-slate-600 mb-2">点击或拖拽文件到此处</p>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportFileSelect}
                    className="hidden"
                    id="template-import"
                  />
                  <label
                    htmlFor="template-import"
                    className="inline-block px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm rounded-lg cursor-pointer transition-colors"
                  >
                    选择文件
                  </label>
                </div>
              </div>

              {importError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {importError}
                  </p>
                </div>
              )}

              {importPreview && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-emerald-800 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    预览信息
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-emerald-600">名称：</span>
                      <span className="text-emerald-800">{importPreview.name}</span>
                    </div>
                    <div>
                      <span className="text-emerald-600">布局：</span>
                      <span className="text-emerald-800">{importPreview.rows} × {importPreview.cols}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-emerald-600">记录数：</span>
                      <span className="text-emerald-800">{importPreview.items.length} 条</span>
                    </div>
                    {importPreview.remark && (
                      <div className="col-span-2">
                        <span className="text-emerald-600">备注：</span>
                        <span className="text-emerald-800">{importPreview.remark}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleImport}
                disabled={!importPreview}
                className="px-4 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                导入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
