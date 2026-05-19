import {BrowserRouter as Router, Route, Routes} from 'react-router-dom'
import Login from'../pages/Login'
import Register from'../pages/Register'
import Library from '../pages/Library'
import Reader from '../pages/Reader'
import Profile from '../pages/Profile'
import Review from '../pages/Review'
import Layout from '../Layout'
import ProtectedRoute from '../components/ProtectedRouter'

function RouterContainer() {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* Protected routes with Layout (header shown) */}
        <Route element={
          <ProtectedRoute>
            <Layout/>
          </ProtectedRoute>
        }>
          <Route path="/" element={<Library />} />
          <Route path="/library" element={<Library />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/review" element={<Review />} />
        </Route>

        {/* Protected routes without Layout (no header) */}
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