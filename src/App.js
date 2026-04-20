import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useSearchParams, NavLink } from 'react-router-dom';
import * as API from './api';
import './App.css';

// ─── Auth Context ────────────────────────────────────────────────────────────
const AuthContext = React.createContext();
function useAuth() { return React.useContext(AuthContext); }

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const Icons = {
  logo: (
    <svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2"/><circle cx="16" cy="16" r="8" stroke="currentColor" strokeWidth="2"/><circle cx="16" cy="16" r="3" fill="currentColor"/></svg>
  ),
  logout: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  phone: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>,
  upload: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>,
  back: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  arrow: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  refresh: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  clock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  users: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  star: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  x: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  shield: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  server: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  play: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  lock: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
};

// ─── Header ──────────────────────────────────────────────────────────────────
function Header() {
  const { isAuth, logout } = useAuth();
  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo-group">
          <div className="logo-icon">{Icons.logo}</div>
          <div>
            <h1 className="logo-text">RingSense</h1>
            <span className="logo-subtitle">Conversation Intelligence</span>
          </div>
        </div>
        {isAuth && (
          <nav className="header-nav">
            <NavLink to="/" end className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              {Icons.phone} Calls
            </NavLink>
            <NavLink to="/settings" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              {Icons.settings} Settings
            </NavLink>
            <button className="btn btn-ghost" onClick={logout}>{Icons.logout} Sign Out</button>
          </nav>
        )}
      </div>
    </header>
  );
}

// ─── Admin Login ─────────────────────────────────────────────────────────────
function AdminLogin() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await API.authLogin(password);
      login(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">{Icons.lock}</div>
          <h2>Dashboard Access</h2>
          <p className="login-desc">Enter your admin password to continue</p>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Admin Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" autoFocus />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : Icons.shield}
            {loading ? 'Authenticating...' : 'Unlock Dashboard'}
          </button>
        </form>
        <div className="login-footer">
          <p style={{fontSize: 12, color: 'var(--text-muted)'}}>All credentials are encrypted server-side with AES-256-GCM</p>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Page ───────────────────────────────────────────────────────────
function SettingsPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('api');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [scheduleStatus, setScheduleStatus] = useState({});
  const [scheduleHistory, setScheduleHistory] = useState([]);
  const [webhookStatus, setWebhookStatus] = useState({});
  const [webhookUrl, setWebhookUrl] = useState('');

  // Form state
  const [form, setForm] = useState({
    rc_server_url: '',
    rc_client_id: '',
    rc_client_secret: '',
    rc_jwt: '',
    sftp_host: '',
    sftp_port: '22',
    sftp_username: '',
    sftp_password: '',
    sftp_private_key: '',
    sftp_remote_path: '/uploads/ringsense',
    sftp_auth_type: 'password',
    schedule_enabled: 'false',
    schedule_frequency: 'daily',
    schedule_time: '02:00',
    schedule_timezone: 'America/Denver',
    schedule_day_of_week: '1',
    schedule_day_of_month: '1',
    schedule_lookback_days: '7',
  });

  const loadConfig = useCallback(async () => {
    try {
      const data = await API.getConfig();
      setConfig(data);
      // Pre-fill form with non-sensitive values, keep masked values as-is
      setForm(prev => ({
        ...prev,
        rc_server_url: data.rc_server_url || 'https://platform.ringcentral.com',
        rc_client_id: data.rc_client_id || '',
        rc_client_secret: data.rc_client_secret || '',
        rc_jwt: data.rc_jwt || '',
        sftp_host: data.sftp_host || '',
        sftp_port: data.sftp_port || '22',
        sftp_username: data.sftp_username || '',
        sftp_password: data.sftp_password || '',
        sftp_private_key: data.sftp_private_key || '',
        sftp_remote_path: data.sftp_remote_path || '/uploads/ringsense',
        sftp_auth_type: data.sftp_auth_type || 'password',
        schedule_enabled: data.schedule_enabled || 'false',
        schedule_frequency: data.schedule_frequency || 'daily',
        schedule_time: data.schedule_time || '02:00',
        schedule_timezone: data.schedule_timezone || 'America/Denver',
        schedule_day_of_week: data.schedule_day_of_week || '1',
        schedule_day_of_month: data.schedule_day_of_month || '1',
        schedule_lookback_days: data.schedule_lookback_days || '7',
      }));
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSchedule = useCallback(async () => {
    try {
      const [sched, hist, wh] = await Promise.all([API.getScheduleStatus(), API.getScheduleHistory(), API.getWebhookStatus()]);
      setScheduleStatus(sched);
      setScheduleHistory(hist);
      setWebhookStatus(wh);
      if (wh.webhookUrl) setWebhookUrl(wh.webhookUrl);
    } catch {}
  }, []);

  useEffect(() => { loadConfig(); loadSchedule(); }, [loadConfig, loadSchedule]);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const showStatus = (type, message) => {
    setStatus({ type, message });
    if (type === 'success') setTimeout(() => setStatus({ type: '', message: '' }), 4000);
  };

  const handleSaveApi = async () => {
    setSaving(true);
    try {
      const updates = {};
      ['rc_server_url', 'rc_client_id'].forEach(k => { updates[k] = form[k]; });
      // Only send secrets if they've been changed (not masked)
      if (form.rc_client_secret && !form.rc_client_secret.startsWith('••••')) updates.rc_client_secret = form.rc_client_secret;
      if (form.rc_jwt && !form.rc_jwt.startsWith('••••')) updates.rc_jwt = form.rc_jwt;
      await API.updateConfig(updates);
      showStatus('success', 'API credentials saved and encrypted.');
      loadConfig();
    } catch (err) {
      showStatus('error', err.message);
    } finally { setSaving(false); }
  };

  const handleSaveSftp = async () => {
    setSaving(true);
    try {
      const updates = {
        sftp_host: form.sftp_host,
        sftp_port: form.sftp_port,
        sftp_username: form.sftp_username,
        sftp_remote_path: form.sftp_remote_path,
        sftp_auth_type: form.sftp_auth_type,
      };
      if (form.sftp_password && !form.sftp_password.startsWith('••••')) updates.sftp_password = form.sftp_password;
      if (form.sftp_private_key && !form.sftp_private_key.startsWith('••••')) updates.sftp_private_key = form.sftp_private_key;
      await API.updateConfig(updates);
      showStatus('success', 'SFTP configuration saved and encrypted.');
      loadConfig();
    } catch (err) {
      showStatus('error', err.message);
    } finally { setSaving(false); }
  };

  const handleSaveSchedule = async () => {
    setSaving(true);
    try {
      await API.updateConfig({
        schedule_enabled: form.schedule_enabled,
        schedule_frequency: form.schedule_frequency,
        schedule_time: form.schedule_time,
        schedule_timezone: form.schedule_timezone,
        schedule_day_of_week: form.schedule_day_of_week,
        schedule_day_of_month: form.schedule_day_of_month,
        schedule_lookback_days: form.schedule_lookback_days,
      });
      if (form.schedule_enabled === 'true') {
        await API.startSchedule();
      } else {
        await API.stopSchedule();
      }
      showStatus('success', 'Schedule configuration saved.');
      loadSchedule();
    } catch (err) {
      showStatus('error', err.message);
    } finally { setSaving(false); }
  };

  const handleTestRc = async () => {
    showStatus('info', 'Testing RingCentral connection...');
    try {
      const res = await API.testRcConnection();
      showStatus('success', res.message);
    } catch (err) {
      showStatus('error', err.message);
    }
  };

  const handleTestSftp = async () => {
    showStatus('info', 'Testing SFTP connection...');
    try {
      const res = await API.testSftp();
      showStatus('success', res.message);
    } catch (err) {
      showStatus('error', err.message);
    }
  };

  const handleUploadNow = async () => {
    showStatus('info', 'Starting manual SFTP upload...');
    try {
      const res = await API.uploadNow(parseInt(form.schedule_lookback_days || '7'));
      showStatus('success', res.message || `Uploaded ${res.recordCount} records to ${res.remoteFile}`);
      loadSchedule();
    } catch (err) {
      showStatus('error', err.message);
    }
  };

  const handleRunScheduleNow = async () => {
    showStatus('info', 'Triggering scheduled job...');
    try {
      await API.runScheduleNow();
      showStatus('success', 'Scheduled upload triggered.');
      loadSchedule();
    } catch (err) {
      showStatus('error', err.message);
    }
  };

  if (loading) return <div className="main-content"><div className="loading-state"><div className="spinner-lg"/><p>Loading configuration...</p></div></div>;

  const sections = [
    { key: 'api', label: 'RingCentral API', icon: Icons.phone },
    { key: 'webhook', label: 'RCX Webhook', icon: Icons.refresh },
    { key: 'sftp', label: 'SFTP Server', icon: Icons.server },
    { key: 'schedule', label: 'Scheduled Uploads', icon: Icons.calendar },
  ];

  const DAYS_OF_WEEK = [
    { value: '0', label: 'Sunday' }, { value: '1', label: 'Monday' }, { value: '2', label: 'Tuesday' },
    { value: '3', label: 'Wednesday' }, { value: '4', label: 'Thursday' }, { value: '5', label: 'Friday' },
    { value: '6', label: 'Saturday' },
  ];

  const TIMEZONES = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Phoenix', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata',
    'Asia/Manila', 'Asia/Tokyo', 'Australia/Sydney', 'UTC',
  ];

  return (
    <div className="main-content">
      <div className="page-header">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="page-desc">Configure API credentials, SFTP server, and scheduled uploads</p>
        </div>
      </div>

      {status.message && (
        <div className={`status-banner ${status.type}`}>
          {status.type === 'success' ? Icons.check : status.type === 'error' ? Icons.x : <span className="spinner" />}
          <span>{status.message}</span>
        </div>
      )}

      <div className="settings-layout">
        <nav className="settings-nav">
          {sections.map(s => (
            <button key={s.key} className={`settings-nav-item ${activeSection === s.key ? 'active' : ''}`} onClick={() => setActiveSection(s.key)}>
              {s.icon}
              <span>{s.label}</span>
              {s.key === 'api' && config.rc_client_id && <span className="nav-badge configured">Configured</span>}
              {s.key === 'sftp' && config.sftp_host && <span className="nav-badge configured">Configured</span>}
              {s.key === 'schedule' && scheduleStatus.active && <span className="nav-badge active-badge">Active</span>}
            </button>
          ))}
          <div className="settings-nav-divider" />
          <div className="security-note">
            {Icons.shield}
            <div>
              <strong>Encrypted Storage</strong>
              <p>All secrets are encrypted at rest using AES-256-GCM. Sensitive fields are never sent to the browser in plaintext.</p>
            </div>
          </div>
        </nav>

        <div className="settings-content">
          {/* ─── RingCentral API Section ──────────────────────────────────── */}
          {activeSection === 'api' && (
            <div className="settings-section">
              <div className="section-header">
                <h3>RingCentral API Credentials</h3>
                <p>Connect to the RingCentral platform to access call recordings and RingSense insights.</p>
              </div>

              <div className="form-group">
                <label>API Server URL</label>
                <input type="text" value={form.rc_server_url} onChange={e => updateField('rc_server_url', e.target.value)} placeholder="https://platform.ringcentral.com" />
                <span className="form-hint">Use https://platform.devtest.ringcentral.com for sandbox</span>
              </div>

              <div className="form-group">
                <label>Client ID</label>
                <input type="text" value={form.rc_client_id} onChange={e => updateField('rc_client_id', e.target.value)} placeholder="Your RingCentral app Client ID" />
              </div>

              <div className="form-group">
                <label>
                  Client Secret
                  {config.rc_client_secret_set && <span className="field-encrypted">Encrypted</span>}
                </label>
                <input type="password" value={form.rc_client_secret} onChange={e => updateField('rc_client_secret', e.target.value)} placeholder={config.rc_client_secret_set ? 'Leave blank to keep current' : 'Enter Client Secret'} />
              </div>

              <div className="form-group">
                <label>
                  JWT Credential
                  {config.rc_jwt_set && <span className="field-encrypted">Encrypted</span>}
                </label>
                <input type="password" value={form.rc_jwt} onChange={e => updateField('rc_jwt', e.target.value)} placeholder={config.rc_jwt_set ? 'Leave blank to keep current' : 'Enter JWT Token'} />
                <span className="form-hint">Generate at <a href="https://developers.ringcentral.com/my-account.html#/credentials" target="_blank" rel="noopener noreferrer">RingCentral Developer Portal</a></span>
              </div>

              <div className="form-actions-row">
                <button className="btn btn-primary" onClick={handleSaveApi} disabled={saving}>
                  {saving ? <span className="spinner" /> : Icons.check}
                  Save API Credentials
                </button>
                <button className="btn btn-secondary" onClick={handleTestRc} disabled={saving}>
                  {Icons.play} Test Connection
                </button>
              </div>
            </div>
          )}

          {/* ─── Webhook Section ─────────────────────────────────────────── */}
          {activeSection === 'webhook' && (
            <div className="settings-section">
              <div className="section-header">
                <h3>RingCX Webhook Subscription</h3>
                <p>RingCX interactions require a webhook subscription to capture call data. RingSense events are pushed to your server in real-time as calls complete.</p>
              </div>

              <div className="form-group">
                <label>Webhook URL</label>
                <input type="text" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder={`${window.location.origin}/api/webhook/ringsense`} />
                <span className="form-hint">This must be publicly accessible. Use your Render URL: https://your-app.onrender.com/api/webhook/ringsense</span>
              </div>

              <div className="schedule-status-card" style={{marginTop: 12, marginBottom: 16}}>
                <h4>Webhook Status</h4>
                <div className="status-grid">
                  <div className="status-item">
                    <span className="status-label">Status</span>
                    <span className={`status-value ${webhookStatus.active ? 'active-text' : ''}`}>
                      {webhookStatus.active ? 'Active' : webhookStatus.expired ? 'Expired' : 'Not subscribed'}
                    </span>
                  </div>
                  <div className="status-item">
                    <span className="status-label">Stored RCX Interactions</span>
                    <span className="status-value">{webhookStatus.storedInteractions || 0}</span>
                  </div>
                  {webhookStatus.expiresAt && (
                    <div className="status-item">
                      <span className="status-label">Expires</span>
                      <span className="status-value">{new Date(webhookStatus.expiresAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="form-actions-row">
                <button className="btn btn-primary" onClick={async () => {
                  showStatus('info', 'Creating webhook subscription...');
                  try {
                    const url = webhookUrl || `${window.location.origin}/api/webhook/ringsense`;
                    const res = await API.subscribeWebhook(url);
                    showStatus('success', res.message);
                    loadSchedule();
                  } catch (err) { showStatus('error', err.message); }
                }}>
                  {Icons.check} Subscribe to RingSense Events
                </button>
                {webhookStatus.active && (
                  <button className="btn btn-secondary" onClick={async () => {
                    try {
                      await API.unsubscribeWebhook();
                      showStatus('success', 'Webhook subscription removed.');
                      loadSchedule();
                    } catch (err) { showStatus('error', err.message); }
                  }}>
                    {Icons.x} Unsubscribe
                  </button>
                )}
                {webhookStatus.storedInteractions > 0 && (
                  <button className="btn btn-secondary" onClick={async () => {
                    try {
                      await API.clearInteractions();
                      showStatus('success', 'Stored interactions cleared (e.g. after switching accounts).');
                      loadSchedule();
                    } catch (err) { showStatus('error', err.message); }
                  }}>
                    {Icons.x} Clear Stored Interactions
                  </button>
                )}
              </div>

              <div className="schedule-status-card" style={{marginTop: 20}}>
                <h4>Subscription Cleanup</h4>
                <p style={{fontSize: 12, color: 'var(--text-muted)', marginBottom: 12}}>
                  If you switched accounts and old subscriptions are still sending events, use these tools to find and delete all subscriptions on the currently authenticated account.
                </p>
                <div className="form-actions-row">
                  <button className="btn btn-secondary" onClick={async () => {
                    try {
                      const res = await API.listAllSubscriptions();
                      showStatus('info', `Found ${res.total} subscription(s) on this account: ${res.subscriptions.map(s => `${s.id} (${s.status})`).join(', ') || 'none'}`);
                    } catch (err) { showStatus('error', err.message); }
                  }}>
                    {Icons.search} List All Subscriptions
                  </button>
                  <button className="btn btn-secondary" style={{borderColor: 'rgba(239,68,68,0.4)', color: '#FCA5A5'}} onClick={async () => {
                    if (!window.confirm('Delete ALL webhook subscriptions on the current account? This cannot be undone.')) return;
                    try {
                      const res = await API.deleteAllSubscriptions();
                      showStatus('success', res.message);
                      loadSchedule();
                    } catch (err) { showStatus('error', err.message); }
                  }}>
                    {Icons.x} Delete All Subscriptions on Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── SFTP Section ────────────────────────────────────────────── */}
          {activeSection === 'sftp' && (
            <div className="settings-section">
              <div className="section-header">
                <h3>SFTP Server Configuration</h3>
                <p>Configure the SFTP destination for call insights data uploads.</p>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>SFTP Host</label>
                  <input type="text" value={form.sftp_host} onChange={e => updateField('sftp_host', e.target.value)} placeholder="sftp.example.com" />
                </div>
                <div className="form-group form-group-sm">
                  <label>Port</label>
                  <input type="text" value={form.sftp_port} onChange={e => updateField('sftp_port', e.target.value)} placeholder="22" />
                </div>
              </div>

              <div className="form-group">
                <label>Remote Upload Path</label>
                <input type="text" value={form.sftp_remote_path} onChange={e => updateField('sftp_remote_path', e.target.value)} placeholder="/uploads/ringsense" />
              </div>

              <div className="form-group">
                <label>Username</label>
                <input type="text" value={form.sftp_username} onChange={e => updateField('sftp_username', e.target.value)} placeholder="sftp_user" />
              </div>

              <div className="auth-tabs" style={{ marginBottom: 16 }}>
                <button className={`auth-tab ${form.sftp_auth_type === 'password' ? 'active' : ''}`} onClick={() => updateField('sftp_auth_type', 'password')}>Password</button>
                <button className={`auth-tab ${form.sftp_auth_type === 'key' ? 'active' : ''}`} onClick={() => updateField('sftp_auth_type', 'key')}>SSH Key</button>
              </div>

              {form.sftp_auth_type === 'password' ? (
                <div className="form-group">
                  <label>
                    Password
                    {config.sftp_password_set && <span className="field-encrypted">Encrypted</span>}
                  </label>
                  <input type="password" value={form.sftp_password} onChange={e => updateField('sftp_password', e.target.value)} placeholder={config.sftp_password_set ? 'Leave blank to keep current' : 'Enter SFTP password'} />
                </div>
              ) : (
                <div className="form-group">
                  <label>
                    SSH Private Key
                    {config.sftp_private_key_set && <span className="field-encrypted">Encrypted</span>}
                  </label>
                  <textarea rows={5} value={form.sftp_private_key} onChange={e => updateField('sftp_private_key', e.target.value)} placeholder={config.sftp_private_key_set ? 'Leave blank to keep current' : 'Paste your SSH private key here'} className="mono-textarea" />
                </div>
              )}

              <div className="form-actions-row">
                <button className="btn btn-primary" onClick={handleSaveSftp} disabled={saving}>
                  {saving ? <span className="spinner" /> : Icons.check}
                  Save SFTP Config
                </button>
                <button className="btn btn-secondary" onClick={handleTestSftp} disabled={saving}>
                  {Icons.play} Test Connection
                </button>
                <button className="btn btn-secondary" onClick={handleUploadNow} disabled={saving}>
                  {Icons.upload} Upload Now
                </button>
              </div>
            </div>
          )}

          {/* ─── Schedule Section ────────────────────────────────────────── */}
          {activeSection === 'schedule' && (
            <div className="settings-section">
              <div className="section-header">
                <h3>Scheduled SFTP Uploads</h3>
                <p>Automatically export and upload new call insights data on a schedule.</p>
              </div>

              <div className="schedule-toggle">
                <label className="toggle-label">
                  <div className={`toggle-switch ${form.schedule_enabled === 'true' ? 'on' : ''}`} onClick={() => updateField('schedule_enabled', form.schedule_enabled === 'true' ? 'false' : 'true')}>
                    <div className="toggle-knob" />
                  </div>
                  <div>
                    <strong>Enable Scheduled Uploads</strong>
                    <p>Automatically upload call insights data to your SFTP server</p>
                  </div>
                </label>
              </div>

              {form.schedule_enabled === 'true' && (
                <>
                  <div className="form-group">
                    <label>Frequency</label>
                    <div className="radio-group">
                      {['daily', 'weekly', 'monthly'].map(freq => (
                        <label key={freq} className={`radio-option ${form.schedule_frequency === freq ? 'selected' : ''}`}>
                          <input type="radio" name="frequency" value={freq} checked={form.schedule_frequency === freq} onChange={e => updateField('schedule_frequency', e.target.value)} />
                          <span>{freq.charAt(0).toUpperCase() + freq.slice(1)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Time of Day</label>
                      <input type="time" value={form.schedule_time} onChange={e => updateField('schedule_time', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Timezone</label>
                      <select value={form.schedule_timezone} onChange={e => updateField('schedule_timezone', e.target.value)}>
                        {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                  </div>

                  {form.schedule_frequency === 'weekly' && (
                    <div className="form-group">
                      <label>Day of Week</label>
                      <select value={form.schedule_day_of_week} onChange={e => updateField('schedule_day_of_week', e.target.value)}>
                        {DAYS_OF_WEEK.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </div>
                  )}

                  {form.schedule_frequency === 'monthly' && (
                    <div className="form-group">
                      <label>Day of Month</label>
                      <select value={form.schedule_day_of_month} onChange={e => updateField('schedule_day_of_month', e.target.value)}>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                          <option key={d} value={String(d)}>{d}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Lookback Period (days)</label>
                    <input type="number" min="1" max="90" value={form.schedule_lookback_days} onChange={e => updateField('schedule_lookback_days', e.target.value)} />
                    <span className="form-hint">How many days of call data to include in each export</span>
                  </div>
                </>
              )}

              <div className="form-actions-row">
                <button className="btn btn-primary" onClick={handleSaveSchedule} disabled={saving}>
                  {saving ? <span className="spinner" /> : Icons.check}
                  Save Schedule
                </button>
                {scheduleStatus.active && (
                  <button className="btn btn-secondary" onClick={handleRunScheduleNow}>
                    {Icons.play} Run Now
                  </button>
                )}
              </div>

              {/* Schedule Status Card */}
              <div className="schedule-status-card">
                <h4>Schedule Status</h4>
                <div className="status-grid">
                  <div className="status-item">
                    <span className="status-label">Status</span>
                    <span className={`status-value ${scheduleStatus.active ? 'active-text' : ''}`}>
                      {scheduleStatus.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {scheduleStatus.cronExpression && (
                    <div className="status-item">
                      <span className="status-label">Cron</span>
                      <span className="status-value mono">{scheduleStatus.cronExpression}</span>
                    </div>
                  )}
                  {scheduleStatus.lastRun && (
                    <div className="status-item">
                      <span className="status-label">Last Run</span>
                      <span className="status-value">{new Date(scheduleStatus.lastRun).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* History */}
              {scheduleHistory.length > 0 && (
                <div className="schedule-history">
                  <h4>Upload History</h4>
                  <div className="history-list">
                    {scheduleHistory.slice(0, 10).map((entry, i) => (
                      <div key={i} className={`history-item ${entry.type}`}>
                        <span className="history-icon">
                          {entry.type === 'success' ? Icons.check : entry.type === 'error' ? Icons.x : Icons.clock}
                        </span>
                        <span className="history-message">{entry.message}</span>
                        <span className="history-time">{new Date(entry.timestamp).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Call List ────────────────────────────────────────────────────────────────
function CallList() {
  const navigate = useNavigate();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [counts, setCounts] = useState({ pbx: 0, rcx: 0 });

  const loadCalls = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await API.getCalls({ dateFrom: new Date(dateFrom).toISOString(), dateTo: new Date(dateTo + 'T23:59:59').toISOString() });
      setCalls(data.records || []);
      setCounts({ pbx: data.pbxCount || 0, rcx: data.rcxCount || 0 });
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { loadCalls(); }, [loadCalls]);

  const filteredCalls = calls.filter(call => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const title = (call.title || '').toLowerCase();
    const fromName = (call.from?.name || '').toLowerCase();
    const toName = (call.to?.name || '').toLowerCase();
    const fromNum = call.from?.phoneNumber || '';
    const toNum = call.to?.phoneNumber || '';
    const speakers = (call.speakerInfo || []).map(s => (s.name || '').toLowerCase()).join(' ');
    return title.includes(q) || fromName.includes(q) || toName.includes(q) || fromNum.includes(q) || toNum.includes(q) || speakers.includes(q);
  });

  const fmtDurSec = (s) => { if(!s)return '0:00'; return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; };
  const fmtDurMs = (ms) => { if(!ms)return null; const s=Math.floor(ms/1000); return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; };
  const fmtDate = (d) => { if(!d) return ''; return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); };
  const fmtTime = (d) => { if(!d) return ''; return new Date(d).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}); };

  // Unified card renderer that works for both PBX and RCX records
  const getCardName = (call, side) => {
    // PBX records have from/to
    if (call.source === 'calllog' && call[side]) {
      return call[side].name || call[side].phoneNumber || 'Unknown';
    }
    // RCX records: parse from title or speakerInfo
    if (call.speakerInfo && call.speakerInfo.length > 0) {
      const idx = side === 'from' ? 0 : Math.min(1, call.speakerInfo.length - 1);
      return call.speakerInfo[idx]?.name || call.speakerInfo[idx]?.phoneNumber || 'Unknown';
    }
    return call.title || 'Unknown';
  };

  const getCardNumber = (call, side) => {
    if (call.source === 'calllog' && call[side]?.phoneNumber && call[side]?.name) {
      return call[side].phoneNumber;
    }
    if (call.speakerInfo) {
      const idx = side === 'from' ? 0 : Math.min(1, call.speakerInfo.length - 1);
      const sp = call.speakerInfo[idx];
      if (sp?.phoneNumber && sp?.name) return sp.phoneNumber;
    }
    return null;
  };

  const getDuration = (call) => {
    if (call.duration) return fmtDurSec(call.duration);
    if (call.recordingDurationMs) return fmtDurMs(call.recordingDurationMs);
    return '0:00';
  };

  const getDirection = (call) => call.callDirection || call.direction || null;
  const getStartTime = (call) => call.recordingStartTime || call.startTime || call.creationTime;

  return (
    <div className="main-content">
      <div className="page-header">
        <div>
          <h2 className="page-title">Call Interactions</h2>
          <p className="page-desc">
            {calls.length} recorded calls found
            {(counts.pbx > 0 || counts.rcx > 0) && (
              <span style={{marginLeft: 8, fontSize: 12}}>
                ({counts.pbx} PBX{counts.rcx > 0 ? `, ${counts.rcx} RingCX` : ''})
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="filters-bar">
        <div className="search-box">
          {Icons.search}
          <input type="text" placeholder="Search by name, number, or title..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <div className="date-filters">
          <div className="date-input-group"><label>From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
          <div className="date-input-group"><label>To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
          <button className="btn btn-secondary" onClick={loadCalls}>{Icons.refresh} Refresh</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-state"><div className="spinner-lg"/><p>Fetching call recordings...</p></div>
      ) : filteredCalls.length === 0 ? (
        <div className="empty-state">{Icons.phone}<h3>No recorded calls found</h3><p>Try adjusting your date range or check API settings. RingCX calls require webhook subscription.</p></div>
      ) : (
        <div className="call-grid">
          {filteredCalls.map(call => {
            const dir = getDirection(call);
            const startTime = getStartTime(call);
            return (
              <div key={call.id} className="call-card" onClick={() => navigate(`/call?id=${encodeURIComponent(call.sourceRecordId)}&domain=${call.domain || 'pbx'}`)}>
                <div className="call-card-top">
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    {dir && (
                      <div className={`direction-badge ${dir.toLowerCase()}`}>
                        {dir === 'Inbound' ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="7 7 17 17"/><polyline points="17 7 17 17 7 17"/></svg> : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="17 7 7 17"/><polyline points="7 7 7 17 17 17"/></svg>}
                        {dir}
                      </div>
                    )}
                    <span className={`domain-badge ${call.domain}`}>{call.domain === 'rcx' ? 'RingCX' : call.domain === 'rcv' ? 'Video' : 'PBX'}</span>
                  </div>
                  <span className="call-duration">{getDuration(call)}</span>
                </div>

                {call.source === 'webhook' && call.title ? (
                  <div className="call-title-row">
                    <span className="call-title">{call.title}</span>
                    {call.speakerInfo && call.speakerInfo.length > 0 && (
                      <span className="call-speakers">{call.speakerInfo.map(s => s.name || 'Unknown').join(', ')}</span>
                    )}
                  </div>
                ) : (
                  <div className="call-participants">
                    <div className="participant">
                      <span className="participant-label">From</span>
                      <span className="participant-name">{getCardName(call, 'from')}</span>
                      {getCardNumber(call, 'from') && <span className="participant-number">{getCardNumber(call, 'from')}</span>}
                    </div>
                    <div className="call-arrow">{Icons.arrow}</div>
                    <div className="participant">
                      <span className="participant-label">To</span>
                      <span className="participant-name">{getCardName(call, 'to')}</span>
                      {getCardNumber(call, 'to') && <span className="participant-number">{getCardNumber(call, 'to')}</span>}
                    </div>
                  </div>
                )}

                <div className="call-card-footer">
                  <span className="call-date">{fmtDate(startTime)}</span>
                  <span className="call-time">{fmtTime(startTime)}</span>
                  {call.result && <span className="call-result">{call.result}</span>}
                </div>
                <div className="card-hover-hint"><span>View Insights</span>{Icons.arrow}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Call Detail ──────────────────────────────────────────────────────────────
function CallDetail() {
  const [searchParams] = useSearchParams();
  const recordingId = searchParams.get('id') || '';
  const domain = searchParams.get('domain') || 'pbx';
  const navigate = useNavigate();
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('transcript');

  useEffect(() => {
    (async () => {
      setLoading(true); setError('');
      try {
        const data = await API.getInsights(recordingId, domain);
        setInsights(data);
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, [recordingId, domain]);

  const fmtMs = (ms) => { if(!ms&&ms!==0)return''; const t=Math.floor(ms/1000); return `${Math.floor(t/60)}:${(t%60).toString().padStart(2,'0')}`; };
  const fmtDur = (ms) => { if(!ms)return'N/A'; const t=Math.floor(ms/1000); return `${Math.floor(t/60)}m ${t%60}s`; };

  const getTranscript = () => insights?.insights?.Transcript || [];
  const getSummary = () => insights?.insights?.Summary || insights?.insights?.BulletedSummary || null;
  const getHighlights = () => insights?.insights?.Highlights || null;
  const getNextSteps = () => insights?.insights?.NextSteps || null;
  const getAIScore = () => insights?.insights?.AIScore || null;
  const getCallNotes = () => insights?.insights?.CallNotes || null;

  if (loading) return <div className="main-content"><div className="loading-state"><div className="spinner-lg"/><p>Loading RingSense insights...</p></div></div>;

  if (error) return (
    <div className="main-content">
      <button className="btn btn-ghost back-btn" onClick={() => navigate('/')}>{Icons.back} Back to Calls</button>
      <div className="error-banner">{error}</div>
    </div>
  );

  const tabs = [
    { key: 'transcript', label: 'Transcript' },
    { key: 'summary', label: 'Summary' },
    { key: 'highlights', label: 'Highlights' },
    { key: 'nextsteps', label: 'Next Steps' },
    { key: 'notes', label: 'Call Notes' },
  ];

  return (
    <div className="main-content">
      <button className="btn btn-ghost back-btn" onClick={() => navigate('/')}>{Icons.back} Back to Calls</button>
      {insights && (
        <>
          <div className="detail-header">
            <div className="detail-title-row">
              <h2 className="page-title">{insights.title || `Recording ${recordingId}`}</h2>
              {insights.callDirection && <span className={`direction-badge ${insights.callDirection.toLowerCase()}`}>{insights.callDirection}</span>}
            </div>
            <div className="detail-meta">
              {insights.recordingStartTime && <span className="meta-item">{Icons.clock}{new Date(insights.recordingStartTime).toLocaleString()}</span>}
              {insights.recordingDurationMs && <span className="meta-item">{Icons.phone}{fmtDur(insights.recordingDurationMs)}</span>}
              {insights.speakerInfo && <span className="meta-item">{Icons.users}{insights.speakerInfo.length} speakers</span>}
            </div>
            {insights.speakerInfo?.length > 0 && (
              <div className="speakers-row">
                {insights.speakerInfo.map((s,i) => (
                  <div key={i} className="speaker-chip">
                    <div className="speaker-avatar" style={{background:`hsl(${i*137.5},50%,60%)`}}>{(s.name||s.speakerId||`S${i}`).charAt(0).toUpperCase()}</div>
                    <span>{s.name||s.speakerId||`Speaker ${i+1}`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {getAIScore() && (
            <div className="ai-score-bar">
              <span className="ai-score-label">AI Confidence Score</span>
              <div className="ai-score-track"><div className="ai-score-fill" style={{width:`${getAIScore().value||getAIScore().score||0}%`}}/></div>
              <span className="ai-score-value">{getAIScore().value||getAIScore().score||'N/A'}</span>
            </div>
          )}

          <div className="detail-tabs">
            {tabs.map(t => <button key={t.key} className={`tab ${activeTab===t.key?'active':''}`} onClick={()=>setActiveTab(t.key)}>{t.label}</button>)}
          </div>

          <div className="detail-content">
            {activeTab === 'transcript' && (
              <div className="transcript-panel">
                {getTranscript().length > 0 ? getTranscript().map((seg,i) => (
                  <div key={i} className="transcript-segment">
                    <div className="segment-header">
                      <span className="speaker-tag" style={{borderColor:`hsl(${(insights.speakerInfo?.findIndex(s=>s.speakerId===seg.speakerId)??i)*137.5},50%,60%)`}}>{seg.name||seg.speakerId||`Speaker ${i}`}</span>
                      {seg.start !== undefined && <span className="segment-time">{fmtMs(seg.start)}</span>}
                    </div>
                    <p className="segment-text">{seg.text||seg.value||seg.transcript}</p>
                  </div>
                )) : <div className="empty-tab">No transcript data available for this recording.</div>}
              </div>
            )}
            {activeTab === 'summary' && (
              <div className="summary-panel">
                {getSummary() ? (Array.isArray(getSummary()) ? getSummary().map((item,i) => <div key={i} className="summary-item">{typeof item==='string'?item:(item.text||item.value||JSON.stringify(item))}</div>) : <div className="summary-item">{typeof getSummary()==='string'?getSummary():(getSummary().text||getSummary().value||JSON.stringify(getSummary(),null,2))}</div>) : <div className="empty-tab">No summary data available.</div>}
              </div>
            )}
            {activeTab === 'highlights' && (
              <div className="highlights-panel">
                {getHighlights() ? (Array.isArray(getHighlights())?getHighlights():[getHighlights()]).map((item,i) => <div key={i} className="highlight-card"><div className="highlight-icon">{Icons.star}</div><p>{typeof item==='string'?item:(item.text||item.value||JSON.stringify(item))}</p></div>) : <div className="empty-tab">No highlights available.</div>}
              </div>
            )}
            {activeTab === 'nextsteps' && (
              <div className="nextsteps-panel">
                {getNextSteps() ? (Array.isArray(getNextSteps())?getNextSteps():[getNextSteps()]).map((item,i) => <div key={i} className="nextstep-item"><div className="nextstep-number">{i+1}</div><p>{typeof item==='string'?item:(item.text||item.value||JSON.stringify(item))}</p></div>) : <div className="empty-tab">No next steps available.</div>}
              </div>
            )}
            {activeTab === 'notes' && (
              <div className="notes-panel">
                {getCallNotes() ? <div className="notes-content">{typeof getCallNotes()==='string'?getCallNotes():(getCallNotes().text||getCallNotes().value||JSON.stringify(getCallNotes(),null,2))}</div> : <div className="empty-tab">No call notes available.</div>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── App Root ────────────────────────────────────────────────────────────────
function App() {
  const [isAuth, setIsAuth] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Restore token from sessionStorage
        const storedToken = sessionStorage.getItem('admin_token');
        if (storedToken) API.setAdminToken(storedToken);
        const res = await API.authCheck();
        setIsAuth(res.authenticated);
      } catch {
        setIsAuth(false);
      } finally { setCheckingAuth(false); }
    })();
  }, []);

  const login = (token) => { API.setAdminToken(token); setIsAuth(true); };
  const logout = async () => { try { await API.authLogout(); } catch {} API.setAdminToken(null); setIsAuth(false); };

  if (checkingAuth) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg-primary)'}}><div className="spinner-lg"/></div>;

  return (
    <AuthContext.Provider value={{ isAuth, login, logout }}>
      <Router>
        <div className="app">
          <Header />
          <Routes>
            <Route path="/" element={isAuth ? <CallList /> : <AdminLogin />} />
            <Route path="/settings" element={isAuth ? <SettingsPage /> : <AdminLogin />} />
            <Route path="/call" element={isAuth ? <CallDetail /> : <AdminLogin />} />
          </Routes>
        </div>
      </Router>
    </AuthContext.Provider>
  );
}

export default App;
