import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PersonOutlined, EmailOutlined } from '@mui/icons-material';
import { TextField, Button, Alert, Paper, Typography, Box, Avatar, MenuItem } from '@mui/material';

interface User {
  id: number;
  username: string;
  email: string;
}

interface PersonalizationProfile {
  user_id: number;
  explanation_level: 'beginner' | 'intermediate' | 'expert';
  study_goal: string | null;
  weak_topics: string[];
  frequently_reviewed_tags: string[];
}

interface WeeklySummary {
  user_id: number;
  period_days: number;
  pages_read: number;
  notes_created: number;
  flashcards_created: number;
  reviews_completed: number;
  review_accuracy: number;
  top_weak_topics: string[];
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
  const [profileSaving, setProfileSaving] = useState(false);
  const [personalization, setPersonalization] = useState<PersonalizationProfile | null>(null);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [studyGoalInput, setStudyGoalInput] = useState('');
  const [weakTopicsInput, setWeakTopicsInput] = useState('');
  const [reviewedTagsInput, setReviewedTagsInput] = useState('');

  const fetchUserProfile = useCallback(async () => {
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
    }
  }, [navigate]);

  const fetchPersonalizationProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/personalization/profile', {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch personalization profile');
      }

      const data: PersonalizationProfile = await res.json();
      setPersonalization(data);
      setStudyGoalInput(data.study_goal || '');
      setWeakTopicsInput((data.weak_topics || []).join(', '));
      setReviewedTagsInput((data.frequently_reviewed_tags || []).join(', '));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load personalization profile');
    }
  }, []);

  const fetchWeeklySummary = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics/weekly-summary', {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch weekly summary');
      }

      const data: WeeklySummary = await res.json();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load weekly summary');
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      await fetchUserProfile();
      await fetchPersonalizationProfile();
      await fetchWeeklySummary();
      setLoading(false);
    };
    bootstrap();
  }, [fetchUserProfile, fetchPersonalizationProfile, fetchWeeklySummary]);

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
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
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

  const handlePersonalizationSave = async () => {
    if (!personalization) return;

    setProfileSaving(true);
    setError('');
    setSuccess('');
    try {
      const weakTopics = weakTopicsInput
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const reviewedTags = reviewedTagsInput
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      const res = await fetch('/api/personalization/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          explanation_level: personalization.explanation_level,
          study_goal: studyGoalInput,
          weak_topics: weakTopics,
          frequently_reviewed_tags: reviewedTags,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to save personalization settings');
      }

      const data: PersonalizationProfile = await res.json();
      setPersonalization(data);
      setSuccess('Personalization settings saved.');
      await fetchWeeklySummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save personalization settings');
    } finally {
      setProfileSaving(false);
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

      {/* Personalization Settings Section */}
      <Paper elevation={2} className="p-6 mb-8">
        <Typography variant="h6" component="h2" gutterBottom>
          {t('profile.personalizationTitle', 'Personalization Settings')}
        </Typography>

        <TextField
          select
          fullWidth
          margin="normal"
          label={t('profile.explanationLevel', 'Explanation Level')}
          value={personalization?.explanation_level || 'intermediate'}
          onChange={(e) =>
            setPersonalization((prev) =>
              prev
                ? {
                    ...prev,
                    explanation_level: e.target.value as PersonalizationProfile['explanation_level'],
                  }
                : prev
            )
          }
        >
          <MenuItem value="beginner">{t('profile.levelBeginner', 'Beginner')}</MenuItem>
          <MenuItem value="intermediate">{t('profile.levelIntermediate', 'Intermediate')}</MenuItem>
          <MenuItem value="expert">{t('profile.levelExpert', 'Expert')}</MenuItem>
        </TextField>

        <TextField
          fullWidth
          margin="normal"
          label={t('profile.studyGoal', 'Study Goal')}
          placeholder={t('profile.studyGoalPlaceholder', 'e.g. Learn distributed systems fundamentals')}
          value={studyGoalInput}
          onChange={(e) => setStudyGoalInput(e.target.value)}
        />

        <TextField
          fullWidth
          margin="normal"
          label={t('profile.weakTopics', 'Weak Topics')}
          placeholder={t('profile.weakTopicsPlaceholder', 'topic1, topic2, topic3')}
          value={weakTopicsInput}
          onChange={(e) => setWeakTopicsInput(e.target.value)}
          helperText={t('profile.commaSeparatedHint', 'Use comma-separated values')}
        />

        <TextField
          fullWidth
          margin="normal"
          label={t('profile.reviewedTags', 'Frequently Reviewed Tags')}
          placeholder={t('profile.reviewedTagsPlaceholder', 'tag1, tag2, tag3')}
          value={reviewedTagsInput}
          onChange={(e) => setReviewedTagsInput(e.target.value)}
          helperText={t('profile.commaSeparatedHint', 'Use comma-separated values')}
        />

        <Box mt={2}>
          <Button
            variant="contained"
            onClick={handlePersonalizationSave}
            disabled={profileSaving || !personalization}
          >
            {profileSaving ? t('profile.saving', 'Saving...') : t('profile.savePersonalization', 'Save Settings')}
          </Button>
        </Box>
      </Paper>

      {/* Weekly Summary Section */}
      <Paper elevation={2} className="p-6 mb-8">
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" component="h2">
            {t('profile.weeklySummary', 'Weekly Learning Summary')}
          </Typography>
          <Button variant="outlined" size="small" onClick={fetchWeeklySummary}>
            {t('common.refresh', 'Refresh')}
          </Button>
        </Box>

        {summary ? (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={2}>
              {t('profile.summaryPeriod', 'Last {{days}} days', { days: summary.period_days })}
            </Typography>
            <Box display="grid" gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap={2}>
              <Paper variant="outlined" className="p-3">
                <Typography variant="caption" color="text.secondary">{t('profile.pagesRead', 'Pages Read')}</Typography>
                <Typography variant="h6">{summary.pages_read}</Typography>
              </Paper>
              <Paper variant="outlined" className="p-3">
                <Typography variant="caption" color="text.secondary">{t('profile.notesCreated', 'Notes Created')}</Typography>
                <Typography variant="h6">{summary.notes_created}</Typography>
              </Paper>
              <Paper variant="outlined" className="p-3">
                <Typography variant="caption" color="text.secondary">{t('profile.flashcardsCreated', 'Flashcards Created')}</Typography>
                <Typography variant="h6">{summary.flashcards_created}</Typography>
              </Paper>
              <Paper variant="outlined" className="p-3">
                <Typography variant="caption" color="text.secondary">{t('profile.reviewAccuracy', 'Review Accuracy')}</Typography>
                <Typography variant="h6">{summary.review_accuracy}%</Typography>
              </Paper>
            </Box>
            <Box mt={2}>
              <Typography variant="body2" fontWeight="medium">
                {t('profile.topWeakTopics', 'Top Weak Topics')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {summary.top_weak_topics.length > 0
                  ? summary.top_weak_topics.join(', ')
                  : t('profile.noWeakTopics', 'No weak topics detected this week.')}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">{t('profile.noSummary', 'Summary is not available yet.')}</Typography>
        )}
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