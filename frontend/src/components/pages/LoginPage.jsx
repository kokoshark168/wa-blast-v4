import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import api from '@/lib/api';
import { MessageSquare } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email'); // email | otp
  const [otpHint, setOtpHint] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const requestOtp = async () => {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/request-otp', { email });
      setStep('otp');
      if (data.otp_code) setOtpHint(`Your OTP: ${data.otp_code}`);
      else if (data.code_dev) setOtpHint(`Dev OTP: ${data.code_dev}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to send OTP');
    } finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    setError('');
    setLoading(true);
    try {
      await login(email, code);
      navigate('/');
    } catch (e) {
      setError(e.response?.data?.error || 'Invalid OTP');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[hsl(var(--primary))]/20 flex items-center justify-center mb-4">
            <MessageSquare className="h-8 w-8 text-[hsl(var(--primary))]" />
          </div>
          <CardTitle>WA Blast Backoffice</CardTitle>
          <CardDescription>
            {step === 'email' ? 'Enter your email to get started' : 'Enter the OTP code sent to your email'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="p-3 rounded-md bg-red-600/10 text-red-400 text-sm">{error}</div>}
          {otpHint && <div className="p-3 rounded-md bg-blue-600/10 text-blue-400 text-sm">{otpHint}</div>}

          {step === 'email' ? (
            <>
              <Input type="email" placeholder="Enter your email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && requestOtp()} />
              <Button className="w-full" onClick={requestOtp} disabled={!email || loading}>
                {loading ? 'Sending...' : 'Send OTP'}
              </Button>
            </>
          ) : (
            <>
              <Input placeholder="Enter 6-digit OTP" value={code} onChange={e => setCode(e.target.value)} maxLength={6} onKeyDown={e => e.key === 'Enter' && verifyOtp()} />
              <Button className="w-full" onClick={verifyOtp} disabled={code.length < 6 || loading}>
                {loading ? 'Verifying...' : 'Verify & Login'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => { setStep('email'); setCode(''); setOtpHint(''); }}>
                ← Back
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
