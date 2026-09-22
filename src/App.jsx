import { Link, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { AdminLayout, Layout } from './components/Layout.jsx'
import { RequireAdmin, RequireStudent } from './components/ProtectedRoute.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import MyExams from './pages/student/MyExams.jsx'
import Instructions from './pages/student/Instructions.jsx'
import Player from './pages/student/Player.jsx'
import Result from './pages/student/Result.jsx'
import Dashboard from './pages/admin/Dashboard.jsx'
import Exams from './pages/admin/Exams.jsx'
import Questions from './pages/admin/Questions.jsx'
import Students from './pages/admin/Students.jsx'
import Results from './pages/admin/Results.jsx'

function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="card">
        <h1 className="font-display text-4xl font-extrabold text-[#0B2F6B]">404</h1>
        <p className="mt-2 text-sm text-slate-500">This page does not exist.</p>
        <Link to="/" className="btn-primary mt-5">Back home</Link>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public chrome: header + ticker + footer */}
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="login" element={<Login />} />
          <Route path="my-exams" element={<RequireStudent><MyExams /></RequireStudent>} />
          <Route path="instructions/:examId" element={<RequireStudent><Instructions /></RequireStudent>} />
          <Route path="result/:examId" element={<RequireStudent><Result /></RequireStudent>} />
        </Route>

        {/* Exam runner — own chrome (timer topbar), no site header */}
        <Route path="exam/:examId" element={<RequireStudent><Player /></RequireStudent>} />

        {/* Admin console */}
        <Route path="admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Dashboard />} />
          <Route path="exams" element={<Exams />} />
          <Route path="questions" element={<Questions />} />
          <Route path="students" element={<Students />} />
          <Route path="results" element={<Results />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}
