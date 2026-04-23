import { useEffect, useState } from 'react';

interface User {
  id: number;
  username: string;
  email: string;
}

const readStoredUser = (): User | null => {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch (e) {
    console.error('Failed to parse user data:', e);
    return null;
  }
};

const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(() => readStoredUser());

  useEffect(() => {
    const syncFromStorage = () => {
      const token = localStorage.getItem('token');
      setIsAuthenticated(!!token);
      setUser(readStoredUser());
    };

    syncFromStorage();
    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
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