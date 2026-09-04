'use client';
import Link from 'next/link';
import {formatLocalDateTime} from '../../lib/time';
import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {supabase} from '../../lib/supabase';
import {useGroups} from '../../lib/useGroups';

export default function Expenses(){
  const router=useRouter();
  const [user,setUser]=useState<any>(null);
  const {groups,groupId,setGroupId}=useGroups(user?.id);
  const [expenses,setExpenses]=useState<any[]>([]);
  const [members,setMembers]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [person,setPerson]=useState('all');
  const [method,setMethod]=useState('all');
  const [category,setCategory]=useState('all');
  const [type,setType]=useState('all');
  const [month,setMonth]=useState('');

  useEffect(()=>{supabase.auth.getUser().then(({data})=>{if(!data.user){router.push('/auth');return}setUser(data.user)})},[]);

  useEffect(()=>{
    if(!groupId){setMembers([]);setExpenses([]);setLoading(false);return}
    setLoading(true);
    (async()=>{
      const [m,e]=await Promise.all([
        supabase.from('group_members').select('id,group_id,user_id,display_name').eq('group_id',groupId),
        supabase.from('expenses').select('*,expense_shares(id,member_id,amount)').eq('group_id',groupId).order('date',{ascending:false})
      ]);
      if(m.error||e.error) setError((m.error||e.error)?.message||'Could not load expenses');
      setMembers(m.data||[]);setExpenses(e.data||[]);setLoading(false);
    })();
  },[groupId]);

  const filtered=useMemo(()=>expenses.filter(e=>
    (person==='all'||e.payer_id===person)&&
    (method==='all'||e.payment_method===method)&&
    (category==='all'||e.category===category)&&
    (type==='all'||e.expense_type===type)&&
    (!month||e.date.startsWith(month))
  ),[expenses,person,method,category,type,month]);

  async function remove(id:string){
    if(!confirm('Delete this expense? This will recalculate the group balances. This cannot be undone.')) return;
    const {error:e}=await supabase.from('expenses').delete().eq('id',id);
    if(e) setError(e.message); else setExpenses(x=>x.filter(v=>v.id!==id));
  }

  const name=(id:string)=>members.find(m=>m.id===id)?.display_name||'Unknown';

  function exportCsv(){
    const rows=[['Date','Description','Amount','Paid By','Type','Category','Payment Method']];
    for(const e of filtered) rows.push([new Date(e.date).toLocaleDateString('en-IN'),e.description,Number(e.total_amount).toFixed(2),name(e.payer_id),e.expense_type,e.category,e.payment_method]);
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='expenses.csv';a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <div className="row">
        <div><h1>Expenses</h1><p className="muted">Review, edit, or delete any expense in this group.</p></div>
        <div className="actions">
          {groups.length>1&&<select className="select" value={groupId} onChange={e=>setGroupId(e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>}
          <Link href="/expenses/new" className="btn primary">+ Add Expense</Link>
        </div>
      </div>
      <section className="card section">
        <div className="filters">
          <select className="select" value={person} onChange={e=>setPerson(e.target.value)}><option value="all">All payers</option>{members.map(m=><option key={m.id} value={m.id}>{m.display_name}</option>)}</select>
          <select className="select" value={type} onChange={e=>setType(e.target.value)}><option value="all">All types</option><option value="personal">For someone</option><option value="shared">Shared</option></select>
          <select className="select" value={method} onChange={e=>setMethod(e.target.value)}><option value="all">All payment methods</option>{['UPI','Cash','Card','Bank Transfer','Other'].map(x=><option key={x}>{x}</option>)}</select>
          <select className="select" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{['Food','Travel','Shopping','Groceries','Bills','Entertainment','Education','Health','Other'].map(x=><option key={x}>{x}</option>)}</select>
          <input className="input" type="month" value={month} onChange={e=>setMonth(e.target.value)} />
        </div>
        {filtered.length>0&&<div className="actions section"><button type="button" className="btn" onClick={exportCsv}>Export CSV</button></div>}
      </section>
      <section className="card section">
        {error&&<p className="error">{error}</p>}
        {loading?<p className="muted">Loading…</p>:groupId===''?<div className="empty">Create or join a group first. <Link href="/groups">Go to groups</Link></div>:filtered.length===0?<div className="empty">No expenses match these filters.</div>:
          <div className="list">{filtered.map(e=>
            <div className="expense" key={e.id}>
              <div><Link href={`/expenses/${e.id}`}><b>{e.description}</b></Link><div className="muted">₹{Number(e.total_amount).toLocaleString('en-IN',{minimumFractionDigits:2})} · {name(e.payer_id)} paid · {formatLocalDateTime(e.date)} · {e.payment_method}</div></div>
              <div className="actions"><Link className="btn" href={`/expenses/${e.id}`}>Edit</Link><button className="btn danger" onClick={()=>remove(e.id)}>Delete</button></div>
            </div>)}
          </div>}
      </section>
    </main>
  );
}
