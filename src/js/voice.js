// Voice input: record from the mic, convert to 16 kHz mono WAV, and send it to Gemini together with the prompt.
// This works in every browser with a mic and does not depend on browser speech-recognition language support.
const recordings = {};            // slot -> { b64, url }
let rec = null;                   // active recording { slot, mr, stream, chunks, timer }
const MAX_SECONDS = 45;

function updateMicUI(slot) {
  const box = document.getElementById('mic-' + slot);
  if (!box) return;
  const btn = box.querySelector('.mic-btn'), done = box.querySelector('.mic-done');
  const recording = rec && rec.slot === slot;
  btn.classList.toggle('rec', !!recording);
  btn.querySelector('.ico').textContent = recording ? '⏹' : '🎤';
  btn.querySelector('.lbl').textContent = t(recording ? 'micStop' : 'micBtn');
  done.hidden = !recordings[slot] || recording;
  done.querySelector('.del').textContent = t('micDel');
}

async function toggleMic(slot) {
  if (rec && rec.slot === slot) { rec.mr.stop(); return; }
  if (rec) rec.mr.stop();
  stopSpeech();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { alert(t('errMic')); return; }
  const mr = new MediaRecorder(stream);
  const r = { slot, mr, stream, chunks: [], timer: null };
  rec = r;
  mr.ondataavailable = e => r.chunks.push(e.data);
  mr.onstop = async () => {
    clearTimeout(r.timer);
    stream.getTracks().forEach(tr => tr.stop());
    if (rec === r) rec = null;
    try {
      const blob = new Blob(r.chunks, { type: mr.mimeType });
      if (recordings[slot]) URL.revokeObjectURL(recordings[slot].url);
      recordings[slot] = { b64: await blobToWavBase64(blob), url: URL.createObjectURL(blob) };
      document.querySelector('#mic-' + slot + ' audio').src = recordings[slot].url;
    } catch (e) { console.error(e); alert(t('errGeneric')); }
    updateMicUI(slot);
  };
  mr.start();
  r.timer = setTimeout(() => mr.state === 'recording' && mr.stop(), MAX_SECONDS * 1000);
  updateMicUI(slot);
}

function clearRec(slot) {
  if (recordings[slot]) URL.revokeObjectURL(recordings[slot].url);
  delete recordings[slot];
  updateMicUI(slot);
}

async function blobToWavBase64(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  const bytes = new Uint8Array(view.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
