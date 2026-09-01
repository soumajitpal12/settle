'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect,useState} from 'react';
import {Home,Receipt,PlusCircle,ArrowLeftRight,Users} from 'lucide-react';
import {supabase} from '../lib/supabase';

export default function AppShell({children}:{children:React.ReactNode}){
  const [signedIn,setSignedIn]=useState(false);
  const pathname=usePathname();
  const router=useRouter();

  useEffect(()=>{
    supabase.auth.getUser().then(({data})=>setSignedIn(!!data.user));
    const {data}=supabase.auth.onAuthStateChange((_e,session)=>setSignedIn(!!session));
    return ()=>data.subscription.unsubscribe();
  },[]);

  async function logout(){
    await supabase.auth.signOut();
    setSignedIn(false);
    router.push('/auth');
    router.refresh();
  }

  const isActive=(href:string)=>href==='/'?pathname==='/':pathname.startsWith(href);

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">Settle</Link>
        <nav className="nav nav-links">
          <Link href="/">Dashboard</Link>
          {signedIn&&<>
            <Link href="/expenses">Expenses</Link>
            <Link href="/groups">Groups</Link>
            <Link href="/settle">Settle Up</Link>
            <Link href="/expenses/new" className="btn primary">+ Add Expense</Link>
          </>}
        </nav>
        <div className="nav-actions">
          {signedIn&&<button className="btn" onClick={logout}>Log out</button>}
          {!signedIn&&<Link href="/auth" className="btn primary">Sign in</Link>}
        </div>
      </header>

      {children}

      {signedIn&&<nav className="bottom-nav" aria-label="Primary">
        <Link href="/" className={isActive('/')&&pathname==='/'?'active':''}><Home size={20}/><span>Home</span></Link>
        <Link href="/expenses" className={isActive('/expenses')?'active':''}><Receipt size={20}/><span>Expenses</span></Link>
        <Link href="/expenses/new" className="fab" aria-label="Add expense"><PlusCircle size={26}/></Link>
        <Link href="/settle" className={isActive('/settle')?'active':''}><ArrowLeftRight size={20}/><span>Settle</span></Link>
        <Link href="/groups" className={isActive('/groups')?'active':''}><Users size={20}/><span>Groups</span></Link>
      </nav>}
    </div>
  );
}
