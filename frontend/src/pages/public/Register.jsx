import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';

function validate({ name, email, password }) {
  const errors = {};
  if (name.trim().length < 2) errors.name = 'Enter your name (at least 2 characters).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (password.length < 8) errors.password = 'Use at least 8 characters.';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Include at least one letter and one number.';
  return errors;
}

export default function Register() {
  useDocumentTitle('Create account');
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    const local = validate(form);
    setErrors(local);
    setError('');
    if (Object.keys(local).length) return;
    setLoading(true);
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrors(getFieldErrors(err));
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <form className="stack" onSubmit={onSubmit} noValidate>
          <div>
            <h1>Create your account</h1>
            <p className="muted small">Your resumes, interviews and reports stay private to your account.</p>
          </div>
          {error ? <Alert variant="error">{error}</Alert> : null}
          <Field label="Name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
          <Field label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
            hint="At least 8 characters, with a letter and a number."
          />
          <Button type="submit" block loading={loading}>
            Create account
          </Button>
          <p className="small muted center">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
