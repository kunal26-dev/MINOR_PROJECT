import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Plus, Save, Trash2 } from 'lucide-react';
import { apiRequest } from './api.js';

const blankUnit = (unitNumber = 1) => ({ unitNumber, title: '', topics: [{ title: '' }] });
const emptyDraft = () => ({ subject: '', semester: '', units: [] });
const getUnitNumber = (unit, index) => unit.unitNumber || index + 1;

function getErrorMessage(error) {
  if (error?.status === 401) return 'Your session expired. Please sign in again.';
  if (error?.details?.length) return `${error.message}: ${error.details.join(', ')}`;
  return error?.message || 'Something went wrong. Please try again.';
}

export default function SyllabusPage({ token, user, subjects: availableSubjects, onUnauthorized }) {
  const [syllabi, setSyllabi] = useState([]);
  const [subjects, setSubjects] = useState(availableSubjects || []);
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const [teacherSemester, setTeacherSemester] = useState('');
  const [teacherSubjectId, setTeacherSubjectId] = useState('');
  const [studentSyllabusId, setStudentSyllabusId] = useState('');
  const [unitIndex, setUnitIndex] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingSyllabusId, setSavingSyllabusId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadSyllabi() {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest('/syllabi', { token });
      setSyllabi(data.syllabi || []);
      if (user.role === 'Teacher' && !availableSubjects?.length) {
        const subjectData = await apiRequest('/subjects', { token });
        setSubjects(subjectData.subjects || []);
      }
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized();
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSyllabi();
  }, [token, user.role, user.semester]);

  useEffect(() => {
    setSubjects(availableSubjects || []);
  }, [availableSubjects]);

  useEffect(() => {
    if (user.role !== 'Student' || !syllabi.length) return;
    const selected = syllabi.find((syllabus) => syllabus._id === studentSyllabusId);
    if (!selected) {
      setStudentSyllabusId(syllabi[0]._id);
      setUnitIndex(getUnitNumber(syllabi[0].units[0], 0));
    } else if (!selected.units.some((unit, index) => getUnitNumber(unit, index) === unitIndex)) {
      setUnitIndex(getUnitNumber(selected.units[0], 0));
    }
  }, [syllabi, studentSyllabusId, user.role]);

  const subjectsForSemester = useMemo(
    () => subjects.filter((subject) => String(subject.semester) === teacherSemester),
    [subjects, teacherSemester]
  );
  const selectedStudentSyllabus = syllabi.find((syllabus) => syllabus._id === studentSyllabusId);
  const teacherSyllabus = syllabi.find((syllabus) => syllabus.subject?._id === draft.subject);
  const selectedStudentUnit = selectedStudentSyllabus?.units.find((unit, index) => getUnitNumber(unit, index) === unitIndex);
  const totalStudentTopics = syllabi.reduce((count, syllabus) =>
    count + syllabus.units.reduce((unitCount, unit) => unitCount + unit.topics.length, 0), 0);
  const completedStudentTopics = syllabi.reduce((count, syllabus) => {
    const completed = new Set(syllabus.completedTopics || []);
    return count + syllabus.units.reduce((unitCount, unit) =>
      unitCount + unit.topics.filter((topic) => completed.has(topic._id)).length, 0);
  }, 0);
  const semesterProgress = totalStudentTopics
    ? Math.round((completedStudentTopics / totalStudentTopics) * 100)
    : 0;
  const selectedSubjectTopics = selectedStudentSyllabus?.units.flatMap((unit) => unit.topics) || [];
  const selectedSubjectCompleted = selectedSubjectTopics.filter((topic) =>
    (selectedStudentSyllabus?.completedTopics || []).includes(topic._id)
  ).length;
  const selectedSubjectProgress = selectedSubjectTopics.length
    ? Math.round((selectedSubjectCompleted / selectedSubjectTopics.length) * 100)
    : 0;
  const selectedDraftUnitIndex = draft.units.findIndex((unit, index) => getUnitNumber(unit, index) === unitIndex);
  const selectedDraftUnit = draft.units[selectedDraftUnitIndex];
  const draftComplete = Boolean(selectedDraftUnit) &&
    selectedDraftUnit.title.trim().length >= 2 &&
    selectedDraftUnit.topics.length > 0 &&
    selectedDraftUnit.topics.every((topic) => topic.title.trim().length >= 2);

  function updateUnit(unitIndex, key, value) {
    setDraft((current) => ({
      ...current,
      units: current.units.map((unit, index) => index === unitIndex ? { ...unit, [key]: value } : unit),
    }));
  }

  function updateTopic(unitIndex, topicIndex, value) {
    setDraft((current) => ({
      ...current,
      units: current.units.map((unit, index) => index === unitIndex
        ? { ...unit, topics: unit.topics.map((topic, i) => i === topicIndex ? { ...topic, title: value } : topic) }
        : unit),
    }));
  }

  function chooseTeacherUnit(unitNumber) {
    setUnitIndex(unitNumber);
    if (!unitNumber) return;

    const savedUnits = (teacherSyllabus?.units || []).map((unit, index) => ({
      _id: unit._id,
      unitNumber: getUnitNumber(unit, index),
      title: unit.title,
      topics: unit.topics.map((topic) => ({ _id: topic._id, title: topic.title })),
    }));
    if (!savedUnits.some((unit) => unit.unitNumber === unitNumber)) {
      savedUnits.push(blankUnit(unitNumber));
      savedUnits.sort((a, b) => a.unitNumber - b.unitNumber);
    }
    setDraft((current) => ({ ...current, units: savedUnits }));
  }

  function startEditing(syllabus, selectedUnitNumber) {
    setEditingId(syllabus._id);
    setTeacherSemester(String(syllabus.subject.semester));
    setTeacherSubjectId(syllabus.subject._id);
    setUnitIndex(selectedUnitNumber || getUnitNumber(syllabus.units[0], 0));
    setDraft({
      subject: syllabus.subject._id,
      semester: syllabus.subject.semester,
      units: syllabus.units.map((unit, index) => ({
        _id: unit._id,
        unitNumber: getUnitNumber(unit, index),
        title: unit.title,
        topics: unit.topics.map((topic) => ({ _id: topic._id, title: topic.title })),
      })),
    });
    setError('');
    setMessage('');
  }

  function chooseTeacherSubject(subjectId) {
    setTeacherSubjectId(subjectId);
    setUnitIndex(0);
    setError('');
    setMessage('');
    if (!subjectId) {
      setEditingId('');
      setDraft(emptyDraft());
      return;
    }
    const existing = syllabi.find((syllabus) => syllabus.subject?._id === subjectId);
    if (existing) {
      startEditing(existing);
      return;
    }
    setEditingId('new');
    setDraft({ subject: subjectId, semester: Number(teacherSemester), units: [] });
  }

  function changeTeacherSemester(semester) {
    setTeacherSemester(semester);
    setTeacherSubjectId('');
    setEditingId('');
    setDraft(emptyDraft());
    setUnitIndex(0);
  }

  function chooseStudentSyllabus(syllabusId) {
    setStudentSyllabusId(syllabusId);
    const selected = syllabi.find((syllabus) => syllabus._id === syllabusId);
    setUnitIndex(selected ? getUnitNumber(selected.units[0], 0) : 1);
  }

  async function saveSyllabus(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const body = {
        subject: draft.subject,
        semester: draft.semester,
        units: [
          ...(teacherSyllabus?.units || [])
            .map((unit, index) => ({ unit, unitNumber: getUnitNumber(unit, index) }))
            .filter(({ unitNumber }) => unitNumber !== unitIndex)
            .map(({ unit, unitNumber }) => ({
              unitNumber,
              title: unit.title,
              topics: unit.topics.map((topic) => ({
                ...(topic._id ? { _id: topic._id } : {}),
                title: topic.title,
              })),
            })),
          {
            unitNumber: unitIndex,
            title: selectedDraftUnit.title,
            topics: selectedDraftUnit.topics.map((topic) => ({
              ...(topic._id ? { _id: topic._id } : {}),
              title: topic.title,
            })),
          },
        ].sort((a, b) => a.unitNumber - b.unitNumber),
      };
      const isEditing = editingId !== 'new';
      const data = await apiRequest(isEditing ? `/syllabi/${editingId}` : '/syllabi', {
        token,
        method: isEditing ? 'PUT' : 'POST',
        body,
      });
      setMessage(isEditing ? 'Syllabus updated.' : 'Syllabus published.');
      startEditing(data.syllabus, unitIndex);
      await loadSyllabi();
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized();
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function toggleTopic(syllabus, topicId) {
    const completed = new Set(syllabus.completedTopics || []);
    if (completed.has(topicId)) completed.delete(topicId);
    else completed.add(topicId);

    setSavingSyllabusId(syllabus._id);
    setError('');
    try {
      const data = await apiRequest(`/syllabi/${syllabus._id}/progress`, {
        token,
        method: 'PUT',
        body: { completedTopics: [...completed] },
      });
      setSyllabi((current) => current.map((item) =>
        item._id === syllabus._id ? { ...item, completedTopics: data.completedTopics || [] } : item
      ));
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized();
      setError(getErrorMessage(requestError));
    } finally {
      setSavingSyllabusId('');
    }
  }

  return (
    <div className="syllabus-page">
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {message && <div className="notice notice-success" role="status">{message}</div>}

      {user.role === 'Teacher' ? (
        <>
          <div className="section-heading">
            <div><span className="section-kicker">SUBJECT OUTLINES</span><h2>Manage Syllabus</h2><p>Choose a semester and subject, then publish one unit at a time.</p></div>
          </div>
          <div className="syllabus-selection-bar card-panel">
            <label>1. Choose semester
              <select value={teacherSemester} onChange={(event) => changeTeacherSemester(event.target.value)}>
                <option value="">Choose semester</option>
                {Array.from({ length: 8 }, (_, index) => <option value={String(index + 1)} key={index + 1}>Semester {index + 1}</option>)}
              </select>
            </label>
            <label>2. Choose subject
              <select disabled={!teacherSemester} value={teacherSubjectId} onChange={(event) => chooseTeacherSubject(event.target.value)}>
                <option value="">Choose subject</option>
                {subjectsForSemester.map((subject) => (
                  <option value={subject._id} key={subject._id}>
                    {subject.subjectName}{syllabi.some((syllabus) => syllabus.subject?._id === subject._id) ? ' · syllabus exists' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading ? <div className="resource-skeletons"><div className="resource-skeleton" /></div> : editingId ? (
            <form className="syllabus-editor card-panel" onSubmit={saveSyllabus}>
              <div className="section-heading"><div><span className="section-kicker">{editingId === 'new' ? 'NEW SYLLABUS' : 'EDIT SYLLABUS'}</span><h2>{editingId === 'new' ? 'Create syllabus' : 'Update syllabus'}</h2></div></div>
              <label>3. Choose unit
                <select value={unitIndex} onChange={(event) => chooseTeacherUnit(Number(event.target.value))}>
                  <option value={0}>Choose unit</option>
                  {Array.from({ length: 5 }, (_, index) => {
                    const number = index + 1;
                    const unit = teacherSyllabus?.units.find((item, itemIndex) => getUnitNumber(item, itemIndex) === number);
                    return <option value={number} key={number}>Unit {number}{unit?.title ? ` · ${unit.title}` : ' · New'}</option>;
                  })}
                </select>
              </label>
              {selectedDraftUnit && (
                <div className="syllabus-units-editor">
                  <fieldset className="syllabus-unit-editor" key={selectedDraftUnit._id || unitIndex}>
                    <div className="syllabus-unit-heading">
                      <legend>Unit {unitIndex}</legend>
                    </div>
                    <label>Unit title<input required minLength="2" maxLength="120" value={selectedDraftUnit.title} onChange={(event) => updateUnit(selectedDraftUnitIndex, 'title', event.target.value)} placeholder="e.g. Introduction to algorithms" /></label>
                    <div className="syllabus-topics-editor">
                      <span className="syllabus-field-label">Topics</span>
                      {selectedDraftUnit.topics.map((topic, topicIndex) => (
                        <div className="syllabus-topic-editor-row" key={topic._id || `topic-${unitIndex}-${topicIndex}`}>
                          <input required minLength="2" maxLength="160" aria-label={`Unit ${unitIndex}, topic ${topicIndex + 1}`} value={topic.title} onChange={(event) => updateTopic(selectedDraftUnitIndex, topicIndex, event.target.value)} placeholder={`Topic ${topicIndex + 1}`} />
                          {selectedDraftUnit.topics.length > 1 && <button type="button" className="icon-button" aria-label={`Remove topic ${topicIndex + 1}`} onClick={() => updateUnit(selectedDraftUnitIndex, 'topics', selectedDraftUnit.topics.filter((_, index) => index !== topicIndex))}><Trash2 size={15} /></button>}
                        </div>
                      ))}
                      {selectedDraftUnit.topics.length < 100 && <button type="button" className="text-button" onClick={() => updateUnit(selectedDraftUnitIndex, 'topics', [...selectedDraftUnit.topics, { title: '' }])}><Plus size={14} /> Add topic</button>}
                    </div>
                  </fieldset>
                </div>
              )}
              {!selectedDraftUnit && <p className="muted-copy">Choose one unit to enter its title and topics.</p>}
              <div className="syllabus-editor-actions">
                <button type="submit" className="button button-primary" disabled={busy || !draftComplete}>{busy ? 'Publishing…' : <><Save size={15} /> Publish syllabus</>}</button>
                {selectedDraftUnit && !draftComplete && <span className="muted-copy">Enter this unit’s title and at least one topic to publish.</span>}
              </div>
            </form>
          ) : (
            <div className="empty-state card-panel"><div className="empty-icon"><BookOpen size={23} /></div><h3>Choose a semester and subject</h3><p>Then select a unit to add or update its topics.</p></div>
          )}
        </>
      ) : (
        <>
          <div className="section-heading">
            <div><span className="section-kicker">YOUR SEMESTER</span><h2>Semester Syllabus</h2><p>Choose a subject and unit, then check off topics as you study.</p></div>
          </div>
          {loading ? <div className="resource-skeletons"><div className="resource-skeleton" /><div className="resource-skeleton" /></div> : syllabi.length ? (
            <>
              <section className="syllabus-overview card-panel">
                <div><span className="section-kicker">SEMESTER PROGRESS</span><strong>{semesterProgress}%</strong><span>{completedStudentTopics} of {totalStudentTopics} topics completed</span></div>
                <div className="progress-track"><span style={{ width: `${semesterProgress}%` }} /></div>
                {selectedStudentSyllabus && <div className="syllabus-subject-progress"><span>{selectedStudentSyllabus.subject?.subjectName}</span><strong>{selectedSubjectProgress}% <small>({selectedSubjectCompleted}/{selectedSubjectTopics.length} topics)</small></strong></div>}
              </section>
              <div className="syllabus-selection-bar card-panel">
                <label>1. Choose subject
                  <select value={studentSyllabusId} onChange={(event) => chooseStudentSyllabus(event.target.value)}>
                    <option value="">Choose subject</option>
                    {syllabi.map((syllabus) => <option value={syllabus._id} key={syllabus._id}>{syllabus.subject?.subjectName}</option>)}
                  </select>
                </label>
                <label>2. Choose unit
                  <select disabled={!selectedStudentSyllabus} value={unitIndex} onChange={(event) => setUnitIndex(Number(event.target.value))}>
                    {selectedStudentSyllabus?.units.map((unit, index) => <option value={getUnitNumber(unit, index)} key={unit._id}>Unit {getUnitNumber(unit, index)} · {unit.title}</option>)}
                  </select>
                </label>
              </div>
              {selectedStudentSyllabus && selectedStudentUnit && (
                <section className="syllabus-card card-panel">
                  <div className="syllabus-card-heading">
                    <div className="syllabus-subject-icon"><BookOpen size={19} /></div>
                    <div className="syllabus-subject-title">
                      <span className="section-kicker">SEMESTER {selectedStudentSyllabus.subject?.semester} · {selectedStudentSyllabus.subject?.subjectCode || 'SUBJECT'}</span>
                      <h3>{selectedStudentSyllabus.subject?.subjectName}</h3>
                    </div>
                  </div>
                  <div className="syllabus-unit">
                    <div className="syllabus-unit-static-heading">Unit {unitIndex} · {selectedStudentUnit.title}</div>
                    <div className="syllabus-topic-list">
                      {selectedStudentUnit.topics.map((topic) => {
                        const completed = (selectedStudentSyllabus.completedTopics || []).includes(topic._id);
                        return (
                          <label className="syllabus-topic-row" key={topic._id}>
                            <input type="checkbox" checked={completed} disabled={Boolean(savingSyllabusId)} onChange={() => toggleTopic(selectedStudentSyllabus, topic._id)} />
                            <span>{topic.title}</span>
                            {completed && <Check size={15} />}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="empty-state card-panel"><div className="empty-icon"><BookOpen size={23} /></div><h3>No syllabi available</h3><p>Your teacher has not published a syllabus for your semester yet.</p></div>
          )}
        </>
      )}
    </div>
  );
}
