import { formatMoney as fmt, rupees, monthName } from './core.mjs?v=20261107-closure-layout-v6';
import { getClosure, closureSummary, closureNeedsReview, closureComparison } from './closure.mjs?v=20261107-closure-layout-v6';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=value=>value==null?'Not entered':fmt(value);
const shortMonth=key=>new Date(key+'-01T12:00:00').toLocaleDateString('en-IN',{month:'short',year:'numeric'});
const input=(name,label,value,hint,{min='',readonly=false,required=true}={})=>`<label>${label}<div class="currency-input"><span>₹</span><input name="${name}" aria-label="${label}" type="number" step="0.01" ${min!==''?`min="${min}"`:''} inputmode="decimal" placeholder="${readonly?'Not entered':'Enter manually'}" value="${value==null?'':rupees(value)}" ${required?'required':''} ${readonly?'readonly':''}></div><small>${hint}</small></label>`;
const metric=(label,value,hint='',className='')=>`<section class="closure-metric ${className}"><h3>${label}</h3><strong>${value}</strong>${hint?`<p>${hint}</p>`:''}</section>`;
export const lateClosureGuidance=`<p>You can close a month after the next month has started. For example, if you complete <strong>October’s closure on 5 November</strong>, select <strong>October</strong> and enter the balances as they stood at the <strong>end of 31 October</strong>.</p>
  <p>If you only know your current balance, use:</p><p class="closure-late-formula"><strong>Month-End Balance = Today’s Balance − All Money Received Since Month-End + All Money Paid Out Since Month-End</strong></p>
  <p>Apply this separately to cash and bank. Include all subsequent movements, including income, spending, investment movements, lending repayments, borrowed money, new lending, borrowing repayments and transfers. Include movements up to the same date and time as the current balance being checked. All subsequent movements must be known for an accurate result.</p>`;
export const componentRows=[
  {id:'investment',opening:'openingInvestment',closing:'closingInvestment',difference:'investmentDifference',title:'Investments',openingLabel:'Investment Value at Start of Month',closingLabel:'Investment Value at End of Month',differenceLabel:'Change in Investment Value',openingHint:'Value of your investments at the beginning of the selected month.',closingHint:'Automatically taken from the Investment screen for the selected month and year.'},
  {id:'lent',opening:'openingLent',closing:'closingLent',difference:'lentDifference',title:'Money Lent to Others',openingLabel:'Money Lent Outstanding at Start of Month',closingLabel:'Money Lent Outstanding at End of Month',differenceLabel:'Change in Money Lent Outstanding',openingHint:'Amount others owed you at the beginning of the selected month.',closingHint:'Automatically taken from money lent to others on Money Lent and Borrowed for the selected month and year.'},
  {id:'held',opening:'openingHeld',closing:'closingHeld',difference:'heldDifference',title:'Money Borrowed or Held for Others',openingLabel:'Money Borrowed or Held at Start of Month',closingLabel:'Money Borrowed or Held at End of Month',differenceLabel:'Change in Money Borrowed or Held',openingHint:'Amount you owed or held for others at the beginning of the selected month.',closingHint:'Automatically taken from money borrowed or held on Money Lent and Borrowed for the selected month and year.'}
];
export function renderClosure(state,key,selection) {
  const c=getClosure(state,key),s=closureSummary(state,key,{current:true}),v=s,closed=c.status==='closed',review=closureNeedsReview(state,key);
  const target=s.target==='not-set'?'Save the start-of-month estimate and actual figures':`Start-of-month savings target ${s.target}`;
  const status=closed?(review?'Saved closed month · needs review':'Saved closed month'):(c.snapshot?'Reopened monthly figures':c.savedAt?'Monthly figures saved':'Enter your monthly figures');
  return `<div class="closure-status ${review?'closure-warning':''}"><div><strong>${status}</strong><p>${closed?'The original closed snapshot remains stored. The comparisons below use the updated formula and current Overview savings. Reopen this month to edit its saved figures.':'Use Save in each section to keep your figures for this month. Automatic fields update as the selected month’s Overview changes.'}</p></div>${closed?'<button class="button secondary" id="reopen-month">Reopen Month</button>':''}</div>
  <section class="card closure-form-card"><div class="card-heading"><div><span class="closure-step">01 · OPENING AND CLOSING FIGURES</span><h2>Investments, lending and borrowing</h2><p>Save opening values at the start of the month. Closing values follow the selected month’s Investment and Money Lent and Borrowed records automatically. Each change is closing minus opening.</p></div></div>
    <form id="closure-components-form"><fieldset class="closure-component-fields" ${closed?'disabled':''}>${componentRows.map(row=>`<section class="closure-component-row" data-component="${row.id}"><h3>${row.title}</h3><div class="closure-component-inputs">
      ${input(row.opening,row.openingLabel,v[row.opening],row.openingHint,{min:'0',required:false})}
      ${input(row.closing,row.closingLabel,v[row.closing],row.closingHint,{min:'0',required:false,readonly:true})}
      ${input(row.difference,row.differenceLabel,s[row.difference],'Closing − opening. Positive means an increase; negative means a decrease.',{readonly:true,required:false})}</div></section>`).join('')}
      <div class="closure-form-actions"><button class="button primary" type="submit">Save Opening Component Figures</button><span>Save the opening figures here. Update closing values in Investment and Money Lent and Borrowed for the same month and year.</span></div>
    </fieldset></form></section>
  <section class="card closure-form-card"><div class="card-heading"><div><span class="closure-step">02 · EXPECTED SAVINGS</span><h2>Compare your savings estimates</h2><p>Keep the start-of-month estimate fixed and compare it with the updated Overview value.</p></div></div><form id="closure-expected-form"><fieldset class="closure-fields closure-plan-fields" ${closed?'disabled':''}>
    ${input('expectedSavings','Expected Closing Savings Calculated at Start of Month',c.expectedSavings,'Enter the Total Savings, including investments, shown on Overview at the start of the selected month. Overview changes as records are updated, while this saved amount remains fixed unless you manually edit it.')}
    ${input('expectedSavingsEnd','Expected Closing Savings Calculated at End of Month',s.expectedSavingsEnd,'Automatically reflects Total Savings, including investments, on Overview for the selected month and year. This amount updates as the underlying records change.',{readonly:true})}
    ${input('theoreticalSavingsDifference','Theoretical Savings Difference',s.theoreticalSavingsDifference,'Compares the fixed savings estimate saved at the start of the month with the updated estimate. A positive amount indicates a decrease; a negative amount indicates an increase.',{readonly:true,required:false})}
    <div class="closure-form-actions"><button class="button primary" type="submit">Save Start-of-Month Expected Savings</button><span>Theoretical Savings Difference = start-of-month expected savings − end-of-month expected savings.</span></div></fieldset></form></section>
  <section class="card closure-form-card"><div class="card-heading"><div><span class="closure-step">03 · ACTUAL MONTH-END BALANCES</span><h2>Enter actual closing balances</h2><p>Use the cash and bank balances at the end of ${esc(monthName(key))}, even if you complete the figures later.</p></div></div><form id="closure-actual-form"><fieldset class="closure-fields" ${closed?'disabled':''}>
    ${input('actualCash','Actual Closing Cash Balance',c.actualCash,'Cash you actually held on the selected month’s last day.',{min:'0'})}
    ${input('actualBank','Actual Closing Bank Balance',c.actualBank,'Bank balance on the selected month’s last day. A negative value can represent an overdraft.')}
    <div class="closure-form-actions"><button class="button primary" type="submit">Save Actual Balances</button><span>Saved separately for the selected month and year.</span></div></fieldset></form>
    <div class="closure-results-heading"><div><h3>Your savings comparison</h3><p>Uses your saved monthly figures and the current Total Savings (Including Investments) on Overview.</p></div><span class="closure-target ${s.target}">${target}</span></div>
    <div class="closure-metrics closure-savings-metrics">
      ${metric('Actual Month-End Savings',amount(s.actualSavings),'Your savings based on actual month-end cash, bank, investment, lending and borrowing figures. Tentative expenses are not subtracted again.','closure-featured')}
      ${metric('Unaccounted Amount',amount(s.unaccounted),'Overview’s Total Savings (Including Investments) − Actual Month-End Savings. Negative results are shown as ₹0.','closure-amber')}
    </div>
    <p class="closure-savings-formula"><strong>Actual Month-End Savings = Actual Closing Cash + Actual Closing Bank Balance + Investment Value at End of Month + Money Lent Outstanding at End of Month − Money Borrowed or Held at End of Month.</strong></p>
    <div class="closure-adjustment-summary"><h3>Unaccounted Amount calculation</h3><p><strong>Unaccounted Amount = Total Savings (Including Investments) on Overview − Actual Month-End Savings</strong></p>
      ${s.actualSavings===null?'<p>Enter and save both actual closing balances to calculate this month’s Unaccounted Amount.</p>':`<p class="closure-worked-calculation">This month: max(₹0, ${amount(s.expectedSavingsEnd)} − (${amount(s.actualSavings)})) = <strong>${amount(s.unaccounted)}</strong>.</p>`}
      <p class="closure-example"><strong>Example:</strong> ₹20,000 on Overview − ₹18,000 in Actual Month-End Savings = ₹2,000 Unaccounted Amount. Negative results are shown as ₹0.</p>
    </div>
    <aside class="closure-late-help"><h3>Completing a month later?</h3>${lateClosureGuidance}</aside>
  </section>
  ${renderComparisons(state,selection)}`;
}
export function renderComparisons(state,selection) {
  const keys=Object.keys(state.months).filter(key=>state.months[key].closure).sort();
  if(!keys.length)return '<section class="card closure-comparisons"><h2>Compare multiple months and years</h2><p>Save monthly figures to add a month to the Savings graph.</p></section>';
  const years=[...new Set(keys.map(key=>key.slice(0,4)))].sort().reverse();
  const rows=keys.filter(key=>selection.has(key)).map(key=>closureComparison(state,key));
  return `<section class="card closure-comparisons"><div class="card-heading"><div><h2>Compare multiple months and years</h2><p>Compare the fixed starting estimate, updated Overview savings and actual month-end figures. The Savings graph uses the current calculations for each selected month; original closed snapshots remain stored.</p></div><div class="button-group"><button class="button secondary small" id="compare-all">Select all</button><button class="button secondary small" id="compare-none">Clear selection</button></div></div>
    <div class="closure-month-picker">${years.map(year=>`<fieldset><legend>${year}</legend><div>${keys.filter(key=>key.startsWith(year+'-')).map(key=>`<label><input type="checkbox" data-compare-month="${key}" ${selection.has(key)?'checked':''}><span>${shortMonth(key)}${closureNeedsReview(state,key)?' · Review':getClosure(state,key).status==='closed'?' · Closed':' · Saved figures'}</span></label>`).join('')}</div></fieldset>`).join('')}</div>
    <div class="closure-chart-area" aria-live="polite">${rows.length?savingsChart(rows):'<p class="closure-chart-empty">Select one or more months to display the Savings graph.</p>'}</div></section>`;
}
function savingsChart(rows) {
  const title='Savings graph';
  const stackTop=row=>row.actualSavings==null?null:Math.max(0,row.actualSavings)+(row.unaccounted??0);
  const values=rows.flatMap(row=>[row.expectedSavings,row.expectedSavingsEnd,row.actualSavings,stackTop(row)]).filter(value=>value!=null);
  const min=Math.min(0,...values),max=Math.max(100,...values),span=max-min,low=min<0?min-span*.08:0,high=max+span*.13;
  const width=Math.max(700,rows.length*190+100),height=330,left=85,right=20,top=20,bottom=65,plotHeight=height-top-bottom;
  const y=value=>top+(high-value)/(high-low)*plotHeight,zero=y(0),groupWidth=(width-left-right)/rows.length,barWidth=Math.min(30,groupWidth*.19);
  let shapes='';
  for(let index=0;index<=4;index++) {
    const value=low+(high-low)*index/4,py=y(value),label=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',notation:'compact',maximumFractionDigits:1}).format(value/100);
    shapes+=`<line class="chart-grid-line" x1="${left}" x2="${width-right}" y1="${py}" y2="${py}"/><text class="chart-axis-text" x="${left-10}" y="${py+4}" text-anchor="end">${esc(label)}</text>`;
  }
  shapes+=`<line class="chart-zero-line" x1="${left}" x2="${width-right}" y1="${zero}" y2="${zero}"/>`;
  const rect=(x,value,css,detail,offset=0)=>{
    const y1=y(offset),y2=y(offset+value),h=Math.max(2,Math.abs(y2-y1));
    return `<rect class="chart-bar ${css}" x="${x}" y="${Math.min(y1,y2)-(value===0?2:0)}" width="${barWidth}" height="${h}" rx="3" tabindex="0" role="button" aria-label="${esc(detail)}" data-chart-detail="${esc(detail)}"><title>${esc(detail)}</title></rect>`;
  };
  const missing=x=>`<text class="chart-missing" x="${x+barWidth/2}" y="${zero-9}" text-anchor="middle">—</text>`;
  rows.forEach((row,index)=>{
    const centre=left+groupWidth*(index+.5),label=shortMonth(row.month),status=row.needsReview?' · Needs review':'';
    const columns=[
      {value:row.expectedSavings,x:centre-barWidth*1.5-9,css:'chart-start-savings',name:'Expected Closing Savings Calculated at Start of Month'},
      {value:row.expectedSavingsEnd,x:centre-barWidth/2,css:'chart-end-savings',name:'Expected Closing Savings Calculated at End of Month'},
      {value:row.actualSavings,x:centre+barWidth/2+9,css:'chart-actual-savings',name:'Actual Month-End Savings'}
    ];
    for(const column of columns) {
      const detail=`${label} · ${column.name}: ${amount(column.value)} · Theoretical Savings Difference: ${amount(row.theoreticalSavingsDifference)}${column.css==='chart-actual-savings'?` · Unaccounted Amount (calculated): ${amount(row.unaccounted)}`:''}${status}`;
      shapes+=column.value==null?missing(column.x):rect(column.x,column.value,column.css,detail);
    }
    // Positive savings stack upward. A negative actual balance stays below zero;
    // its nonnegative Unaccounted Amount starts at zero to avoid covering it.
    if(row.actualSavings!=null&&row.unaccounted>0)shapes+=rect(centre+barWidth/2+9,row.unaccounted,'chart-savings-unaccounted',`${label} · Unaccounted Amount (calculated): ${fmt(row.unaccounted)} · Actual Month-End Savings: ${fmt(row.actualSavings)}${status}`,Math.max(0,row.actualSavings));
    shapes+=`<text class="chart-axis-text chart-month-label" x="${centre}" y="${height-35}" text-anchor="middle">${label}</text><text class="chart-status-text" x="${centre}" y="${height-17}" text-anchor="middle">${row.needsReview?'Review needed':row.status==='closed'?'Closed record':'Saved figures'}</text>`;
  });
  const legend='<span><i class="chart-start-savings"></i>Expected savings at start of month</span><span><i class="chart-end-savings"></i>Expected savings at end of month · Overview</span><span><i class="chart-actual-savings"></i>Actual Month-End Savings</span><span><i class="chart-savings-unaccounted"></i>Unaccounted Amount</span>';
  return `<figure class="closure-chart"><figcaption><h3>${title}</h3><p>Compare the fixed starting estimate, current end-of-month estimate from Overview, and Actual Month-End Savings. Green shows actual savings; amber shows Unaccounted Amount stacked above the green bar. ${rows.some(row=>row.actualSavings<0)?'Negative actual savings extend below zero, with Unaccounted Amount above zero. ':''}Hover, focus or tap each coloured segment for its exact rupee amount. Swipe horizontally to see more months.</p></figcaption><div class="chart-legend">${legend}</div><div class="closure-chart-scroll"><svg viewBox="0 0 ${width} ${height}" style="min-width:${width}px" role="group" aria-label="${title}">${shapes}</svg></div><p class="closure-chart-detail" data-chart-readout role="status">Select a bar or coloured segment to see its exact amount. A dash means a figure has not been entered.</p></figure>`;
}
