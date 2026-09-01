'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../../lib/supabase';
import {storeGroup,getStoredGroup} from '../../lib/useGroups';
import {useRouter} from 'next/navigation';
import Link from 'next/link';

type UnlinkedMember={id:string;display_name:string};

export default function Groups(){
  const [user,setUser]=useState<any>(null);
  const [groups,setGroups]=useState<any[]>([]);
  const [membersByGroup,setMembersByGroup]=useState<Record<string,any[]>>({});
  const [expanded,setExpanded]=useState<string|null>(null);
  const [newMemberName,setNewMemberName]=useState<Record<string,string>>({});
  const [name,setName]=useState('');
  const [memberNames,setMemberNames]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [copied,setCopied]=useState('');
  const [deleteConfirm,setDeleteConfirm]=useState<Record<string,string>>({});
  const [deleteBusy,setDeleteBusy]=useState<string|null>(null);

  // Join flow: step 1 (enter code) -> preview -> step 2 (claim existing name or join as new)
  const [joinCode,setJoinCode]=useState('');
  const [joinError,setJoinError]=useState('');
  const [joinBusy,setJoinBusy]=useState(false);
  const [preview,setPreview]=useState<{groupId:string;groupName:string;unlinked:UnlinkedMember[]}|null>(null);
  const [claimId,setClaimId]=useState<string>('__new__');

  const router=useRouter();

  async function load(){
    const {data:u}=await supabase.auth.getUser();
    if(!u.user){router.push('/auth');return}
    setUser(u.user);
    const {data}=await supabase.from('group_members').select('group_id,groups(id,name,created_by,join_code)').eq('user_id',u.user.id);
    setGroups((data||[]).map((x:any)=>x.groups).filter(Boolean));
  }
  useEffect(()=>{load()},[]);

  async function loadMembers(groupId:string){
    const {data}=await supabase.from('group_members').select('id,display_name,user_id').eq('group_id',groupId);
    setMembersByGroup(x=>({...x,[groupId]:data||[]}));
  }

  function toggleExpand(g:any){
    if(expanded===g.id){setExpanded(null);return}
    setExpanded(g.id);
    if(!membersByGroup[g.id]) loadMembers(g.id);
  }

  async function create(e:any){
    e.preventDefault();setError('');setBusy(true);
    try{
      const {data:g,error:ge}=await supabase.from('groups').insert({name,created_by:user.id}).select().single();
      if(ge) throw ge;
      const names=[user.user_metadata?.name||user.email?.split('@')[0]||'Me',...memberNames.split(',').map(x=>x.trim()).filter(Boolean)];
      const unique=[...new Set(names)];
      const rows=unique.map((display_name,i)=>({group_id:g.id,user_id:i===0?user.id:null,display_name}));
      const {error:me}=await supabase.from('group_members').insert(rows);
      if(me) throw me;
      setName('');setMemberNames('');
      storeGroup(g.id);
      router.push('/');
    }catch(e:any){setError(e.message||'Could not create group.')}
    finally{setBusy(false)}
  }

  async function addMember(groupId:string){
    const nm=(newMemberName[groupId]||'').trim();
    if(!nm) return;
    setError('');
    const {error:e}=await supabase.from('group_members').insert({group_id:groupId,user_id:null,display_name:nm});
    if(e) setError(e.message); else {setNewMemberName(x=>({...x,[groupId]:''}));loadMembers(groupId)}
  }

  async function removeMember(groupId:string,memberId:string){
    if(!confirm('Remove this member from the group?')) return;
    const {error:e}=await supabase.from('group_members').delete().eq('id',memberId);
    if(e) setError('Could not remove — this person is linked to existing expenses or settlements.');
    else loadMembers(groupId);
  }

  async function leaveGroup(groupId:string,groupName:string){
    if(!confirm(`Leave "${groupName}"? You'll need a new invite code to rejoin.`)) return;
    setError('');
    const {error:e}=await supabase.rpc('leave_group',{p_group_id:groupId});
    if(e) setError(e.message||'Could not leave group.');
    else{setExpanded(null);load();}
  }

  async function deleteGroup(g:any){
    if((deleteConfirm[g.id]||'').trim()!==g.name) return;
    setError('');setDeleteBusy(g.id);
    const {error:e}=await supabase.from('groups').delete().eq('id',g.id);
    if(e) setError('Could not delete group — '+e.message);
    else{
      if(getStoredGroup()===g.id) storeGroup('');
      setExpanded(null);
      setDeleteConfirm(x=>{const y={...x};delete y[g.id];return y});
      load();
    }
    setDeleteBusy(null);
  }

  async function copyCode(code:string){
    try{await navigator.clipboard.writeText(code);setCopied(code);setTimeout(()=>setCopied(''),1500)}catch{}
  }

  async function lookupCode(e:any){
    e.preventDefault();setJoinError('');setPreview(null);setJoinBusy(true);
    try{
      const {data,error:pe}=await supabase.rpc('group_preview_by_code',{p_code:joinCode.trim()});
      if(pe) throw pe;
      const row=Array.isArray(data)?data[0]:data;
      if(!row) throw new Error('Invalid invite code.');
      const unlinked=(row.unlinked_members||[]) as UnlinkedMember[];
      setPreview({groupId:row.group_id,groupName:row.group_name,unlinked});
      setClaimId(unlinked.length?unlinked[0].id:'__new__');
    }catch(e:any){setJoinError(e.message||'Could not find that group.')}
    finally{setJoinBusy(false)}
  }

  async function confirmJoin(e:any){
    e.preventDefault();
    if(!preview) return;
    setJoinError('');setJoinBusy(true);
    try{
      let memberId:string|null=null;
      if(claimId==='__new__'){
        const {data,error:je}=await supabase.rpc('join_group_with_code',{p_code:joinCode.trim()});
        if(je) throw je;
        memberId=data as string;
      }else{
        const {data,error:je}=await supabase.rpc('claim_group_member',{p_code:joinCode.trim(),p_member_id:claimId});
        if(je) throw je;
        memberId=data as string;
      }
      setJoinCode('');setPreview(null);
      if(memberId) storeGroup(preview.groupId);
      router.push('/');
    }catch(e:any){setJoinError(e.message||'Could not join group.')}
    finally{setJoinBusy(false)}
  }

  function cancelPreview(){setPreview(null);setJoinError('');}

  function openGroup(id:string){storeGroup(id);router.push('/')}

  return (
    <main>
      <div className="row"><div><h1>Your groups</h1><p className="muted">Create separate spaces for trips, home, work, or anything else.</p></div><Link href="/" className="btn">Dashboard</Link></div>
      <div className="grid section cols-2">
        <div className="card">
          <h2>Create a group</h2>
          <form onSubmit={create} className="form">
            <div className="field"><label className="label">Group name</label><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Goa Trip" required/></div>
            <div className="field"><label className="label">Other members</label><input className="input" value={memberNames} onChange={e=>setMemberNames(e.target.value)} placeholder="Alex, Sam, Rahul"/><small className="muted">Separate names with commas. You are added automatically. When one of them signs up later, they can use the group's invite code to link their account to their name — no duplicate entry.</small></div>
            {error&&<p className="error">{error}</p>}
            <button className="btn primary" disabled={busy}>{busy?'Creating…':'Create group'}</button>
          </form>
        </div>
        <div className="card">
          <h2>Join a group</h2>
          {!preview&&<>
            <p className="muted">Have an invite code from a friend? Enter it to see the group before joining.</p>
            <form onSubmit={lookupCode} className="form">
              <div className="field"><label className="label">Invite code</label><input className="input" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={8} required/></div>
              {joinError&&<p className="error">{joinError}</p>}
              <button className="btn primary" disabled={joinBusy}>{joinBusy?'Looking up…':'Find group'}</button>
            </form>
          </>}
          {preview&&<form onSubmit={confirmJoin} className="form">
            <p className="muted">Joining <b>{preview.groupName}</b>.</p>
            {preview.unlinked.length>0&&<div className="field">
              <label className="label">Is one of these names you?</label>
              {preview.unlinked.map(m=>
                <label className="member" key={m.id}>
                  <input type="radio" className="check" name="claim" checked={claimId===m.id} onChange={()=>setClaimId(m.id)}/>
                  <span>{m.display_name}</span>
                </label>)}
              <label className="member">
                <input type="radio" className="check" name="claim" checked={claimId==='__new__'} onChange={()=>setClaimId('__new__')}/>
                <span>None of these — add me as a new member</span>
              </label>
              <small className="muted">Picking your name links your account to their existing expense history instead of creating a duplicate person.</small>
            </div>}
            {preview.unlinked.length===0&&<p className="muted">You'll be added as a new member of this group.</p>}
            {joinError&&<p className="error">{joinError}</p>}
            <div className="actions"><button type="button" className="btn" onClick={cancelPreview}>Cancel</button><button className="btn primary" disabled={joinBusy}>{joinBusy?'Joining…':'Confirm & join'}</button></div>
          </form>}
        </div>
      </div>
      <div className="card section">
        <h2>Existing groups</h2>
        {groups.length===0?<div className="empty">No groups yet.</div>:
          <div className="list">{groups.map(g=>
            <div key={g.id} className="group-item">
              <div className="expense">
                <b>{g.name}</b>
                <div className="actions">
                  <button type="button" className="btn" onClick={()=>toggleExpand(g)}>{expanded===g.id?'Hide members':'Manage'}</button>
                  <button type="button" className="btn primary" onClick={()=>openGroup(g.id)}>Open</button>
                </div>
              </div>
              {expanded===g.id&&<div className="group-detail">
                <div className="field"><label className="label">Invite code</label><div className="actions"><code className="join-code">{g.join_code}</code><button type="button" className="btn" onClick={()=>copyCode(g.join_code)}>{copied===g.join_code?'Copied!':'Copy'}</button></div><small className="muted">Share this code — a friend who joins with it can either link it to a name already on the list or be added as a new member.</small></div>
                <div className="field"><label className="label">Members</label>
                  {(membersByGroup[g.id]||[]).map(m=>
                    <div className="member-row" key={m.id}>
                      <span>{m.display_name}{m.user_id===user?.id&&' (you)'}{!m.user_id&&' · not linked yet'}</span>
                      {g.created_by===user?.id&&m.user_id!==user?.id&&<button type="button" className="btn danger small" onClick={()=>removeMember(g.id,m.id)}>Remove</button>}
                    </div>)}
                </div>
                {g.created_by===user?.id&&<div className="field"><label className="label">Add a member (without an account)</label><div className="actions"><input className="input" value={newMemberName[g.id]||''} onChange={e=>setNewMemberName(x=>({...x,[g.id]:e.target.value}))} placeholder="Name"/><button type="button" className="btn" onClick={()=>addMember(g.id)}>Add</button></div></div>}
                {g.created_by!==user?.id&&<div className="field"><button type="button" className="btn danger" onClick={()=>leaveGroup(g.id,g.name)}>Leave group</button><small className="muted">You can leave as long as you have no expenses or settlements recorded in this group.</small></div>}
                {g.created_by===user?.id&&<div className="danger-zone">
                  <label className="label">Delete this group</label>
                  <p className="muted">This permanently deletes {g.name} and every expense, share, and settlement in it for all members. This cannot be undone.</p>
                  <div className="actions">
                    <input className="input" value={deleteConfirm[g.id]||''} onChange={e=>setDeleteConfirm(x=>({...x,[g.id]:e.target.value}))} placeholder={`Type "${g.name}" to confirm`}/>
                    <button type="button" className="btn danger" disabled={(deleteConfirm[g.id]||'').trim()!==g.name||deleteBusy===g.id} onClick={()=>deleteGroup(g)}>{deleteBusy===g.id?'Deleting…':'Delete permanently'}</button>
                  </div>
                </div>}
              </div>}
            </div>)}
          </div>}
        {error&&<p className="error section">{error}</p>}
      </div>
    </main>
  );
}
