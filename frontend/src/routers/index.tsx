import {BrowserRouter as Router, Route, Routes} from 'react-router-dom'
import Login from'../pages/Login'
import Register from'../pages/Register'
import Library from '../pages/Library'
import Reader from '../pages/Reader'
import Profile from '../pages/Profile'
import Review from '../pages/Review'
import Settings from '../pages/Settings'
import Layout from '../Layout'
import PublicLayout from '../components/PublicLayout'
import ProtectedRoute from '../components/ProtectedRouter'

function RouterContainer() {
  return (
    <Router>
      <Routes>
        {/* Public routes with minimal titlebar (desktop drag) */}
        <Route element={<PublicLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Protected routes with full Layout */}
        <Route element={
          <ProtectedRoute>
            <Layout/>
          </ProtectedRoute>
        }>
          <Route path="/" element={<Library />} />
          <Route path="/library" element={<Library />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/review" element={<Review />} />
        </Route>

        {/* Protected routes without Layout (no titlebar) */}
        <Route path="/reader/:id" element={
          <ProtectedRoute>
            <Reader />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  )
}

export default RouterContainer