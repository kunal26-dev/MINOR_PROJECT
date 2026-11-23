import { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Check, ClipboardList, Plus, Send, Trash2 } from 'lucide-react';
import { apiRequest } from './api.js';

const blankQuestion = () => ({
  prompt: '',
  options: ['', '', '', ''],
  correctOption: 0,
  marks: 1,
  explanation: '',
});
const localDateTimeMin = () => {
  const local = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const formatDate = (value) => new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));

export default function TestsPage({ token, user, subjects, onUnauthorized }) {
  const [tests, setTests] = useState([]);
  const [marks, setMarks] = useState(null);
  const [selectedTest, setSelectedTest] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '', subject: '', scheduledAt: '', maxAttempts: 1, questions: [blankQuestion()] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function showError(requestError) {
    if (requestError.status === 401) {
      setError('Your session expired. Please sign in again.');
      onUnauthorized();
      return;
    }
    setError(requestError.details?.length
      ? `${requestError.message}: ${requestError.details.join(', ')}`
      : requestError.message || 'Something went wrong. Please try again.');
  }

  async function loadTests() {
    setLoading(true);
    setError('');
    try {
      const testData = await apiRequest('/tests', { token });
      setTests(testData.tests || []);
    } catch (requestError) {
      showError(requestError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTests();
  }, [token, user.role, user.semester]);

  function updateQuestion(index, key, value) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [key]: value } : question
      ),
    }));
  }

  function updateOption(questionIndex, optionIndex, value) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, index) =>
        index === questionIndex
          ? { ...question, options: question.options.map((option, i) => i === optionIndex ? value : option) }
          : question
      ),
    }));
  }

  async function createTest(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiRequest('/tests', {
        token,
        method: 'POST',
        body: {
          ...draft,
          scheduledAt: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : null,
          maxAttempts: Number(draft.maxAttempts),
          questions: draft.questions.map((question) => ({
            ...question,
            marks: Number(question.marks),
            correctOption: Number(question.correctOption),
          })),
        },
      });
      setDraft({ title: '', description: '', subject: '', scheduledAt: '', maxAttempts: 1, questions: [blankQuestion()] });
      setCreating(false);
      setMessage(draft.scheduledAt
        ? `Your MCQ test is scheduled for ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.scheduledAt))}.`
        : 'Your MCQ test is published and ready for students.');
      await loadTests();
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswers(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await apiRequest(`/tests/${selectedTest._id}/attempts`, {
        token,
        method: 'POST',
        body: { answers },
      });
      setResult(data);
      await loadTests();
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function toggleMarks(test) {
    if (marks?.test?._id === test._id) {
      setMarks(null);
      return;
    }
    setError('');
    try {
      const data = await apiRequest(`/tests/${test._id}/marks`, { token });
      setMarks(data);
    } catch (requestError) {
      showError(requestError);
    }
  }

  function startTest(test) {
    setSelectedTest(test);
    setAnswers(Array(test.questions.length).fill(null));
    setResult(null);
    setError('');
  }

  if (selectedTest) {
    if (result) {
      return (
        <section className="tests-page">
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <button type="button" className="text-button back-button" onClick={() => { setSelectedTest(null); setResult(null); }}><ArrowLeft size={15} /> Back to tests</button>
          <div className="test-result-card card-panel">
            <span className="section-kicker">TEST MARK</span>
            <h2>{selectedTest.title}</h2>
            <strong className="test-score">{result.attempt.score}<span> / {result.attempt.totalMarks}</span></strong>
            <p>{result.attempt.percentage}% · Attempt {result.attempt.attemptNumber} of {result.attempt.maxAttempts}</p>
          </div>
          <div className="test-result-list">
            {result.results.map((question, index) => (
              <article className={`test-question-card card-panel ${question.isCorrect ? 'answer-correct' : 'answer-incorrect'}`} key={question.questionId}>
                <span className="question-count">Question {index + 1} · {question.marksEarned}/{question.marks} marks</span>
                <h3>{question.prompt}</h3>
                <p><strong>Your answer:</strong> {question.selectedOption === null ? 'Not answered' : question.options[question.selectedOption]}</p>
                <p><strong>Correct answer:</strong> {question.options[question.correctOption]}</p>
                {question.explanation && <p className="answer-explanation">{question.explanation}</p>}
              </article>
            ))}
          </div>
        </section>
      );
    }

    return (
      <section className="tests-page">
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <button type="button" className="text-button back-button" onClick={() => setSelectedTest(null)}><ArrowLeft size={15} /> Back to tests</button>
        <div className="section-heading"><div><span className="section-kicker">{selectedTest.subject?.subjectName || 'ASSESSMENT'}</span><h2>{selectedTest.title}</h2><p>{selectedTest.description}</p></div></div>
        <form className="test-question-list" onSubmit={submitAnswers}>
          {selectedTest.questions.map((question, index) => (
            <fieldset className="test-question-card card-panel" key={question._id}>
              <legend>Question {index + 1} <span>· {question.marks} {question.marks === 1 ? 'mark' : 'marks'}</span></legend>
              <p>{question.prompt}</p>
              <div className="test-options">
                {question.options.map((option, optionIndex) => (
                  <label className={`test-option ${answers[index] === optionIndex ? 'selected' : ''}`} key={`${question._id}-${optionIndex}`}>
                    <input type="radio" name={`question-${question._id}`} checked={answers[index] === optionIndex} onChange={() => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? optionIndex : answer))} />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Marking test…' : <><Send size={15} /> Submit answers</>}</button>
        </form>
      </section>
    );
  }

  return (
    <div className="tests-page">
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {message && <div className="notice notice-success" role="status">{message}</div>}
      {marks && (
        <section className="teacher-marks card-panel">
          <div className="section-heading"><div><span className="section-kicker">STUDENT RESULTS</span><h2>{marks.test.title}</h2></div><button className="text-button" onClick={() => setMarks(null)}>Close</button></div>
          {marks.marks.length ? <div className="marks-list">{marks.marks.map((mark) => <div className="marks-row" key={`${mark.student._id}-${mark.attemptNumber}`}><div><strong>{mark.student.name}</strong><span>Attempt {mark.attemptNumber} · {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(mark.submittedAt))}</span></div><strong>{mark.score}/{mark.totalMarks}<small> ({mark.percentage}%)</small></strong></div>)}</div> : <p className="muted-copy">No students have submitted this test yet.</p>}
        </section>
      )}

      <div className="section-heading tests-heading">
        <div><span className="section-kicker">{user.role === 'Teacher' ? 'ASSESSMENT CENTER' : 'YOUR ASSESSMENTS'}</span><h2>{user.role === 'Teacher' ? 'Weekly MCQ tests' : 'Available tests'}</h2></div>
        {user.role === 'Teacher' && <button className="button button-primary" onClick={() => { setCreating((current) => !current); setMessage(''); }}><Plus size={16} /> Create a test</button>}
      </div>

      {creating && user.role === 'Teacher' && (
        <form className="test-create-form card-panel" onSubmit={createTest}>
          <div className="section-heading"><div><span className="section-kicker">NEW ASSESSMENT</span><h2>Create weekly MCQ test</h2></div></div>
          <label>Test title<input required minLength="3" maxLength="150" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Week 4 · Data Structures" /></label>
          <label>Description<textarea maxLength="1000" rows="2" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Instructions or topics covered" /></label>
          <div className="test-form-grid">
            <label>Subject<select required value={draft.subject} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}><option value="">Choose subject</option>{subjects.map((subject) => <option value={subject._id} key={subject._id}>{subject.subjectName}</option>)}</select></label>
            <label>Attempts per student<input type="number" min="1" max="20" required value={draft.maxAttempts} onChange={(event) => setDraft((current) => ({ ...current, maxAttempts: event.target.value }))} /></label>
          </div>
          <label>Schedule for later<input type="datetime-local" min={localDateTimeMin()} value={draft.scheduledAt} onChange={(event) => setDraft((current) => ({ ...current, scheduledAt: event.target.value }))} /><small>Leave blank to publish and make the test available immediately.</small></label>
          {draft.questions.map((question, index) => (
            <fieldset className="question-editor" key={index}>
              <div className="question-editor-heading"><legend>Question {index + 1}</legend>{draft.questions.length > 1 && <button type="button" className="text-button danger-text" onClick={() => setDraft((current) => ({ ...current, questions: current.questions.filter((_, questionIndex) => questionIndex !== index) }))}><Trash2 size={14} /> Remove</button>}</div>
              <label>Question text<textarea required maxLength="1000" rows="2" value={question.prompt} onChange={(event) => updateQuestion(index, 'prompt', event.target.value)} /></label>
              <div className="test-options-editor">
                {question.options.map((option, optionIndex) => (
                  <label key={optionIndex}>Option {optionIndex + 1}<input required maxLength="300" value={option} onChange={(event) => updateOption(index, optionIndex, event.target.value)} /></label>
                ))}
              </div>
              <div className="test-form-grid">
                <label>Correct option<select value={question.correctOption} onChange={(event) => updateQuestion(index, 'correctOption', Number(event.target.value))}>{question.options.map((_, optionIndex) => <option value={optionIndex} key={optionIndex}>Option {optionIndex + 1}</option>)}</select></label>
                <label>Marks<input type="number" min="1" max="100" required value={question.marks} onChange={(event) => updateQuestion(index, 'marks', event.target.value)} /></label>
              </div>
              <label>Answer explanation<textarea maxLength="1000" rows="2" value={question.explanation} onChange={(event) => updateQuestion(index, 'explanation', event.target.value)} placeholder="Shown to students after they submit" /></label>
            </fieldset>
          ))}
          <div className="test-form-actions">
            <button type="button" className="button button-outline" onClick={() => setDraft((current) => ({ ...current, questions: [...current.questions, blankQuestion()] }))}><Plus size={15} /> Add question</button>
            <button type="submit" className="button button-primary" disabled={busy || !subjects.length}>{busy ? 'Saving…' : <><Check size={15} /> {draft.scheduledAt ? 'Schedule test' : 'Publish test'}</>}</button>
          </div>
        </form>
      )}

      {loading ? <div className="resource-skeletons"><div className="resource-skeleton" /><div className="resource-skeleton" /></div> : tests.length ? (
        <div className="test-card-list">
          {tests.map((test) => {
            const isScheduled = test.scheduledAt && new Date(test.scheduledAt) > new Date();
            const questionCount = test.questionCount ?? test.questions.length;
            return (
              <article className="test-card card-panel" key={test._id}>
                <div className="test-card-icon"><ClipboardList size={20} /></div>
                <div className="test-card-main">
                  <span className="section-kicker">{test.subject?.subjectName || 'GENERAL'}</span>
                  <h3>{test.title}</h3>
                  <p>{test.description || 'Multiple-choice assessment'} · {questionCount} questions · up to {test.maxAttempts} {test.maxAttempts === 1 ? 'attempt' : 'attempts'}</p>
                  <small>{isScheduled ? `Scheduled for ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(test.scheduledAt))}` : `Created by ${test.createdBy?.name || 'Teacher'} · ${new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(test.createdAt))}`}</small>
                  {user.role === 'Student' && test.latestAttempt && <div className="test-latest-mark">Latest: {test.latestAttempt.score}/{test.latestAttempt.totalMarks} ({test.latestAttempt.percentage}%) · best {test.bestPercentage}%</div>}
                </div>
                {user.role === 'Student' && <button className="button button-primary" disabled={isScheduled || test.attemptsUsed >= test.maxAttempts} onClick={() => startTest(test)}>{isScheduled ? 'Scheduled' : test.attemptsUsed >= test.maxAttempts ? 'Attempts used' : test.attemptsUsed ? 'Retake test' : 'Start test'}</button>}
                {user.role === 'Teacher' && test.createdBy?._id === user._id && <button className="button button-outline" onClick={() => toggleMarks(test)}><BarChart3 size={15} /> View marks</button>}
              </article>
            );
          })}
        </div>
      ) : <div className="empty-state card-panel"><div className="empty-icon"><ClipboardList size={23} /></div><h3>No tests available yet</h3><p>{user.role === 'Teacher' ? 'Create a weekly MCQ test for your students.' : 'Teacher-created tests will appear here.'}</p></div>}
    </div>
  );
}
