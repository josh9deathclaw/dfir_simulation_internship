import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { setToken, setUser } from '../../utils/auth';
import './Register.css';
import "../../App.css";
import { API } from '../../utils/api';

// ─── OTP entry screen ─────────────────────────────────────────────────────────
// Shown after the registration form is submitted successfully.
// The user enters the 6-digit code sent to their email.
function OTPScreen({ email, onVerified }) {
    const [digits,    setDigits]    = useState(['', '', '', '', '', '']);
    const [error,     setError]     = useState('');
    const [loading,   setLoading]   = useState(false);
    const [resending, setResending] = useState(false);
    const [resendMsg, setResendMsg] = useState('');
    // Cooldown so they can't spam resend — 30 seconds
    const [cooldown,  setCooldown]  = useState(0);
    const inputRefs = useRef([]);

    // Countdown ticker
    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setTimeout(() => setCooldown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    function handleDigitChange(index, value) {
        // Only accept a single digit
        const digit = value.replace(/\D/g, '').slice(-1);
        const next  = [...digits];
        next[index] = digit;
        setDigits(next);
        setError('');

        // Auto-advance focus
        if (digit && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }
    }

    function handleKeyDown(index, e) {
        if (e.key === 'Backspace' && !digits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    }

    function handlePaste(e) {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (!pasted) return;
        const next = [...digits];
        pasted.split('').forEach((ch, i) => { next[i] = ch; });
        setDigits(next);
        // Focus the last filled box
        const lastIdx = Math.min(pasted.length, 5);
        inputRefs.current[lastIdx]?.focus();
    }

    async function handleVerify(e) {
        e.preventDefault();
        const code = digits.join('');
        if (code.length < 6) {
            setError('Please enter all 6 digits.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res  = await fetch(API('/auth/verify'), {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ email, otp: code }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.message || 'Verification failed.');
                // Clear the boxes on a wrong code so they can retype cleanly
                setDigits(['', '', '', '', '', '']);
                inputRefs.current[0]?.focus();
                return;
            }

            // Success — pass token + user up to parent which logs in
            onVerified(data.token, data.user);

        } catch {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    async function handleResend() {
        if (cooldown > 0 || resending) return;
        setResending(true);
        setResendMsg('');
        setError('');

        try {
            const res  = await fetch(API('/auth/resend'), {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ email }),
            });
            const data = await res.json();

            if (res.ok) {
                setResendMsg('New code sent.');
                setDigits(['', '', '', '', '', '']);
                inputRefs.current[0]?.focus();
                setCooldown(30);
            } else {
                setError(data.message || 'Failed to resend code.');
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setResending(false);
        }
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>Check your email</h2>
                <p className="auth-otp-sub">
                    We sent a 6-digit code to <strong>{email}</strong>.<br />
                    Enter it below to activate your account.
                </p>

                {error     && <div className="error-message">{error}</div>}
                {resendMsg && <div className="auth-otp-success">{resendMsg}</div>}

                <form onSubmit={handleVerify}>
                    <div className="auth-otp-boxes" onPaste={handlePaste}>
                        {digits.map((d, i) => (
                            <input
                                key={i}
                                ref={el => inputRefs.current[i] = el}
                                className="auth-otp-box"
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={d}
                                onChange={e => handleDigitChange(i, e.target.value)}
                                onKeyDown={e => handleKeyDown(i, e)}
                                autoFocus={i === 0}
                                autoComplete="off"
                            />
                        ))}
                    </div>

                    <button type="submit" disabled={loading || digits.join('').length < 6}>
                        {loading ? 'Verifying...' : 'Verify Email'}
                    </button>
                </form>

                <div className="auth-otp-footer">
                    <span>Didn't receive it?</span>
                    <button
                        className="auth-otp-resend"
                        onClick={handleResend}
                        disabled={cooldown > 0 || resending}
                        type="button"
                    >
                        {resending
                            ? 'Sending...'
                            : cooldown > 0
                                ? `Resend in ${cooldown}s`
                                : 'Resend code'}
                    </button>
                </div>

                <p className="auth-footer">
                    Wrong email? <Link to="/register">Start over</Link>
                </p>
            </div>
        </div>
    );
}

// ─── Registration form ────────────────────────────────────────────────────────
export default function Register() {
    const [firstName,       setFirstName]       = useState('');
    const [lastName,        setLastName]         = useState('');
    const [email,           setEmail]            = useState('');
    const [password,        setPassword]         = useState('');
    const [confirmPassword, setConfirmPassword]  = useState('');
    const [error,           setError]            = useState('');
    const [loading,         setLoading]          = useState(false);

    // When this is set, we swap to the OTP screen
    const [pendingEmail, setPendingEmail] = useState(null);

    const navigate = useNavigate();

    // Called by OTPScreen on successful verification
    function handleVerified(token, user) {
        setToken(token);
        setUser(user);
        navigate('/dashboard');
    }

    // Show OTP screen once email is confirmed
    if (pendingEmail) {
        return <OTPScreen email={pendingEmail} onVerified={handleVerified} />;
    }

    const onSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (!/[0-9]/.test(password)) {
            setError('Password must contain at least one number.');
            return;
        }
        if (!/[!@#$%^&*()_+\-=[\]{};':"\|,.<>/?]/.test(password)) {
            setError('Password must contain at least one symbol.');
            return;
        }

        setLoading(true);

        try {
            const res  = await fetch(API('/auth/register'), {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ firstName, lastName, email, password }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.message || 'Registration failed.');
                return;
            }

            // Backend confirmed the OTP was sent — show the OTP screen
            setPendingEmail(data.email);

        } catch {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>Create Account</h2>
                {error && <div className="error-message">{error}</div>}
                <form onSubmit={onSubmit}>
                    <div className="form-group">
                        <label htmlFor="firstName">First Name:</label>
                        <input
                            type="text"
                            id="firstName"
                            value={firstName}
                            onChange={e => setFirstName(e.target.value)}
                            required
                            placeholder="John"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="lastName">Last Name:</label>
                        <input
                            type="text"
                            id="lastName"
                            value={lastName}
                            onChange={e => setLastName(e.target.value)}
                            required
                            placeholder="Doe"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="email">Email:</label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            placeholder="your@university.edu"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password:</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            placeholder="8+ chars, include a number or symbol"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm Password:</label>
                        <input
                            type="password"
                            id="confirmPassword"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                            placeholder="Confirm your password"
                        />
                    </div>

                    <button type="submit" disabled={loading}>
                        {loading ? 'Sending code...' : 'Create Account'}
                    </button>
                </form>

                <p className="auth-footer">
                    Already have an account? <Link to="/login">Login here</Link>
                </p>
            </div>
        </div>
    );
}