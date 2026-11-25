import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Check, ClipboardList, Plus, UploadCloud } from 'lucide-react';
import { apiRequest, downloadProtectedPdf } from './api.js';

const formatDate = (value) => new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

export default function AssignmentsPage({ token, user, subjects, onUnauthorized }) {
  const [assignments, setAssignments] = useState([]);
  const [submissionView, setSubmissionView] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '', semester: '', subject: '', deadline: '', file: null });
  const [uploadFiles, setUploadFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function showError(requestError) {
    if (requestError.status === 401) {
      onUnauthorized();
      return;
    }
    setError(requestError.details?.length
      ? `${requestError.message}: ${requestError.details.join(', ')}`
      : requestError.message || 'Something went wrong.');
  }

  async function loadAssignments() {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest('/assignments', { token });
      setAssignments(data.assignments || []);
    } catch (requestError) {
      showError(requestError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssignments();
  }, [token, user.role, user.semester]);

  async function createAssignment(event) {
    event.preventDefault();
    if (!draft.file) {
      setError('Choose a PDF assignment file.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('title', draft.title);
      formData.append('description', draft.description);
      formData.append('semester', draft.semester);
      formData.append('subject', draft.subject);
      formData.append('deadline', draft.deadline);
      formData.append('file', draft.file);
      await apiRequest('/assignments', { token, method: 'POST', body: formData });
      setDraft({ title: '', description: '', semester: '', subject: '', deadline: '', file: null });
      setCreating(false);
      setMessage('Assignment published successfully.');
      await loadAssignments();
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function submitAssignment(assignment) {
    const file = uploadFiles[assignment._id];
    if (!file) {
      setError('Choose a PDF file for this assignment.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      await apiRequest(`/assignments/${assignment._id}/submissions`, { token, method: 'POST', body: formData });
      setUploadFiles((current) => ({ ...current, [assignment._id]: null }));
      setMessage(`Your PDF submission for "${assignment.title}" was uploaded.`);
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function viewSubmissions(assignment) {
    setError('');
    try {
      const data = await apiRequest(`/assignments/${assignment._id}/submissions`, { token });
      setSubmissionView(data.assignment);
      setSubmissions(data.submissions || []);
    } catch (requestError) {
      showError(requestError);
    }
  }

  const semesterGroups = useMemo(() => {
    const groups = new Map();
    assignments.forEach((assignment) => {
      const semester = assignment.semester || assignment.subject?.semester || 0;
      if (!groups.has(semester)) groups.set(semester, []);
      groups.get(semester).push(assignment);
    });
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [assignments]);
  const subjectsForSemester = subjects.filter((subject) => String(subject.semester) === draft.semester);

  return (
    <div className="assignments-page">
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {message && <div className="notice notice-success" role="status">{message}</div>}

      {submissionView && (
        <section className="teacher-marks card-panel assignment-submissions">
          <div className="section-heading">
            <div><span className="section-kicker">STUDENT SUBMISSIONS</span><h2>{submissionView.title}</h2></div>
            <button className="text-button" type="button" onClick={() => { setSubmissionView(null); setSubmissions([]); }}>Close</button>
          </div>
          {submissions.length ? (
            <div className="marks-list">
              {submissions.map((submission) => (
                <div className="marks-row" key={submission._id}>
                  <div><strong>{submission.student?.name || 'Student'}</strong><span>{submission.student?.email} · submitted {formatDate(submission.createdAt)}</span></div>
                  <button className="button button-outline" type="button" onClick={() => downloadProtectedPdf(`/assignments/submissions/${submission._id}/download`, token, submission.originalFileName)}>
                    <ArrowDownToLine size={15} /> {submission.originalFileName}
                  </button>
                </div>
              ))}
            </div>
          ) : <p className="muted-copy">No students have submitted this assignment yet.</p>}
        </section>
      )}

      <div className="section-heading tests-heading">
        <div><span className="section-kicker">{user.role === 'Teacher' ? 'ASSIGNMENT CENTER' : 'YOUR ASSIGNMENTS'}</span><h2>{user.role === 'Teacher' ? 'Semester assignments' : 'Assignment submissions'}</h2></div>
        {user.role === 'Teacher' && <button className="button button-primary" type="button" onClick={() => setCreating((current) => !current)}><Plus size={16} /> Create assignment</button>}
      </div>

      {creating && user.role === 'Teacher' && (
        <form className="test-create-form card-panel" onSubmit={createAssignment}>
          <div className="section-heading"><div><span className="section-kicker">NEW ASSIGNMENT</span><h2>Upload assignment PDF</h2></div></div>
          <label>Assignment title<input required minLength="3" maxLength="150" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Database normalization worksheet" /></label>
          <label>Description<textarea maxLength="2000" rows="3" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Instructions for students" /></label>
          <div className="test-form-grid">
            <label>Semester<select required value={draft.semester} onChange={(event) => setDraft((current) => ({ ...current, semester: event.target.value, subject: '' }))}><option value="">Choose semester</option>{Array.from({ length: 8 }, (_, index) => <option value={String(index + 1)} key={index + 1}>Semester {index + 1}</option>)}</select></label>
            <label>Subject<select required disabled={!draft.semester} value={draft.subject} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}><option value="">Choose subject</option>{subjectsForSemester.map((subject) => <option value={subject._id} key={subject._id}>{subject.subjectName}</option>)}</select></label>
          </div>
          <div className="test-form-grid">
            <label>Deadline<input type="datetime-local" required value={draft.deadline} onChange={(event) => setDraft((current) => ({ ...current, deadline: event.target.value }))} /></label>
          </div>
          <label>Assignment PDF<input type="file" accept="application/pdf,.pdf" required onChange={(event) => setDraft((current) => ({ ...current, file: event.target.files?.[0] || null }))} /></label>
          <div className="test-form-actions">
            <button type="submit" className="button button-primary" disabled={busy || !draft.subject}><Check size={15} /> Publish assignment</button>
          </div>
        </form>
      )}

      {loading ? <div className="resource-skeletons"><div className="resource-skeleton" /><div className="resource-skeleton" /></div> : semesterGroups.length ? (
        <div className="semester-resource-groups">
          {semesterGroups.map(([semester, items]) => (
            <section className="semester-resource-group" key={semester}>
              <div className="semester-group-heading"><h3>{semester ? `Semester ${semester} assignments` : 'Assignments'}</h3><span>{items.length} {items.length === 1 ? 'assignment' : 'assignments'}</span></div>
              <div className="test-card-list">
                {items.map((assignment) => {
                  const closed = new Date(assignment.deadline) <= new Date();
                  return (
                    <article className="test-card card-panel" key={assignment._id}>
                      <div className="test-card-icon"><ClipboardList size={20} /></div>
                      <div className="test-card-main">
                        <span className="section-kicker">{assignment.subject?.subjectName || 'GENERAL'}</span>
                        <h3>{assignment.title}</h3>
                        <p>{assignment.description || 'PDF assignment'}</p>
                        <small>{closed ? 'Deadline passed' : `Deadline: ${formatDate(assignment.deadline)}`}</small>
                      </div>
                      <div className="assignment-card-actions">
                        <button className="button button-outline" type="button" onClick={() => downloadProtectedPdf(`/assignments/${assignment._id}/download`, token, assignment.originalFileName)}>
                          <ArrowDownToLine size={15} /> PDF
                        </button>
                        {user.role === 'Teacher' && <button className="button button-outline" type="button" onClick={() => viewSubmissions(assignment)}>Submissions</button>}
                        {user.role === 'Student' && (
                          <div className="assignment-submit">
                            <input type="file" accept="application/pdf,.pdf" aria-label={`Upload PDF for ${assignment.title}`} onChange={(event) => setUploadFiles((current) => ({ ...current, [assignment._id]: event.target.files?.[0] || null }))} />
                            <button className="button button-primary" type="button" disabled={closed || busy} onClick={() => submitAssignment(assignment)}>
                              <UploadCloud size={15} /> {closed ? 'Closed' : 'Submit PDF'}
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-state card-panel"><div className="empty-icon"><ClipboardList size={23} /></div><h3>No assignments available yet</h3><p>{user.role === 'Teacher' ? 'Create a PDF assignment for a subject and semester.' : 'Teacher-created assignments will appear here.'}</p></div>
      )}
    </div>
  );
}
