'use client';
import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {supabase} from '../../lib/supabase';
import {balances,simplifySettlements} from '../../lib/balance';
import {useGroups} from '../../lib/useGroups';

export default function Settle(){
  const router=useRouter();
  const [user,setUser]=useState<any>(null);
  const {groups,groupId,setGroupId,loadingGroups}=useGroups(user?.id);
  const [members,setMembers]=useState<any[]>([]);
  const [expenses,setExpenses]=useState<any[]>([]);
  const [settlements,setSettlements]=useState<any[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [modal,setModal]=useState<{from:string;to:string;suggested:number}|null>(null);
  const [payAmount,setPayAmount]=useState('');
  const [payMethod,setPayMethod]=useState('UPI');

  useEffect(()=>{supabase.auth.getUser().then(({data})=>{if(!data.user){router.push('/auth');return}setUser(data.user)})},[]);

  async function load(){
    if(!groupId) return;
    const [m,e,s]=await Promise.all([
      supabase.from('group_members').select('*').eq('group_id',groupId),
      supabase.from('expenses').select('*,expense_shares(member_id,amount)').eq('group_id',groupId),
      supabase.from('settlements').select('*').eq('group_id',groupId).order('date',{ascending:false})
    ]);
    setMembers(m.data||[]);setExpenses(e.data||[]);setSettlements(s.data||[]);
  }
  useEffect(()=>{load()},[groupId]);

  const net=useMemo(()=>{
    if(!members.length) return new Map<string,number>();
    return balances(
      members.map(m=>m.id),
      expenses.map(e=>({payerId:e.payer_id,total:Number(e.total_amount),shares:e.expense_shares.map((s:any)=>({memberId:s.member_id,amount:Number(s.amount)}))})),
      settlements.map(s=>({from:s.from_member_id,to:s.to_member_id,amount:Number(s.amount)}))
    );
  },[members,expenses,settlements]);
  const suggestions=simplifySettlements(net);
  const name=(id:string)=>members.find(m=>m.id===id)?.display_name||'Unknown';

  function openModal(x:{from:string;to:string;amount:number}){
    setModal({from:x.from,to:x.to,suggested:x.amount});
    setPayAmount(x.amount.toFixed(2));
    setPayMethod('UPI');
    setError('');
  }

  async function confirmPayment(e:any){
    e.preventDefault();
    if(!modal) return;
    const n=Number(payAmount);
    if(!(n>0&&n<=modal.suggested+0.005)){setError('Enter a valid amount up to the suggested amount.');return}
    setBusy(true);setError('');
    const {error:e2}=await supabase.from('settlements').insert({group_id:groupId,from_member_id:modal.from,to_member_id:modal.to,amount:n,payment_method:payMethod,date:new Date().toISOString()});
    if(e2) setError(e2.message); else {setModal(null);await load();}
    setBusy(false);
  }

  async function removeSettlement(id:string){
    if(!confirm('Delete this settlement record? This will recalculate balances.')) return;
    const {error:e}=await supabase.from('settlements').delete().eq('id',id);
    if(e) setError(e.message); else setSettlements(x=>x.filter(v=>v.id!==id));
  }

  if(!loadingGroups&&groups.length===0) return (
    <main><div className="card"><h1>Settle up</h1><p className="muted">You need a group before you can settle up.</p></div></main>
  );

  return (
    <main>
      <div className="row">
        <div><h1>Settle up</h1><p className="muted">Record a full or partial payment. Settlements are separate from expenses.</p></div>
        {groups.length>1&&<select className="select" value={groupId} onChange={e=>setGroupId(e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>}
      </div>
      <div className="card section">
        <h2>Suggested payments</h2>
        {suggestions.length===0?<div className="empty">Everything is settled.</div>:suggestions.map((x,i)=>
          <div className="expense" key={i}>
            <div><b>{name(x.from)}</b> → <b>{name(x.to)}</b><div className="muted">Suggested payment</div></div>
            <div className="actions"><b>₹{x.amount.toLocaleString('en-IN')}</b><button className="btn primary" disabled={busy} onClick={()=>openModal(x)}>Record payment</button></div>
          </div>)}
        {error&&!modal&&<p className="error">{error}</p>}
      </div>
      <div className="card section">
        <h2>Settlement history</h2>
        {settlements.length===0?<div className="empty">No payments recorded yet.</div>:
          <div className="list">{settlements.map(s=>
            <div className="expense" key={s.id}>
              <div><b>{name(s.from_member_id)}</b> → <b>{name(s.to_member_id)}</b><div className="muted">₹{Number(s.amount).toLocaleString('en-IN',{minimumFractionDigits:2})} · {s.payment_method} · {new Date(s.date).toLocaleDateString('en-IN')}</div></div>
              <button className="btn danger" onClick={()=>removeSettlement(s.id)}>Delete</button>
            </div>)}
          </div>}
      </div>
      {modal&&<div className="overlay" onClick={()=>setModal(null)}>
        <form className="card modal" onClick={e=>e.stopPropagation()} onSubmit={confirmPayment}>
          <h2>Record payment</h2>
          <p className="muted">{name(modal.from)} → {name(modal.to)} · Suggested ₹{modal.suggested.toLocaleString('en-IN')}</p>
          <div className="field"><label className="label">Amount paid</label><input className="input amount" inputMode="decimal" value={payAmount} onChange={e=>setPayAmount(e.target.value)} required/></div>
          <div className="field"><label className="label">Payment method</label><select className="select" value={payMethod} onChange={e=>setPayMethod(e.target.value)}>{['UPI','Cash','Card','Bank Transfer','Other'].map(x=><option key={x}>{x}</option>)}</select></div>
          {error&&<p className="error">{error}</p>}
          <div className="actions"><button type="button" className="btn" onClick={()=>setModal(null)}>Cancel</button><button className="btn primary" disabled={busy}>{busy?'Saving…':'Confirm'}</button></div>
        </form>
      </div>}
    </main>
  );
}
