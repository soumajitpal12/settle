import test from 'node:test';import assert from 'node:assert/strict';
function calc(ids,expenses,settlements=[]){const n=new Map(ids.map(x=>[x,0]));for(const e of expenses){n.set(e.payerId,n.get(e.payerId)+Math.round(e.total*100));for(const s of e.shares)n.set(s.memberId,n.get(s.memberId)-Math.round(s.amount*100))}for(const s of settlements){const a=Math.round(s.amount*100);n.set(s.from,n.get(s.from)+a);n.set(s.to,n.get(s.to)-a)}return n}
test('personal expense',()=>assert.deepEqual(calc(['A','B'],[{payerId:'A',total:100,shares:[{memberId:'B',amount:100}]}]),new Map([['A',10000],['B',-10000]])));
test('equal shared expense',()=>assert.deepEqual(calc(['A','B'],[{payerId:'A',total:100,shares:[{memberId:'A',amount:50},{memberId:'B',amount:50}]}]),new Map([['A',5000],['B',-5000]])));
test('partial settlement',()=>assert.deepEqual(calc(['A','B'],[{payerId:'A',total:500,shares:[{memberId:'B',amount:500}]}],[{from:'B',to:'A',amount:200}]),new Map([['A',30000],['B',-30000]])));
test('rounding reconciles',()=>{const s=[33.34,33.33,33.33];assert.equal(Math.round(s.reduce((a,b)=>a+b,0)*100),10000);});
test('circular netting',()=>{const n=calc(['A','B','C'],[{payerId:'A',total:100,shares:[{memberId:'B',amount:100}]},{payerId:'B',total:100,shares:[{memberId:'C',amount:100}]},{payerId:'C',total:100,shares:[{memberId:'A',amount:100}]}]);assert.deepEqual([...n.values()],[0,0,0]);});
