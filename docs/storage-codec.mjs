import { createState, checkMonth } from './core.mjs';
// Splitting transaction lists avoids Firestore's 1 MiB document limit, even
// after years of use. Only changed chunks are written. No financial data lives
// in the public Git repository or in the Firebase configuration file.
const CHUNK_SIZE=100;
const encoder=new TextEncoder();
export function encodeState(state) {
  if(state.version!==2) throw new Error('Unsupported ledger version.');
  const result=new Map();
  const add=(id,data)=>{
    const text=JSON.stringify(data);
    if(encoder.encode(text).length>700000) throw new Error('This record is too large to save. Reduce the number of categories or shorten descriptions.');
    result.set(id,text);
  };
  const chunks=(prefix,rows)=>{for(let i=0;i<rows.length;i+=CHUNK_SIZE)add(`${prefix}~${String(i/CHUNK_SIZE).padStart(5,'0')}`,rows.slice(i,i+CHUNK_SIZE));};
  add('settings',{version:2,budgetReference:state.budgetReference,investment:state.investment});
  chunks('money',state.moneyEntries);
  for(const [key,value] of Object.entries(state.months)) {
    checkMonth(key);
    const {transactions,...details}=value;
    add(`month~${key}`,details);
    chunks(`tx~${key}`,transactions);
  }
  return result;
}
export function decodeState(records) {
  const state=createState();
  const settings=records.get('settings');
  if(settings) {
    const saved=JSON.parse(settings);
    if(saved.version!==2 || !Array.isArray(saved.budgetReference) || !Array.isArray(saved.investment)) throw new Error('Cloud records use an unsupported format.');
    Object.assign(state,saved);
  }
  for(const [id,text] of records) if(id.startsWith('month~')) {
    const key=id.slice(6);checkMonth(key);
    state.months[key]={...JSON.parse(text),transactions:[]};
  }
  for(const [id,text] of [...records].sort(([a],[b])=>a.localeCompare(b))) {
    if(id.startsWith('money~')) state.moneyEntries.push(...JSON.parse(text));
    if(id.startsWith('tx~')) {
      const key=id.split('~')[1];
      if(!state.months[key]) throw new Error('A cloud transaction is missing its month. No changes have been saved.');
      state.months[key].transactions.push(...JSON.parse(text));
    }
  }
  return state;
}
export function diffRecords(previous,next) {
  return [...new Set([...previous.keys(),...next.keys()])].filter(id=>previous.get(id)!==next.get(id)).map(id=>({id,data:next.get(id)??null}));
}
