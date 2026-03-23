import {BrowserRouter as Router, Route, Routes} from 'react-router-dom'
import Login from'../pages/Login'
import Register from'../pages/Register'
import Library from '../pages/Libary'
import Reader from '../pages/Reader'

function RouterContainer() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reader" element={<Reader />} />
      </Routes>
    </Router>
  )
}

export default RouterContainer