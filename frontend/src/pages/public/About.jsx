import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export default function About() {
  useDocumentTitle('About');
  return (
    <article className="prose" style={{ padding: '48px 0' }}>
      <h1>About PrepAI</h1>
      <p style={{ marginTop: 16 }}>
        PrepAI is an interview-practice tool for software engineering candidates. It combines your resume, a target job
        description and a curated technical knowledge base to run realistic mock interviews and give structured feedback.
      </p>

      <h2>How it works</h2>
      <ul className="bullets">
        <li>Your resume PDF is converted to text and analysed into skills, projects and experience.</li>
        <li>The job description is analysed into required and preferred skills; a keyword comparison shows likely gaps.</li>
        <li>
          Interview questions are generated one at a time. Each question uses your context, your previous answers and the most
          relevant passages from the knowledge base (retrieval-augmented generation).
        </li>
        <li>Answers are scored against a fixed rubric. The overall score is computed by the application, not by the model.</li>
        <li>At the end you get a report and a learning roadmap.</li>
        <li>
          Coding problems come with examples and starter code. In a local installation your C++ code is compiled and run against
          test cases; on this public demo, running code is turned off for security.
        </li>
      </ul>

      <h2>What PrepAI is not</h2>
      <p>
        PrepAI is not a hiring tool and its match analysis is not a hiring decision. Language models can be wrong, can miss
        nuance, and different models give different feedback. Treat the feedback as a practice partner&apos;s opinion and verify
        technical details you are unsure about.
      </p>

      <h2>Your data</h2>
      <p>
        Resumes, job descriptions and interview transcripts are stored in your account only and are never shown to other users.
        Only compact, structured summaries are sent to the AI service. You can delete individual items or your whole account at
        any time from your profile.
      </p>
    </article>
  );
}
