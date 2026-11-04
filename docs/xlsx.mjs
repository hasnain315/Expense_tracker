// A small, dependency-free XLSX writer. Uses uncompressed ZIP entries and inline
// text cells, so category names beginning with =, +, -, or @ are never formulas.
const encoder = new TextEncoder();
const xml = v => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const table = Array.from({length:256},(_,n)=>{ for(let k=0;k<8;k++) n=(n&1)?0xedb88320^(n>>>1):n>>>1; return n>>>0; });
const crc32 = bytes => { let c=0xffffffff; for(const b of bytes)c=table[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0; };
function zip(files) {
  const parts=[], directory=[]; let offset=0;
  const header = (size, fn) => { const a=new Uint8Array(size);fn(new DataView(a.buffer));return a; };
  for(const [path,content] of Object.entries(files)) {
    const name=encoder.encode(path), data=encoder.encode(content), crc=crc32(data);
    const local=header(30,v=>{v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);});
    const central=header(46,v=>{v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);});
    parts.push(local,name,data);directory.push(central,name);offset+=local.length+name.length+data.length;
  }
  const length=directory.reduce((s,a)=>s+a.length,0), count=Object.keys(files).length;
  parts.push(...directory,header(22,v=>{v.setUint32(0,0x06054b50,true);v.setUint16(8,count,true);v.setUint16(10,count,true);v.setUint32(12,length,true);v.setUint32(16,offset,true);}));
  const bytes=new Uint8Array(offset+length+22);let pos=0;for(const a of parts){bytes.set(a,pos);pos+=a.length;}return bytes;
}
const column = index => {let s='';for(index++;index;index=Math.floor((index-1)/26))s=String.fromCharCode(65+(index-1)%26)+s;return s;};
export function createWorkbook(carryRows) {
  const rows=[['Month','Expense category','Previous carry-forward (INR)','Monthly budget (INR)','Actual category expenses (INR)','Calculated carry-forward (INR)','Manual adjustment (INR)','Closing carry-forward (INR)','Closing balance source'],...carryRows.map(r=>[
    r.month,r.name,r.opening/100,r.allowance/100,r.spent/100,r.calculated/100,r.adjustment/100,r.balance/100,r.edited?'Manual edit':r.reset?'Manual reset':'Calculated'
  ])];
  const data=rows.map((r,i)=>`<row r="${i+1}">${r.map((v,j)=>typeof v==='number'?`<c r="${column(j)}${i+1}" s="2"><v>${v}</v></c>`:`<c r="${column(j)}${i+1}" t="inlineStr" s="${i===0?1:0}"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')}</row>`).join('');
  const files={
    '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Category Carry-forward" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':'<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF23664F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml':`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="15" customWidth="1"/><col min="2" max="2" width="32" customWidth="1"/><col min="3" max="9" width="31" customWidth="1"/></cols><sheetData>${data}</sheetData><autoFilter ref="A1:I${rows.length}"/></worksheet>`
  };
  return zip(files);
}
