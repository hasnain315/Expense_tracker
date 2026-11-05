import { money } from './core.mjs';

const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const datePattern = /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[\s-]+[A-Za-z]{3,9}[\s,-]+\d{2,4})\b/;
export function parseDate(text) {
  const match = String(text).match(datePattern); if (!match) return null;
  const raw=match[1]; let y,m,d;
  if (/^\d{4}/.test(raw)) [y,m,d]=raw.split(/[-/]/).map(Number);
  else if (/[a-z]/i.test(raw)) { const parts=raw.split(/[\s,-]+/);d=+parts[0];m=months.indexOf(parts[1].slice(0,3).toLowerCase())+1;y=+parts[2]; }
  else [d,m,y]=raw.split(/[-/.]/).map(Number);
  if(y<100)y+=2000;
  const value=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const dt=new Date(value+'T12:00:00Z');
  return Number.isFinite(dt.getTime()) && dt.toISOString().slice(0,10)===value ? {value,raw,index:match.index} : null;
}
export function rowsFromItems(items) {
  const rows=[];
  for(const item of items) {
    if(!item.str?.trim())continue;
    const y=item.transform[5],x=item.transform[4];
    let row=rows.find(r=>Math.abs(r.y-y)<2.5);
    if(!row){row={y,cells:[]};rows.push(row);}
    row.cells.push({x,width:item.width||0,text:item.str.trim()});
  }
  return rows.sort((a,b)=>b.y-a.y).map(r=>({cells:r.cells.sort((a,b)=>a.x-b.x),text:r.cells.sort((a,b)=>a.x-b.x).map(c=>c.text).join(' ')}));
}
function headerColumns(rows) {
  for(const [index,row] of rows.entries()) {
    if(parseDate(row.text) || /opening balance|\b(?:dr|cr) count\b|statement summary/i.test(row.text))continue;
    const columns={};let referenceX;
    for(const cell of row.cells) {
      const t=cell.text.trim().toLowerCase(),center=cell.x+(cell.width||0)/2;
      if(/^(?:(?:debit|withdrawal)(?:\s+(?:amount|amt\.?))?|paid out)$/.test(t))columns.debit=center;
      if(/^(?:(?:credit|deposit)(?:\s+(?:amount|amt\.?))?|paid in)$/.test(t))columns.credit=center;
      if(/^(?:(?:closing|running|available)\s+)?balance$/.test(t))columns.balance=center;
      if(/^(?:chq\.?\s*\/\s*ref\.?\s*no\.?|(?:cheque|reference|ref\.?)\s*(?:no\.?|number))$/.test(t))referenceX=cell.x;
    }
    // Use the transaction table, never the statement-summary totals. Column
    // centers also account for short amounts aligned to the right of a column.
    if(Object.keys(columns).length>=2 && (columns.debit!==undefined || columns.credit!==undefined))return {columns,index,referenceX};
  }
  return {columns:{},index:-1};
}
function amountsIn(text) {
  // Requiring decimals or a currency symbol avoids treating UPI reference IDs,
  // phone numbers and times as amounts. Plain integer amounts are handled last.
  const rx=/(?:₹|INR\b|Rs\.?\s*)\s*-?\s*[\d,]+(?:\.\d{1,2})?|(?<![\d\w.])-?(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2}(?![\d.])/gi;
  return [...text.matchAll(rx)].map(m=>({raw:m[0],index:m.index,value:Math.abs(money(m[0].replace(/INR|Rs\.?/gi,'')))}));
}
export function parseStatementRows(rows) {
  const header=headerColumns(rows),columns=header.columns,colEntries=Object.entries(columns),tabular=colEntries.length>=2;
  const blocks=[];let current=null;
  for(const [index,row] of rows.entries()) {
    if(tabular && index<=header.index)continue;
    if(/^(?:page\b|total\b|\*?opening balance|\*?closing balance|statement summary|transaction statement\b|note\s*:|generated (?:on|by)\b|(?:a\/c|account) open date\b|from\s*:|to\s*:|date\s+(?:&\s*time|narration|description|particulars)\b)/i.test(row.text.trim())){current=null;continue;}
    const date=parseDate(row.text);
    if(date) {
      if(/opening balance|closing balance|balance brought|balance carried|statement (?:from|to)|period (?:from|to)/i.test(row.text)){current=null;continue;}
      // Date ranges are statement metadata; a table transaction starts with its
      // date cell, rather than an account-opening or statement-generation date.
      const afterDate=row.text.slice(date.index+date.raw.length);
      if(/^\s*(?:[-\u2013\u2014]|to\b)\s*/i.test(afterDate) && parseDate(afterDate)){current=null;continue;}
      if(tabular && row.cells[0]?.text.trim()!==date.raw){current=null;continue;}
      current={date:date.value,rawDate:date.raw,rows:[row]};blocks.push(current);
    } else if(current && !/^(?:page\s*\d|total\b|opening balance|closing balance|statement summary)/i.test(row.text))current.rows.push(row);
  }
  const transactions=[];
  for(const block of blocks) {
    const descriptionEnd=header.referenceX ?? Math.min(...colEntries.map(([,x])=>x));
    const text=(tabular?block.rows.flatMap(r=>r.cells.filter(c=>c.x<descriptionEnd && c.text!==block.rawDate).map(c=>c.text)).join(' '):block.rows.map(r=>r.text).join(' ').replace(block.rawDate,' ')).trim();
    let type=/\b(received|credited|credit\b|deposit|paid in|cr)\b/i.test(text)?'income':/\b(paid|sent|debited|debit|withdrawal|dr)\b/i.test(text)?'expense':'';
    let amount=null,chosenRaw='';
    if(tabular) {
      amountCell: for(const row of block.rows) for(const cell of row.cells) {
        if(!/^\s*(?:₹|Rs\.?|INR)?\s*-?[\d,]+(?:\.\d{1,2})?(?:\s*(?:Cr|Dr))?\s*$/i.test(cell.text) || cell.text===block.rawDate)continue;
        const center=cell.x+(cell.width||0)/2;
        const column=colEntries.map(([key,x])=>({key,d:Math.abs(x-center)})).sort((a,b)=>a.d-b.d)[0];
        // Reject reference-number and running-balance cells before parsing money.
        if(column.d>=85 || column.key==='balance')continue;
        const found=amountsIn(cell.text);const value=found[0]?.value ?? (/^[\d,]+$/.test(cell.text)?money(cell.text):0);
        if(!value)continue;
        amount=value;type=column.key==='credit'?'income':'expense';chosenRaw=cell.text;break amountCell;
      }
      // A balance-only row is not a payment. Do not use the narrative fallback.
      if(amount===null)continue;
    }
    const found=amountsIn(text);
    if(amount===null && found.length) {amount=found[0].value;chosenRaw=found[0].raw; if(/^-/.test(chosenRaw))type='expense';}
    if(amount===null) {
      const simple=text.match(/(?:₹|INR|Rs\.?)\s*(\d[\d,]*)\b|\b(\d{1,7})\s*(?:Cr|Dr)\b|\s(\d{1,7})\s*$/i);
      if(simple){amount=money(simple[1]||simple[2]||simple[3]);chosenRaw=simple[0];}
    }
    if(!amount || !Number.isSafeInteger(amount))continue;
    let description=text.replace(chosenRaw,' ').replace(/\b(?:UPI transaction ID|Transaction ID|UPI Ref(?:erence)?(?: No\.?)?)\s*:?\s*[A-Za-z\d]+/gi,'').replace(/\s+/g,' ').trim();
    description=description.replace(/\s+\d[\d,]*\.\d{2}(?:\s*(?:Cr|Dr))?\s*$/i,'').trim();
    transactions.push({date:block.date,description:description.slice(0,300)||'Imported transaction',amount,type,wallet:'bank',category:'',keep:true});
  }
  return transactions;
}
export async function readStatement(file,password='') {
  if(file.size>40*1024*1024)throw new Error('Please use a PDF smaller than 40 MB.');
  const pdfjs=await import('./vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),password,isEvalSupported:false,useSystemFonts:true});
  let pdf;
  try {
    pdf=await task.promise;
    const rows=[];
    for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();rows.push(...rowsFromItems(content.items));page.cleanup();}
    const transactions=parseStatementRows(rows);
    if(!transactions.length)throw new Error('No readable transactions found. Use a text-based statement with dates and amounts, or enter transactions manually. Scanned PDFs are not supported.');
    return transactions;
  } catch(error) {
    if(error.name==='PasswordException')throw new Error('This PDF needs a valid password. Enter the statement password and try again.');
    if(error.name==='InvalidPDFException')throw new Error('This file could not be read as a PDF. Please select a valid statement.');
    throw error;
  } finally {await task.destroy();}
}
