import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StatusProvider } from './lib/status'
import { AppLayout } from './pages/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { ProductPage } from './pages/ProductPage'
import { PublicDrop } from './pages/PublicDrop'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public launch page: the only screen shoppers ever see. */}
        <Route path="/d/:slug" element={<PublicDrop />} />
        <Route
          path="/app"
          element={
            <StatusProvider>
              <AppLayout />
            </StatusProvider>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path=":slug" element={<ProductPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
