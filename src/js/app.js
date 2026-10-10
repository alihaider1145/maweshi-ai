function switchTab(tabId, event) {
  document.querySelectorAll('.card').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  if (event) event.currentTarget.classList.add('active');
}

function previewImage(event) {
  const preview = document.getElementById('preview');
  const file = event.target.files[0];
  if (file) {
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
  }
}