export type Share={memberId:string;amount:number};
export type ExpenseInput={payerId:string;total:number;shares:Share[]};
export type SettlementInput={from:string;to:string;amount:number};

// All values are integer paise/cents in the engine. This avoids floating point drift.
export function toMinor(v:number){return Math.round(v*100)}
export function fromMinor(v:number){return v/100}

export function validateShares(total:number,shares:Share[]){
  const totalMinor=toMinor(total);
  if(totalMinor<=0) throw new Error('Amount must be greater than ₹0.');
  if(!shares.length) throw new Error('At least one person must be included.');
  if(shares.some(s=>toMinor(s.amount)<0)) throw new Error('Shares cannot be negative.');
  const sum=shares.reduce((n,s)=>n+toMinor(s.amount),0);
  if(sum!==totalMinor) throw new Error(`Split is off by ₹${Math.abs(fromMinor(totalMinor-sum)).toFixed(2)}.`);
}

export function balances(memberIds:string[],expenses:ExpenseInput[],settlements:SettlementInput[]=[]){
  const net=new Map<string,number>(memberIds.map(id=>[id,0]));
  for(const e of expenses){
    validateShares(e.total,e.shares);
    const paid=toMinor(e.total);
    net.set(e.payerId,(net.get(e.payerId)||0)+paid);
    for(const s of e.shares) net.set(s.memberId,(net.get(s.memberId)||0)-toMinor(s.amount));
  }
  for(const s of settlements){
    const amount=toMinor(s.amount);
    if(amount<=0) throw new Error('Settlement must be greater than ₹0.');
    net.set(s.from,(net.get(s.from)||0)+amount);
    net.set(s.to,(net.get(s.to)||0)-amount);
  }
  return net;
}

export function simplifySettlements(net:Map<string,number>){
  const creditors=[...net].filter(([,v])=>v>0).map(([id,v])=>({id,amount:v}));
  const debtors=[...net].filter(([,v])=>v<0).map(([id,v])=>({id,amount:-v}));
  const out:{from:string;to:string;amount:number}[]=[];
  let i=0,j=0;
  while(i<debtors.length&&j<creditors.length){
    const amount=Math.min(debtors[i].amount,creditors[j].amount);
    if(amount>0) out.push({from:debtors[i].id,to:creditors[j].id,amount:fromMinor(amount)});
    debtors[i].amount-=amount; creditors[j].amount-=amount;
    if(debtors[i].amount===0)i++; if(creditors[j].amount===0)j++;
  }
  return out;
}

export function equalSplit(total:number,memberIds:string[]){
  const totalMinor=toMinor(total); if(!memberIds.length) return [];
  const base=Math.floor(totalMinor/memberIds.length), remainder=totalMinor-base*memberIds.length;
  return memberIds.map((memberId,i)=>({memberId,amount:fromMinor(base+(i<remainder?1:0))}));
}
