import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 简单验证
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }

    try {
      // 发送登录请求到后端 - 现在使用JSON格式
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // 登录成功，保存token并跳转
        localStorage.setItem('token', data.access_token);
        navigate('/library'); // 跳转到图书馆页面
      } else {
        setError(data.detail || '登录失败，请检查用户名和密码');
      }
    } catch (err) {
      setError('网络错误，请稍后再试');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br to-indigo-100 flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-md min-w-[350px] bg-white rounded-xl shadow-lg p-6 sm:p-8 space-y-6 mx-auto lg:min-w-[800px] lg:w-auto lg:max-w-2xl">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">欢迎回来</h2>
          <p className="mt-2 text-gray-600">请登录您的账户</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="输入用户名"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="输入密码"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                记住我
              </label>
            </div>

            <div className="text-sm">
              <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
                忘记密码?
              </a>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            登录
          </button>
        </form>

        <div className="text-center text-sm text-gray-600">
          还没有账户?{' '}
          <a href="/register" className="font-medium text-blue-600 hover:text-blue-500">
            注册
          </a>
        </div>
      </div>
    </div>
  );
}

export default Login;