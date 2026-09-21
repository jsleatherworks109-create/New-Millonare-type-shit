import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { AuthProvider } from './lib/auth'
import { Admin } from './pages/Admin'
import { AppLayout } from './pages/AppLayout'
import { Billing } from './pages/Billing'
import { Dashboard } from './pages/Dashboard'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Pricing } from './pages/Pricing'
import { ProductPage } from './pages/ProductPage'
import { PublicDrop } from './pages/PublicDrop'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/d/:slug" element={<PublicDrop />} />
          <Route
            path="/app"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="billing" element={<Billing />} />
            <Route path="admin" element={<Admin />} />
            <Route path=":slug" element={<ProductPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
