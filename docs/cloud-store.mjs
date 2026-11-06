import { firebaseConfig, ownerUid } from './firebase-config.mjs';
import { uid } from './core.mjs?v=20261106-resets';
import { encodeState, decodeState, diffRecords, migrationTarget } from './storage-codec.mjs?v=20261106-resets';

export const configured=!!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain && firebaseConfig.appId && ownerUid);
const SDK='https://www.gstatic.com/firebasejs/12.10.0';
const ATOMIC_LIMIT=400, BATCH_SIZE=100;
export function friendlyError(error) {
  const code=String(error?.code||'');
  if(code.includes('permission-denied'))return 'Access denied. Publish the UPDATED firestore.rules with your owner UID; keep your existing Firebase configuration.';
  if(code.includes('resource-exhausted'))return 'Firebase’s free quota has been reached. Your saved records remain in the database. Try again after the quota renews.';
  if(code.includes('invalid-credential')||code.includes('wrong-password')||code.includes('user-not-found'))return 'The email or password is incorrect.';
  if(code.includes('too-many-requests'))return 'Too many sign-in attempts. Please try again later.';
  if(code.includes('network-request-failed')||code.includes('unavailable'))return 'Cannot reach Firebase. Reconnect and reload to load saved records or finish a pending update.';
  if(code.includes('operation-not-allowed'))return 'Enable Email/Password sign-in in Firebase Authentication.';
  return error?.message||'The database could not be reached. Please try again.';
}
function splitChanges(changes) {
  const result=[];let batch=[],size=0;
  for(const change of changes) {
    const bytes=new TextEncoder().encode(JSON.stringify(change)).length;
    if(bytes>650000)throw new Error('One database record is too large to save safely. Shorten its description.');
    if(batch.length&&(batch.length===BATCH_SIZE||size+bytes>650000)){result.push(batch);batch=[];size=0;}
    batch.push(change);size+=bytes;
  }
  if(batch.length)result.push(batch);
  return result;
}
const metadata=(revision,extra={})=>({schema:3,revision,currency:'INR',moneyUnit:'rupees',...extra});
export async function connectCloud({onSession,onData,onStatus,onReset=()=>{}},dependencies=null) {
  if(!configured&&!dependencies)return null;
  const settings=dependencies?.config||firebaseConfig,expectedOwner=dependencies?.ownerUid||ownerUid;
  const [appSDK,authSDK,dbSDK]=dependencies?.sdk||await Promise.all([
    import(`${SDK}/firebase-app.js`),import(`${SDK}/firebase-auth.js`),import(`${SDK}/firebase-firestore.js`)
  ]);
  const app=appSDK.initializeApp(settings),auth=authSDK.getAuth(app),db=dbSDK.getFirestore(app);
  await authSDK.setPersistence(auth,authSDK.browserLocalPersistence);
  let unsubscribe=null,records=new Map(),userId=null,generation=0,maintenance=null;
  const running=new Map();
  const recordRef=(user,id)=>dbSDK.doc(db,'users',user,'ledger',id);
  const metaRef=user=>recordRef(user,'__meta');
  const journalRef=(user,id,index)=>dbSDK.doc(db,'users',user,'ledgerPendingWrites',`${id}__${String(index).padStart(6,'0')}`);
  const assertSession=(user,sessionGeneration)=>{if(sessionGeneration!==generation||auth.currentUser?.uid!==user)throw new Error('Your sign-in session changed. Sign in again to continue.');};
  function assertWritable(meta,expectedRevision) {
    if(meta?.resetting)throw new Error('A manual reset is in progress. Wait for it to finish before editing.');
    if(meta?.pendingWrite)throw new Error('A database update is in progress. Wait for it to finish before editing.');
    if((meta?.revision||0)!==expectedRevision){const error=new Error('Records changed on another device. Review the latest records and save again.');error.code='ledger/revision-conflict';throw error;}
    if(meta&&![2,3].includes(meta.schema))throw new Error('Unsupported database version. Existing records have been kept.');
  }
  function applyChanges(transaction,user,changes) {
    for(const change of changes) {
      if(!change.documentId||change.documentId==='__meta'||change.documentId.includes('/'))throw new Error('An update contains an invalid document identifier.');
      const ref=recordRef(user,change.documentId);
      if(change.fields===null)transaction.delete(ref);else transaction.set(ref,change.fields);
    }
  }
  function runOnce(key,work) {
    if(running.has(key))return running.get(key);
    const promise=Promise.resolve().then(work).finally(()=>{if(running.get(key)===promise)running.delete(key);});
    running.set(key,promise);return promise;
  }
  async function resumeWrite(user,sessionGeneration,operationId) {
    return runOnce(`${sessionGeneration}:${operationId}`,async()=>{
      while(true) {
        assertSession(user,sessionGeneration);
        const snapshot=await dbSDK.getDocFromServer(metaRef(user)),meta=snapshot.data(),operation=meta?.pendingWrite;
        if(!operation||operation.operationId!==operationId)return;
        if(!Number.isSafeInteger(operation.batchCount)||!Number.isSafeInteger(operation.nextBatch)||operation.batchCount<1||operation.nextBatch<0||operation.nextBatch>operation.batchCount)throw new Error('A pending update is incomplete. Existing records have been kept.');
        await dbSDK.runTransaction(db,async transaction=>{
          assertSession(user,sessionGeneration);
          const current=(await transaction.get(metaRef(user))).data(),active=current?.pendingWrite;
          if(!active||active.operationId!==operationId||active.nextBatch!==operation.nextBatch)return;
          if(active.nextBatch===active.batchCount) {
            transaction.set(metaRef(user),metadata(active.targetRevision));return;
          }
          const ref=journalRef(user,operationId,active.nextBatch),chunk=await transaction.get(ref),fields=chunk.data();
          if(!chunk.exists()||fields.operationId!==operationId||fields.batchIndex!==active.nextBatch||!Array.isArray(fields.changes)||fields.changes.length>BATCH_SIZE)throw new Error('A pending update is missing a batch. Existing records have been kept; do not delete database documents.');
          applyChanges(transaction,user,fields.changes);
          transaction.delete(ref);
          transaction.set(metaRef(user),metadata(current.revision,{pendingWrite:{...active,nextBatch:active.nextBatch+1}}));
        });
      }
    });
  }
  async function discardUnstarted(user,sessionGeneration,operationId,count) {
    // A preparation failure never changes live records. Clean only this writer's
    // temporary batches; an active update must be resumed, never discarded.
    for(let start=0;start<count;start+=100) {
      await dbSDK.runTransaction(db,async transaction=>{
        assertSession(user,sessionGeneration);
        const meta=(await transaction.get(metaRef(user))).data();
        if(meta?.pendingWrite?.operationId===operationId)return;
        for(let i=start;i<Math.min(start+100,count);i++)transaction.delete(journalRef(user,operationId,i));
      });
    }
  }
  async function writeRecords(next,expectedRevision,purpose='save') {
    const user=userId,sessionGeneration=generation;
    assertSession(user,sessionGeneration);
    if(!navigator.onLine)throw new Error('You are offline. Reconnect before saving. This change has not been saved.');
    const changes=diffRecords(records,next);
    if(!changes.length)return expectedRevision;
    const writeBytes=new TextEncoder().encode(JSON.stringify(changes)).length;
    if(changes.length<=ATOMIC_LIMIT&&writeBytes<=6000000) {
      await dbSDK.runTransaction(db,async transaction=>{
        assertSession(user,sessionGeneration);
        const meta=(await transaction.get(metaRef(user))).data();assertWritable(meta,expectedRevision);
        applyChanges(transaction,user,changes);
        transaction.set(metaRef(user),metadata(expectedRevision+1));
      });
      return expectedRevision+1;
    }
    // Large imports and upgrades are fully staged before touching live records.
    // The revision document locks the operation. Another signed-in device can
    // resume its remaining batches after a browser close or lost connection.
    const batches=splitChanges(changes),operationId=uid();let staged=0,started=false;
    try {
      for(let start=0;start<batches.length;start+=5) {
        await dbSDK.runTransaction(db,async transaction=>{
          assertSession(user,sessionGeneration);
          const meta=(await transaction.get(metaRef(user))).data();assertWritable(meta,expectedRevision);
          for(let i=start;i<Math.min(start+5,batches.length);i++)transaction.set(journalRef(user,operationId,i),{
            storageVersion:3,recordType:'pendingWriteBatch',operationId,batchIndex:i,batchCount:batches.length,
            purpose,changes:batches[i]
          });
        });
        staged=Math.min(start+5,batches.length);
      }
      await dbSDK.runTransaction(db,async transaction=>{
        assertSession(user,sessionGeneration);
        const meta=(await transaction.get(metaRef(user))).data();assertWritable(meta,expectedRevision);
        transaction.set(metaRef(user),metadata(expectedRevision,{pendingWrite:{operationId,purpose,batchCount:batches.length,nextBatch:0,targetRevision:expectedRevision+1}}));
      });
      started=true;await resumeWrite(user,sessionGeneration,operationId);return expectedRevision+1;
    }catch(error) {
      if(!started){try{await discardUnstarted(user,sessionGeneration,operationId,staged);}catch{/* Retry will not expose temporary batches as financial records. */}throw error;}
      const interrupted=new Error('This update has not finished. Your entries are preserved in a pending update. Reconnect and reload the page to finish it.');
      interrupted.cause=error;throw interrupted;
    }
  }
  async function finishReset(user,sessionGeneration) {
    return runOnce(`${sessionGeneration}:reset`,async()=>{
      while(true) {
        assertSession(user,sessionGeneration);
        const [live,pending]=await Promise.all([
          dbSDK.getDocsFromServer(dbSDK.collection(db,'users',user,'ledger')),
          dbSDK.getDocsFromServer(dbSDK.collection(db,'users',user,'ledgerPendingWrites'))
        ]);
        const payload=[...live.docs.filter(d=>d.id!=='__meta'),...pending.docs].slice(0,400);
        const finished=await dbSDK.runTransaction(db,async transaction=>{
          assertSession(user,sessionGeneration);
          const meta=(await transaction.get(metaRef(user))).data();
          if(!meta?.resetting)return true;
          if(!payload.length){transaction.set(metaRef(user),metadata(meta.revision+1));return true;}
          for(const document of payload)transaction.delete(document.ref);
          return false;
        });
        if(finished)return;
      }
    });
  }
  function maintain(work,sessionGeneration) {
    if(maintenance?.generation===sessionGeneration)return;
    const job={generation:sessionGeneration};maintenance=job;
    job.promise=Promise.resolve().then(work).catch(error=>{if(generation===sessionGeneration&&error.code!=='ledger/revision-conflict')onStatus(friendlyError(error),true);}).finally(()=>{if(maintenance===job)maintenance=null;});
  }
  authSDK.onAuthStateChanged(auth,user=>{
    generation++;unsubscribe?.();unsubscribe=null;records=new Map();userId=null;maintenance=null;
    onSession(user);if(!user)return;
    if(user.uid!==expectedOwner){onStatus('This account is not the owner configured for this ledger.',true);return;}
    userId=user.uid;const sessionGeneration=generation,sessionUser=user.uid;
    onStatus('Loading records from Firebase…');
    unsubscribe=dbSDK.onSnapshot(dbSDK.collection(db,'users',sessionUser,'ledger'),{includeMetadataChanges:true},snapshot=>{
      if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites||sessionGeneration!==generation)return;
      try {
        const meta=snapshot.docs.find(d=>d.id==='__meta')?.data();
        if(meta&&![2,3].includes(meta.schema))throw new Error('Unsupported database version. Existing records have been kept.');
        if(meta?.resetting){onReset();onStatus('Completing your requested manual reset…');maintain(()=>finishReset(sessionUser,sessionGeneration),sessionGeneration);return;}
        if(meta?.pendingWrite){onStatus(meta.pendingWrite.purpose==='migration'?'Converting existing records to readable Firebase fields…':'Finishing your saved database update…');maintain(()=>resumeWrite(sessionUser,sessionGeneration,meta.pendingWrite.operationId),sessionGeneration);return;}
        const payload=new Map(snapshot.docs.filter(d=>d.id!=='__meta').map(d=>[d.id,d.data()]));
        if(meta?.schema===2||(!meta&&[...payload.values()].some(v=>v?.storageVersion!==3&&typeof v?.data==='string'))) {
          records=payload;
          const next=payload.size?migrationTarget(payload):encodeState(decodeState(new Map()));
          onStatus('Converting existing records to readable Firebase fields…');
          maintain(()=>writeRecords(next,meta?.revision||0,'migration'),sessionGeneration);return;
        }
        const state=decodeState(payload);records=payload;
        onData(state,meta?.revision||0);onStatus('Saved in Firebase');
      }catch(error){onStatus(friendlyError(error),true);}
    },error=>{if(sessionGeneration===generation)onStatus(friendlyError(error),true);});
  },error=>onStatus(friendlyError(error),true));
  return {
    signIn:(email,password)=>authSDK.signInWithEmailAndPassword(auth,email,password),
    signOut:()=>authSDK.signOut(auth),
    resetPassword:email=>authSDK.sendPasswordResetEmail(auth,email),
    async save(state,expectedRevision) {
      if(!userId||auth.currentUser?.uid!==userId)throw new Error('Sign in before saving records.');
      return writeRecords(encodeState(state),expectedRevision);
    },
    async resetAll(expectedRevision) {
      if(!userId||!navigator.onLine)throw new Error('Sign in and reconnect before resetting data.');
      const user=userId,sessionGeneration=generation;
      await dbSDK.runTransaction(db,async transaction=>{
        assertSession(user,sessionGeneration);
        const meta=(await transaction.get(metaRef(user))).data();assertWritable(meta,expectedRevision);
        transaction.set(metaRef(user),metadata(expectedRevision+1,{resetting:true}));
      });
      onReset();
      await finishReset(user,sessionGeneration);return expectedRevision+2;
    }
  };
}
