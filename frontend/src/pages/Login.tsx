import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LockOutlined } from '@mui/icons-material';
import {
  Avatar, Box, Button, Container, TextField, Typography, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';

const Login: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirm, setForgotConfirm] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.access_token);
        
        // Store user info if provided in response
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
        } else {
          // Store basic user info if not provided
          localStorage.setItem('user', JSON.stringify({ username }));
        }
        
        navigate('/library', { replace: true });
      } else {
        const data = await response.json().catch(() => ({}));
        const msg = Array.isArray(data.detail) ? data.detail[0]?.msg || t('login.error') : data.detail || t('login.error');
        setError(msg);
      }
    } catch {
      setError(t('login.error'));
    }
  };

  const handleForgotSubmit = async () => {
    setForgotError('');
    setForgotSuccess('');
    if (!forgotUsername.trim() || !forgotNewPassword) {
      setForgotError('Please fill in all fields.');
      return;
    }
    if (forgotNewPassword !== forgotConfirm) {
      setForgotError('Passwords do not match.');
      return;
    }
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: forgotUsername, new_password: forgotNewPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setForgotSuccess('Password reset successfully. You can now log in.');
        setForgotUsername('');
        setForgotNewPassword('');
        setForgotConfirm('');
      } else {
        setForgotError(data.detail || 'Reset failed. Please check your username.');
      }
    } catch {
      setForgotError('Network error. Please try again.');
    }
  };

  const handleForgotClose = () => {
    setForgotOpen(false);
    setForgotUsername('');
    setForgotNewPassword('');
    setForgotConfirm('');
    setForgotError('');
    setForgotSuccess('');
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Avatar sx={{ m: 1, bgcolor: 'secondary.main' }}>
          <LockOutlined />
        </Avatar>
        <Typography component="h1" variant="h5">
          {t('login.pageTitle')}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ width: '100%', mt: 2 }}>
            {error}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1, width: '100%' }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="username"
            label={t('login.usernameLabel')}
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label={t('login.passwordLabel')}
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Box sx={{ textAlign: 'right', mt: 0.5 }}>
            <Button
              size="small"
              variant="text"
              onClick={() => setForgotOpen(true)}
              sx={{ textTransform: 'none', p: 0, minWidth: 0 }}
            >
              Forgot password?
            </Button>
          </Box>
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 2, mb: 2 }}
          >
            {t('login.loginButton')}
          </Button>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => navigate('/register')}
          >
            {t('login.registerLink')}
          </Button>
        </Box>
      </Box>

      {/* Forgot password dialog */}
      <Dialog open={forgotOpen} onClose={handleForgotClose} maxWidth="xs" fullWidth>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          {forgotError && <Alert severity="error" sx={{ mb: 2 }}>{forgotError}</Alert>}
          {forgotSuccess && <Alert severity="success" sx={{ mb: 2 }}>{forgotSuccess}</Alert>}
          <TextField
            margin="normal"
            required
            fullWidth
            label="Username"
            value={forgotUsername}
            onChange={(e) => setForgotUsername(e.target.value)}
            autoFocus
          />
          <TextField
            margin="normal"
            required
            fullWidth
            label="New Password"
            type="password"
            value={forgotNewPassword}
            onChange={(e) => setForgotNewPassword(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            label="Confirm New Password"
            type="password"
            value={forgotConfirm}
            onChange={(e) => setForgotConfirm(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleForgotClose}>Cancel</Button>
          <Button variant="contained" onClick={handleForgotSubmit} disabled={!!forgotSuccess}>
            Reset Password
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Login;