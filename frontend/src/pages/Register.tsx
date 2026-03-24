import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 简单验证
    if (!username || !email || !password || !confirmPassword) {
      setError('请填写所有必填字段');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (password.length < 6) {
      setError('密码长度至少为6位');
      return;
    }

    try {
      // 发送注册请求到后端
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          username, 
          email, 
          password 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setError('');
        
        // 注册成功后跳转到登录页
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        setError(data.detail || '注册失败，请稍后再试');
      }
    } catch (err) {
      setError('网络错误，请稍后再试');
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md min-w-[350px] bg-white rounded-xl shadow-lg p-6 sm:p-8 space-y-6 mx-auto lg:min-w-[800px] lg:w-auto lg:max-w-2xl">
          <div className="mx-auto bg-green-100 text-green-700 rounded-full w-16 h-16 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">注册成功！</h2>
          <p className="text-gray-600 mb-6">您的账户已创建成功，正在跳转到登录页面...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md min-w-[350px] bg-white rounded-xl shadow-lg p-8 space-y-6 mx-auto lg:min-w-[800px] lg:w-auto lg:max-w-2xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-800">创建账户</h2>
          <p className="mt-2 text-gray-600">加入Smart Reader大家庭</p>
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
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              邮箱地址
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="输入邮箱地址"
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

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              确认密码
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="再次输入密码"
            />
          </div>

          <div className="flex items-center">
            <input
              id="terms"
              name="terms"
              type="checkbox"
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="terms" className="ml-2 block text-sm text-gray-700">
              我同意 <a href="#" className="text-blue-600 hover:underline">服务条款</a> 和 <a href="#" className="text-blue-600 hover:underline">隐私政策</a>
            </label>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            注册
          </button>
        </form>

        <div className="text-center text-sm text-gray-600">
          已有账户?{' '}
          <a href="/login" className="font-medium text-blue-600 hover:text-blue-500">
            登录
          </a>
        </div>
      </div>
    </div>
  );
}

export default Register;