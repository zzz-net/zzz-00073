import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import sessionRoutes from './routes/sessions.js'
import rosterRoutes from './routes/rosters.js'
import assignmentRoutes from './routes/assignments.js'
import swapRequestRoutes from './routes/swapRequests.js'
import attendanceRoutes from './routes/attendance.js'
import logRoutes from './routes/logs.js'
import exportRoutes from './routes/export.js'
import seatingDraftRoutes from './routes/seatingDrafts.js'
import seatingTemplateRoutes from './routes/seatingTemplates.js'

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/sessions', sessionRoutes)
app.use('/api/sessions/:sessionId/draft', seatingDraftRoutes)
app.use('/api/rosters', rosterRoutes)
app.use('/api/assignments', assignmentRoutes)
app.use('/api/swap-requests', swapRequestRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/logs', logRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/seating-templates', seatingTemplateRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', error)
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
