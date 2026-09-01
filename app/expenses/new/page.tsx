'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {supabase} from '../../../lib/supabase';
import {equalSplit,validateShares} from '../../../lib/balance';
import {useGroups} from '../../../lib/useGroups';

export default function NewExpense(){
  const router=useRouter();
  const [user,setUser]=useState<any>(null);
  const {groups,groupId,setGroupId,loadingGroups}=useGroups(user?.id);
  const [members,setMembers]=useState<any[]>([]);
  const [amount,setAmount]=useState('');
  const [description,setDescription]=useState('');
  const [payer,setPayer]=useState('');
  const [type,setType]=useState<'personal'|'shared'>('shared');
  const [selected,setSelected]=useState<string[]>([]);
  const [shares,setShares]=useState<Record<string,string>>({});
  const [category,setCategory]=useState('Food');
  const [method,setMethod]=useState('UPI');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{supabase.auth.getUser().then(({data})=>{if(!data.user){router.push('/auth');return}setUser(data.user)})},[]);

  useEffect(()=>{
    if(!groupId){setMembers([]);return}
    (async()=>{
      const {data:m}=await supabase.from('group_members').select('id,display_name,user_id').eq('group_id',groupId);
      const list=m||[];
      setMembers(list);
      const mine=list.find(x=>x.user_id===user?.id)?.id||list[0]?.id||'';
      setPayer(mine);
      setSelected(mine?[mine]:[]);
    })();
  },[groupId,user]);

  function chooseType(t:'personal'|'shared'){setType(t);setSelected(t==='personal'?(payer?[payer]:[]):(payer?[payer]:[]))}
  function equal(){const s=equalSplit(Number(amount),selected);setShares(Object.fromEntries(s.map(x=>[x.memberId,x.amount.toFixed(2)])))}

  async function save(e:any){
    e.preventDefault();setError('');setBusy(true);
    try{
      const total=Number(amount);
      let final:any[]=[];
      if(type==='personal'){
        if(selected.length!==1) throw new Error('Choose exactly one person.');
        final=[{memberId:selected[0],amount:total}];
      }else{
        final=selected.map(id=>({memberId:id,amount:Number(shares[id]||0)}));
      }
      validateShares(total,final);
      const {error:ee}=await supabase.rpc('create_expense_with_shares',{p_group_id:groupId,p_description:description,p_total:total,p_payer_id:payer,p_type:type,p_category:category,p_method:method,p_date:new Date().toISOString(),p_notes:null,p_shares:final.map(s=>({member_id:s.memberId,amount:s.amount}))});
      if(ee) throw ee;
      router.push('/');
    }catch(err:any){setError(err.message||'Could not save expense.')}
    finally{setBusy(false)}
  }

  if(!loadingGroups&&groups.length===0) return (
    <main><div className="card"><h1>Add expense</h1><p className="muted">You need a group before you can add an expense.</p><Link className="btn primary" href="/groups">Create or join a group</Link></div></main>
  );

  return (
    <main>
      <div className="row"><div><h1>Add expense</h1><p className="muted">Record it now. Settle it later.</p></div><Link href="/" className="btn">Cancel</Link></div>
      <form className="card form section" onSubmit={save}>
        {groups.length>1&&<div className="field"><label className="label">Group</label><select className="select" value={groupId} onChange={e=>setGroupId(e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></div>}
        <div className="field"><label className="label">Amount</label><input className="input amount" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="₹0.00" required/></div>
        <div className="field"><label className="label">Description</label><input className="input" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Pizza, cab, groceries…" required/></div>
        <div className="field"><label className="label">Who paid?</label><select className="select" value={payer} onChange={e=>{setPayer(e.target.value);if(type==='shared')setSelected([e.target.value])}}>{members.map(m=><option key={m.id} value={m.id}>{m.display_name}</option>)}</select></div>
        <div className="field"><label className="label">What kind of expense?</label><div className="chips"><button type="button" className={'chip '+(type==='personal'?'active':'')} onClick={()=>chooseType('personal')}>For someone</button><button type="button" className={'chip '+(type==='shared'?'active':'')} onClick={()=>chooseType('shared')}>Shared</button></div></div>
        <div className="field"><label className="label">Who was it for?</label>{members.map(m=><label className="member" key={m.id}><input className="check" type="checkbox" checked={selected.includes(m.id)} onChange={e=>{setSelected(x=>e.target.checked?[...x,m.id]:x.filter(id=>id!==m.id))}} disabled={type==='personal'&&selected.length===1&&!selected.includes(m.id)}/><span>{m.display_name}</span></label>)}</div>
        {type==='shared'&&<>
          <div className="actions"><button type="button" className="btn" onClick={()=>setSelected(members.map(m=>m.id))}>Everyone</button><button type="button" className="btn" onClick={equal} disabled={!amount||!selected.length}>Split equally</button></div>
          {selected.map(id=><div className="field" key={id}><label className="label">{members.find(m=>m.id===id)?.display_name}'s share</label><input className="input" inputMode="decimal" value={shares[id]||''} onChange={e=>setShares(s=>({...s,[id]:e.target.value}))}/></div>)}
        </>}
        <div className="field"><label className="label">Payment method</label><select className="select" value={method} onChange={e=>setMethod(e.target.value)}>{['UPI','Cash','Card','Bank Transfer','Other'].map(x=><option key={x}>{x}</option>)}</select></div>
        <div className="field"><label className="label">Category</label><select className="select" value={category} onChange={e=>setCategory(e.target.value)}>{['Food','Travel','Shopping','Groceries','Bills','Entertainment','Education','Health','Other'].map(x=><option key={x}>{x}</option>)}</select></div>
        {error&&<p className="error">{error}</p>}
        <button className="btn primary" disabled={busy||!groupId}>{busy?'Saving…':'Save expense'}</button>
      </form>
    </main>
  );
}
