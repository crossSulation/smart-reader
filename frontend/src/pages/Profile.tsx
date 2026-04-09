import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PersonOutlined, EmailOutlined } from '@mui/icons-material';
import { TextField, Button, Alert, Paper, Typography, Box, Avatar } from '@mui/material';

interface User {
  id: number;
  username: string;
  email: string;
}

function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to fetch user profile');
      }

      const userData = await res.json();
      setUser(userData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError(t('profile.errors.fillAllFields'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('profile.errors.passwordMismatch'));
      return;
    }

    if (newPassword.length < 6) {
      setError(t('profile.errors.passwordTooShort'));
      return;
    }

    setUpdating(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to change password');
      }

      setSuccess(t('profile.success.passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  if (!user) return <div className="p-8 text-center">Failed to load profile</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Typography variant="h4" component="h1" gutterBottom>
        {t('profile.pageTitle')}
      </Typography>

      {/* User Info Section */}
      <Paper elevation={2} className="p-6 mb-8">
        <Box display="flex" alignItems="center" mb={3}>
          <Avatar sx={{ width: 64, height: 64, mr: 3, bgcolor: 'primary.main' }}>
            <PersonOutlined sx={{ fontSize: 32 }} />
          </Avatar>
          <Box>
            <Typography variant="h5" component="h2">
              {user.username}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('profile.memberSince')} {new Date().getFullYear()}
            </Typography>
          </Box>
        </Box>

        <Box mb={2}>
          <Box display="flex" alignItems="center" mb={1}>
            <PersonOutlined sx={{ mr: 1, color: 'action.active' }} />
            <Typography variant="body1" fontWeight="medium">
              {t('profile.username')}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" ml={4}>
            {user.username}
          </Typography>
        </Box>

        <Box>
          <Box display="flex" alignItems="center" mb={1}>
            <EmailOutlined sx={{ mr: 1, color: 'action.active' }} />
            <Typography variant="body1" fontWeight="medium">
              {t('profile.email')}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" ml={4}>
            {user.email}
          </Typography>
        </Box>
      </Paper>

      {/* Password Change Section */}
      <Paper elevation={2} className="p-6">
        <Typography variant="h6" component="h2" gutterBottom>
          {t('profile.changePassword')}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {success}
          </Alert>
        )}

        <Box component="form" onSubmit={handlePasswordChange}>
          <TextField
            fullWidth
            type="password"
            label={t('profile.currentPassword')}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            margin="normal"
            required
          />

          <TextField
            fullWidth
            type="password"
            label={t('profile.newPassword')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            margin="normal"
            required
            helperText={t('profile.passwordHint')}
          />

          <TextField
            fullWidth
            type="password"
            label={t('profile.confirmPassword')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            margin="normal"
            required
          />

          <Box mt={3}>
            <Button
              type="submit"
              variant="contained"
              disabled={updating}
              sx={{ mr: 2 }}
            >
              {updating ? t('profile.updating') : t('profile.updatePassword')}
            </Button>
            <Button
              type="button"
              variant="outlined"
              onClick={() => {
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setError('');
                setSuccess('');
              }}
            >
              {t('common.cancel')}
            </Button>
          </Box>
        </Box>
      </Paper>
    </div>
  );
}

export default Profile;