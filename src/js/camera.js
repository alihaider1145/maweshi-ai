// Phones/tablets: the native camera via <input capture>. Laptops/desktops ignore `capture`,
// so we show an in-page camera preview with a capture button instead.
let camStream = null;

async function openCamera() {
  if (matchMedia('(pointer: coarse)').matches) { document.getElementById('camImage').click(); return; }
  if (!window.isSecureContext || !navigator.mediaDevices) {
    alert(t('errCam') + ' [page must use https:// or localhost]');
    return;
  }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } });
  } catch (e) {
    const why = e.name === 'NotAllowedError' ? 'blocked: click the lock icon in the address bar and allow the camera'
      : e.name === 'NotFoundError' ? 'no camera found' : e.name === 'NotReadableError' ? 'camera is in use by another app' : e.name;
    alert(`${t('errCam')} [${why}]`);
    return;
  }
  document.getElementById('camVideo').srcObject = camStream;
  document.getElementById('camModal').hidden = false;
}

function closeCamera() {
  if (camStream) camStream.getTracks().forEach(tr => tr.stop());
  camStream = null;
  document.getElementById('camVideo').srcObject = null;
  document.getElementById('camModal').hidden = true;
}

function snapPhoto() {
  const v = document.getElementById('camVideo');
  if (!v.videoWidth) return;
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  c.toBlob(b => { if (b) setPhoto(new File([b], 'camera.jpg', { type: 'image/jpeg' })); closeCamera(); }, 'image/jpeg', 0.9);
}
