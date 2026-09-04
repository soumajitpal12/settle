'use client';
import Link from 'next/link';
import {formatLocalDateTime} from '../lib/time';
import {useEffect,useMemo,useState} from 'react';
import {supabase} from '../lib/supabase';
import {balances,simplifySettlements} from '../lib/balance';
import {useGroups} from '../lib/useGroups';

export default function Home(){
  const [user,setUser]=useState<any>(null);
  const [authChecked,setAuthChecked]=useState(false);
  const {groups,groupId,setGroupId}=useGroups(user?.id);
  const [members,setMembers]=useState<any[]>([]);
  const [expenses,setExpenses]=useState<any[]>([]);
  const [settlements,setSettlements]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{supabase.auth.getUser().then(({data})=>{setUser(data.user);setAuthChecked(true)});},[]);

  useEffect(()=>{
    if(!groupId){setMembers([]);setExpenses([]);setSettlements([]);setLoading(false);return;}
    setLoading(true);
    (async()=>{
      const [m,e,s]=await Promise.all([
        supabase.from('group_members').select('id,display_name,user_id').eq('group_id',groupId),
        supabase.from('expenses').select('*,expense_shares(member_id,amount)').eq('group_id',groupId).order('date',{ascending:false}),
        supabase.from('settlements').select('*').eq('group_id',groupId).order('date',{ascending:false})
      ]);
      setMembers(m.data||[]);setExpenses(e.data||[]);setSettlements(s.data||[]);setLoading(false);
    })();
  },[groupId]);

  const myMember=members.find(m=>m.user_id===user?.id)?.id;
  const net=useMemo(()=>{
    if(!members.length) return new Map<string,number>();
    return balances(
      members.map(m=>m.id),
      expenses.map(e=>({payerId:e.payer_id,total:Number(e.total_amount),shares:e.expense_shares.map((s:any)=>({memberId:s.member_id,amount:Number(s.amount)}))})),
      settlements.map(s=>({from:s.from_member_id,to:s.to_member_id,amount:Number(s.amount)}))
    );
  },[members,expenses,settlements]);
  const mine=net.get(myMember||'')||0;
  const owedToMe=[...net].filter(([id,v])=>id!==myMember&&v<0).reduce((a,[,v])=>a-v,0)/100;
  const iOwe=[...net].filter(([id,v])=>id!==myMember&&v>0).reduce((a,[,v])=>a+v,0)/100;

  const categoryTotals=useMemo(()=>{
    const totals=new Map<string,number>();
    for(const e of expenses) totals.set(e.category,(totals.get(e.category)||0)+Number(e.total_amount));
    const max=Math.max(1,...totals.values());
    return [...totals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([category,amount])=>({category,amount,pct:Math.round((amount/max)*100)}));
  },[expenses]);

  if(!authChecked) return <main className="auth"><p className="muted">Loading…</p></main>;

  if(!user) return (
    <main className="auth">
      <div className="card">
        <h1>Expense tracking, without the headache.</h1>
        <p className="muted">Record who paid, split expenses, and see exactly who should pay whom — built for roommates, trips, and friend groups.</p>
        <Link className="btn primary" href="/auth">Get started</Link>
      </div>
    </main>
  );

  if(!loading&&groups.length===0) return (
    <main className="auth">
      <div className="card">
        <h1>Welcome, {user.user_metadata?.name||user.email?.split('@')[0]}!</h1>
        <p className="muted">You're not part of any group yet. Create one or join an existing group with an invite code.</p>
        <Link className="btn primary" href="/groups">Create or join a group</Link>
      </div>
    </main>
  );

  return (
    <main>
      <div className="row">
        <div><h1>{groups.find(g=>g.id===groupId)?.name||'Your group'}</h1><p className="muted">{members.length} member{members.length===1?'':'s'}</p></div>
        <div className="actions">
          {groups.length>1&&<select className="select" value={groupId} onChange={e=>setGroupId(e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>}
          <Link className="btn primary" href="/expenses/new">+ Add Expense</Link>
        </div>
      </div>
      <section className="grid stats section">
        <div className="card"><div className="stat-label">Total group expenses</div><div className="stat-value">₹{(expenses.reduce((a,e)=>a+Number(e.total_amount),0)).toLocaleString('en-IN')}</div></div>
        <div className="card"><div className="stat-label">You are owed</div><div className="stat-value positive">₹{owedToMe.toLocaleString('en-IN',{minimumFractionDigits:2})}</div></div>
        <div className="card"><div className="stat-label">You owe</div><div className="stat-value negative">₹{iOwe.toLocaleString('en-IN',{minimumFractionDigits:2})}</div></div>
        <div className="card"><div className="stat-label">Net balance</div><div className={'stat-value '+(mine>=0?'positive':'negative')}>{mine>=0?'+':'-'}₹{(Math.abs(mine)/100).toLocaleString('en-IN',{minimumFractionDigits:2})}</div></div>
      </section>
      <section className="card section">
        <div className="row"><h2>Recent expenses</h2><Link href="/expenses">View all</Link></div>
        {loading?<p className="muted">Loading…</p>:expenses.length===0?<div className="empty">No expenses yet. Add your first one.</div>:
          <div className="list">{expenses.slice(0,8).map(e=>
            <div className="expense" key={e.id}>
              <div><b>{e.description}</b><div className="muted">₹{Number(e.total_amount).toLocaleString('en-IN')} · {members.find(m=>m.id===e.payer_id)?.display_name||'Unknown'} paid · {formatLocalDateTime(e.date)}</div></div>
              <span className="muted">{e.category}</span>
            </div>)}
          </div>}
      </section>
      <section className="card section">
        <h2>Suggested settlements</h2>
        {simplifySettlements(net).length===0?<p className="muted">Everything is settled.</p>:simplifySettlements(net).slice(0,6).map((x,i)=>
          <div className="expense" key={i}><div>{members.find(m=>m.id===x.from)?.display_name} → {members.find(m=>m.id===x.to)?.display_name}</div><b>₹{x.amount.toLocaleString('en-IN')}</b></div>)}
        {simplifySettlements(net).length>0&&<Link className="btn primary section" href="/settle">Settle up</Link>}
      </section>
      {categoryTotals.length>0&&<section className="card section">
        <h2>Spending by category</h2>
        <div className="bars">{categoryTotals.map(c=>
          <div className="bar-row" key={c.category}>
            <span className="bar-label">{c.category}</span>
            <div className="bar-track"><div className="bar-fill" style={{width:c.pct+'%'}}/></div>
            <span className="bar-value">₹{c.amount.toLocaleString('en-IN')}</span>
          </div>)}
        </div>
      </section>}
    </main>
  );
}
