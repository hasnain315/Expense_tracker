import { firebaseConfig, ownerUid } from './firebase-config.mjs';
import { encodeState, decodeState, diffRecords } from './storage-codec.mjs';

export const configured=!!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain && firebaseConfig.appId && ownerUid);
const SDK='https://www.gstatic.com/firebasejs/12.10.0';
export function friendlyError(error) {
  const code=String(error?.code||'');
  if(code.includes('permission-denied')) return 'Access denied. Check the owner UID and publish the supplied Firestore rules.';
  if(code.includes('resource-exhausted')) return 'Firebase’s free quota has been reached. Your saved records remain in the database. Try again after the quota renews.';
  if(code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'The email or password is incorrect.';
  if(code.includes('too-many-requests')) return 'Too many sign-in attempts. Please try again later.';
  if(code.includes('network-request-failed') || code.includes('unavailable')) return 'Cannot reach Firebase. Check your connection and try again. This change has not been saved.';
  if(code.includes('operation-not-allowed')) return 'Enable Email/Password sign-in in Firebase Authentication.';
  return error?.message || 'The database could not be reached. Please try again.';
}
export async function connectCloud({onSession,onData,onStatus}, dependencies=null) {
  if(!configured && !dependencies)return null;
  const settings=dependencies?.config||firebaseConfig,expectedOwner=dependencies?.ownerUid||ownerUid;
  const [appSDK,authSDK,dbSDK]=dependencies?.sdk||await Promise.all([
    import(`${SDK}/firebase-app.js`),import(`${SDK}/firebase-auth.js`),import(`${SDK}/firebase-firestore.js`)
  ]);
  const app=appSDK.initializeApp(settings);
  const auth=authSDK.getAuth(app),db=dbSDK.getFirestore(app);
  await authSDK.setPersistence(auth,authSDK.browserLocalPersistence);
  let unsubscribe=null,records=new Map(),revision=0,userId=null,generation=0,resetPromise=null;
  async function finishReset(uid,sessionGeneration) {
    if(resetPromise)return resetPromise;
    resetPromise=(async()=>{
      const metaRef=dbSDK.doc(db,'users',uid,'ledger','__meta');
      while(true) {
        if(sessionGeneration!==generation)throw new Error('Sign in again to finish the requested reset.');
        const snapshot=await dbSDK.getDocsFromServer(dbSDK.collection(db,'users',uid,'ledger'));
        const payload=snapshot.docs.filter(d=>d.id!=='__meta').slice(0,400);
        const finished=await dbSDK.runTransaction(db,async transaction=>{
          const meta=await transaction.get(metaRef),data=meta.data();
          if(!data?.resetting)return true;
          if(!payload.length){transaction.set(metaRef,{schema:2,revision:data.revision+1});return true;}
          for(const document of payload)transaction.delete(document.ref);
          return false;
        });
        if(finished)return;
      }
    })().finally(()=>{resetPromise=null;});
    return resetPromise;
  }
  authSDK.onAuthStateChanged(auth,user=>{
    generation++;unsubscribe?.();unsubscribe=null;records=new Map();revision=0;userId=null;
    onSession(user);
    if(!user)return;
    if(user.uid!==expectedOwner){onStatus('This account is not the owner configured for this ledger.',true);return;}
    userId=user.uid;
    const sessionGeneration=generation;
    onStatus('Loading records from Firebase…');
    unsubscribe=dbSDK.onSnapshot(dbSDK.collection(db,'users',userId,'ledger'),{includeMetadataChanges:true},snapshot=>{
      if(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || sessionGeneration!==generation)return;
      try {
        const meta=snapshot.docs.find(d=>d.id==='__meta')?.data();
        if(meta && meta.schema!==2)throw new Error('Unsupported database version.');
        if(meta?.resetting){
          onStatus('Completing your requested manual reset…');
          finishReset(userId,sessionGeneration).catch(error=>onStatus(friendlyError(error),true));
          return;
        }
        const next=new Map(snapshot.docs.filter(d=>d.id!=='__meta').map(d=>[d.id,d.data().data]));
        const state=decodeState(next);
        records=next;revision=meta?.revision||0;
        onData(state,revision);
        onStatus('Saved in Firebase');
      }catch(error){onStatus(friendlyError(error),true);}
    },error=>onStatus(friendlyError(error),true));
  },error=>onStatus(friendlyError(error),true));
  return {
    signIn:(email,password)=>authSDK.signInWithEmailAndPassword(auth,email,password),
    signOut:()=>authSDK.signOut(auth),
    resetPassword:email=>authSDK.sendPasswordResetEmail(auth,email),
    async resetAll(expectedRevision) {
      if(!userId || !navigator.onLine)throw new Error('Sign in and reconnect before resetting data.');
      const uid=userId,sessionGeneration=generation,reference=dbSDK.doc(db,'users',uid,'ledger','__meta');
      await dbSDK.runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(reference),meta=snapshot.data();
        if((meta?.revision||0)!==expectedRevision)throw new Error('Records changed on another device. Review the latest records before resetting.');
        transaction.set(reference,{schema:2,revision:expectedRevision+1,resetting:true});
      });
      await finishReset(uid,sessionGeneration);
      const snapshot=await dbSDK.getDocFromServer(reference);
      return snapshot.data().revision;
    },
    async save(state,expectedRevision) {
      if(!userId || auth.currentUser?.uid!==userId)throw new Error('Sign in before saving records.');
      if(!navigator.onLine)throw new Error('You are offline. Reconnect before saving. This change has not been saved.');
      const next=encodeState(state),changes=diffRecords(records,next);
      if(!changes.length)return expectedRevision;
      // 450 payload writes plus the revision document stay below the batch limit.
      if(changes.length>450)throw new Error('This change spans too many records. Save a smaller PDF batch or use a closer month before trying again.');
      const sessionGeneration=generation,uid=userId;
      const reference=dbSDK.doc(db,'users',uid,'ledger','__meta');
      await dbSDK.runTransaction(db,async transaction=>{
        if(sessionGeneration!==generation)throw new Error('Your sign-in session changed. Sign in again.');
        const snapshot=await transaction.get(reference);
        if(snapshot.data()?.resetting)throw new Error('A manual reset is in progress. Wait for it to finish before editing.');
        const currentRevision=snapshot.exists()?snapshot.data().revision:0;
        if(currentRevision!==expectedRevision)throw new Error('Records changed on another device. The latest records are loading. Review them and save again.');
        for(const change of changes) {
          const ref=dbSDK.doc(db,'users',uid,'ledger',change.id);
          if(change.data===null)transaction.delete(ref);else transaction.set(ref,{data:change.data});
        }
        transaction.set(reference,{schema:2,revision:expectedRevision+1});
      });
      return expectedRevision+1;
    }
  };
}
