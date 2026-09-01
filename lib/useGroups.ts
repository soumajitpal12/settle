'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from './supabase';

export type GroupOption={id:string;name:string};

const STORAGE_KEY='settle:selectedGroup';

export function getStoredGroup(){
  if(typeof window==='undefined') return '';
  return window.localStorage.getItem(STORAGE_KEY)||'';
}

export function storeGroup(id:string){
  if(typeof window!=='undefined') window.localStorage.setItem(STORAGE_KEY,id);
}

// Loads every group the user belongs to and keeps a single "active group"
// selection in sync across pages via localStorage, so switching group on one
// screen (Dashboard, Expenses, Add Expense, Settle Up) sticks everywhere else.
export function useGroups(userId:string|null|undefined){
  const [groups,setGroups]=useState<GroupOption[]>([]);
  const [groupId,setGroupIdState]=useState('');
  const [loadingGroups,setLoadingGroups]=useState(true);

  const refreshGroups=useCallback(async()=>{
    if(!userId){setGroups([]);setGroupIdState('');setLoadingGroups(false);return;}
    setLoadingGroups(true);
    const {data}=await supabase.from('group_members').select('group_id,groups(id,name)').eq('user_id',userId);
    const list=(data||[]).map((x:any)=>x.groups).filter(Boolean) as GroupOption[];
    setGroups(list);
    setGroupIdState(prev=>{
      if(prev&&list.some(g=>g.id===prev)) return prev;
      const stored=getStoredGroup();
      if(stored&&list.some(g=>g.id===stored)) return stored;
      return list[0]?.id||'';
    });
    setLoadingGroups(false);
  },[userId]);

  useEffect(()=>{refreshGroups()},[refreshGroups]);

  const setGroupId=useCallback((id:string)=>{setGroupIdState(id);storeGroup(id);},[]);

  return {groups,groupId,setGroupId,loadingGroups,refreshGroups};
}
