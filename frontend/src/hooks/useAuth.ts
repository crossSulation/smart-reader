import { useEffect, useState } from 'react';

interface User {
  id: number;
  username: string;
  email: string;
}

const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // 检查本地存储中的token
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
    
    // 如果有token，可以考虑解码或获取用户信息
    if (token) {
      // 这里可以根据需要从后端获取用户信息
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error('Failed to parse user data:', e);
        }
      }
    }
  }, []);

  const login = (token: string, userData: User) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
  };

  return { isAuthenticated, user, login, logout };
};

export default useAuth;