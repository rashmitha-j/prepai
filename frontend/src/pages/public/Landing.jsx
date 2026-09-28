import Button from '../../components/ui/Button';
import { RubricBars } from '../../components/ui/Scores';
import { useAuth } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

const SAMPLE_SCORES = { correctness: 8, technicalDepth: 5, clarity: 7, completeness: 5 };

export default function Landing() {
  useDocumentTitle();
  const { isAuthenticated } = useAuth();
  return (
    <>
      <section className="hero">
        <div>
          <h1>Practise the interview you are actually going to have.</h1>
          <p className="lead">
            Upload your resume and paste the job description. PrepAI runs a mock interview built around both, asks follow-ups
            based on what you say, scores every answer, and turns your weak spots into a study plan.
          </p>
          <div className="row" style={{ marginTop: 32 }}>
            {isAuthenticated ? (
              <Button size="lg" to="/interview/new">
                Start an interview
              </Button>
            ) : (
              <>
                <Button size="lg" to="/register">
                  Create a free account
                </Button>
                <Button size="lg" variant="secondary" to="/login">
                  Log in
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="hero-demo" aria-label="Example of an interview exchange">
          <div className="question-card">
            <div className="question-meta">
              <span className="badge badge-accent">Follow-up</span>
              <span>Operating Systems</span>
            </div>
            <p className="question-text">You mentioned lock ordering. How exactly does it prevent a deadlock between two threads?</p>
          </div>
          <div className="answer-quote">
            If every thread acquires locks in the same global order, a thread holding lock B can never wait for lock A, so the
            circular wait condition cannot happen…
          </div>
          <div className="card card-tight stack-sm">
            <div className="row-between">
              <strong className="small">Example feedback</strong>
              <span className="badge badge-mid">6.4 / 10</span>
            </div>
            <RubricBars scores={SAMPLE_SCORES} />
            <p className="small muted">Missing: what happens when lock order cannot be known up front (try-lock with back-off).</p>
          </div>
        </div>
      </section>

      <section className="feature-list" aria-label="How PrepAI works">
        <div>
          <h3>Questions from your resume and the job</h3>
          <p>
            Your projects, skills and the gaps against the job description decide what gets asked — from DSA and DBMS to system
            design and behavioral rounds.
          </p>
        </div>
        <div>
          <h3>Feedback you can act on</h3>
          <p>
            Every answer is scored on correctness, depth, clarity and communication, with the points you missed and a concise
            model answer. Technical feedback is grounded in curated study notes.
          </p>
        </div>
        <div>
          <h3>A plan for what to study next</h3>
          <p>
            Each interview ends with a report and a step-by-step roadmap. Your dashboard tracks weak topics across interviews
            and your C++ coding practice.
          </p>
        </div>
      </section>
    </>
  );
}
