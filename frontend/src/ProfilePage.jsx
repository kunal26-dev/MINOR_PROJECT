import { useEffect, useState } from 'react';
import { BookOpen, Check, ClipboardList, LogOut, Pencil, Plus, Save, Trash2, UserRound } from 'lucide-react';
import { apiRequest } from './api.js';

const emptyProgress = { subject: '', topic: '', completion: 0, notes: '' };
const formatDate = (value) => value
  ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
  : 'today';

export default function ProfilePage({ token, user, onUserUpdate, onLogout, onUnauthorized, onOpenTests }) {
  const [profileForm, setProfileForm] = useState({
    name: user.name,
    email: user.email,
    bio: user.bio || '',
    semester: user.semester || '',
  });
  const [progressForm, setProgressForm] = useState(emptyProgress);
  const [editingId, setEditingId] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [progress, setProgress] = useState([]);
  const [report, setReport] = useState(null);
  const [availableTests, setAvailableTests] = useState([]);
  const [marks, setMarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const maxSemester = Number.isInteger(user.semester) ? user.semester : 8;

  function showError(requestError) {
    if (requestError.status === 401) {
      setError('Your session expired. Please sign in again.');
      onUnauthorized();
      return;
    }
    setError(requestError.message || 'Something went wrong. Please try again.');
  }

  async function loadProfileData() {
    setLoading(true);
    setError('');
    try {
      const [dashboard, progressData, testsData, marksData] = await Promise.all([
        apiRequest('/dashboard', { token }),
        apiRequest('/progress', { token }),
        user.role === 'Student' ? apiRequest('/tests', { token }) : Promise.resolve(null),
        user.role === 'Student' ? apiRequest('/tests/my-attempts', { token }) : Promise.resolve(null),
      ]);
      setSubjects(dashboard.subjects || []);
      setProgress(progressData.progress || []);
      setReport(progressData.report || null);
      setAvailableTests(testsData?.tests || []);
      setMarks(marksData?.attempts || []);
    } catch (requestError) {
      showError(requestError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setProfileForm({
      name: user.name,
      email: user.email,
      bio: user.bio || '',
      semester: user.semester || '',
    });
  }, [user]);

  useEffect(() => {
    loadProfileData();
  }, [token, user.role, user.semester]);

  async function saveProfile(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await apiRequest('/users/profile', {
        token,
        method: 'PUT',
        body: profileForm,
      });
      await onUserUpdate(data.user);
      setMessage('Profile details saved.');
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function saveProgress(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(editingId ? `/progress/${editingId}` : '/progress', {
        token,
        method: editingId ? 'PATCH' : 'POST',
        body: {
          ...progressForm,
          completion: Number(progressForm.completion),
        },
      });
      setProgressForm(emptyProgress);
      setEditingId('');
      await loadProfileData();
      setMessage(editingId ? 'Progress updated.' : 'Progress added to your report.');
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy(false);
    }
  }

  function editProgress(entry) {
    setEditingId(entry._id);
    setProgressForm({
      subject: entry.subject?._id || '',
      topic: entry.topic,
      completion: entry.completion,
      notes: entry.notes || '',
    });
    setMessage('');
  }

  async function deleteProgress(id) {
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/progress/${id}`, { token, method: 'DELETE' });
      await loadProfileData();
      if (editingId === id) {
        setEditingId('');
        setProgressForm(emptyProgress);
      }
      setMessage('Progress entry removed.');
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-page">
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {message && <div className="notice notice-success" role="status">{message}</div>}

      <section className="profile-identity card-panel">
        <div className="profile-identity-avatar"><UserRound size={25} /></div>
        <div>
          <span className="section-kicker">YOUR PROFILE</span>
          <h2>{user.name}</h2>
          <p>{user.role}{user.role === 'Student' && user.semester ? ` · Semester ${user.semester}` : ''} · Member since {formatDate(user.createdAt)}</p>
        </div>
        <button className="button button-outline profile-logout-button" type="button" onClick={onLogout}><LogOut size={15} /> Sign out</button>
      </section>

      <section className="profile-section card-panel">
        <div className="section-heading">
          <div><span className="section-kicker">ACCOUNT</span><h2>Profile details</h2></div>
        </div>
        <form className="profile-edit-form" onSubmit={saveProfile}>
          <label>Name<input required minLength="2" maxLength="60" value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>Email<input type="email" required value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} /></label>
          {user.role === 'Student' && (
            <label>Semester
              <select required value={profileForm.semester} onChange={(event) => setProfileForm((current) => ({ ...current, semester: event.target.value }))}>
                <option value="">Select your semester</option>
                {Array.from({ length: maxSemester }, (_, index) => <option key={index + 1} value={index + 1}>Semester {index + 1}</option>)}
              </select>
              <small className="field-hint">You can choose your current or an earlier semester. Ask an administrator to advance your semester.</small>
            </label>
          )}
          <label className="profile-bio-field">About you<textarea maxLength="300" rows="3" value={profileForm.bio} onChange={(event) => setProfileForm((current) => ({ ...current, bio: event.target.value }))} placeholder="Share a little about your learning goals." /></label>
          <button className="button button-primary" type="submit" disabled={busy}><Save size={15} /> Save profile</button>
        </form>
      </section>

      <section className="profile-section">
        <div className="section-heading">
          <div><span className="section-kicker">PROGRESS REPORT</span><h2>Your learning progress</h2></div>
        </div>
        {loading ? <div className="resource-skeletons"><div className="resource-skeleton" /></div> : (
          <>
            <div className="progress-report-grid">
              <article className="progress-stat card-panel"><span>Average completion</span><strong>{report?.averageCompletion || 0}%</strong></article>
              <article className="progress-stat card-panel"><span>Topics completed</span><strong>{report?.completedTopics || 0}<small> / {report?.trackedTopics || 0}</small></strong></article>
              <article className="progress-stat card-panel"><span>Tests taken</span><strong>{report?.testAttempts || 0}</strong></article>
              <article className="progress-stat card-panel"><span>Average test mark</span><strong>{report?.averageTestPercentage || 0}%</strong></article>
            </div>
            {report?.subjects?.length > 0 && (
              <div className="subject-progress-list card-panel">
                <h3><BookOpen size={17} /> Progress by subject</h3>
                {report.subjects.map((subject) => (
                  <div className="subject-progress-row" key={subject.subjectId}>
                    <div><strong>{subject.subjectName}</strong><span>{subject.completed}/{subject.topics} topics complete</span></div>
                    <div className="progress-track"><span style={{ width: `${subject.averageCompletion}%` }} /></div>
                    <strong>{subject.averageCompletion}%</strong>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="profile-section card-panel">
        <div className="section-heading">
          <div><span className="section-kicker">PERSONAL GOALS</span><h2>Track a topic</h2></div>
        </div>
        <form className="progress-edit-form" onSubmit={saveProgress}>
          <label>Subject<select required value={progressForm.subject} onChange={(event) => setProgressForm((current) => ({ ...current, subject: event.target.value }))}><option value="">Choose subject</option>{subjects.map((subject) => <option value={subject._id} key={subject._id}>{subject.subjectName}</option>)}</select></label>
          <label>Topic or goal<input required minLength="2" maxLength="120" value={progressForm.topic} onChange={(event) => setProgressForm((current) => ({ ...current, topic: event.target.value }))} placeholder="e.g. Complete tree traversal exercises" /></label>
          <label>Completion (%)<input type="number" min="0" max="100" step="1" required value={progressForm.completion} onChange={(event) => setProgressForm((current) => ({ ...current, completion: event.target.value }))} /></label>
          <label>Notes<textarea maxLength="500" rows="2" value={progressForm.notes} onChange={(event) => setProgressForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional notes about your progress" /></label>
          <div className="progress-form-actions">
            <button className="button button-primary" type="submit" disabled={busy || !subjects.length}>{editingId ? <Save size={15} /> : <Plus size={15} />}{editingId ? 'Update progress' : 'Add to report'}</button>
            {editingId && <button className="button button-outline" type="button" onClick={() => { setEditingId(''); setProgressForm(emptyProgress); }}>Cancel</button>}
          </div>
        </form>
      </section>

      <section className="profile-section">
        <div className="section-heading"><div><span className="section-kicker">YOUR TRACKED GOALS</span><h2>Progress entries</h2></div></div>
        {loading ? <p className="muted-copy">Loading progress…</p> : progress.length ? (
          <div className="progress-entry-list">
            {progress.map((entry) => (
              <article className="progress-entry card-panel" key={entry._id}>
                <div className="progress-entry-top"><span className="subject-pill">{entry.subject?.subjectName || 'Subject'}</span><strong>{entry.completion}%</strong></div>
                <h3>{entry.topic}</h3>
                <div className="progress-track"><span style={{ width: `${entry.completion}%` }} /></div>
                {entry.notes && <p>{entry.notes}</p>}
                <div className="progress-entry-actions">
                  {entry.completion === 100 && <span className="completed-label"><Check size={14} /> Complete</span>}
                  <button type="button" className="text-button" onClick={() => editProgress(entry)}><Pencil size={14} /> Edit</button>
                  <button type="button" className="text-button danger-text" disabled={busy} onClick={() => deleteProgress(entry._id)}><Trash2 size={14} /> Remove</button>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="empty-state card-panel"><div className="empty-icon"><ClipboardList size={23} /></div><h3>No progress entries yet</h3><p>Add a topic above to start building your progress report.</p></div>}
      </section>

      {user.role === 'Student' && (
        <section className="profile-section">
          <div className="section-heading">
            <div><span className="section-kicker">ASSESSMENTS</span><h2>Published tests</h2></div>
            <button type="button" className="button button-outline" onClick={onOpenTests}>Open tests</button>
          </div>
          {loading ? <p className="muted-copy">Loading published tests…</p> : availableTests.length ? (
            <div className="test-card-list">
              {availableTests.slice(0, 5).map((availableTest) => {
                const isScheduled = availableTest.scheduledAt && new Date(availableTest.scheduledAt) > new Date();
                return (
                  <article className="test-card card-panel" key={availableTest._id}>
                    <div className="test-card-icon"><ClipboardList size={20} /></div>
                    <div className="test-card-main">
                      <span className="section-kicker">{availableTest.subject?.subjectName || 'ASSESSMENT'}</span>
                      <h3>{availableTest.title}</h3>
                      <p>{availableTest.description || 'Multiple-choice assessment'} · {availableTest.questionCount ?? availableTest.questions.length} questions</p>
                      <small>{isScheduled
                        ? `Scheduled for ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(availableTest.scheduledAt))}`
                        : 'Available now'}</small>
                    </div>
                    <button type="button" className="button button-outline" onClick={onOpenTests}>View</button>
                  </article>
                );
              })}
              {availableTests.length > 5 && <button type="button" className="text-button" onClick={onOpenTests}>View all {availableTests.length} tests</button>}
            </div>
          ) : <p className="muted-copy">Published tests for your semester will appear here.</p>}

          <div className="section-heading profile-marks-heading"><div><span className="section-kicker">RESULTS</span><h2>Recent test marks</h2></div></div>
          {marks.length ? (
            <div className="marks-list card-panel">
              {marks.slice(0, 5).map((mark) => (
                <div className="marks-row" key={mark._id}>
                  <div><strong>{mark.test?.title || 'Test'}</strong><span>{mark.test?.subject?.subjectName || 'Subject'} · attempt {mark.attemptNumber}</span></div>
                  <strong>{mark.score}/{mark.totalMarks}<small> ({mark.percentage}%)</small></strong>
                </div>
              ))}
            </div>
          ) : <p className="muted-copy">Your test marks will appear here after you complete a test.</p>}
        </section>
      )}
    </div>
  );
}
