'use client';
import {useState} from 'react';
import {supabase} from '../../lib/supabase';
import {useRouter} from 'next/navigation';

export default function Auth(){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [name,setName]=useState('');
  const [mode,setMode]=useState<'signin'|'signup'>('signin');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [checkEmail,setCheckEmail]=useState('');
  const router=useRouter();

  async function submit(e:any){
    e.preventDefault();setBusy(true);setError('');setCheckEmail('');
    if(mode==='signin'){
      const r=await supabase.auth.signInWithPassword({email,password});
      if(r.error) setError(r.error.message); else router.push('/groups');
    }else{
      const r=await supabase.auth.signUp({email,password,options:{data:{name}}});
      if(r.error){setError(r.error.message)}
      else if(r.data.session){ router.push('/groups'); }
      else{ setCheckEmail(email); setMode('signin'); }
    }
    setBusy(false);
  }

  return <main className="auth"><form className="card form" onSubmit={submit}>
    <h1>{mode==='signin'?'Welcome back':'Create your account'}</h1>
    {checkEmail&&<p className="notice">We sent a confirmation link to <b>{checkEmail}</b>. Open it, then sign in below.<br/><small className="muted">Setting this up yourself? You can turn email confirmation off in Supabase — see the README.</small></p>}
    {mode==='signup'&&<div className="field"><label className="label">Your name</label><input className="input" value={name} onChange={e=>setName(e.target.value)} required/></div>}
    <div className="field"><label className="label">Email</label><input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div>
    <div className="field"><label className="label">Password</label><input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required/></div>
    {error&&<p className="error">{error}</p>}
    <button className="btn primary" disabled={busy}>{busy?'Please wait…':mode==='signin'?'Sign in':'Create account'}</button>
    <button type="button" className="btn" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setError('');setCheckEmail('')}}>{mode==='signin'?'Need an account? Sign up':'Already have an account? Sign in'}</button>
  </form></main>
}
