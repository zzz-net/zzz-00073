import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import ToastContainer from '@/components/Toast'
import Sessions from '@/pages/Sessions'
import Roster from '@/pages/Roster'
import SessionDetail from '@/pages/SessionDetail'
import Export from '@/pages/Export'
import Templates from '@/pages/Templates'

export default function App() {
  return (
    <Router>
      <ToastContainer />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Sessions />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/session/:id" element={<SessionDetail />} />
          <Route path="/export" element={<Export />} />
        </Route>
      </Routes>
    </Router>
  )
}
